import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  History,
  LayoutDashboard,
  Lock,
  ScanFace,
  Upload,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PortalLayout, type NavItem } from '../components/PortalLayout';
import { AttendanceStatusText, CategoryStatusText } from '../components/StatusText';

interface TeacherDashboardData {
  profile: {
    id: number;
    faculty_id: string;
    designation: string;
    specialization: string | null;
    department_code: string;
    department_name: string;
    full_name: string;
    email: string;
    phone: string | null;
  };
  todayDay: string;
  todayDate: string;
  assignedSubjects: Array<{
    id: number;
    code: string;
    name: string;
    credits: number;
    department_code: string;
    department_name: string;
    semester_name: string;
    section_id: number;
    section_name: string;
    enrolled_students: number;
  }>;
  todaysTimetable: Array<{
    id: number;
    subject_id: number;
    subject_code: string;
    subject_name: string;
    section_name: string;
    semester_name: string;
    department_code: string;
    start_time: string;
    end_time: string;
    room_no: string;
    existing_session_id: number | null;
    session_code: string | null;
    session_status: string | null;
  }>;
  totalConducted: number;
  recentSessions: Array<{
    id: number;
    session_code: string;
    session_date: string;
    start_time: string;
    end_time: string;
    status: string;
    topic: string | null;
    subject_code: string;
    subject_name: string;
    section_name: string;
    present_cnt: number;
    absent_cnt: number;
    pending_cnt: number;
  }>;
}

interface SessionDetailData {
  session: {
    id: number;
    session_code: string;
    session_date: string;
    start_time: string;
    end_time: string;
    topic: string | null;
    status: 'scheduled' | 'in_progress' | 'finalized' | 'cancelled';
    subject_code: string;
    subject_name: string;
    section_name: string;
    semester_name: string;
    department_name: string;
  };
  roster: Array<{
    student_id: number;
    usn: string;
    full_name: string;
    face_consent: number;
    status: 'Present' | 'Absent' | 'Late' | 'Pending Review' | 'Excused';
    source: string | null;
    confidence_score: number | null;
    liveness_passed: number | null;
    notes: string | null;
  }>;
  faceLogs: Array<{
    id: number;
    matched_usn: string | null;
    student_name: string | null;
    confidence_score: number | null;
    liveness_passed: number;
    duplicate_detected: number;
    disposition: string;
    raw_notes: string | null;
    created_at: string;
  }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'classes', label: 'My Classes', icon: BookOpen },
  { id: 'timetable', label: 'Timetable', icon: Calendar },
  { id: 'take', label: 'Take Attendance', icon: ClipboardCheck },
  { id: 'history', label: 'Attendance History', icon: History },
  { id: 'reports', label: 'Student Reports', icon: BarChart3 },
];

const STATUS_OPTIONS: Array<'Present' | 'Absent' | 'Late' | 'Excused' | 'Pending Review'> = [
  'Present',
  'Absent',
  'Late',
  'Excused',
  'Pending Review',
];

export function TeacherDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState<TeacherDashboardData | null>(null);
  const [timetable, setTimetable] = useState<Array<{
    id: number;
    day_of_week: string;
    start_time: string;
    end_time: string;
    room_no: string;
    subject_code: string;
    subject_name: string;
    section_name: string;
  }>>([]);
  const [reports, setReports] = useState<Array<{
    subject: { id: number; code: string; name: string; section_name: string };
    students: Array<{
      studentId: number;
      usn: string;
      fullName: string;
      present: number;
      absent: number;
      conducted: number;
      percentage: number;
      category: string;
      requirementMessage: string;
    }>;
  }>>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active Session State
  const [selectedSubjectId, setSelectedSubjectId] = useState<number | ''>('');
  const [sessionDate, setSessionDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [topicInput, setTopicInput] = useState('');
  const [activeSessionId, setActiveSessionId] = useState<number | null>(null);
  const [sessionDetail, setSessionDetail] = useState<SessionDetailData | null>(null);
  const [draftStatuses, setDraftStatuses] = useState<Record<number, SessionDetailData['roster'][number]['status']>>({});
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const [savingDraft, setSavingDraft] = useState(false);
  const [finalizing, setFinalizing] = useState(false);

  // AI Face Verification State
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [cameraRunning, setCameraRunning] = useState(false);
  const [verifyingFaces, setVerifyingFaces] = useState(false);
  const [faceResultSummary, setFaceResultSummary] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [dashRes, ttRes, repRes] = await Promise.all([
        apiFetch<TeacherDashboardData>('/api/teacher/dashboard'),
        apiFetch<{ timetable: typeof timetable }>('/api/teacher/timetable'),
        apiFetch<{ reports: typeof reports }>('/api/teacher/reports'),
      ]);
      setData(dashRes);
      setTimetable(ttRes.timetable);
      setReports(repRes.reports);
      if (!selectedSubjectId && dashRes.assignedSubjects.length > 0) {
        setSelectedSubjectId(dashRes.assignedSubjects[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load teacher portal.');
    } finally {
      setLoading(false);
    }
  }, [selectedSubjectId]);

  useEffect(() => {
    loadDashboard();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [loadDashboard]);

  const loadSessionDetail = useCallback(async (sessionId: number) => {
    setActionErr(null);
    try {
      const detail = await apiFetch<SessionDetailData>(`/api/teacher/sessions/${sessionId}`);
      setSessionDetail(detail);
      setActiveSessionId(sessionId);
      setTopicInput(detail.session.topic || '');
      const statusMap: Record<number, SessionDetailData['roster'][number]['status']> = {};
      for (const r of detail.roster) {
        statusMap[r.student_id] = r.status;
      }
      setDraftStatuses(statusMap);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to load session.');
    }
  }, []);

  const handleStartSession = async (opts?: {
    subjectId: number;
    timetableId?: number;
    date?: string;
    start?: string;
    end?: string;
  }) => {
    const subId = opts?.subjectId ?? Number(selectedSubjectId);
    if (!subId) return;
    setActionErr(null);
    setActionMsg(null);
    try {
      const res = await apiFetch<{ sessionId: number }>('/api/teacher/sessions', {
        method: 'POST',
        body: JSON.stringify({
          subjectId: subId,
          timetableId: opts?.timetableId,
          sessionDate: opts?.date || sessionDate,
          startTime: opts?.start || startTime,
          endTime: opts?.end || endTime,
          topic: topicInput,
        }),
      });
      setActiveTab('take');
      await loadSessionDetail(res.sessionId);
      loadDashboard();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to start session.');
    }
  };

  const handleSaveDraft = async () => {
    if (!activeSessionId || !sessionDetail) return;
    setSavingDraft(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      const records = sessionDetail.roster.map((r) => ({
        studentId: r.student_id,
        status: draftStatuses[r.student_id] || r.status,
      }));
      await apiFetch(`/api/teacher/sessions/${activeSessionId}/attendance`, {
        method: 'PUT',
        body: JSON.stringify({ records, topic: topicInput }),
      });
      setActionMsg('Attendance draft saved. Review and finalize when ready.');
      await loadSessionDetail(activeSessionId);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to save draft.');
    } finally {
      setSavingDraft(false);
    }
  };

  const handleFinalizeSession = async () => {
    if (!activeSessionId || !sessionDetail) return;
    setFinalizing(true);
    setActionErr(null);
    setActionMsg(null);
    try {
      // Save latest draft marks first
      const records = sessionDetail.roster.map((r) => ({
        studentId: r.student_id,
        status: draftStatuses[r.student_id] || r.status,
      }));
      await apiFetch(`/api/teacher/sessions/${activeSessionId}/attendance`, {
        method: 'PUT',
        body: JSON.stringify({ records, topic: topicInput }),
      });

      const res = await apiFetch<{
        message: string;
        notifications: { createdCount: number; sentCount: number; failedCount: number };
      }>(`/api/teacher/sessions/${activeSessionId}/finalize`, {
        method: 'POST',
      });

      setActionMsg(
        `${res.message} Parent alerts queued: ${res.notifications.createdCount} (${res.notifications.sentCount} sent, ${res.notifications.failedCount} pending/failed).`
      );
      await loadSessionDetail(activeSessionId);
      loadDashboard();
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to finalize session.');
    } finally {
      setFinalizing(false);
    }
  };

  const startClassroomCamera = async () => {
    setActionErr(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setCameraRunning(true);
      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 50);
    } catch {
      setActionErr('Camera access denied or unavailable. Upload a classroom photo instead.');
    }
  };

  const stopClassroomCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraRunning(false);
  };

  const runFaceVerification = async (imageBase64: string, mimeType = 'image/jpeg') => {
    if (!activeSessionId) return;
    setVerifyingFaces(true);
    setActionErr(null);
    setFaceResultSummary(null);
    try {
      const res = await apiFetch<{
        facesDetectedCount: number;
        summary: string;
        matches: Array<{
          usn: string | null;
          studentName: string | null;
          confidence: number;
          disposition: string;
          reason: string;
        }>;
      }>(`/api/teacher/sessions/${activeSessionId}/face-verify`, {
        method: 'POST',
        body: JSON.stringify({ imageBase64, mimeType }),
      });
      setFaceResultSummary(
        `Detected ${res.facesDetectedCount} face(s). ${res.summary}`
      );
      await loadSessionDetail(activeSessionId);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Face verification failed.');
    } finally {
      setVerifyingFaces(false);
    }
  };

  const handleCaptureCameraFrame = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      runFaceVerification(dataUrl, 'image/jpeg');
    }
  };

  const handleUploadClassroomPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        runFaceVerification(reader.result, file.type || 'image/jpeg');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleResolvePendingFace = async (studentId: number, decision: 'Present' | 'Absent' | 'Late') => {
    if (!activeSessionId) return;
    try {
      await apiFetch(`/api/teacher/sessions/${activeSessionId}/review-face`, {
        method: 'POST',
        body: JSON.stringify({ studentId, decision }),
      });
      await loadSessionDetail(activeSessionId);
    } catch (err) {
      setActionErr(err instanceof Error ? err.message : 'Unable to resolve pending review.');
    }
  };

  if (!user) return null;

  const isLocked =
    sessionDetail?.session.status === 'finalized' ||
    sessionDetail?.session.status === 'cancelled';

  const pendingReviews =
    sessionDetail?.roster.filter((r) => (draftStatuses[r.student_id] || r.status) === 'Pending Review') || [];

  return (
    <PortalLayout
      user={user}
      portalLabel="Faculty Portal"
      navItems={NAV_ITEMS}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onLogout={logout}
    >
      {loading ? (
        <div className="h-44 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : error || !data ? (
        <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
          {error || 'Unable to load teacher portal.'}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Teacher Profile Summary Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono font-semibold text-[#1D4ED8]">{data.profile.faculty_id}</span>
                <span aria-hidden="true">·</span>
                <span>{data.profile.designation}</span>
                <span aria-hidden="true">·</span>
                <span>{data.profile.department_name}</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-[#0B1F3A] mt-1">
                {data.profile.full_name}
              </h2>
            </div>

            <div className="flex items-center gap-6 text-right">
              <div>
                <p className="text-xs text-slate-500">Assigned Classes</p>
                <p className="font-mono tabular-nums text-xl font-bold text-slate-900">
                  {data.assignedSubjects.length}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Classes Conducted</p>
                <p className="font-mono tabular-nums text-xl font-bold text-[#1D4ED8]">
                  {data.totalConducted}
                </p>
              </div>
            </div>
          </div>

          {/* TAB: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-base text-slate-900">
                      Today’s Timetable ({data.todayDay} · {data.todayDate})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Start a period session to mark attendance manually or via AI camera verification.
                    </p>
                  </div>
                </div>

                {data.todaysTimetable.length === 0 ? (
                  <p className="text-sm text-slate-500 py-6">No classes scheduled today.</p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {data.todaysTimetable.map((slot) => (
                      <div key={slot.id} className="py-3.5 flex flex-wrap items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-xs font-mono text-[#1D4ED8]">
                            <span>{slot.start_time} - {slot.end_time}</span>
                            <span aria-hidden="true">·</span>
                            <span>Room {slot.room_no}</span>
                            <span aria-hidden="true">·</span>
                            <span>{slot.section_name}</span>
                          </div>
                          <p className="text-sm font-semibold text-slate-900 mt-0.5">
                            {slot.subject_code} · {slot.subject_name}
                          </p>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {slot.existing_session_id ? (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveTab('take');
                                loadSessionDetail(slot.existing_session_id!);
                              }}
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#EFF6FF] text-[#1D4ED8] hover:bg-blue-100"
                            >
                              {slot.session_status === 'finalized' ? 'View Finalized' : 'Resume Session'}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() =>
                                handleStartSession({
                                  subjectId: slot.subject_id,
                                  timetableId: slot.id,
                                  date: data.todayDate,
                                  start: slot.start_time,
                                  end: slot.end_time,
                                })
                              }
                              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#0B1F3A] text-white hover:bg-[#16345E]"
                            >
                              Start Class Session
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-base text-slate-900">Recent Class Sessions</h3>
                <div className="divide-y divide-slate-100">
                  {data.recentSessions.slice(0, 6).map((s) => (
                    <div key={s.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-900 truncate">
                          {s.subject_code} · {s.section_name}
                        </p>
                        <p className="text-xs font-mono text-slate-500">
                          {s.session_date} · {s.start_time} · P:{s.present_cnt} A:{s.absent_cnt}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab('take');
                          loadSessionDetail(s.id);
                        }}
                        className="text-xs font-medium text-[#1D4ED8] hover:underline shrink-0"
                      >
                        {s.status === 'finalized' ? 'Finalized' : 'Open'}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: MY CLASSES */}
          {activeTab === 'classes' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {data.assignedSubjects.map((sub) => (
                <div key={sub.id} className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="text-xs font-mono text-[#1D4ED8] font-semibold">
                      {sub.code} · {sub.section_name}
                    </div>
                    <h3 className="font-display font-semibold text-base text-slate-900 mt-1">
                      {sub.name}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">
                      {sub.department_name} · {sub.semester_name}
                    </p>
                  </div>
                  <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                    <span className="text-xs font-mono text-slate-600">
                      {sub.enrolled_students} students · {sub.credits} credits
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedSubjectId(sub.id);
                        setActiveTab('take');
                      }}
                      className="text-xs font-semibold text-[#1D4ED8] hover:underline"
                    >
                      Take Attendance
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB: TIMETABLE */}
          {activeTab === 'timetable' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <h3 className="font-semibold text-base text-slate-900">Faculty Weekly Schedule</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Day</th>
                      <th className="py-3 px-4">Time</th>
                      <th className="py-3 px-4">Subject</th>
                      <th className="py-3 px-4">Section</th>
                      <th className="py-3 px-4">Room</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {timetable.map((slot) => (
                      <tr key={slot.id}>
                        <td className="py-3 px-4 font-medium">{slot.day_of_week}</td>
                        <td className="py-3 px-4 font-mono text-xs">{slot.start_time} - {slot.end_time}</td>
                        <td className="py-3 px-4">{slot.subject_code} · {slot.subject_name}</td>
                        <td className="py-3 px-4 font-mono text-xs">{slot.section_name}</td>
                        <td className="py-3 px-4 font-mono text-xs">{slot.room_no}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: TAKE ATTENDANCE */}
          {activeTab === 'take' && (
            <div className="space-y-6">
              {/* Session Launcher */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-base text-slate-900">Start or Resume Class Session</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                  <div className="lg:col-span-2">
                    <label className="block text-xs font-medium text-slate-600 mb-1">Subject &amp; Section</label>
                    <select
                      value={selectedSubjectId}
                      onChange={(e) => setSelectedSubjectId(Number(e.target.value))}
                      className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                    >
                      {data.assignedSubjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.code} · {s.name} ({s.section_name})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Date</label>
                    <input
                      type="date"
                      value={sessionDate}
                      onChange={(e) => setSessionDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Period Window</label>
                    <div className="flex gap-1.5">
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-1/2 px-2 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                      />
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-1/2 px-2 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>
                  <div className="flex items-end">
                    <button
                      type="button"
                      onClick={() => handleStartSession()}
                      className="w-full py-2 px-4 text-sm font-semibold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#16345E]"
                    >
                      Start / Load Session
                    </button>
                  </div>
                </div>
              </div>

              {actionErr && (
                <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
                  {actionErr}
                </div>
              )}
              {actionMsg && (
                <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                  {actionMsg}
                </div>
              )}

              {/* Active Session Workspace */}
              {sessionDetail && (
                <div className="space-y-6">
                  <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono font-semibold text-[#1D4ED8]">
                            {sessionDetail.session.session_code}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{sessionDetail.session.session_date}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">
                            {sessionDetail.session.start_time} - {sessionDetail.session.end_time}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>Section {sessionDetail.session.section_name}</span>
                        </div>
                        <h3 className="font-display text-lg font-bold text-slate-900 mt-1">
                          {sessionDetail.session.subject_code} · {sessionDetail.session.subject_name}
                        </h3>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {!isLocked && (
                          <>
                            <button
                              type="button"
                              onClick={() => setAiPanelOpen(!aiPanelOpen)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#EFF6FF] text-[#1D4ED8] hover:bg-blue-100"
                            >
                              <ScanFace className="w-4 h-4" />
                              <span>{aiPanelOpen ? 'Hide AI Camera' : 'AI Face Verification'}</span>
                            </button>
                            <button
                              type="button"
                              disabled={savingDraft}
                              onClick={handleSaveDraft}
                              className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                            >
                              {savingDraft ? 'Saving...' : 'Save Draft'}
                            </button>
                            <button
                              type="button"
                              disabled={finalizing}
                              onClick={handleFinalizeSession}
                              className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-[#0B1F3A] text-white hover:bg-[#16345E] disabled:opacity-60"
                            >
                              <CheckCircle2 className="w-4 h-4" />
                              <span>{finalizing ? 'Finalizing...' : 'Submit & Finalize'}</span>
                            </button>
                          </>
                        )}
                        {isLocked && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 rounded-lg border border-emerald-200">
                            <Lock className="w-3.5 h-3.5" />
                            <span>Session {sessionDetail.session.status.toUpperCase()}</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">
                        Lecture Topic Covered
                      </label>
                      <input
                        type="text"
                        disabled={isLocked}
                        value={topicInput}
                        onChange={(e) => setTopicInput(e.target.value)}
                        placeholder="e.g., B+ Tree Indexing & Transaction Isolation"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                  </div>

                  {/* AI Face Recognition Module */}
                  {aiPanelOpen && !isLocked && (
                    <div className="bg-white border border-blue-200 rounded-xl p-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h4 className="font-semibold text-sm text-slate-900">
                            AI Classroom Face Recognition &amp; Liveness Verification
                          </h4>
                          <p className="text-xs text-slate-500 mt-0.5">
                            Only consented students are matched. High-confidence liveness passes mark Present; uncertain matches enter Pending Review; unrecognized faces never auto-mark Absent.
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          {!cameraRunning ? (
                            <button
                              type="button"
                              onClick={startClassroomCamera}
                              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-[#1D4ED8] text-white rounded-lg hover:bg-blue-700"
                            >
                              <Camera className="w-3.5 h-3.5" />
                              <span>Start Camera</span>
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={verifyingFaces}
                                onClick={handleCaptureCameraFrame}
                                className="px-3 py-2 text-xs font-semibold bg-emerald-700 text-white rounded-lg hover:bg-emerald-800"
                              >
                                {verifyingFaces ? 'Analyzing Frame...' : 'Capture & Verify Faces'}
                              </button>
                              <button
                                type="button"
                                onClick={stopClassroomCamera}
                                className="px-3 py-2 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg"
                              >
                                Stop Camera
                              </button>
                            </>
                          )}

                          <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            <span>Upload Classroom Photo</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handleUploadClassroomPhoto}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>

                      {cameraRunning && (
                        <video
                          ref={videoRef}
                          autoPlay
                          playsInline
                          className="w-full max-w-md rounded-lg border border-slate-200 bg-black"
                        />
                      )}

                      {faceResultSummary && (
                        <div className="p-3 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-900">
                          {faceResultSummary}
                        </div>
                      )}

                      {sessionDetail.faceLogs.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-xs font-semibold text-slate-700">Recent AI Verification Log</p>
                          <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-lg text-xs">
                            {sessionDetail.faceLogs.map((log) => (
                              <div key={log.id} className="px-3 py-2 flex items-center justify-between gap-2">
                                <span>
                                  <strong className="font-mono">{log.matched_usn || 'UNRECOGNIZED'}</strong>
                                  {log.student_name ? ` (${log.student_name})` : ''} · {log.disposition} ·{' '}
                                  {log.raw_notes}
                                </span>
                                <span className="font-mono text-slate-500 shrink-0">
                                  {log.confidence_score !== null ? `${Math.round(log.confidence_score * 100)}%` : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Pending Review Queue */}
                  {pendingReviews.length > 0 && !isLocked && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-3">
                      <h4 className="font-semibold text-sm text-amber-900">
                        Pending Review ({pendingReviews.length} uncertain face match{pendingReviews.length > 1 ? 'es' : ''})
                      </h4>
                      <div className="divide-y divide-amber-200/70">
                        {pendingReviews.map((r) => (
                          <div key={r.student_id} className="py-2.5 flex flex-wrap items-center justify-between gap-3">
                            <div className="text-xs">
                              <span className="font-mono font-semibold text-slate-900">{r.usn}</span>
                              <span className="mx-1.5">·</span>
                              <span className="font-medium text-slate-900">{r.full_name}</span>
                              <span className="ml-2 text-amber-800">{r.notes}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => handleResolvePendingFace(r.student_id, 'Present')}
                                className="px-2.5 py-1 text-xs font-semibold bg-emerald-700 text-white rounded"
                              >
                                Approve Present
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResolvePendingFace(r.student_id, 'Late')}
                                className="px-2.5 py-1 text-xs font-semibold bg-amber-600 text-white rounded"
                              >
                                Mark Late
                              </button>
                              <button
                                type="button"
                                onClick={() => handleResolvePendingFace(r.student_id, 'Absent')}
                                className="px-2.5 py-1 text-xs font-semibold bg-red-700 text-white rounded"
                              >
                                Mark Absent
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Student Roster Table */}
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                      <h4 className="font-semibold text-sm text-slate-900">
                        Registered Section Roster ({sessionDetail.roster.length} students)
                      </h4>
                      {!isLocked && (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              const next: Record<number, 'Present'> = {};
                              sessionDetail.roster.forEach((r) => (next[r.student_id] = 'Present'));
                              setDraftStatuses(next);
                            }}
                            className="text-xs font-medium text-[#1D4ED8] hover:underline"
                          >
                            Mark All Present
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                            <th className="py-3 px-4">USN</th>
                            <th className="py-3 px-4">Student Name</th>
                            <th className="py-3 px-4">Source</th>
                            <th className="py-3 px-4">Current Mark</th>
                            <th className="py-3 px-4">Set Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {sessionDetail.roster.map((stu) => {
                            const current = draftStatuses[stu.student_id] || stu.status;
                            return (
                              <tr key={stu.student_id} className="hover:bg-slate-50/70">
                                <td className="py-3 px-4 font-mono text-xs font-semibold text-slate-900">
                                  {stu.usn}
                                </td>
                                <td className="py-3 px-4 font-medium text-slate-900">{stu.full_name}</td>
                                <td className="py-3 px-4 text-xs text-slate-500">
                                  {stu.source === 'face_ai' ? 'AI Face Verification' : 'Manual'}
                                </td>
                                <td className="py-3 px-4">
                                  <AttendanceStatusText status={current} />
                                </td>
                                <td className="py-3 px-4">
                                  <div className="flex flex-wrap gap-1">
                                    {STATUS_OPTIONS.map((opt) => (
                                      <button
                                        key={opt}
                                        type="button"
                                        disabled={isLocked}
                                        onClick={() =>
                                          setDraftStatuses((prev) => ({
                                            ...prev,
                                            [stu.student_id]: opt,
                                          }))
                                        }
                                        className={`px-2.5 py-1 rounded text-xs font-medium transition-colors disabled:opacity-50 ${
                                          current === opt
                                            ? opt === 'Present'
                                              ? 'bg-emerald-700 text-white'
                                              : opt === 'Absent'
                                              ? 'bg-red-700 text-white'
                                              : opt === 'Late'
                                              ? 'bg-amber-600 text-white'
                                              : 'bg-[#0B1F3A] text-white'
                                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                        }`}
                                      >
                                        {opt}
                                      </button>
                                    ))}
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: ATTENDANCE HISTORY */}
          {activeTab === 'history' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <h3 className="font-semibold text-base text-slate-900">Conducted &amp; In-Progress Sessions</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Session ID</th>
                      <th className="py-3 px-4">Date &amp; Time</th>
                      <th className="py-3 px-4">Subject &amp; Section</th>
                      <th className="py-3 px-4 text-right">Present</th>
                      <th className="py-3 px-4 text-right">Absent</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {data.recentSessions.map((s) => (
                      <tr key={s.id}>
                        <td className="py-3 px-4 font-mono text-xs">{s.session_code}</td>
                        <td className="py-3 px-4 font-mono text-xs">
                          {s.session_date} · {s.start_time}-{s.end_time}
                        </td>
                        <td className="py-3 px-4">
                          {s.subject_code} · {s.subject_name} ({s.section_name})
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{s.present_cnt}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-red-700">{s.absent_cnt}</td>
                        <td className="py-3 px-4 capitalize text-xs font-medium">{s.status}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('take');
                              loadSessionDetail(s.id);
                            }}
                            className="text-xs font-semibold text-[#1D4ED8] hover:underline"
                          >
                            View Roster
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: STUDENT REPORTS */}
          {activeTab === 'reports' && (
            <div className="space-y-6">
              {reports.map((rep) => (
                <div key={rep.subject.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold text-base text-slate-900">
                        {rep.subject.code} · {rep.subject.name}
                      </h3>
                      <p className="text-xs text-slate-500">Section {rep.subject.section_name}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                          <th className="py-3 px-4">USN</th>
                          <th className="py-3 px-4">Student Name</th>
                          <th className="py-3 px-4 text-right">Present</th>
                          <th className="py-3 px-4 text-right">Conducted</th>
                          <th className="py-3 px-4 text-right">Attendance %</th>
                          <th className="py-3 px-4">Category</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-sm">
                        {rep.students.map((stu) => (
                          <tr key={stu.studentId}>
                            <td className="py-3 px-4 font-mono text-xs font-semibold">{stu.usn}</td>
                            <td className="py-3 px-4">{stu.fullName}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">{stu.present}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums">{stu.conducted}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                              {stu.percentage.toFixed(2)}%
                            </td>
                            <td className="py-3 px-4">
                              <CategoryStatusText category={stu.category} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </PortalLayout>
  );
}
