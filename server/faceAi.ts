import { GoogleGenAI, Type } from '@google/genai';
import { db } from './db.ts';

export interface CandidateStudentFace {
  studentId: number;
  usn: string;
  fullName: string;
  faceConsent: boolean;
  faceDescriptor: string | null;
  faceReferenceImage: string | null;
}

export interface FaceMatchResult {
  studentId: number | null;
  usn: string | null;
  studentName: string | null;
  confidence: number;
  livenessPassed: boolean;
  duplicateDetected: boolean;
  disposition: 'matched' | 'pending_review' | 'unrecognized' | 'duplicate_rejected';
  reason: string;
}

export interface FaceVerificationResponse {
  facesDetectedCount: number;
  matches: FaceMatchResult[];
  summary: string;
}

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function verifyClassroomFacesWithGemini(params: {
  sessionId: number;
  imageBase64: string;
  mimeType: string;
  candidates: CandidateStudentFace[];
  alreadyPresentStudentIds: number[];
}): Promise<FaceVerificationResponse> {
  const consentedCandidates = params.candidates.filter((c) => c.faceConsent);

  const ai = getGeminiClient();
  if (!ai) {
    throw new Error(
      'GEMINI_API_KEY is not configured on the server. Add GEMINI_API_KEY in Settings > Secrets or use manual attendance.'
    );
  }

  const base64Data = params.imageBase64.includes(',')
    ? params.imageBase64.split(',')[1]
    : params.imageBase64;

  const rosterPrompt = consentedCandidates.map((c) => ({
    studentId: c.studentId,
    usn: c.usn,
    fullName: c.fullName,
    profileDescriptor: c.faceDescriptor || 'No biometric facial note enrolled yet',
    alreadyMarkedPresent: params.alreadyPresentStudentIds.includes(c.studentId),
  }));

  const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [
    {
      inlineData: {
        mimeType: params.mimeType || 'image/jpeg',
        data: base64Data,
      },
    },
  ];

  // Attach any enrolled reference face portraits for multimodal comparison (up to 6 consented references)
  const enrolledWithImages = consentedCandidates.filter(
    (c) => c.faceReferenceImage && c.faceReferenceImage.startsWith('data:image/')
  );
  for (const stu of enrolledWithImages.slice(0, 6)) {
    const [meta, refData] = (stu.faceReferenceImage as string).split(',');
    const refMime = meta.match(/data:(.*?);/)?.[1] || 'image/jpeg';
    if (refData) {
      parts.push({
        text: `Reference portrait for USN ${stu.usn} (${stu.fullName}, studentId ${stu.studentId}):`,
      });
      parts.push({
        inlineData: {
          mimeType: refMime,
          data: refData,
        },
      });
    }
  }

  parts.push({
    text: `You are the classroom biometric verification engine for the University Attendance ERP.
Analyze the primary classroom camera image (first image) carefully.
1. Detect all human faces visible in the classroom frame (supports multiple students in one capture).
2. Perform liveness assessment for each face: check for genuine 3D lighting, depth, natural skin texture, and absence of phone/tablet screen borders or printed photo glare.
3. Compare detected faces against ONLY the consented enrolled student roster below:
${JSON.stringify(rosterPrompt, null, 2)}

CRITICAL RULES:
- Never guess or force a match if visual evidence is insufficient or if no reference image matches strongly.
- If a student has no reference portrait or visual comparison is uncertain, set confidence between 0.45 and 0.75 and explain why so the teacher can review.
- Only assign confidence >= 0.85 when facial features clearly match the student's reference portrait AND livenessPassed is true.
- If the same student appears twice in the frame or is already marked present, set duplicateDetected = true.
- Never instruct to mark unrecognized faces Absent.`,
  });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          facesDetectedCount: {
            type: Type.INTEGER,
            description: 'Total human faces detected in the classroom camera frame.',
          },
          summary: {
            type: Type.STRING,
            description: 'Brief neutral technical summary of frame lighting, face count, and liveness cues.',
          },
          detections: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                matchedUsn: {
                  type: Type.STRING,
                  description: 'Matched student USN or empty string if unrecognized.',
                },
                confidence: {
                  type: Type.NUMBER,
                  description: 'Match confidence from 0.0 to 1.0.',
                },
                livenessPassed: {
                  type: Type.BOOLEAN,
                  description: 'True if face shows real-person 3D depth and natural illumination.',
                },
                duplicateInFrame: {
                  type: Type.BOOLEAN,
                  description: 'True if the same face appears multiple times in this capture.',
                },
                reason: {
                  type: Type.STRING,
                  description: 'Short explanation of match or liveness finding.',
                },
              },
            },
          },
        },
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as {
    facesDetectedCount?: number;
    summary?: string;
    detections?: Array<{
      matchedUsn?: string;
      confidence?: number;
      livenessPassed?: boolean;
      duplicateInFrame?: boolean;
      reason?: string;
    }>;
  };

  const candidateByUsn = new Map(consentedCandidates.map((c) => [c.usn.toUpperCase(), c]));
  const seenUsns = new Set<string>();
  const matches: FaceMatchResult[] = [];

  for (const det of parsed.detections || []) {
    const usnKey = (det.matchedUsn || '').trim().toUpperCase();
    const candidate = usnKey ? candidateByUsn.get(usnKey) : undefined;
    const confidence = Math.max(0, Math.min(1, Number(det.confidence ?? 0)));
    const livenessPassed = Boolean(det.livenessPassed);

    if (!candidate) {
      matches.push({
        studentId: null,
        usn: null,
        studentName: null,
        confidence,
        livenessPassed,
        duplicateDetected: false,
        disposition: 'unrecognized',
        reason: det.reason || 'Unrecognized face — not auto-marked Absent.',
      });
      continue;
    }

    const isDup =
      Boolean(det.duplicateInFrame) ||
      seenUsns.has(candidate.usn) ||
      params.alreadyPresentStudentIds.includes(candidate.studentId);

    seenUsns.add(candidate.usn);

    if (isDup) {
      matches.push({
        studentId: candidate.studentId,
        usn: candidate.usn,
        studentName: candidate.fullName,
        confidence,
        livenessPassed,
        duplicateDetected: true,
        disposition: 'duplicate_rejected',
        reason: 'Duplicate face detection or student already marked Present.',
      });
      continue;
    }

    if (confidence >= 0.85 && livenessPassed) {
      matches.push({
        studentId: candidate.studentId,
        usn: candidate.usn,
        studentName: candidate.fullName,
        confidence,
        livenessPassed: true,
        duplicateDetected: false,
        disposition: 'matched',
        reason: det.reason || 'Verified identity and liveness passed.',
      });
    } else {
      matches.push({
        studentId: candidate.studentId,
        usn: candidate.usn,
        studentName: candidate.fullName,
        confidence,
        livenessPassed,
        duplicateDetected: false,
        disposition: 'pending_review',
        reason:
          det.reason ||
          (!livenessPassed
            ? 'Liveness check uncertain — queued for teacher verification.'
            : 'Match confidence below threshold — queued for teacher review.'),
      });
    }
  }

  // Persist verification logs and update attendance safely
  const insertLog = db.prepare(
    `INSERT INTO face_verification_logs (session_id, student_id, matched_usn, confidence_score, liveness_passed, duplicate_detected, disposition, raw_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );

  for (const m of matches) {
    insertLog.run(
      params.sessionId,
      m.studentId,
      m.usn,
      m.confidence,
      m.livenessPassed ? 1 : 0,
      m.duplicateDetected ? 1 : 0,
      m.disposition,
      m.reason
    );
  }

  return {
    facesDetectedCount: Number(parsed.facesDetectedCount ?? matches.length),
    matches,
    summary: parsed.summary || 'Face verification completed.',
  };
}
