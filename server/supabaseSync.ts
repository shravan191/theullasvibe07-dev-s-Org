import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { db } from './db.ts';
import {
  getActivePolicy,
  getAllStudentsAttendanceSummaries,
  round2,
} from './calculations.ts';

const MANAGEMENT_TABLES = [
  'management_report_snapshots',
  'management_student_attendance',
  'management_subject_attendance',
  'management_department_attendance',
  'management_notification_reports',
] as const;

export interface SupabaseSyncCounts {
  snapshots: number;
  students: number;
  subjects: number;
  departments: number;
  notifications: number;
}

export interface SupabaseStatusResult {
  configured: boolean;
  connected: boolean;
  projectRef: string | null;
  supabaseUrl: string | null;
  keyPreview: string | null;
  tablesReady: boolean;
  missingTables: string[];
  readyTables: string[];
  lastSyncedAt: string | null;
  lastSyncCounts: SupabaseSyncCounts | null;
  lastError: string | null;
  snapshotSummaries: Array<{
    report_type: string;
    title: string;
    row_count: number;
    synced_at: string;
  }>;
}

export interface SupabaseSyncResult {
  ok: boolean;
  configured: boolean;
  tablesReady: boolean;
  missingTables: string[];
  projectRef: string | null;
  syncedAt: string | null;
  counts: SupabaseSyncCounts;
  message: string;
  error?: string;
}

let lastSyncedAtMemory: string | null = null;
let lastSyncCountsMemory: SupabaseSyncCounts | null = null;
let lastSyncErrorMemory: string | null = null;

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || '').trim();
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const explicitKey = (process.env.SUPABASE_KEY || '').trim();
  const anonKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  const activeKey = serviceKey || explicitKey || anonKey;

  let projectRef: string | null = null;
  try {
    if (url) {
      const hostname = new URL(url).hostname;
      projectRef = hostname.split('.')[0] || null;
    }
  } catch {
    projectRef = null;
  }

  const keyPreview = activeKey
    ? activeKey.length > 18
      ? `${activeKey.slice(0, 14)}...${activeKey.slice(-4)}`
      : '***configured***'
    : null;

  return { url, activeKey, projectRef, keyPreview };
}

function getSupabaseServerClient(): SupabaseClient | null {
  const { url, activeKey } = getSupabaseConfig();
  if (!url || !activeKey) return null;
  return createClient(url, activeKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function isMissingTableError(err: { message?: string; code?: string; details?: string }): boolean {
  const code = (err.code || '').toUpperCase();
  const msg = `${err.message || ''} ${err.details || ''}`.toLowerCase();
  return (
    code === 'PGRST205' ||
    code === '42P01' ||
    msg.includes('could not find the table') ||
    msg.includes('schema cache') ||
    msg.includes('does not exist')
  );
}

export function getSupabaseManagementReportsSql(): string {
  return `-- University Attendance ERP — Supabase Management Reporting Tables & Views
-- Run this idempotent SQL once in your Supabase SQL Editor (Project: zgijvqlnfmecbwfjhqbi)
-- Once created, the University Attendance ERP backend automatically syncs live university reports here.

CREATE TABLE IF NOT EXISTS public.management_report_snapshots (
  report_type TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  row_count INT NOT NULL DEFAULT 0,
  summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  rows_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.management_student_attendance (
  usn TEXT PRIMARY KEY,
  student_name TEXT NOT NULL,
  email TEXT,
  department_code TEXT NOT NULL,
  department_name TEXT NOT NULL,
  semester_name TEXT NOT NULL,
  section_name TEXT NOT NULL,
  present_count INT NOT NULL DEFAULT 0,
  absent_count INT NOT NULL DEFAULT 0,
  conducted_count INT NOT NULL DEFAULT 0,
  attendance_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  category TEXT NOT NULL,
  classes_needed_for_target INT NOT NULL DEFAULT 0,
  requirement_message TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.management_subject_attendance (
  report_key TEXT PRIMARY KEY,
  subject_code TEXT NOT NULL,
  subject_name TEXT NOT NULL,
  section_name TEXT NOT NULL,
  semester_name TEXT NOT NULL,
  teacher_name TEXT NOT NULL,
  sessions_conducted INT NOT NULL DEFAULT 0,
  present_count INT NOT NULL DEFAULT 0,
  absent_count INT NOT NULL DEFAULT 0,
  attendance_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.management_department_attendance (
  department_code TEXT PRIMARY KEY,
  department_name TEXT NOT NULL,
  students_count INT NOT NULL DEFAULT 0,
  present_count INT NOT NULL DEFAULT 0,
  absent_count INT NOT NULL DEFAULT 0,
  attendance_percentage NUMERIC(5,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.management_notification_reports (
  log_id BIGINT PRIMARY KEY,
  usn TEXT NOT NULL,
  student_name TEXT NOT NULL,
  parent_name TEXT NOT NULL,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  status TEXT NOT NULL,
  retry_count INT NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  synced_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.v_management_shortage_students AS
SELECT
  usn,
  student_name,
  department_code,
  semester_name,
  section_name,
  present_count,
  conducted_count,
  attendance_percentage,
  category,
  classes_needed_for_target,
  requirement_message,
  updated_at
FROM public.management_student_attendance
WHERE conducted_count > 0 AND attendance_percentage < 75.00
ORDER BY attendance_percentage ASC, usn ASC;

-- Grant API access & enable RLS policies for server-side publishable/service sync and management reads
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON
  public.management_report_snapshots,
  public.management_student_attendance,
  public.management_subject_attendance,
  public.management_department_attendance,
  public.management_notification_reports
TO anon, authenticated;
GRANT SELECT ON public.v_management_shortage_students TO anon, authenticated;

ALTER TABLE public.management_report_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_student_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_subject_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_department_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.management_notification_reports ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'management_report_snapshots',
    'management_student_attendance',
    'management_subject_attendance',
    'management_department_attendance',
    'management_notification_reports'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "Management report read" ON public.%I', tbl);
    EXECUTE format('CREATE POLICY "Management report read" ON public.%I FOR SELECT TO anon, authenticated USING (true)', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Server report upsert" ON public.%I', tbl);
    EXECUTE format('CREATE POLICY "Server report upsert" ON public.%I FOR INSERT TO anon, authenticated WITH CHECK (true)', tbl);
    EXECUTE format('DROP POLICY IF EXISTS "Server report update" ON public.%I', tbl);
    EXECUTE format('CREATE POLICY "Server report update" ON public.%I FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true)', tbl);
  END LOOP;
END $$;
`;
}

function buildAllReportPayloads() {
  const policy = getActivePolicy();
  const studentSummaries = getAllStudentsAttendanceSummaries();

  const kpiCounts = db
    .prepare(
      `SELECT
         (SELECT COUNT(*) FROM students) AS totalStudents,
         (SELECT COUNT(*) FROM teachers) AS totalTeachers,
         (SELECT COUNT(*) FROM departments) AS totalDepartments,
         (SELECT COUNT(*) FROM subjects) AS totalSubjects,
         (SELECT COUNT(*) FROM class_sessions WHERE status = 'finalized') AS finalizedSessions`
    )
    .get() as {
    totalStudents: number;
    totalTeachers: number;
    totalDepartments: number;
    totalSubjects: number;
    finalizedSessions: number;
  };

  let sumPresent = 0;
  let sumConducted = 0;
  for (const s of studentSummaries) {
    sumPresent += s.present;
    sumConducted += s.conducted;
  }
  const overallUniversityPercentage =
    sumConducted > 0 ? round2((sumPresent / sumConducted) * 100) : 0;

  const below75Count = studentSummaries.filter(
    (s) => s.conducted > 0 && s.percentage < policy.minEligiblePercent
  ).length;
  const below65Count = studentSummaries.filter(
    (s) => s.conducted > 0 && s.percentage < policy.criticalShortagePercent
  ).length;

  const overviewSummary = {
    totalStudents: kpiCounts.totalStudents,
    totalTeachers: kpiCounts.totalTeachers,
    totalDepartments: kpiCounts.totalDepartments,
    totalSubjects: kpiCounts.totalSubjects,
    finalizedSessions: kpiCounts.finalizedSessions,
    below75Count,
    below65Count,
    overallUniversityPercentage,
    policyMinEligible: policy.minEligiblePercent,
    policyCriticalShortage: policy.criticalShortagePercent,
  };

  const subjectRowsRaw = db
    .prepare(
      `SELECT
         sub.code, sub.name, sec.name AS section_name, sem.name AS semester_name, tp.full_name AS teacher_name,
         COUNT(DISTINCT cs.id) AS sessions_conducted,
         SUM(CASE WHEN a.status IN ('Present', 'Late', 'Excused') THEN 1 ELSE 0 END) AS present_count,
         SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
         COUNT(a.id) AS total_records
       FROM subjects sub
       JOIN sections sec ON sec.id = sub.section_id
       JOIN semesters sem ON sem.id = sub.semester_id
       JOIN teachers t ON t.id = sub.teacher_id
       JOIN profiles tp ON tp.id = t.profile_id
       LEFT JOIN class_sessions cs ON cs.subject_id = sub.id AND cs.status = 'finalized'
       LEFT JOIN attendance a ON a.session_id = cs.id AND a.status != 'Pending Review'
       GROUP BY sub.id
       ORDER BY sub.code ASC`
    )
    .all() as Array<{
    code: string;
    name: string;
    section_name: string;
    semester_name: string;
    teacher_name: string;
    sessions_conducted: number;
    present_count: number;
    absent_count: number;
    total_records: number;
  }>;

  const departmentRowsRaw = db
    .prepare(
      `SELECT
         d.code, d.name,
         COUNT(DISTINCT s.id) AS students_count,
         SUM(CASE WHEN a.status IN ('Present', 'Late', 'Excused') THEN 1 ELSE 0 END) AS present_count,
         SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
         COUNT(a.id) AS total_records
       FROM departments d
       LEFT JOIN students s ON s.department_id = d.id
       LEFT JOIN attendance a ON a.student_id = s.id AND a.status != 'Pending Review'
       LEFT JOIN class_sessions cs ON cs.id = a.session_id AND cs.status = 'finalized'
       WHERE a.id IS NULL OR cs.id IS NOT NULL
       GROUP BY d.id
       ORDER BY d.code ASC`
    )
    .all() as Array<{
    code: string;
    name: string;
    students_count: number;
    present_count: number;
    absent_count: number;
    total_records: number;
  }>;

  const semesterRowsRaw = db
    .prepare(
      `SELECT
         sem.name AS semester_name, c.name AS course_name,
         COUNT(DISTINCT s.id) AS students_count,
         SUM(CASE WHEN a.status IN ('Present', 'Late', 'Excused') THEN 1 ELSE 0 END) AS present_count,
         SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
         COUNT(a.id) AS total_records
       FROM semesters sem
       JOIN courses c ON c.id = sem.course_id
       LEFT JOIN students s ON s.semester_id = sem.id
       LEFT JOIN attendance a ON a.student_id = s.id AND a.status != 'Pending Review'
       LEFT JOIN class_sessions cs ON cs.id = a.session_id AND cs.status = 'finalized'
       WHERE a.id IS NULL OR cs.id IS NOT NULL
       GROUP BY sem.id`
    )
    .all() as Array<{
    semester_name: string;
    course_name: string;
    students_count: number;
    present_count: number;
    absent_count: number;
    total_records: number;
  }>;

  const buildPeriodRows = (groupExpr: string) =>
    (
      db
        .prepare(
          `SELECT
             ${groupExpr} AS period,
             COUNT(DISTINCT cs.id) AS sessions_conducted,
             SUM(CASE WHEN a.status IN ('Present', 'Late', 'Excused') THEN 1 ELSE 0 END) AS present_count,
             SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
             COUNT(a.id) AS total_records
           FROM class_sessions cs
           JOIN attendance a ON a.session_id = cs.id
           WHERE cs.status = 'finalized' AND a.status != 'Pending Review'
           GROUP BY ${groupExpr}
           ORDER BY period DESC`
        )
        .all() as Array<{
        period: string;
        sessions_conducted: number;
        present_count: number;
        absent_count: number;
        total_records: number;
      }>
    ).map((r) => ({
      Period: r.period,
      'Sessions Conducted': r.sessions_conducted,
      Present: r.present_count,
      Absent: r.absent_count,
      'Total Marks': r.total_records,
      'Attendance %':
        r.total_records > 0 ? round2((r.present_count / r.total_records) * 100) : 0,
    }));

  const dailyRows = buildPeriodRows('cs.session_date');
  const weeklyRows = buildPeriodRows("strftime('%Y-W%W', cs.session_date)");
  const monthlyRows = buildPeriodRows('substr(cs.session_date, 1, 7)');

  const notificationLogsRaw = db
    .prepare(
      `SELECT nl.id AS log_id, nl.created_at, s.usn, sp.full_name AS student_name, pp.full_name AS parent_name,
              nl.channel, nl.recipient, nl.status, nl.retry_count
       FROM notification_logs nl
       JOIN notifications n ON n.id = nl.notification_id
       JOIN students s ON s.id = n.student_id
       JOIN profiles sp ON sp.id = s.profile_id
       JOIN parents par ON par.id = nl.parent_id
       JOIN profiles pp ON pp.id = par.profile_id
       ORDER BY nl.created_at DESC`
    )
    .all() as Array<{
    log_id: number;
    created_at: string;
    usn: string;
    student_name: string;
    parent_name: string;
    channel: string;
    recipient: string;
    status: string;
    retry_count: number;
  }>;

  const nowIso = new Date().toISOString();

  const studentTableRows = studentSummaries.map((s) => ({
    usn: s.usn,
    student_name: s.fullName,
    email: s.email,
    department_code: s.departmentCode,
    department_name: s.departmentName,
    semester_name: s.semesterName,
    section_name: s.sectionName,
    present_count: s.present,
    absent_count: s.absent,
    conducted_count: s.conducted,
    attendance_percentage: s.percentage,
    category: s.category,
    classes_needed_for_target: s.additionalClassesNeeded,
    requirement_message: s.requirementMessage,
    updated_at: nowIso,
  }));

  const subjectTableRows = subjectRowsRaw.map((r) => ({
    report_key: `${r.code}::${r.section_name}::${r.semester_name}`,
    subject_code: r.code,
    subject_name: r.name,
    section_name: r.section_name,
    semester_name: r.semester_name,
    teacher_name: r.teacher_name,
    sessions_conducted: r.sessions_conducted,
    present_count: r.present_count || 0,
    absent_count: r.absent_count || 0,
    attendance_percentage:
      r.total_records > 0 ? round2(((r.present_count || 0) / r.total_records) * 100) : 0,
    updated_at: nowIso,
  }));

  const departmentTableRows = departmentRowsRaw.map((r) => ({
    department_code: r.code,
    department_name: r.name,
    students_count: r.students_count,
    present_count: r.present_count || 0,
    absent_count: r.absent_count || 0,
    attendance_percentage:
      r.total_records > 0 ? round2(((r.present_count || 0) / r.total_records) * 100) : 0,
    updated_at: nowIso,
  }));

  const notificationTableRows = notificationLogsRaw.map((r) => ({
    log_id: r.log_id,
    usn: r.usn,
    student_name: r.student_name,
    parent_name: r.parent_name,
    channel: r.channel.toUpperCase(),
    recipient: r.recipient,
    status: r.status.toUpperCase(),
    retry_count: r.retry_count,
    created_at: r.created_at,
    synced_at: nowIso,
  }));

  const shortageRows = studentTableRows.filter(
    (s) => s.conducted_count > 0 && s.attendance_percentage < policy.minEligiblePercent
  );

  const semesterSnapshotRows = semesterRowsRaw.map((r) => ({
    Semester: r.semester_name,
    Program: r.course_name,
    Students: r.students_count,
    Present: r.present_count || 0,
    Absent: r.absent_count || 0,
    'Attendance %':
      r.total_records > 0 ? round2(((r.present_count || 0) / r.total_records) * 100) : 0,
  }));

  const snapshots = [
    {
      report_type: 'overview',
      title: 'University Executive Attendance Overview',
      row_count: departmentTableRows.length,
      summary_json: overviewSummary,
      rows_json: departmentTableRows,
      synced_at: nowIso,
    },
    {
      report_type: 'daily',
      title: 'Daily Session Attendance Report',
      row_count: dailyRows.length,
      summary_json: overviewSummary,
      rows_json: dailyRows,
      synced_at: nowIso,
    },
    {
      report_type: 'weekly',
      title: 'Weekly Attendance Trend Report',
      row_count: weeklyRows.length,
      summary_json: overviewSummary,
      rows_json: weeklyRows,
      synced_at: nowIso,
    },
    {
      report_type: 'monthly',
      title: 'Monthly Attendance Summary Report',
      row_count: monthlyRows.length,
      summary_json: overviewSummary,
      rows_json: monthlyRows,
      synced_at: nowIso,
    },
    {
      report_type: 'subject',
      title: 'Subject-Wise Faculty Attendance Report',
      row_count: subjectTableRows.length,
      summary_json: overviewSummary,
      rows_json: subjectTableRows,
      synced_at: nowIso,
    },
    {
      report_type: 'semester',
      title: 'Semester-Wise Program Attendance Report',
      row_count: semesterSnapshotRows.length,
      summary_json: overviewSummary,
      rows_json: semesterSnapshotRows,
      synced_at: nowIso,
    },
    {
      report_type: 'department',
      title: 'Department-Wise Attendance Report',
      row_count: departmentTableRows.length,
      summary_json: overviewSummary,
      rows_json: departmentTableRows,
      synced_at: nowIso,
    },
    {
      report_type: 'student',
      title: 'Student-Wise Master Attendance Register',
      row_count: studentTableRows.length,
      summary_json: overviewSummary,
      rows_json: studentTableRows,
      synced_at: nowIso,
    },
    {
      report_type: 'shortage',
      title: 'Attendance Shortage & Recovery Report',
      row_count: shortageRows.length,
      summary_json: {
        thresholdPercent: policy.minEligiblePercent,
        criticalPercent: policy.criticalShortagePercent,
        below75Count,
        below65Count,
      },
      rows_json: shortageRows,
      synced_at: nowIso,
    },
    {
      report_type: 'notifications',
      title: 'Parent Notification Delivery Log Report',
      row_count: notificationTableRows.length,
      summary_json: {
        totalLogs: notificationTableRows.length,
        sentLogs: notificationTableRows.filter((n) => n.status === 'SENT').length,
      },
      rows_json: notificationTableRows,
      synced_at: nowIso,
    },
  ];

  return {
    nowIso,
    snapshots,
    studentTableRows,
    subjectTableRows,
    departmentTableRows,
    notificationTableRows,
  };
}

export async function checkSupabaseConnection(): Promise<SupabaseStatusResult> {
  const { url, projectRef, keyPreview } = getSupabaseConfig();
  const client = getSupabaseServerClient();

  if (!client) {
    return {
      configured: false,
      connected: false,
      projectRef,
      supabaseUrl: url || null,
      keyPreview: null,
      tablesReady: false,
      missingTables: [...MANAGEMENT_TABLES],
      readyTables: [],
      lastSyncedAt: lastSyncedAtMemory,
      lastSyncCounts: lastSyncCountsMemory,
      lastError: 'Supabase credentials are not configured in server environment.',
      snapshotSummaries: [],
    };
  }

  const missingTables: string[] = [];
  const readyTables: string[] = [];
  let connected = false;
  let lastErr: string | null = lastSyncErrorMemory;

  for (const tbl of MANAGEMENT_TABLES) {
    try {
      const { error } = await client.from(tbl).select('*').limit(1);
      connected = true;
      if (error) {
        if (isMissingTableError(error)) {
          missingTables.push(tbl);
        } else {
          lastErr = error.message || `Error checking ${tbl}`;
        }
      } else {
        readyTables.push(tbl);
      }
    } catch (err) {
      lastErr = err instanceof Error ? err.message : 'Network error connecting to Supabase';
    }
  }

  const tablesReady = connected && missingTables.length === 0;
  let snapshotSummaries: SupabaseStatusResult['snapshotSummaries'] = [];

  if (readyTables.includes('management_report_snapshots')) {
    const { data, error } = await client
      .from('management_report_snapshots')
      .select('report_type, title, row_count, synced_at')
      .order('report_type', { ascending: true });

    if (!error && Array.isArray(data)) {
      snapshotSummaries = data as SupabaseStatusResult['snapshotSummaries'];
      if (!lastSyncedAtMemory && data.length > 0) {
        lastSyncedAtMemory = data[0].synced_at || null;
      }
    }
  }

  return {
    configured: true,
    connected,
    projectRef,
    supabaseUrl: url,
    keyPreview,
    tablesReady,
    missingTables,
    readyTables,
    lastSyncedAt: lastSyncedAtMemory,
    lastSyncCounts: lastSyncCountsMemory,
    lastError: lastErr,
    snapshotSummaries,
  };
}

export async function syncAllReportsToSupabase(): Promise<SupabaseSyncResult> {
  const { projectRef } = getSupabaseConfig();
  const client = getSupabaseServerClient();

  if (!client) {
    return {
      ok: false,
      configured: false,
      tablesReady: false,
      missingTables: [...MANAGEMENT_TABLES],
      projectRef,
      syncedAt: null,
      counts: { snapshots: 0, students: 0, subjects: 0, departments: 0, notifications: 0 },
      message: 'Supabase environment variables are not configured.',
    };
  }

  const status = await checkSupabaseConnection();
  if (!status.connected) {
    lastSyncErrorMemory = status.lastError || 'Unable to reach Supabase project endpoint.';
    return {
      ok: false,
      configured: true,
      tablesReady: false,
      missingTables: status.missingTables,
      projectRef,
      syncedAt: null,
      counts: { snapshots: 0, students: 0, subjects: 0, departments: 0, notifications: 0 },
      message: lastSyncErrorMemory,
      error: lastSyncErrorMemory,
    };
  }

  if (!status.tablesReady) {
    const msg = `Connected to Supabase (${projectRef}), but management report tables are not created yet (${status.missingTables.join(', ')}). Run the one-time SQL script in your Supabase SQL Editor, then click Sync.`;
    lastSyncErrorMemory = msg;
    return {
      ok: false,
      configured: true,
      tablesReady: false,
      missingTables: status.missingTables,
      projectRef,
      syncedAt: null,
      counts: { snapshots: 0, students: 0, subjects: 0, departments: 0, notifications: 0 },
      message: msg,
    };
  }

  const payloads = buildAllReportPayloads();

  try {
    if (payloads.departmentTableRows.length > 0) {
      const { error } = await client
        .from('management_department_attendance')
        .upsert(payloads.departmentTableRows, { onConflict: 'department_code' });
      if (error) throw new Error(`Department sync: ${error.message}`);
    }

    if (payloads.subjectTableRows.length > 0) {
      const { error } = await client
        .from('management_subject_attendance')
        .upsert(payloads.subjectTableRows, { onConflict: 'report_key' });
      if (error) throw new Error(`Subject sync: ${error.message}`);
    }

    if (payloads.studentTableRows.length > 0) {
      const { error } = await client
        .from('management_student_attendance')
        .upsert(payloads.studentTableRows, { onConflict: 'usn' });
      if (error) throw new Error(`Student sync: ${error.message}`);
    }

    if (payloads.notificationTableRows.length > 0) {
      const { error } = await client
        .from('management_notification_reports')
        .upsert(payloads.notificationTableRows, { onConflict: 'log_id' });
      if (error) throw new Error(`Notification sync: ${error.message}`);
    }

    if (payloads.snapshots.length > 0) {
      const { error } = await client
        .from('management_report_snapshots')
        .upsert(payloads.snapshots, { onConflict: 'report_type' });
      if (error) throw new Error(`Snapshots sync: ${error.message}`);
    }

    const counts: SupabaseSyncCounts = {
      snapshots: payloads.snapshots.length,
      students: payloads.studentTableRows.length,
      subjects: payloads.subjectTableRows.length,
      departments: payloads.departmentTableRows.length,
      notifications: payloads.notificationTableRows.length,
    };

    lastSyncedAtMemory = payloads.nowIso;
    lastSyncCountsMemory = counts;
    lastSyncErrorMemory = null;

    return {
      ok: true,
      configured: true,
      tablesReady: true,
      missingTables: [],
      projectRef,
      syncedAt: payloads.nowIso,
      counts,
      message: `Synced ${counts.snapshots} management report snapshots (${counts.students} students, ${counts.subjects} subjects, ${counts.departments} departments, ${counts.notifications} notifications) to Supabase (${projectRef}).`,
    };
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : 'Supabase sync failed.';
    lastSyncErrorMemory = errMsg;
    return {
      ok: false,
      configured: true,
      tablesReady: true,
      missingTables: [],
      projectRef,
      syncedAt: null,
      counts: { snapshots: 0, students: 0, subjects: 0, departments: 0, notifications: 0 },
      message: errMsg,
      error: errMsg,
    };
  }
}

export async function fetchSupabaseManagementReports(reportType?: string) {
  const client = getSupabaseServerClient();
  if (!client) {
    return { ready: false, error: 'Supabase not configured.', snapshots: [] };
  }

  const query = client
    .from('management_report_snapshots')
    .select('report_type, title, row_count, summary_json, rows_json, synced_at')
    .order('report_type', { ascending: true });

  const { data, error } = reportType
    ? await query.eq('report_type', reportType)
    : await query;

  if (error) {
    return {
      ready: !isMissingTableError(error),
      error: error.message,
      snapshots: [],
    };
  }

  return {
    ready: true,
    error: null,
    snapshots: data || [],
  };
}

export interface AppointmentRecordPayload {
  booking_code: string;
  full_name: string;
  email: string;
  phone: string;
  requester_role: string;
  reference_id: string | null;
  department_code: string;
  appointment_with: string;
  preferred_date: string;
  preferred_time: string;
  purpose: string;
  notes: string | null;
  status: string;
}

export function getSupabaseAppointmentsSql(): string {
  return `-- University Attendance ERP — Supabase Appointment Booking Table & RLS
-- Run once in Supabase SQL Editor (Project: zgijvqlnfmecbwfjhqbi)

CREATE TABLE IF NOT EXISTS public.appointments (
  id BIGSERIAL PRIMARY KEY,
  booking_code TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT NOT NULL,
  requester_role TEXT NOT NULL DEFAULT 'Student',
  reference_id TEXT,
  department_code TEXT NOT NULL,
  appointment_with TEXT NOT NULL,
  preferred_date DATE NOT NULL,
  preferred_time TEXT NOT NULL,
  purpose TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'Pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.appointments_id_seq TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.appointments TO anon, authenticated;

ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow appointment booking insert" ON public.appointments;
CREATE POLICY "Allow appointment booking insert" ON public.appointments
  FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Allow appointment read" ON public.appointments;
CREATE POLICY "Allow appointment read" ON public.appointments
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Allow appointment update" ON public.appointments;
CREATE POLICY "Allow appointment update" ON public.appointments
  FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
`;
}

export async function checkAppointmentsTableReady(): Promise<{
  ready: boolean;
  error: string | null;
}> {
  const client = getSupabaseServerClient();
  if (!client) {
    return { ready: false, error: 'Supabase credentials are not configured.' };
  }
  try {
    const { error } = await client.from('appointments').select('id').limit(1);
    if (error) {
      return { ready: false, error: error.message || 'Appointments table not found.' };
    }
    return { ready: true, error: null };
  } catch (err) {
    return {
      ready: false,
      error: err instanceof Error ? err.message : 'Unable to connect to Supabase.',
    };
  }
}

export async function saveAppointmentToSupabase(
  record: AppointmentRecordPayload
): Promise<{ ok: boolean; tableMissing: boolean; error: string | null }> {
  const client = getSupabaseServerClient();
  if (!client) {
    return { ok: false, tableMissing: false, error: 'Supabase not configured.' };
  }

  try {
    const { error } = await client
      .from('appointments')
      .upsert(record, { onConflict: 'booking_code' });

    if (error) {
      return {
        ok: false,
        tableMissing: isMissingTableError(error),
        error: error.message,
      };
    }

    return { ok: true, tableMissing: false, error: null };
  } catch (err) {
    return {
      ok: false,
      tableMissing: false,
      error: err instanceof Error ? err.message : 'Network error saving to Supabase.',
    };
  }
}

export async function updateAppointmentStatusInSupabase(
  bookingCode: string,
  status: string
): Promise<{ ok: boolean; error: string | null }> {
  const client = getSupabaseServerClient();
  if (!client) {
    return { ok: false, error: 'Supabase not configured.' };
  }
  try {
    const { error } = await client
      .from('appointments')
      .update({ status })
      .eq('booking_code', bookingCode);
    if (error) return { ok: false, error: error.message };
    return { ok: true, error: null };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Failed updating Supabase appointment.',
    };
  }
}

export async function fetchAppointmentsFromSupabase() {
  const client = getSupabaseServerClient();
  if (!client) {
    return { ready: false, error: 'Supabase not configured.', appointments: [] };
  }

  const { data, error } = await client
    .from('appointments')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);

  if (error) {
    return {
      ready: !isMissingTableError(error),
      error: error.message,
      appointments: [],
    };
  }

  return {
    ready: true,
    error: null,
    appointments: data || [],
  };
}

export async function syncAllAppointmentsToSupabase(
  records: AppointmentRecordPayload[]
): Promise<{ ok: boolean; syncedCount: number; tableMissing: boolean; error: string | null }> {
  const client = getSupabaseServerClient();
  if (!client) {
    return { ok: false, syncedCount: 0, tableMissing: false, error: 'Supabase not configured.' };
  }

  const check = await checkAppointmentsTableReady();
  if (!check.ready) {
    return {
      ok: false,
      syncedCount: 0,
      tableMissing: true,
      error: check.error || "Table 'public.appointments' is not created in Supabase yet.",
    };
  }

  if (records.length === 0) {
    return { ok: true, syncedCount: 0, tableMissing: false, error: null };
  }

  const { error } = await client
    .from('appointments')
    .upsert(records, { onConflict: 'booking_code' });

  if (error) {
    return {
      ok: false,
      syncedCount: 0,
      tableMissing: isMissingTableError(error),
      error: error.message,
    };
  }

  return { ok: true, syncedCount: records.length, tableMissing: false, error: null };
}

