import { db } from './db.ts';

interface AbsentStudentRecord {
  attendanceId: number;
  studentId: number;
  studentName: string;
  usn: string;
  departmentName: string;
  subjectName: string;
  sessionDate: string;
  startTime: string;
  endTime: string;
}

interface LinkedParentRow {
  parentId: number;
  parentName: string;
  email: string;
  phone: string | null;
  preferredChannel: 'sms' | 'email' | 'whatsapp';
  whatsappConsent: number;
  accessToken: string;
}

export function formatAbsenceMessage(record: AbsentStudentRecord): string {
  return [
    'Dear Parent,',
    '',
    `Your child ${record.studentName} has been marked absent.`,
    '',
    `Student ID: ${record.usn}`,
    `Department: ${record.departmentName}`,
    `Subject: ${record.subjectName}`,
    `Date: ${record.sessionDate}`,
    `Class Time: ${record.startTime} - ${record.endTime}`,
    'Attendance Status: Absent',
    '',
    'Please contact the university if required.',
  ].join('\n');
}

async function dispatchSmsViaMsg91(phone: string, message: string): Promise<{ ok: boolean; detail: string }> {
  const authKey = process.env.MSG91_AUTH_KEY;
  if (!authKey) {
    return { ok: false, detail: 'MSG91_AUTH_KEY not configured on server.' };
  }
  try {
    const cleanPhone = phone.replace(/[^\d+]/g, '');
    const res = await fetch('https://control.msg91.com/api/v5/flow/', {
      method: 'POST',
      headers: {
        authkey: authKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        template_id: process.env.MSG91_TEMPLATE_ID || '',
        sender: process.env.MSG91_SENDER_ID || 'UNIATT',
        mobiles: cleanPhone,
        message,
      }),
    });
    const text = await res.text();
    return res.ok ? { ok: true, detail: text } : { ok: false, detail: `MSG91 HTTP ${res.status}: ${text}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'MSG91 request failed' };
  }
}

async function dispatchEmailViaResend(
  toEmail: string,
  subject: string,
  textBody: string
): Promise<{ ok: boolean; detail: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { ok: false, detail: 'RESEND_API_KEY not configured on server.' };
  }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'University Attendance ERP <attendance@university.edu>',
        to: [toEmail],
        subject,
        text: textBody,
      }),
    });
    const text = await res.text();
    return res.ok ? { ok: true, detail: text } : { ok: false, detail: `Resend HTTP ${res.status}: ${text}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'Resend request failed' };
  }
}

async function dispatchWhatsAppCloud(
  phone: string,
  message: string,
  whatsappConsent: boolean
): Promise<{ ok: boolean; detail: string }> {
  if (!whatsappConsent) {
    return { ok: false, detail: 'Parent has not consented to WhatsApp notifications.' };
  }
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) {
    return { ok: false, detail: 'WHATSAPP_TOKEN or WHATSAPP_PHONE_NUMBER_ID not configured on server.' };
  }
  try {
    const cleanPhone = phone.replace(/[^\d]/g, '');
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: cleanPhone,
        type: 'text',
        text: { body: message },
      }),
    });
    const text = await res.text();
    return res.ok ? { ok: true, detail: text } : { ok: false, detail: `WhatsApp HTTP ${res.status}: ${text}` };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : 'WhatsApp request failed' };
  }
}

export async function dispatchChannel(
  channel: 'sms' | 'email' | 'whatsapp',
  recipient: string,
  subject: string,
  message: string,
  whatsappConsent: boolean
): Promise<{ status: 'sent' | 'failed'; detail: string }> {
  let result: { ok: boolean; detail: string };
  if (channel === 'email') {
    result = await dispatchEmailViaResend(recipient, subject, message);
  } else if (channel === 'sms') {
    result = await dispatchSmsViaMsg91(recipient, message);
  } else {
    result = await dispatchWhatsAppCloud(recipient, message, whatsappConsent);
  }

  return {
    status: result.ok ? 'sent' : 'failed',
    detail: result.detail,
  };
}

/**
 * Automatically creates & dispatches parent notifications ONLY AFTER a session is finalized.
 * Prevents duplicate notifications via unique constraints on (attendance_id, parent_id) and (notification_id, channel).
 */
export async function processFinalizedSessionNotifications(sessionId: number): Promise<{
  createdCount: number;
  sentCount: number;
  failedCount: number;
}> {
  const session = db
    .prepare(`SELECT id, status FROM class_sessions WHERE id = ?`)
    .get(sessionId) as { id: number; status: string } | undefined;

  if (!session || session.status !== 'finalized') {
    return { createdCount: 0, sentCount: 0, failedCount: 0 };
  }

  const absentRecords = db
    .prepare(
      `SELECT
         a.id AS attendanceId,
         s.id AS studentId,
         sp.full_name AS studentName,
         s.usn,
         d.name AS departmentName,
         sub.name AS subjectName,
         cs.session_date AS sessionDate,
         cs.start_time AS startTime,
         cs.end_time AS endTime
       FROM attendance a
       JOIN class_sessions cs ON cs.id = a.session_id
       JOIN students s ON s.id = a.student_id
       JOIN profiles sp ON sp.id = s.profile_id
       JOIN departments d ON d.id = s.department_id
       JOIN subjects sub ON sub.id = cs.subject_id
       WHERE a.session_id = ? AND a.status = 'Absent'`
    )
    .all(sessionId) as AbsentStudentRecord[];

  let createdCount = 0;
  let sentCount = 0;
  let failedCount = 0;

  for (const record of absentRecords) {
    const parents = db
      .prepare(
        `SELECT
           par.id AS parentId,
           pp.full_name AS parentName,
           pp.email,
           pp.phone,
           par.preferred_channel AS preferredChannel,
           par.whatsapp_consent AS whatsappConsent,
           par.access_token AS accessToken
         FROM student_parents sp_link
         JOIN parents par ON par.id = sp_link.parent_id
         JOIN profiles pp ON pp.id = par.profile_id
         WHERE sp_link.student_id = ?`
      )
      .all(record.studentId) as LinkedParentRow[];

    for (const parent of parents) {
      const existingNotif = db
        .prepare(`SELECT id FROM notifications WHERE attendance_id = ? AND parent_id = ?`)
        .get(record.attendanceId, parent.parentId) as { id: number } | undefined;

      if (existingNotif) {
        continue; // Prevent duplicate notifications
      }

      const title = `Absence Alert: ${record.studentName} (${record.usn}) — ${record.subjectName}`;
      const message = formatAbsenceMessage(record);

      const insertResult = db
        .prepare(
          `INSERT INTO notifications (attendance_id, session_id, student_id, parent_id, title, message)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(record.attendanceId, sessionId, record.studentId, parent.parentId, title, message);

      const notificationId = Number(insertResult.lastInsertRowid);
      createdCount += 1;

      const channels: Array<{ channel: 'sms' | 'email' | 'whatsapp'; recipient: string }> = [];
      if (parent.email) {
        channels.push({ channel: 'email', recipient: parent.email });
      }
      if (parent.phone) {
        channels.push({ channel: 'sms', recipient: parent.phone });
        if (parent.whatsappConsent) {
          channels.push({ channel: 'whatsapp', recipient: parent.phone });
        }
      }

      for (const ch of channels) {
        const existingLog = db
          .prepare(`SELECT id FROM notification_logs WHERE notification_id = ? AND channel = ?`)
          .get(notificationId, ch.channel);
        if (existingLog) continue;

        const dispatchRes = await dispatchChannel(
          ch.channel,
          ch.recipient,
          title,
          message,
          Boolean(parent.whatsappConsent)
        );

        if (dispatchRes.status === 'sent') sentCount += 1;
        else failedCount += 1;

        db.prepare(
          `INSERT INTO notification_logs (notification_id, parent_id, channel, recipient, status, provider_response, error_message, sent_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).run(
          notificationId,
          parent.parentId,
          ch.channel,
          ch.recipient,
          dispatchRes.status,
          dispatchRes.status === 'sent' ? dispatchRes.detail : null,
          dispatchRes.status === 'failed' ? dispatchRes.detail : null,
          dispatchRes.status === 'sent' ? new Date().toISOString() : null
        );
      }
    }
  }

  return { createdCount, sentCount, failedCount };
}

export async function retryNotificationLog(logId: number) {
  const row = db
    .prepare(
      `SELECT
         nl.id,
         nl.channel,
         nl.recipient,
         nl.retry_count,
         n.title,
         n.message,
         par.whatsapp_consent
       FROM notification_logs nl
       JOIN notifications n ON n.id = nl.notification_id
       JOIN parents par ON par.id = nl.parent_id
       WHERE nl.id = ?`
    )
    .get(logId) as
    | {
        id: number;
        channel: 'sms' | 'email' | 'whatsapp';
        recipient: string;
        retry_count: number;
        title: string;
        message: string;
        whatsapp_consent: number;
      }
    | undefined;

  if (!row) {
    throw new Error('Notification log not found.');
  }

  const dispatchRes = await dispatchChannel(
    row.channel,
    row.recipient,
    row.title,
    row.message,
    Boolean(row.whatsapp_consent)
  );

  db.prepare(
    `UPDATE notification_logs
     SET status = ?,
         provider_response = ?,
         error_message = ?,
         retry_count = retry_count + 1,
         sent_at = CASE WHEN ? = 'sent' THEN datetime('now') ELSE sent_at END
     WHERE id = ?`
  ).run(
    dispatchRes.status,
    dispatchRes.status === 'sent' ? dispatchRes.detail : null,
    dispatchRes.status === 'failed' ? dispatchRes.detail : null,
    dispatchRes.status,
    logId
  );

  return {
    logId,
    status: dispatchRes.status,
    detail: dispatchRes.detail,
    retryCount: row.retry_count + 1,
  };
}
