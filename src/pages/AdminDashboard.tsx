import React, { useCallback, useEffect, useState } from 'react';
import {
  Award,
  Bell,
  BookOpen,
  Building2,
  Calendar,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  Cloud,
  Copy,
  Database,
  Download,
  FileText,
  GraduationCap,
  Layers,
  LayoutDashboard,
  RefreshCw,
  Settings,
  Trash2,
  UserCheck,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { downloadCsvReport, downloadPdfReport } from '../lib/exportUtils';
import { useAuth } from '../context/AuthContext';
import { PortalLayout, type NavItem } from '../components/PortalLayout';
import { AttendanceStatusText, CategoryStatusText } from '../components/StatusText';
import { AttendanceBarChart } from '../components/AttendanceChart';

const ADMIN_NAV: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'students', label: 'Students', icon: GraduationCap },
  { id: 'teachers', label: 'Teachers', icon: UserCheck },
  { id: 'departments', label: 'Departments', icon: Building2 },
  { id: 'courses', label: 'Courses', icon: Award },
  { id: 'semesters', label: 'Semesters', icon: Layers },
  { id: 'subjects', label: 'Subjects', icon: BookOpen },
  { id: 'timetable', label: 'Timetable', icon: Calendar },
  { id: 'attendance', label: 'Attendance', icon: ClipboardCheck },
  { id: 'parents', label: 'Parent Management', icon: Users },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'appointments', label: 'Appointments', icon: CalendarClock },
  { id: 'reports', label: 'Reports', icon: FileText },
  { id: 'settings', label: 'Settings', icon: Settings },
];

interface AcademicsPayload {
  departments: Array<{ id: number; code: string; name: string; hod_name: string | null }>;
  courses: Array<{ id: number; department_id: number; code: string; name: string; duration_years: number; department_code: string }>;
  academicYears: Array<{ id: number; label: string; is_current: number }>;
  semesters: Array<{ id: number; academic_year_id: number; course_id: number; number: number; name: string; academic_year_label: string; course_code: string }>;
  sections: Array<{ id: number; department_id: number; semester_id: number; name: string; capacity: number; department_code: string; semester_name: string }>;
  subjects: Array<{ id: number; department_id: number; semester_id: number; section_id: number; teacher_id: number; code: string; name: string; credits: number; weekly_hours: number; department_code: string; semester_name: string; section_name: string; teacher_name: string }>;
  teachers: Array<{ id: number; faculty_id: string; designation: string; specialization: string | null; department_id: number; department_code: string; department_name: string; full_name: string; email: string; phone: string | null }>;
}

interface AdminDashboardPayload {
  kpis: {
    totalStudents: number;
    totalTeachers: number;
    totalDepartments: number;
    totalSubjects: number;
    presentStudents: number;
    absentStudents: number;
    latestSessionDate: string;
    below75Count: number;
    below65Count: number;
    overallUniversityPercentage: number;
  };
  policy: {
    id: number;
    minEligiblePercent: number;
    criticalShortagePercent: number;
    lateCountsAsPresent: boolean;
    excusedCountsAsPresent: boolean;
  };
  departmentBreakdown: Array<{ code: string; name: string; percentage: number; students: number }>;
  shortageStudents: Array<{
    studentId: number;
    usn: string;
    fullName: string;
    departmentCode: string;
    sectionName: string;
    present: number;
    conducted: number;
    percentage: number;
    category: string;
    additionalClassesNeeded: number;
  }>;
  students: Array<{
    studentId: number;
    usn: string;
    fullName: string;
    email: string;
    phone: string | null;
    departmentId: number;
    departmentCode: string;
    semesterId: number;
    semesterName: string;
    sectionId: number;
    sectionName: string;
    present: number;
    absent: number;
    conducted: number;
    percentage: number;
    category: string;
  }>;
  recentSessions: Array<{
    id: number;
    session_code: string;
    session_date: string;
    start_time: string;
    end_time: string;
    status: string;
    subject_code: string;
    subject_name: string;
    section_name: string;
    teacher_name: string;
    present_cnt: number;
    absent_cnt: number;
  }>;
}

export function AdminDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');

  // Shared Filter State
  const [filterDept, setFilterDept] = useState('');
  const [filterSem, setFilterSem] = useState('');
  const [filterSection, setFilterSection] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterUsn, setFilterUsn] = useState('');

  const [academics, setAcademics] = useState<AcademicsPayload | null>(null);
  const [dashboard, setDashboard] = useState<AdminDashboardPayload | null>(null);
  const [timetables, setTimetables] = useState<Array<{
    id: number;
    day_of_week: string;
    start_time: string;
    end_time: string;
    room_no: string;
    section_name: string;
    subject_code: string;
    subject_name: string;
    teacher_name: string;
  }>>([]);
  const [attendanceRecords, setAttendanceRecords] = useState<Array<{
    attendance_id: number;
    attendance_status: string;
    source: string;
    session_id: number;
    session_code: string;
    session_date: string;
    start_time: string;
    end_time: string;
    session_status: string;
    usn: string;
    student_name: string;
    department_code: string;
    section_name: string;
    subject_code: string;
    subject_name: string;
  }>>([]);
  const [parentsList, setParentsList] = useState<Array<{
    parent_id: number;
    parent_name: string;
    parent_email: string;
    parent_phone: string | null;
    preferred_channel: string;
    whatsapp_consent: number;
    access_token: string;
    usn: string | null;
    student_name: string | null;
  }>>([]);
  const [notificationLogs, setNotificationLogs] = useState<Array<{
    log_id: number;
    channel: string;
    recipient: string;
    status: string;
    error_message: string | null;
    retry_count: number;
    created_at: string;
    title: string;
    usn: string;
    student_name: string;
    parent_name: string;
  }>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<{
    id: number;
    actor_name: string | null;
    actor_role: string;
    action: string;
    entity_type: string;
    entity_id: string;
    reason: string | null;
    created_at: string;
  }>>([]);

  // Reports State
  const [reportType, setReportType] = useState('student');
  const [reportData, setReportData] = useState<{
    columns: string[];
    rows: Array<Record<string, unknown>>;
  } | null>(null);

  // Settings / Policy & Supabase Backend State
  const [minEligibleInput, setMinEligibleInput] = useState('75');
  const [criticalInput, setCriticalInput] = useState('65');
  const [lateAsPresent, setLateAsPresent] = useState(true);
  const [excusedAsPresent, setExcusedAsPresent] = useState(true);
  const [supabaseSql, setSupabaseSql] = useState('');
  const [supabaseStatus, setSupabaseStatus] = useState<{
    configured: boolean;
    connected: boolean;
    projectRef: string | null;
    keyPreview: string | null;
    tablesReady: boolean;
    missingTables: string[];
    readyTables: string[];
    lastSyncedAt: string | null;
    lastSyncCounts: {
      snapshots: number;
      students: number;
      subjects: number;
      departments: number;
      notifications: number;
    } | null;
    lastError: string | null;
    reportSetupSql: string;
    snapshotSummaries: Array<{
      report_type: string;
      title: string;
      row_count: number;
      synced_at: string;
    }>;
  } | null>(null);
  const [supabaseSyncing, setSupabaseSyncing] = useState(false);
  const [reportSource, setReportSource] = useState<'local' | 'supabase'>('local');
  const [supabaseReportSnapshots, setSupabaseReportSnapshots] = useState<Array<{
    report_type: string;
    title: string;
    row_count: number;
    summary_json: Record<string, unknown>;
    rows_json: Array<Record<string, unknown>>;
    synced_at: string;
  }>>([]);
  const [appointmentsData, setAppointmentsData] = useState<{
    localAppointments: Array<{
      id: number;
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
      synced_to_supabase: number;
      created_at: string;
    }>;
    supabaseAppointments: Array<{
      id: number;
      booking_code: string;
      full_name: string;
      email: string;
      phone: string;
      requester_role: string;
      department_code: string;
      appointment_with: string;
      preferred_date: string;
      preferred_time: string;
      purpose: string;
      status: string;
      created_at: string;
    }>;
    supabaseReady: boolean;
    supabaseError: string | null;
    appointmentsSql: string;
  } | null>(null);

  // Status feedback
  const [bannerMsg, setBannerMsg] = useState<string | null>(null);
  const [bannerErr, setBannerErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Forms State
  const [stuForm, setStuForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    usn: '',
    departmentId: '',
    courseId: '',
    semesterId: '',
    sectionId: '',
    parentName: '',
    parentEmail: '',
    parentPhone: '',
    faceConsent: true,
  });
  const [editingStudentId, setEditingStudentId] = useState<number | null>(null);
  const [teacherForm, setTeacherForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    facultyId: '',
    departmentId: '',
    designation: 'Assistant Professor',
    specialization: '',
  });
  const [deptForm, setDeptForm] = useState({ code: '', name: '', hodName: '' });
  const [courseForm, setCourseForm] = useState({ departmentId: '', code: '', name: '', durationYears: '4' });
  const [semForm, setSemForm] = useState({ academicYearId: '', courseId: '', number: '6', name: 'Semester 6 (Even)' });
  const [secForm, setSecForm] = useState({ departmentId: '', semesterId: '', name: '', capacity: '60' });
  const [subForm, setSubForm] = useState({
    departmentId: '',
    semesterId: '',
    sectionId: '',
    teacherId: '',
    code: '',
    name: '',
    credits: '4',
  });
  const [ttForm, setTtForm] = useState({
    subjectId: '',
    dayOfWeek: 'Monday',
    startTime: '15:00',
    endTime: '16:00',
    roomNo: 'LH-201',
  });

  const buildFilterQuery = useCallback(() => {
    const p = new URLSearchParams();
    if (filterDept) p.set('departmentId', filterDept);
    if (filterSem) p.set('semesterId', filterSem);
    if (filterSection) p.set('sectionId', filterSection);
    if (filterSubject) p.set('subjectId', filterSubject);
    if (filterDate) {
      p.set('dateFrom', filterDate);
      p.set('dateTo', filterDate);
      p.set('date', filterDate);
    }
    if (filterUsn) p.set('usn', filterUsn);
    return p.toString();
  }, [filterDept, filterSem, filterSection, filterSubject, filterDate, filterUsn]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const qs = buildFilterQuery();
      const [acadRes, dashRes] = await Promise.all([
        apiFetch<AcademicsPayload>('/api/admin/academics'),
        apiFetch<AdminDashboardPayload>(`/api/admin/dashboard?${qs}`),
      ]);
      setAcademics(acadRes);
      setDashboard(dashRes);
      setMinEligibleInput(String(dashRes.policy.minEligiblePercent));
      setCriticalInput(String(dashRes.policy.criticalShortagePercent));
      setLateAsPresent(dashRes.policy.lateCountsAsPresent);
      setExcusedAsPresent(dashRes.policy.excusedCountsAsPresent);

      // Default select options for forms
      if (acadRes.departments.length > 0 && !stuForm.departmentId) {
        setStuForm((f) => ({
          ...f,
          departmentId: String(acadRes.departments[0].id),
          courseId: String(acadRes.courses[0]?.id || ''),
          semesterId: String(acadRes.semesters[0]?.id || ''),
          sectionId: String(acadRes.sections[0]?.id || ''),
        }));
        setTeacherForm((f) => ({ ...f, departmentId: String(acadRes.departments[0].id) }));
        setCourseForm((f) => ({ ...f, departmentId: String(acadRes.departments[0].id) }));
        setSemForm((f) => ({
          ...f,
          academicYearId: String(acadRes.academicYears[0]?.id || ''),
          courseId: String(acadRes.courses[0]?.id || ''),
        }));
        setSecForm((f) => ({
          ...f,
          departmentId: String(acadRes.departments[0].id),
          semesterId: String(acadRes.semesters[0]?.id || ''),
        }));
        setSubForm((f) => ({
          ...f,
          departmentId: String(acadRes.departments[0].id),
          semesterId: String(acadRes.semesters[0]?.id || ''),
          sectionId: String(acadRes.sections[0]?.id || ''),
          teacherId: String(acadRes.teachers[0]?.id || ''),
        }));
        setTtForm((f) => ({ ...f, subjectId: String(acadRes.subjects[0]?.id || '') }));
      }
    } catch (err) {
      setBannerErr(err instanceof Error ? err.message : 'Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  }, [buildFilterQuery, stuForm.departmentId]);

  const loadTabSpecific = useCallback(async () => {
    const qs = buildFilterQuery();
    try {
      if (activeTab === 'timetable') {
        const res = await apiFetch<{ timetables: typeof timetables }>('/api/admin/timetables');
        setTimetables(res.timetables);
      } else if (activeTab === 'attendance') {
        const res = await apiFetch<{ records: typeof attendanceRecords }>(`/api/admin/attendance?${qs}`);
        setAttendanceRecords(res.records);
      } else if (activeTab === 'parents') {
        const res = await apiFetch<{ parents: typeof parentsList }>('/api/admin/parents');
        setParentsList(res.parents);
      } else if (activeTab === 'notifications') {
        const res = await apiFetch<{ logs: typeof notificationLogs }>('/api/admin/notifications');
        setNotificationLogs(res.logs);
      } else if (activeTab === 'appointments') {
        const res = await apiFetch<NonNullable<typeof appointmentsData>>('/api/admin/appointments');
        setAppointmentsData(res);
      } else if (activeTab === 'reports') {
        const [repRes, sbStatusRes, sbReportsRes] = await Promise.all([
          apiFetch<{ columns: string[]; rows: Array<Record<string, unknown>> }>(
            `/api/admin/reports?type=${reportType}&${qs}`
          ),
          apiFetch<NonNullable<typeof supabaseStatus>>('/api/admin/supabase/status'),
          apiFetch<{ ready: boolean; snapshots: typeof supabaseReportSnapshots }>(
            '/api/admin/supabase/reports'
          ),
        ]);
        setReportData(repRes);
        setSupabaseStatus(sbStatusRes);
        if (sbReportsRes.ready) {
          setSupabaseReportSnapshots(sbReportsRes.snapshots);
        }
      } else if (activeTab === 'settings') {
        const [auditRes, sqlRes, sbStatusRes] = await Promise.all([
          apiFetch<{ logs: typeof auditLogs }>('/api/admin/audit-logs'),
          apiFetch<{ sql: string }>('/api/admin/supabase-sql'),
          apiFetch<NonNullable<typeof supabaseStatus>>('/api/admin/supabase/status'),
        ]);
        setAuditLogs(auditRes.logs);
        setSupabaseSql(sqlRes.sql);
        setSupabaseStatus(sbStatusRes);
      }
    } catch (err) {
      setBannerErr(err instanceof Error ? err.message : 'Unable to fetch tab records.');
    }
  }, [activeTab, buildFilterQuery, reportType]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    loadTabSpecific();
  }, [loadTabSpecific]);

  const showSuccess = (msg: string) => {
    setBannerErr(null);
    setBannerMsg(msg);
  };

  const handleSaveStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setBannerErr(null);
    try {
      if (editingStudentId) {
        await apiFetch(`/api/admin/students/${editingStudentId}`, {
          method: 'PATCH',
          body: JSON.stringify(stuForm),
        });
        showSuccess('Student record updated.');
        setEditingStudentId(null);
      } else {
        await apiFetch('/api/admin/students', {
          method: 'POST',
          body: JSON.stringify(stuForm),
        });
        showSuccess('New student enrolled and parent link created.');
      }
      setStuForm((f) => ({
        ...f,
        fullName: '',
        email: '',
        phone: '',
        usn: '',
        parentName: '',
        parentEmail: '',
        parentPhone: '',
      }));
      loadAll();
    } catch (err) {
      setBannerErr(err instanceof Error ? err.message : 'Failed to save student.');
    }
  };

  const handleDeleteStudent = async (id: number) => {
    try {
      await apiFetch(`/api/admin/students/${id}`, { method: 'DELETE' });
      showSuccess('Student record deleted.');
      loadAll();
    } catch (err) {
      setBannerErr(err instanceof Error ? err.message : 'Delete failed.');
    }
  };

  const handleAddTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/teachers', { method: 'POST', body: JSON.stringify(teacherForm) });
      showSuccess('Teacher added.');
      setTeacherForm((f) => ({ ...f, fullName: '', email: '', phone: '', facultyId: '', specialization: '' }));
      loadAll();
    } catch (err) {
      setBannerErr(err instanceof Error ? err.message : 'Failed to add teacher.');
    }
  };

  const handleCorrectAttendance = async (attendanceId: number, status: string) => {
    try {
      await apiFetch(`/api/admin/attendance/${attendanceId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status, reason: 'Administrator audit correction' }),
      });
      showSuccess(`Attendance updated to ${status} and recalculated across portals.`);
      loadTabSpecific();
      loadAll();
    } catch (err) {
      setBannerErr(err instanceof Error ? err.message : 'Correction failed.');
    }
  };

  const handleRetryNotification = async (logId: number) => {
    try {
      const res = await apiFetch<{ status: string; detail: string }>(
        `/api/admin/notifications/retry/${logId}`,
        { method: 'POST' }
      );
      showSuccess(`Retry completed with status: ${res.status.toUpperCase()} (${res.detail})`);
      loadTabSpecific();
    } catch (err) {
      setBannerErr(err instanceof Error ? err.message : 'Retry failed.');
    }
  };

  const handleUpdatePolicy = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiFetch('/api/admin/policy', {
        method: 'PATCH',
        body: JSON.stringify({
          minEligiblePercent: Number(minEligibleInput),
          criticalShortagePercent: Number(criticalInput),
          lateCountsAsPresent: lateAsPresent,
          excusedCountsAsPresent: excusedAsPresent,
        }),
      });
      showSuccess('University attendance policy updated and applied to all calculations.');
      loadAll();
      loadTabSpecific();
    } catch (err) {
      setBannerErr(err instanceof Error ? err.message : 'Policy update failed.');
    }
  };

  const handleSyncSupabaseReports = async () => {
    setSupabaseSyncing(true);
    setBannerErr(null);
    try {
      const res = await apiFetch<{
        ok: boolean;
        tablesReady: boolean;
        message: string;
      }>('/api/admin/supabase/sync', { method: 'POST' });

      if (res.ok) {
        showSuccess(res.message);
      } else {
        setBannerErr(res.message);
      }
      await loadTabSpecific();
    } catch (err) {
      setBannerErr(err instanceof Error ? err.message : 'Supabase sync failed.');
    } finally {
      setSupabaseSyncing(false);
    }
  };

  const handleCopySql = (sqlText: string, label: string) => {
    if (!sqlText) return;
    navigator.clipboard?.writeText(sqlText);
    showSuccess(`${label} copied to clipboard. Paste and run it in your Supabase SQL Editor.`);
  };

  if (!user) return null;

  return (
    <PortalLayout
      user={user}
      portalLabel="University Admin ERP"
      navItems={ADMIN_NAV}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onLogout={logout}
      headerAction={
        <button
          type="button"
          onClick={() => {
            loadAll();
            loadTabSpecific();
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-50 whitespace-nowrap"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      }
    >
      <div className="space-y-6">
        {bannerErr && (
          <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between">
            <span>{bannerErr}</span>
            <button type="button" onClick={() => setBannerErr(null)} className="underline">Dismiss</button>
          </div>
        )}
        {bannerMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center justify-between">
            <span>{bannerMsg}</span>
            <button type="button" onClick={() => setBannerMsg(null)} className="underline">Dismiss</button>
          </div>
        )}

        {/* Global Filter Bar on Data Views */}
        {['dashboard', 'students', 'attendance', 'reports'].includes(activeTab) && academics && (
          <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">All Departments</option>
              {academics.departments.map((d) => (
                <option key={d.id} value={d.id}>{d.code} · {d.name}</option>
              ))}
            </select>

            <select
              value={filterSem}
              onChange={(e) => setFilterSem(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">All Semesters</option>
              {academics.semesters.map((s) => (
                <option key={s.id} value={s.id}>{s.name} ({s.course_code})</option>
              ))}
            </select>

            <select
              value={filterSection}
              onChange={(e) => setFilterSection(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">All Sections</option>
              {academics.sections.map((sec) => (
                <option key={sec.id} value={sec.id}>{sec.name}</option>
              ))}
            </select>

            <select
              value={filterSubject}
              onChange={(e) => setFilterSubject(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="">All Subjects</option>
              {academics.subjects.map((sub) => (
                <option key={sub.id} value={sub.id}>{sub.code} · {sub.section_name}</option>
              ))}
            </select>

            <input
              type="date"
              value={filterDate}
              onChange={(e) => setFilterDate(e.target.value)}
              className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
            />

            <div className="flex gap-2">
              <input
                type="text"
                value={filterUsn}
                onChange={(e) => setFilterUsn(e.target.value)}
                placeholder="Search USN / Name"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
              />
              {(filterDept || filterSem || filterSection || filterSubject || filterDate || filterUsn) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilterDept('');
                    setFilterSem('');
                    setFilterSection('');
                    setFilterSubject('');
                    setFilterDate('');
                    setFilterUsn('');
                  }}
                  className="px-2.5 py-2 text-xs text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  Reset
                </button>
              )}
            </div>
          </div>
        )}

        {/* TAB: DASHBOARD */}
        {activeTab === 'dashboard' && dashboard && (
          <div className="space-y-6">
            {/* 9 Required KPI Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs text-slate-500">Overall University Attendance</p>
                <p className="font-mono tabular-nums text-2xl font-bold text-[#0B1F3A] mt-2">
                  {dashboard.kpis.overallUniversityPercentage.toFixed(2)}%
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs text-slate-500">Total Students</p>
                <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-2">
                  {dashboard.kpis.totalStudents}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs text-slate-500">Total Teachers</p>
                <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-2">
                  {dashboard.kpis.totalTeachers}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs text-slate-500">Total Departments</p>
                <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-2">
                  {dashboard.kpis.totalDepartments}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs text-slate-500">Total Subjects</p>
                <p className="font-mono tabular-nums text-2xl font-bold text-slate-900 mt-2">
                  {dashboard.kpis.totalSubjects}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs text-slate-500">
                  Present Students ({dashboard.kpis.latestSessionDate})
                </p>
                <p className="font-mono tabular-nums text-2xl font-bold text-emerald-700 mt-2">
                  {dashboard.kpis.presentStudents}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs text-slate-500">
                  Absent Students ({dashboard.kpis.latestSessionDate})
                </p>
                <p className="font-mono tabular-nums text-2xl font-bold text-red-700 mt-2">
                  {dashboard.kpis.absentStudents}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs text-slate-500">
                  Below {dashboard.policy.minEligiblePercent}% Attendance
                </p>
                <p className="font-mono tabular-nums text-2xl font-bold text-amber-700 mt-2">
                  {dashboard.kpis.below75Count}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-5">
                <p className="text-xs text-slate-500">
                  Below {dashboard.policy.criticalShortagePercent}% Critical
                </p>
                <p className="font-mono tabular-nums text-2xl font-bold text-red-700 mt-2">
                  {dashboard.kpis.below65Count}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-5">
                <AttendanceBarChart
                  title="Department Attendance Comparison"
                  subtitle="Computed from finalized session records"
                  targetPercent={dashboard.policy.minEligiblePercent}
                  items={dashboard.departmentBreakdown.map((d) => ({
                    label: `${d.code} · ${d.name}`,
                    sublabel: `${d.students} students`,
                    percentage: d.percentage,
                  }))}
                />
              </div>

              <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="p-5 border-b border-slate-200 flex items-center justify-between">
                  <div>
                    <h3 className="font-semibold text-base text-slate-900">
                      Students Requiring Attendance Intervention
                    </h3>
                    <p className="text-xs text-slate-500">
                      Below {dashboard.policy.minEligiblePercent}% threshold
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setReportType('shortage');
                      setActiveTab('reports');
                    }}
                    className="text-xs font-semibold text-[#1D4ED8] hover:underline"
                  >
                    Export Shortage Report
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                        <th className="py-3 px-4">USN</th>
                        <th className="py-3 px-4">Student</th>
                        <th className="py-3 px-4">Section</th>
                        <th className="py-3 px-4 text-right">Attended</th>
                        <th className="py-3 px-4 text-right">Attendance %</th>
                        <th className="py-3 px-4">Category</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-sm">
                      {dashboard.shortageStudents.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-500 text-xs">
                            All filtered students meet the attendance threshold.
                          </td>
                        </tr>
                      ) : (
                        dashboard.shortageStudents.map((s) => (
                          <tr key={s.studentId}>
                            <td className="py-3 px-4 font-mono text-xs font-semibold">{s.usn}</td>
                            <td className="py-3 px-4">{s.fullName}</td>
                            <td className="py-3 px-4 font-mono text-xs">{s.sectionName}</td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums text-xs">
                              {s.present}/{s.conducted}
                            </td>
                            <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                              {s.percentage.toFixed(2)}%
                            </td>
                            <td className="py-3 px-4">
                              <CategoryStatusText category={s.category} />
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB: STUDENTS */}
        {activeTab === 'students' && academics && dashboard && (
          <div className="space-y-6">
            <form onSubmit={handleSaveStudent} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-base text-slate-900">
                  {editingStudentId ? 'Edit Student Record' : 'Add New Student & Parent Link'}
                </h3>
                {editingStudentId && (
                  <button
                    type="button"
                    onClick={() => setEditingStudentId(null)}
                    className="text-xs text-slate-500 hover:text-slate-900"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  required
                  placeholder="Full Name"
                  value={stuForm.fullName}
                  onChange={(e) => setStuForm({ ...stuForm, fullName: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  required
                  disabled={Boolean(editingStudentId)}
                  placeholder="USN (e.g., 1MS24CS099)"
                  value={stuForm.usn}
                  onChange={(e) => setStuForm({ ...stuForm, usn: e.target.value })}
                  className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg disabled:bg-slate-50"
                />
                <input
                  required
                  type="email"
                  placeholder="Student Email"
                  value={stuForm.email}
                  onChange={(e) => setStuForm({ ...stuForm, email: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  placeholder="Student Phone"
                  value={stuForm.phone}
                  onChange={(e) => setStuForm({ ...stuForm, phone: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <select
                  value={stuForm.departmentId}
                  onChange={(e) => setStuForm({ ...stuForm, departmentId: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {academics.departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.code} · {d.name}</option>
                  ))}
                </select>
                <select
                  value={stuForm.courseId}
                  onChange={(e) => setStuForm({ ...stuForm, courseId: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {academics.courses.map((c) => (
                    <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                  ))}
                </select>
                <select
                  value={stuForm.semesterId}
                  onChange={(e) => setStuForm({ ...stuForm, semesterId: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {academics.semesters.map((s) => (
                    <option key={s.id} value={s.id}>{s.name} ({s.course_code})</option>
                  ))}
                </select>
                <select
                  value={stuForm.sectionId}
                  onChange={(e) => setStuForm({ ...stuForm, sectionId: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {academics.sections.map((sec) => (
                    <option key={sec.id} value={sec.id}>{sec.name}</option>
                  ))}
                </select>

                {!editingStudentId && (
                  <>
                    <input
                      placeholder="Parent Name (optional)"
                      value={stuForm.parentName}
                      onChange={(e) => setStuForm({ ...stuForm, parentName: e.target.value })}
                      className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                    <input
                      type="email"
                      placeholder="Parent Email (optional)"
                      value={stuForm.parentEmail}
                      onChange={(e) => setStuForm({ ...stuForm, parentEmail: e.target.value })}
                      className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                    <input
                      placeholder="Parent Phone (optional)"
                      value={stuForm.parentPhone}
                      onChange={(e) => setStuForm({ ...stuForm, parentPhone: e.target.value })}
                      className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                  </>
                )}

                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#16345E]"
                >
                  {editingStudentId ? 'Update Student' : 'Enroll Student'}
                </button>
              </div>
            </form>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">USN</th>
                      <th className="py-3 px-4">Student Name</th>
                      <th className="py-3 px-4">Dept / Section</th>
                      <th className="py-3 px-4 text-right">Attendance %</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {dashboard.students.map((s) => (
                      <tr key={s.studentId}>
                        <td className="py-3 px-4 font-mono text-xs font-semibold">{s.usn}</td>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{s.fullName}</div>
                          <div className="text-xs text-slate-500">{s.email}</div>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">
                          {s.departmentCode} · {s.sectionName}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                          {s.percentage.toFixed(2)}%
                        </td>
                        <td className="py-3 px-4">
                          <CategoryStatusText category={s.category} />
                        </td>
                        <td className="py-3 px-4 text-right space-x-3">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingStudentId(s.studentId);
                              setStuForm((f) => ({
                                ...f,
                                fullName: s.fullName,
                                email: s.email,
                                phone: s.phone || '',
                                usn: s.usn,
                                departmentId: String(s.departmentId),
                                semesterId: String(s.semesterId),
                                sectionId: String(s.sectionId),
                              }));
                            }}
                            className="text-xs font-medium text-[#1D4ED8] hover:underline"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteStudent(s.studentId)}
                            className="text-xs font-medium text-red-700 hover:underline"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: TEACHERS */}
        {activeTab === 'teachers' && academics && (
          <div className="space-y-6">
            <form onSubmit={handleAddTeacher} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="font-semibold text-base text-slate-900">Add Faculty Member</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  required
                  placeholder="Full Name"
                  value={teacherForm.fullName}
                  onChange={(e) => setTeacherForm({ ...teacherForm, fullName: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  required
                  placeholder="Faculty ID (e.g., FAC-104)"
                  value={teacherForm.facultyId}
                  onChange={(e) => setTeacherForm({ ...teacherForm, facultyId: e.target.value })}
                  className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg"
                />
                <input
                  required
                  type="email"
                  placeholder="Faculty Email"
                  value={teacherForm.email}
                  onChange={(e) => setTeacherForm({ ...teacherForm, email: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <select
                  value={teacherForm.departmentId}
                  onChange={(e) => setTeacherForm({ ...teacherForm, departmentId: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  {academics.departments.map((d) => (
                    <option key={d.id} value={d.id}>{d.code} · {d.name}</option>
                  ))}
                </select>
                <input
                  placeholder="Designation"
                  value={teacherForm.designation}
                  onChange={(e) => setTeacherForm({ ...teacherForm, designation: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <input
                  placeholder="Specialization"
                  value={teacherForm.specialization}
                  onChange={(e) => setTeacherForm({ ...teacherForm, specialization: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#16345E]"
                >
                  Add Teacher
                </button>
              </div>
            </form>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Faculty ID</th>
                    <th className="py-3 px-4">Name &amp; Email</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4">Designation</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {academics.teachers.map((t) => (
                    <tr key={t.id}>
                      <td className="py-3 px-4 font-mono text-xs font-semibold">{t.faculty_id}</td>
                      <td className="py-3 px-4">
                        <div className="font-medium">{t.full_name}</div>
                        <div className="text-xs text-slate-500">{t.email}</div>
                      </td>
                      <td className="py-3 px-4 text-xs">{t.department_code} · {t.department_name}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{t.designation}</td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await apiFetch(`/api/admin/teachers/${t.id}`, { method: 'DELETE' });
                              showSuccess('Teacher removed.');
                              loadAll();
                            } catch (err) {
                              setBannerErr(err instanceof Error ? err.message : 'Unable to delete teacher.');
                            }
                          }}
                          className="text-xs text-red-700 hover:underline"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: DEPARTMENTS */}
        {activeTab === 'departments' && academics && (
          <div className="space-y-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiFetch('/api/admin/departments', { method: 'POST', body: JSON.stringify(deptForm) });
                  setDeptForm({ code: '', name: '', hodName: '' });
                  showSuccess('Department added.');
                  loadAll();
                } catch (err) {
                  setBannerErr(err instanceof Error ? err.message : 'Failed.');
                }
              }}
              className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-4 gap-3"
            >
              <input required placeholder="Code (e.g., ME)" value={deptForm.code} onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })} className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg" />
              <input required placeholder="Department Name" value={deptForm.name} onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
              <input placeholder="Head of Department" value={deptForm.hodName} onChange={(e) => setDeptForm({ ...deptForm, hodName: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg">Add Department</button>
            </form>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">HOD</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {academics.departments.map((d) => (
                    <tr key={d.id}>
                      <td className="py-3 px-4 font-mono text-xs font-semibold">{d.code}</td>
                      <td className="py-3 px-4 font-medium">{d.name}</td>
                      <td className="py-3 px-4 text-slate-600">{d.hod_name || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: COURSES */}
        {activeTab === 'courses' && academics && (
          <div className="space-y-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiFetch('/api/admin/courses', { method: 'POST', body: JSON.stringify(courseForm) });
                  setCourseForm({ ...courseForm, code: '', name: '' });
                  showSuccess('Course created.');
                  loadAll();
                } catch (err) {
                  setBannerErr(err instanceof Error ? err.message : 'Failed.');
                }
              }}
              className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-4 gap-3"
            >
              <select value={courseForm.departmentId} onChange={(e) => setCourseForm({ ...courseForm, departmentId: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
                {academics.departments.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
              </select>
              <input required placeholder="Course Code" value={courseForm.code} onChange={(e) => setCourseForm({ ...courseForm, code: e.target.value })} className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg" />
              <input required placeholder="Program Name" value={courseForm.name} onChange={(e) => setCourseForm({ ...courseForm, name: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg">Add Course</button>
            </form>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Course Name</th>
                    <th className="py-3 px-4">Department</th>
                    <th className="py-3 px-4 text-right">Duration</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {academics.courses.map((c) => (
                    <tr key={c.id}>
                      <td className="py-3 px-4 font-mono text-xs font-semibold">{c.code}</td>
                      <td className="py-3 px-4 font-medium">{c.name}</td>
                      <td className="py-3 px-4 text-xs">{c.department_code}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs">{c.duration_years} Years</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: SEMESTERS & SECTIONS */}
        {activeTab === 'semesters' && academics && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiFetch('/api/admin/semesters', { method: 'POST', body: JSON.stringify(semForm) });
                    showSuccess('Semester created.');
                    loadAll();
                  } catch (err) {
                    setBannerErr(err instanceof Error ? err.message : 'Failed.');
                  }
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <h3 className="font-semibold text-sm text-slate-900">Add Semester</h3>
                <div className="grid grid-cols-2 gap-2">
                  <select value={semForm.courseId} onChange={(e) => setSemForm({ ...semForm, courseId: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
                    {academics.courses.map((c) => <option key={c.id} value={c.id}>{c.code}</option>)}
                  </select>
                  <input type="number" min={1} max={10} value={semForm.number} onChange={(e) => setSemForm({ ...semForm, number: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                  <input required placeholder="Semester Name" value={semForm.name} onChange={(e) => setSemForm({ ...semForm, name: e.target.value })} className="col-span-2 px-3 py-2 text-xs border border-slate-300 rounded-lg" />
                </div>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg">Create Semester</button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 px-4">Semester</th>
                      <th className="py-2.5 px-4">Program</th>
                      <th className="py-2.5 px-4">Academic Year</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {academics.semesters.map((s) => (
                      <tr key={s.id}>
                        <td className="py-2.5 px-4 font-medium">{s.name}</td>
                        <td className="py-2.5 px-4 font-mono text-xs">{s.course_code}</td>
                        <td className="py-2.5 px-4 font-mono text-xs">{s.academic_year_label}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    await apiFetch('/api/admin/sections', { method: 'POST', body: JSON.stringify(secForm) });
                    setSecForm({ ...secForm, name: '' });
                    showSuccess('Section created.');
                    loadAll();
                  } catch (err) {
                    setBannerErr(err instanceof Error ? err.message : 'Failed.');
                  }
                }}
                className="bg-white border border-slate-200 rounded-xl p-5 space-y-3"
              >
                <h3 className="font-semibold text-sm text-slate-900">Add Section</h3>
                <div className="grid grid-cols-2 gap-2">
                  <select value={secForm.departmentId} onChange={(e) => setSecForm({ ...secForm, departmentId: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
                    {academics.departments.map((d) => <option key={d.id} value={d.id}>{d.code}</option>)}
                  </select>
                  <select value={secForm.semesterId} onChange={(e) => setSecForm({ ...secForm, semesterId: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
                    {academics.semesters.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.course_code})</option>)}
                  </select>
                  <input required placeholder="Section Name (e.g., CSE-6A)" value={secForm.name} onChange={(e) => setSecForm({ ...secForm, name: e.target.value })} className="col-span-2 px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg" />
                </div>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg">Create Section</button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-2.5 px-4">Section</th>
                      <th className="py-2.5 px-4">Dept</th>
                      <th className="py-2.5 px-4">Semester</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {academics.sections.map((sec) => (
                      <tr key={sec.id}>
                        <td className="py-2.5 px-4 font-mono font-semibold text-xs">{sec.name}</td>
                        <td className="py-2.5 px-4 text-xs">{sec.department_code}</td>
                        <td className="py-2.5 px-4 text-xs">{sec.semester_name}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: SUBJECTS */}
        {activeTab === 'subjects' && academics && (
          <div className="space-y-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiFetch('/api/admin/subjects', { method: 'POST', body: JSON.stringify(subForm) });
                  setSubForm({ ...subForm, code: '', name: '' });
                  showSuccess('Subject assigned.');
                  loadAll();
                } catch (err) {
                  setBannerErr(err instanceof Error ? err.message : 'Failed to create subject.');
                }
              }}
              className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3"
            >
              <input required placeholder="Code (e.g., CS505)" value={subForm.code} onChange={(e) => setSubForm({ ...subForm, code: e.target.value })} className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg" />
              <input required placeholder="Subject Title" value={subForm.name} onChange={(e) => setSubForm({ ...subForm, name: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg" />
              <select value={subForm.sectionId} onChange={(e) => setSubForm({ ...subForm, sectionId: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
                {academics.sections.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
              </select>
              <select value={subForm.teacherId} onChange={(e) => setSubForm({ ...subForm, teacherId: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
                {academics.teachers.map((t) => <option key={t.id} value={t.id}>{t.faculty_id} · {t.full_name}</option>)}
              </select>
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg">Create Subject</button>
            </form>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Subject Name</th>
                    <th className="py-3 px-4">Section</th>
                    <th className="py-3 px-4">Assigned Faculty</th>
                    <th className="py-3 px-4 text-right">Credits</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {academics.subjects.map((s) => (
                    <tr key={s.id}>
                      <td className="py-3 px-4 font-mono text-xs font-semibold">{s.code}</td>
                      <td className="py-3 px-4 font-medium">{s.name}</td>
                      <td className="py-3 px-4 font-mono text-xs">{s.section_name}</td>
                      <td className="py-3 px-4 text-slate-600">{s.teacher_name}</td>
                      <td className="py-3 px-4 text-right font-mono text-xs">{s.credits}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: TIMETABLE */}
        {activeTab === 'timetable' && academics && (
          <div className="space-y-6">
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                try {
                  await apiFetch('/api/admin/timetables', { method: 'POST', body: JSON.stringify(ttForm) });
                  showSuccess('Timetable period scheduled.');
                  loadTabSpecific();
                } catch (err) {
                  setBannerErr(err instanceof Error ? err.message : 'Schedule conflict.');
                }
              }}
              className="bg-white border border-slate-200 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-6 gap-3"
            >
              <select value={ttForm.subjectId} onChange={(e) => setTtForm({ ...ttForm, subjectId: e.target.value })} className="lg:col-span-2 px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
                {academics.subjects.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name} ({s.section_name})</option>)}
              </select>
              <select value={ttForm.dayOfWeek} onChange={(e) => setTtForm({ ...ttForm, dayOfWeek: e.target.value })} className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d) => <option key={d}>{d}</option>)}
              </select>
              <input type="time" value={ttForm.startTime} onChange={(e) => setTtForm({ ...ttForm, startTime: e.target.value })} className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg" />
              <input type="time" value={ttForm.endTime} onChange={(e) => setTtForm({ ...ttForm, endTime: e.target.value })} className="px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg" />
              <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg">Add Slot</button>
            </form>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Day</th>
                      <th className="py-3 px-4">Time</th>
                      <th className="py-3 px-4">Section</th>
                      <th className="py-3 px-4">Subject</th>
                      <th className="py-3 px-4">Faculty</th>
                      <th className="py-3 px-4 text-right">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {timetables.map((tt) => (
                      <tr key={tt.id}>
                        <td className="py-3 px-4 font-medium">{tt.day_of_week}</td>
                        <td className="py-3 px-4 font-mono text-xs">{tt.start_time} - {tt.end_time}</td>
                        <td className="py-3 px-4 font-mono text-xs">{tt.section_name}</td>
                        <td className="py-3 px-4">{tt.subject_code} · {tt.subject_name}</td>
                        <td className="py-3 px-4 text-slate-600">{tt.teacher_name}</td>
                        <td className="py-3 px-4 text-right">
                          <button
                            type="button"
                            onClick={async () => {
                              await apiFetch(`/api/admin/timetables/${tt.id}`, { method: 'DELETE' });
                              loadTabSpecific();
                            }}
                            className="text-red-700 hover:underline text-xs inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: ATTENDANCE */}
        {activeTab === 'attendance' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h3 className="font-semibold text-base text-slate-900">
                University Attendance Ledger &amp; Authorized Corrections
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Every authorized correction is logged in audit_logs and immediately recalculates all student percentages.
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Date &amp; Time</th>
                    <th className="py-3 px-4">USN &amp; Student</th>
                    <th className="py-3 px-4">Subject &amp; Section</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Authorized Correction</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendanceRecords.map((r) => (
                    <tr key={r.attendance_id}>
                      <td className="py-3 px-4 font-mono text-xs">
                        <div>{r.session_date}</div>
                        <div className="text-slate-500">{r.start_time}-{r.end_time}</div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs font-semibold">{r.usn}</div>
                        <div className="text-slate-800">{r.student_name}</div>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        {r.subject_code} · {r.subject_name} ({r.section_name})
                      </td>
                      <td className="py-3 px-4">
                        <AttendanceStatusText status={r.attendance_status} />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <select
                          value={r.attendance_status}
                          onChange={(e) => handleCorrectAttendance(r.attendance_id, e.target.value)}
                          className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                        >
                          {['Present', 'Absent', 'Late', 'Excused', 'Pending Review'].map((st) => (
                            <option key={st} value={st}>{st}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: PARENTS */}
        {activeTab === 'parents' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h3 className="font-semibold text-base text-slate-900">Parent Contact Management &amp; Access Links</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Parent / Guardian</th>
                    <th className="py-3 px-4">Linked Student</th>
                    <th className="py-3 px-4">Phone &amp; Email</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4">WhatsApp Consent</th>
                    <th className="py-3 px-4 text-right">Secure Access Link</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {parentsList.map((p) => (
                    <tr key={`${p.parent_id}-${p.usn}`}>
                      <td className="py-3 px-4 font-medium">{p.parent_name}</td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-semibold text-[#1D4ED8]">{p.usn}</span>
                        <span className="ml-1.5 text-slate-700">{p.student_name}</span>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <div className="font-mono">{p.parent_phone || '—'}</div>
                        <div className="text-slate-500">{p.parent_email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={p.preferred_channel}
                          onChange={async (e) => {
                            await apiFetch(`/api/admin/parents/${p.parent_id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ preferredChannel: e.target.value }),
                            });
                            loadTabSpecific();
                          }}
                          className="px-2 py-1 text-xs border border-slate-300 rounded bg-white uppercase font-mono"
                        >
                          <option value="email">EMAIL</option>
                          <option value="sms">SMS</option>
                          <option value="whatsapp">WHATSAPP</option>
                        </select>
                      </td>
                      <td className="py-3 px-4">
                        <input
                          type="checkbox"
                          checked={Boolean(p.whatsapp_consent)}
                          onChange={async (e) => {
                            await apiFetch(`/api/admin/parents/${p.parent_id}`, {
                              method: 'PATCH',
                              body: JSON.stringify({ whatsappConsent: e.target.checked }),
                            });
                            loadTabSpecific();
                          }}
                        />
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => {
                            const url = `${window.location.origin}/parent/access/${p.access_token}`;
                            navigator.clipboard?.writeText(url);
                            showSuccess(`Copied secure parent access link: ${url}`);
                          }}
                          className="text-xs font-semibold text-[#1D4ED8] hover:underline"
                        >
                          Copy Link
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: NOTIFICATIONS */}
        {activeTab === 'notifications' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="p-6 border-b border-slate-200">
              <h3 className="font-semibold text-base text-slate-900">
                Parent Notification Delivery Queue (MSG91 · Resend · WhatsApp)
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Channel &amp; Recipient</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Detail</th>
                    <th className="py-3 px-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {notificationLogs.map((log) => (
                    <tr key={log.log_id}>
                      <td className="py-3 px-4 font-mono text-xs text-slate-500">{log.created_at}</td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-xs font-semibold">{log.usn}</span>
                        <span className="ml-1.5">{log.student_name}</span>
                      </td>
                      <td className="py-3 px-4 text-xs">
                        <span className="font-mono uppercase font-semibold">{log.channel}</span> · {log.recipient}
                      </td>
                      <td className="py-3 px-4 text-xs font-semibold uppercase">
                        <span
                          className={
                            log.status === 'sent'
                              ? 'text-emerald-700'
                              : log.status === 'failed'
                              ? 'text-red-700'
                              : 'text-amber-700'
                          }
                        >
                          {log.status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 max-w-xs truncate">
                        {log.error_message || 'Delivered'}
                      </td>
                      <td className="py-3 px-4 text-right">
                        {log.status !== 'sent' && (
                          <button
                            type="button"
                            onClick={() => handleRetryNotification(log.log_id)}
                            className="px-2.5 py-1 text-xs font-semibold bg-[#EFF6FF] text-[#1D4ED8] rounded hover:bg-blue-100"
                          >
                            Retry ({log.retry_count})
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB: APPOINTMENTS */}
        {activeTab === 'appointments' && (
          <div className="space-y-6">
            {appointmentsData && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Cloud className="w-4 h-4 text-[#1D4ED8]" />
                      <span>Supabase Appointment Bookings Table</span>
                    </div>
                    <p className="text-xs text-slate-600">
                      {appointmentsData.supabaseReady ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            Connected to public.appointments ({appointmentsData.supabaseAppointments.length} booking(s) live in Supabase).
                          </span>
                        </span>
                      ) : (
                        <span className="text-amber-700 font-medium">
                          Bookings are saved locally; create public.appointments in Supabase SQL Editor to see rows automatically appear in Supabase.
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!appointmentsData.supabaseReady && (
                      <button
                        type="button"
                        onClick={() =>
                          handleCopySql(appointmentsData.appointmentsSql, 'Appointments Table SQL')
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-[#EFF6FF] text-[#1D4ED8] rounded-lg hover:bg-blue-100"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Appointments SQL</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          const res = await apiFetch<{ ok: boolean; message: string }>(
                            '/api/admin/appointments/sync',
                            { method: 'POST' }
                          );
                          if (res.ok) showSuccess(res.message);
                          else setBannerErr(res.message);
                          loadTabSpecific();
                        } catch (err) {
                          setBannerErr(err instanceof Error ? err.message : 'Sync failed.');
                        }
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg hover:bg-slate-800"
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>Sync Bookings to Supabase</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-base text-slate-900">
                    Appointment Bookings Queue
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Every submission from the public /appointments form is persisted locally and pushed to Supabase.
                  </p>
                </div>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Booking Code</th>
                      <th className="py-3 px-4">Requester</th>
                      <th className="py-3 px-4">Scheduled With</th>
                      <th className="py-3 px-4">Date &amp; Slot</th>
                      <th className="py-3 px-4">Purpose</th>
                      <th className="py-3 px-4">Supabase</th>
                      <th className="py-3 px-4 text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!appointmentsData || appointmentsData.localAppointments.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500 text-xs">
                          No appointments booked yet. Share the /appointments route to accept requests.
                        </td>
                      </tr>
                    ) : (
                      appointmentsData.localAppointments.map((apt) => (
                        <tr key={apt.id}>
                          <td className="py-3 px-4 font-mono text-xs font-semibold text-[#1D4ED8]">
                            {apt.booking_code}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-900">
                              {apt.full_name}{' '}
                              <span className="text-xs text-slate-500">({apt.requester_role})</span>
                            </div>
                            <div className="text-xs text-slate-500 font-mono">
                              {apt.email} · {apt.phone}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-xs">
                            <div className="font-medium text-slate-800">{apt.appointment_with}</div>
                            <div className="text-slate-500">{apt.department_code}</div>
                          </td>
                          <td className="py-3 px-4 font-mono text-xs tabular-nums">
                            <div>{apt.preferred_date}</div>
                            <div className="text-slate-500">{apt.preferred_time}</div>
                          </td>
                          <td className="py-3 px-4 text-xs text-slate-700 max-w-xs">
                            <div className="font-medium">{apt.purpose}</div>
                            {apt.notes && <div className="text-slate-500 truncate">{apt.notes}</div>}
                          </td>
                          <td className="py-3 px-4 text-xs font-medium">
                            <span className={apt.synced_to_supabase ? 'text-emerald-700' : 'text-amber-700'}>
                              {apt.synced_to_supabase ? 'Synced' : 'Pending SQL'}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-right">
                            <select
                              value={apt.status}
                              onChange={async (e) => {
                                try {
                                  const res = await apiFetch<{ message: string }>(
                                    `/api/admin/appointments/${apt.id}`,
                                    {
                                      method: 'PATCH',
                                      body: JSON.stringify({ status: e.target.value }),
                                    }
                                  );
                                  showSuccess(res.message);
                                  loadTabSpecific();
                                } catch (err) {
                                  setBannerErr(err instanceof Error ? err.message : 'Status update failed.');
                                }
                              }}
                              className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                            >
                              {['Pending', 'Confirmed', 'Completed', 'Cancelled'].map((st) => (
                                <option key={st} value={st}>{st}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB: REPORTS */}
        {activeTab === 'reports' && (
          <div className="space-y-6">
            {/* Supabase Backend Management Sync Panel */}
            {supabaseStatus && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                      <Cloud className="w-4 h-4 text-[#1D4ED8]" />
                      <span>
                        Supabase Management Backend · Project{' '}
                        <span className="font-mono text-[#1D4ED8]">
                          {supabaseStatus.projectRef || 'unconfigured'}
                        </span>
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      {supabaseStatus.tablesReady ? (
                        <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>
                            Connected and ready ({supabaseStatus.readyTables.length} management report tables active).
                            {supabaseStatus.lastSyncedAt &&
                              ` Last synced ${new Date(supabaseStatus.lastSyncedAt).toLocaleString()}.`}
                          </span>
                        </span>
                      ) : supabaseStatus.connected ? (
                        <span className="text-amber-700 font-medium">
                          Connected to Supabase endpoint, waiting for one-time management table SQL setup (
                          {supabaseStatus.missingTables.length} tables pending).
                        </span>
                      ) : (
                        <span className="text-red-700 font-medium">
                          {supabaseStatus.lastError || 'Supabase backend unreachable.'}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {supabaseStatus.tablesReady && (
                      <div className="inline-flex border border-slate-300 rounded-lg overflow-hidden text-xs">
                        <button
                          type="button"
                          onClick={() => setReportSource('local')}
                          className={`px-3 py-1.5 font-medium ${
                            reportSource === 'local'
                              ? 'bg-[#0B1F3A] text-white'
                              : 'bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          Live University Engine
                        </button>
                        <button
                          type="button"
                          onClick={() => setReportSource('supabase')}
                          className={`px-3 py-1.5 font-medium ${
                            reportSource === 'supabase'
                              ? 'bg-[#0B1F3A] text-white'
                              : 'bg-white text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          Supabase Cloud Snapshots ({supabaseReportSnapshots.length})
                        </button>
                      </div>
                    )}

                    <button
                      type="button"
                      disabled={supabaseSyncing}
                      onClick={handleSyncSupabaseReports}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg hover:bg-slate-800 disabled:opacity-60"
                    >
                      <Database className="w-3.5 h-3.5" />
                      <span>{supabaseSyncing ? 'Syncing to Supabase...' : 'Sync All Reports to Supabase'}</span>
                    </button>
                  </div>
                </div>

                {!supabaseStatus.tablesReady && supabaseStatus.reportSetupSql && (
                  <div className="border-t border-slate-200 pt-4 space-y-2.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-xs text-slate-700">
                        Run this one-time SQL script in your Supabase Dashboard SQL Editor (
                        <span className="font-mono">{supabaseStatus.projectRef}</span>) to create{' '}
                        <span className="font-mono">management_report_snapshots</span>,{' '}
                        <span className="font-mono">management_student_attendance</span>,{' '}
                        <span className="font-mono">management_subject_attendance</span>,{' '}
                        <span className="font-mono">management_department_attendance</span>, and{' '}
                        <span className="font-mono">management_notification_reports</span>.
                      </p>
                      <button
                        type="button"
                        onClick={() =>
                          handleCopySql(supabaseStatus.reportSetupSql, 'Management Report SQL')
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-[#EFF6FF] text-[#1D4ED8] rounded-lg hover:bg-blue-100"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy Setup SQL</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { id: 'daily', label: 'Daily' },
                  { id: 'weekly', label: 'Weekly' },
                  { id: 'monthly', label: 'Monthly' },
                  { id: 'subject', label: 'Subject-Wise' },
                  { id: 'semester', label: 'Semester-Wise' },
                  { id: 'department', label: 'Department-Wise' },
                  { id: 'student', label: 'Student-Wise' },
                  { id: 'shortage', label: 'Shortage Report' },
                  { id: 'notifications', label: 'Parent Notifications' },
                ].map((rt) => (
                  <button
                    key={rt.id}
                    type="button"
                    onClick={() => setReportType(rt.id)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                      reportType === rt.id
                        ? 'bg-[#0B1F3A] text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    {rt.label}
                  </button>
                ))}
              </div>

              {reportData && reportSource === 'local' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() =>
                      downloadCsvReport(
                        `uniattend-${reportType}-report`,
                        reportData.columns,
                        reportData.rows
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold border border-slate-300 rounded-lg hover:bg-slate-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download CSV</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      downloadPdfReport(
                        `uniattend-${reportType}-report`,
                        `${reportType.toUpperCase()} Attendance Report`,
                        'Computed dynamically from finalized university sessions',
                        reportData.columns,
                        reportData.rows
                      )
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold bg-[#1D4ED8] text-white rounded-lg hover:bg-blue-700"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download PDF</span>
                  </button>
                </div>
              )}
            </div>

            {reportSource === 'supabase' ? (
              (() => {
                const snap = supabaseReportSnapshots.find((s) => s.report_type === reportType);
                if (!snap) {
                  return (
                    <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                      No Supabase snapshot found for "{reportType}". Click "Sync All Reports to Supabase" above to publish the latest management snapshots.
                    </div>
                  );
                }
                const rows = Array.isArray(snap.rows_json) ? snap.rows_json : [];
                const cols = rows.length > 0 ? Object.keys(rows[0]) : [];
                return (
                  <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-900">{snap.title} (Supabase Table Snapshot)</span>
                      <span className="font-mono text-slate-500">
                        Rows: {snap.row_count} · Synced: {new Date(snap.synced_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                            {cols.map((col) => (
                              <th key={col} className="py-3 px-4">{col}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {rows.length === 0 ? (
                            <tr>
                              <td colSpan={Math.max(1, cols.length)} className="py-8 text-center text-slate-500 text-xs">
                                Snapshot contains 0 rows for this report category.
                              </td>
                            </tr>
                          ) : (
                            rows.map((row, idx) => (
                              <tr key={idx}>
                                {cols.map((col) => (
                                  <td key={col} className="py-3 px-4 font-mono text-xs text-slate-800">
                                    {String(row[col] ?? '')}
                                  </td>
                                ))}
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                );
              })()
            ) : (
              reportData && (
                <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                          {reportData.columns.map((col) => (
                            <th key={col} className="py-3 px-4">{col}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {reportData.rows.length === 0 ? (
                          <tr>
                            <td colSpan={reportData.columns.length} className="py-8 text-center text-slate-500 text-xs">
                              No records match the current filter selection.
                            </td>
                          </tr>
                        ) : (
                          reportData.rows.map((row, idx) => (
                            <tr key={idx}>
                              {reportData.columns.map((col) => (
                                <td key={col} className="py-3 px-4 font-mono text-xs text-slate-800">
                                  {String(row[col] ?? '')}
                                </td>
                              ))}
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            )}
          </div>
        )}

        {/* TAB: SETTINGS */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <form onSubmit={handleUpdatePolicy} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-base text-slate-900">
                  Attendance Threshold Policy Configuration
                </h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Minimum Eligible %
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={minEligibleInput}
                      onChange={(e) => setMinEligibleInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Critical Shortage Below %
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={criticalInput}
                      onChange={(e) => setCriticalInput(e.target.value)}
                      className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                    />
                  </div>
                </div>
                <div className="space-y-2 text-xs text-slate-700">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={lateAsPresent} onChange={(e) => setLateAsPresent(e.target.checked)} />
                    <span>Count Late status as Present in eligibility calculations</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={excusedAsPresent} onChange={(e) => setExcusedAsPresent(e.target.checked)} />
                    <span>Count Excused status as Present in eligibility calculations</span>
                  </label>
                </div>
                <button type="submit" className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg">
                  Save Policy Thresholds
                </button>
              </form>

              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold text-base text-slate-900">
                    Supabase Backend Connection &amp; SQL Setup
                  </h3>
                  <div className="flex items-center gap-3">
                    {supabaseStatus?.reportSetupSql && (
                      <button
                        type="button"
                        onClick={() =>
                          handleCopySql(supabaseStatus.reportSetupSql, 'Management Report SQL')
                        }
                        className="text-xs font-semibold text-[#1D4ED8] hover:underline"
                      >
                        Copy Report SQL
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const blob = new Blob([supabaseSql], { type: 'text/sql' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = 'uniattend_supabase_migration.sql';
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      className="text-xs font-semibold text-[#1D4ED8] hover:underline"
                    >
                      Download Full SQL
                    </button>
                  </div>
                </div>

                {supabaseStatus && (
                  <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-slate-700">
                        Project ID: <span className="font-mono text-slate-900">{supabaseStatus.projectRef || '—'}</span>
                      </span>
                      <span className="font-mono text-slate-500">
                        Key: {supabaseStatus.keyPreview || 'Not configured'}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={supabaseStatus.tablesReady ? 'text-emerald-700 font-medium' : 'text-amber-700 font-medium'}>
                        {supabaseStatus.tablesReady
                          ? `Ready · ${supabaseStatus.readyTables.length}/5 management tables online`
                          : supabaseStatus.connected
                          ? `Connected · Missing tables: ${supabaseStatus.missingTables.join(', ')}`
                          : supabaseStatus.lastError || 'Offline'}
                      </span>
                      <button
                        type="button"
                        disabled={supabaseSyncing}
                        onClick={handleSyncSupabaseReports}
                        className="px-2.5 py-1 text-xs font-semibold bg-[#0B1F3A] text-white rounded hover:bg-slate-800 disabled:opacity-60"
                      >
                        {supabaseSyncing ? 'Syncing...' : 'Sync Reports Now'}
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-xs text-slate-500">
                  Run the management reporting SQL script in your Supabase SQL Editor so management can inspect all synced tables, shortage views, and snapshots directly inside Supabase.
                </p>
                <pre className="text-[11px] font-mono bg-slate-900 text-slate-100 p-3 rounded-lg max-h-48 overflow-auto">
                  {supabaseStatus?.reportSetupSql || supabaseSql}
                </pre>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-5 border-b border-slate-200">
                <h3 className="font-semibold text-base text-slate-900">System Modification &amp; Security Audit Log</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-semibold text-slate-600">
                      <th className="py-2.5 px-4">Timestamp</th>
                      <th className="py-2.5 px-4">Actor</th>
                      <th className="py-2.5 px-4">Action</th>
                      <th className="py-2.5 px-4">Entity</th>
                      <th className="py-2.5 px-4">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {auditLogs.map((a) => (
                      <tr key={a.id}>
                        <td className="py-2.5 px-4 font-mono text-slate-500">{a.created_at}</td>
                        <td className="py-2.5 px-4">{a.actor_name || a.actor_role}</td>
                        <td className="py-2.5 px-4 font-mono font-semibold text-[#1D4ED8]">{a.action}</td>
                        <td className="py-2.5 px-4 font-mono">{a.entity_type} #{a.entity_id}</td>
                        <td className="py-2.5 px-4 text-slate-600">{a.reason || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {loading && !dashboard && (
          <div className="h-44 bg-white border border-slate-200 rounded-xl animate-pulse" />
        )}
      </div>
    </PortalLayout>
  );
}
