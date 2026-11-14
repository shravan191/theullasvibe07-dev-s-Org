import { useCallback, useEffect, useState } from 'react';
import { Bell, BookOpen, History, LayoutDashboard, User } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PortalLayout, type NavItem } from '../components/PortalLayout';
import { AttendanceStatusText, CategoryStatusText } from '../components/StatusText';
import { AttendanceBarChart } from '../components/AttendanceChart';

interface ParentDashboardData {
  parentProfile: {
    id: number;
    full_name: string;
    email: string;
    phone: string | null;
    preferred_channel: string;
    whatsapp_consent: number;
    access_token: string;
  };
  children: Array<{
    relationship: string;
    report: {
      studentId: number;
      usn: string;
      fullName: string;
      email: string;
      departmentName: string;
      courseName: string;
      semesterName: string;
      sectionName: string;
      policy: { minEligiblePercent: number; criticalShortagePercent: number };
      overall: {
        present: number;
        absent: number;
        conducted: number;
        percentage: number;
        category: string;
        additionalClassesNeeded: number;
        requirementMessage: string;
      };
      subjects: Array<{
        subjectId: number;
        subjectCode: string;
        subjectName: string;
        teacherName: string;
        present: number;
        absent: number;
        conducted: number;
        percentage: number;
        category: string;
        requirementMessage: string;
      }>;
    };
    history: Array<{
      id: number;
      status: string;
      session_code: string;
      session_date: string;
      start_time: string;
      end_time: string;
      subject_code: string;
      subject_name: string;
      teacher_name: string;
    }>;
  }>;
  notifications: Array<{
    id: number;
    title: string;
    message: string;
    created_at: string;
    usn: string;
    student_name: string;
    delivery_summary: string | null;
  }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'profile', label: 'Child Profile', icon: User },
  { id: 'summary', label: 'Attendance Summary', icon: BookOpen },
  { id: 'history', label: 'Attendance History', icon: History },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

export function ParentDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState<ParentDashboardData | null>(null);
  const [selectedChildIdx, setSelectedChildIdx] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ParentDashboardData>('/api/parent/dashboard');
      setData(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load parent portal.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (!user) return null;

  const activeChild = data?.children[selectedChildIdx];

  return (
    <PortalLayout
      user={user}
      portalLabel="Parent Portal"
      navItems={NAV_ITEMS}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onLogout={logout}
    >
      {loading ? (
        <div className="h-40 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : error || !data ? (
        <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
          {error || 'Unable to load linked student records.'}
        </div>
      ) : !activeChild ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-sm text-slate-600">
          No students are currently linked to this parent account. Contact the university administrator.
        </div>
      ) : (
        <div className="space-y-6">
          {/* Child selector if multiple linked */}
          {data.children.length > 1 && (
            <div className="flex items-center gap-2">
              {data.children.map((c, idx) => (
                <button
                  key={c.report.studentId}
                  type="button"
                  onClick={() => setSelectedChildIdx(idx)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg border ${
                    idx === selectedChildIdx
                      ? 'bg-[#0B1F3A] text-white border-[#0B1F3A]'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  {c.report.fullName} ({c.report.usn})
                </button>
              ))}
            </div>
          )}

          {/* Linked Student Banner */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono font-semibold text-[#1D4ED8]">{activeChild.report.usn}</span>
                <span aria-hidden="true">·</span>
                <span>{activeChild.report.departmentName}</span>
                <span aria-hidden="true">·</span>
                <span>{activeChild.report.semesterName}</span>
                <span aria-hidden="true">·</span>
                <span>Section {activeChild.report.sectionName}</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-[#0B1F3A] mt-1">
                {activeChild.report.fullName}
              </h2>
            </div>
            <div className="sm:text-right">
              <CategoryStatusText category={activeChild.report.overall.category} />
              <p className="text-xs text-slate-600 mt-1">
                {activeChild.report.overall.requirementMessage}
              </p>
            </div>
          </div>

          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Overall Attendance</p>
                  <p className="font-mono tabular-nums text-3xl font-bold text-[#0B1F3A] mt-2">
                    {activeChild.report.overall.percentage.toFixed(2)}%
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Classes Attended</p>
                  <p className="font-mono tabular-nums text-3xl font-bold text-emerald-700 mt-2">
                    {activeChild.report.overall.present}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Absent Classes</p>
                  <p className="font-mono tabular-nums text-3xl font-bold text-red-700 mt-2">
                    {activeChild.report.overall.absent}
                  </p>
                </div>
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Classes Required for Target</p>
                  <p className="font-mono tabular-nums text-3xl font-bold text-[#1D4ED8] mt-2">
                    {activeChild.report.overall.additionalClassesNeeded}
                  </p>
                </div>
              </div>

              <AttendanceBarChart
                title="Subject-Wise Attendance Summary"
                targetPercent={activeChild.report.policy.minEligiblePercent}
                items={activeChild.report.subjects.map((s) => ({
                  label: `${s.subjectCode} · ${s.subjectName}`,
                  sublabel: `${s.present} present / ${s.conducted} conducted`,
                  percentage: s.percentage,
                }))}
              />
            </div>
          )}

          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                <h3 className="font-semibold text-base text-slate-900">Linked Student Details</h3>
                <dl className="divide-y divide-slate-100 text-sm">
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Student Name</dt>
                    <dd className="font-medium">{activeChild.report.fullName}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">USN</dt>
                    <dd className="font-mono font-semibold">{activeChild.report.usn}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Department</dt>
                    <dd>{activeChild.report.departmentName}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Program</dt>
                    <dd>{activeChild.report.courseName}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Section</dt>
                    <dd className="font-mono">{activeChild.report.sectionName}</dd>
                  </div>
                </dl>
              </div>
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                <h3 className="font-semibold text-base text-slate-900">Guardian Contact Settings</h3>
                <dl className="divide-y divide-slate-100 text-sm">
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Guardian Name</dt>
                    <dd className="font-medium">{data.parentProfile.full_name}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Email</dt>
                    <dd>{data.parentProfile.email}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Phone</dt>
                    <dd className="font-mono">{data.parentProfile.phone || '—'}</dd>
                  </div>
                  <div className="py-2.5 flex justify-between">
                    <dt className="text-slate-500">Preferred Alert Channel</dt>
                    <dd className="uppercase font-mono text-xs">{data.parentProfile.preferred_channel}</dd>
                  </div>
                </dl>
              </div>
            </div>
          )}

          {activeTab === 'summary' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <h3 className="font-semibold text-base text-slate-900">Subject Attendance Breakdown</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Subject</th>
                      <th className="py-3 px-4">Faculty</th>
                      <th className="py-3 px-4 text-right">Present</th>
                      <th className="py-3 px-4 text-right">Conducted</th>
                      <th className="py-3 px-4 text-right">Percentage</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {activeChild.report.subjects.map((sub) => (
                      <tr key={sub.subjectId}>
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{sub.subjectName}</div>
                          <div className="text-xs font-mono text-slate-500">{sub.subjectCode}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{sub.teacherName}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{sub.present}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{sub.conducted}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold">
                          {sub.percentage.toFixed(2)}%
                        </td>
                        <td className="py-3 px-4">
                          <CategoryStatusText category={sub.category} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <h3 className="font-semibold text-base text-slate-900">Class Attendance History</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Time</th>
                      <th className="py-3 px-4">Subject</th>
                      <th className="py-3 px-4">Faculty</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {activeChild.history.map((h) => (
                      <tr key={h.id}>
                        <td className="py-3 px-4 font-mono text-xs">{h.session_date}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">
                          {h.start_time} - {h.end_time}
                        </td>
                        <td className="py-3 px-4">
                          {h.subject_code} · {h.subject_name}
                        </td>
                        <td className="py-3 px-4 text-slate-600">{h.teacher_name}</td>
                        <td className="py-3 px-4">
                          <AttendanceStatusText status={h.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activeTab === 'notifications' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h3 className="font-semibold text-base text-slate-900">Absence Notification Log</h3>
              {data.notifications.length === 0 ? (
                <p className="text-sm text-slate-500">No absence notifications received.</p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.notifications.map((n) => (
                    <div key={n.id} className="py-4 space-y-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-semibold text-sm text-slate-900">{n.title}</span>
                        <span className="text-xs font-mono text-slate-500">{n.created_at}</span>
                      </div>
                      <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans bg-slate-50 p-3 rounded-lg border border-slate-200">
                        {n.message}
                      </pre>
                      <p className="text-xs text-slate-500">
                        Channels: {n.delivery_summary || 'In-portal alert'}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </PortalLayout>
  );
}
