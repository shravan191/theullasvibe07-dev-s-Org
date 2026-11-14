import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Bell,
  BookOpen,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  History,
  LayoutDashboard,
  User,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { PortalLayout, type NavItem } from '../components/PortalLayout';
import { AttendanceStatusText, CategoryStatusText } from '../components/StatusText';
import { AttendanceBarChart } from '../components/AttendanceChart';

interface StudentDashboardData {
  report: {
    studentId: number;
    usn: string;
    fullName: string;
    email: string;
    phone: string | null;
    departmentCode: string;
    departmentName: string;
    courseName: string;
    semesterName: string;
    semesterNumber: number;
    sectionName: string;
    faceConsent: boolean;
    policy: {
      minEligiblePercent: number;
      criticalShortagePercent: number;
    };
    overall: {
      present: number;
      absent: number;
      late: number;
      excused: number;
      conducted: number;
      percentage: number;
      category: string;
      additionalClassesNeeded: number;
      requirementMessage: string;
    };
    semesterSummary: {
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
      credits: number;
      teacherName: string;
      present: number;
      absent: number;
      conducted: number;
      percentage: number;
      category: string;
      additionalClassesNeeded: number;
      requirementMessage: string;
    }>;
    monthlyHistory: Array<{
      month: string;
      label: string;
      present: number;
      absent: number;
      conducted: number;
      percentage: number;
    }>;
  };
  todayDay: string;
  todaysTimetable: Array<{
    id: number;
    start_time: string;
    end_time: string;
    room_no: string;
    subject_code: string;
    subject_name: string;
    teacher_name: string;
  }>;
  weeklyTimetable: Array<{
    id: number;
    day_of_week: string;
    start_time: string;
    end_time: string;
    room_no: string;
    subject_code: string;
    subject_name: string;
    teacher_name: string;
  }>;
  history: Array<{
    id: number;
    status: string;
    source: string;
    notes: string | null;
    session_code: string;
    session_date: string;
    start_time: string;
    end_time: string;
    topic: string | null;
    subject_code: string;
    subject_name: string;
    teacher_name: string;
  }>;
  notifications: Array<{
    id: number;
    title: string;
    message: string;
    created_at: string;
    parent_name: string;
    delivery_summary: string | null;
  }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'profile', label: 'My Profile', icon: User },
  { id: 'attendance', label: 'My Attendance', icon: ClipboardCheck },
  { id: 'subjects', label: 'Subject Attendance', icon: BookOpen },
  { id: 'timetable', label: 'Timetable', icon: Calendar },
  { id: 'history', label: 'Attendance History', icon: History },
  { id: 'notifications', label: 'Notifications', icon: Bell },
];

export function StudentDashboard() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [data, setData] = useState<StudentDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Face consent & reference enrollment state
  const [consentChecked, setConsentChecked] = useState(false);
  const [faceDescriptor, setFaceDescriptor] = useState('');
  const [facePreview, setFacePreview] = useState<string | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [consentMessage, setConsentMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<StudentDashboardData>('/api/student/dashboard');
      setData(res);
      setConsentChecked(res.report.faceConsent);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load student portal.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [loadDashboard]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      setCameraActive(true);
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch {
      setConsentMessage('Camera access denied or unavailable. You may upload a photo instead.');
    }
  };

  const captureSnapshot = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      setFacePreview(canvas.toDataURL('image/jpeg', 0.85));
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setCameraActive(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setFacePreview(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const saveBiometricConsent = async () => {
    setSavingConsent(true);
    setConsentMessage(null);
    try {
      await apiFetch('/api/student/face-consent', {
        method: 'PATCH',
        body: JSON.stringify({
          faceConsent: consentChecked,
          faceReferenceImage: facePreview || undefined,
          faceDescriptor: faceDescriptor || undefined,
        }),
      });
      setConsentMessage('Biometric consent settings saved.');
      loadDashboard();
    } catch (err) {
      setConsentMessage(err instanceof Error ? err.message : 'Unable to save consent.');
    } finally {
      setSavingConsent(false);
    }
  };

  if (!user) return null;

  return (
    <PortalLayout
      user={user}
      portalLabel="Student Portal"
      navItems={NAV_ITEMS}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onLogout={logout}
    >
      {loading ? (
        <div className="space-y-4">
          <div className="h-24 bg-white border border-slate-200 rounded-xl animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-28 bg-white border border-slate-200 rounded-xl animate-pulse" />
            ))}
          </div>
        </div>
      ) : error || !data ? (
        <div className="bg-white border border-red-200 rounded-xl p-6 text-sm text-red-700">
          {error || 'Unable to load student records.'}
        </div>
      ) : (
        <div className="space-y-6">
          {/* Student Identity Header */}
          <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span className="font-mono font-semibold text-[#1D4ED8]">{data.report.usn}</span>
                <span aria-hidden="true">·</span>
                <span>{data.report.departmentName}</span>
                <span aria-hidden="true">·</span>
                <span>{data.report.semesterName}</span>
                <span aria-hidden="true">·</span>
                <span>Section {data.report.sectionName}</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-[#0B1F3A] mt-1">
                {data.report.fullName}
              </h2>
            </div>
            <div className="flex flex-col sm:items-end gap-1">
              <CategoryStatusText category={data.report.overall.category} />
              <p className="text-xs text-slate-600">{data.report.overall.requirementMessage}</p>
            </div>
          </div>

          {/* Shortage Warning Banner */}
          {data.report.overall.category !== 'Eligible' && (
            <div
              className={`rounded-xl border p-4 text-sm flex flex-wrap items-center justify-between gap-3 ${
                data.report.overall.category === 'Critical Shortage'
                  ? 'bg-red-50 border-red-200 text-red-900'
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              <div>
                <p className="font-semibold">
                  Attendance {data.report.overall.category} ({data.report.overall.percentage.toFixed(2)}%)
                </p>
                <p className="text-xs mt-0.5">{data.report.overall.requirementMessage}</p>
              </div>
              <span className="font-mono tabular-nums text-xs font-semibold">
                Minimum required: {data.report.policy.minEligiblePercent}%
              </span>
            </div>
          )}

          {/* TAB: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Overall Attendance</p>
                  <p className="font-mono tabular-nums text-3xl font-bold text-[#0B1F3A] mt-2">
                    {data.report.overall.percentage.toFixed(2)}%
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {data.report.overall.present} / {data.report.overall.conducted} classes
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Total Classes Conducted</p>
                  <p className="font-mono tabular-nums text-3xl font-bold text-slate-900 mt-2">
                    {data.report.overall.conducted}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">Finalized sessions only</p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">Total Classes Attended</p>
                  <p className="font-mono tabular-nums text-3xl font-bold text-emerald-700 mt-2">
                    {data.report.overall.present}
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    {data.report.overall.absent} absent class(es)
                  </p>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-5">
                  <p className="text-xs text-slate-500">
                    Classes Needed for {data.report.policy.minEligiblePercent}%
                  </p>
                  <p className="font-mono tabular-nums text-3xl font-bold text-[#1D4ED8] mt-2">
                    {data.report.overall.additionalClassesNeeded}
                  </p>
                  <p className="text-xs text-slate-600 mt-1">
                    {data.report.overall.requirementMessage}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <div className="lg:col-span-7">
                  <AttendanceBarChart
                    title="Subject-Wise Attendance Percentage"
                    subtitle="Calculated directly from finalized period records"
                    targetPercent={data.report.policy.minEligiblePercent}
                    items={data.report.subjects.map((s) => ({
                      label: `${s.subjectCode} · ${s.subjectName}`,
                      sublabel: `${s.present} present / ${s.conducted} conducted · ${s.requirementMessage}`,
                      percentage: s.percentage,
                    }))}
                  />
                </div>

                <div className="lg:col-span-5 space-y-6">
                  <AttendanceBarChart
                    title="Monthly Attendance History"
                    subtitle="Month-over-month finalized attendance rate"
                    targetPercent={data.report.policy.minEligiblePercent}
                    items={data.report.monthlyHistory.map((m) => ({
                      label: m.label,
                      sublabel: `${m.present} attended · ${m.absent} absent`,
                      percentage: m.percentage,
                    }))}
                  />

                  {/* Today's Timetable */}
                  <div className="bg-white border border-slate-200 rounded-xl p-6">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-base text-slate-900">
                        Today’s Timetable ({data.todayDay})
                      </h3>
                      <button
                        type="button"
                        onClick={() => setActiveTab('timetable')}
                        className="text-xs font-medium text-[#1D4ED8] hover:underline"
                      >
                        Full Week
                      </button>
                    </div>
                    {data.todaysTimetable.length === 0 ? (
                      <p className="text-sm text-slate-500">No classes scheduled for today.</p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {data.todaysTimetable.map((slot) => (
                          <div key={slot.id} className="py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-slate-900 truncate">
                                {slot.subject_code} · {slot.subject_name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {slot.teacher_name} · Room {slot.room_no}
                              </p>
                            </div>
                            <span className="font-mono tabular-nums text-xs font-medium text-slate-700 shrink-0">
                              {slot.start_time} - {slot.end_time}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: MY PROFILE */}
          {activeTab === 'profile' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h3 className="font-semibold text-base text-slate-900">Academic Profile</h3>
                <dl className="divide-y divide-slate-100 text-sm">
                  <div className="py-3 flex justify-between gap-4">
                    <dt className="text-slate-500">Full Name</dt>
                    <dd className="font-medium text-slate-900">{data.report.fullName}</dd>
                  </div>
                  <div className="py-3 flex justify-between gap-4">
                    <dt className="text-slate-500">USN / Student ID</dt>
                    <dd className="font-mono font-semibold text-slate-900">{data.report.usn}</dd>
                  </div>
                  <div className="py-3 flex justify-between gap-4">
                    <dt className="text-slate-500">Email</dt>
                    <dd className="text-slate-900">{data.report.email}</dd>
                  </div>
                  <div className="py-3 flex justify-between gap-4">
                    <dt className="text-slate-500">Phone</dt>
                    <dd className="font-mono text-slate-900">{data.report.phone || 'Not provided'}</dd>
                  </div>
                  <div className="py-3 flex justify-between gap-4">
                    <dt className="text-slate-500">Department</dt>
                    <dd className="text-slate-900">{data.report.departmentName}</dd>
                  </div>
                  <div className="py-3 flex justify-between gap-4">
                    <dt className="text-slate-500">Course &amp; Semester</dt>
                    <dd className="text-slate-900">
                      {data.report.courseName} · {data.report.semesterName}
                    </dd>
                  </div>
                  <div className="py-3 flex justify-between gap-4">
                    <dt className="text-slate-500">Section</dt>
                    <dd className="font-mono text-slate-900">{data.report.sectionName}</dd>
                  </div>
                </dl>
              </div>

              <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div>
                  <h3 className="font-semibold text-base text-slate-900">
                    Biometric Facial Recognition Consent
                  </h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Facial attendance is optional. Unrecognized captures never auto-mark you Absent, and manual attendance is always available.
                  </p>
                </div>

                <label className="flex items-start gap-3 p-3.5 rounded-lg border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consentChecked}
                    onChange={(e) => setConsentChecked(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-[#1D4ED8]"
                  />
                  <span className="text-xs text-slate-700 leading-relaxed">
                    I consent to encrypted classroom facial verification during my enrolled sessions.
                  </span>
                </label>

                <div className="space-y-2">
                  <label className="block text-xs font-medium text-slate-700">
                    Optional Reference Portrait (for AI classroom verification)
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-[#EFF6FF] text-[#1D4ED8] rounded-lg hover:bg-blue-100"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Use Webcam</span>
                    </button>
                    <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 cursor-pointer">
                      <span>Upload Portrait</span>
                      <input type="file" accept="image/*" onChange={handleFileUpload} className="hidden" />
                    </label>
                  </div>

                  {cameraActive && (
                    <div className="space-y-2 pt-2">
                      <video ref={videoRef} autoPlay playsInline className="w-full max-w-xs rounded-lg border border-slate-200" />
                      <button
                        type="button"
                        onClick={captureSnapshot}
                        className="px-3 py-1.5 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg"
                      >
                        Capture Reference Frame
                      </button>
                    </div>
                  )}

                  {facePreview && (
                    <img
                      src={facePreview}
                      alt="Student facial reference preview"
                      className="w-28 h-28 object-cover rounded-lg border border-slate-200 mt-2"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    Visual Descriptor Note (optional)
                  </label>
                  <input
                    type="text"
                    value={faceDescriptor}
                    onChange={(e) => setFaceDescriptor(e.target.value)}
                    placeholder="e.g., Rectangular glasses, short black hair"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>

                {consentMessage && (
                  <p className="text-xs text-[#1D4ED8] font-medium">{consentMessage}</p>
                )}

                <button
                  type="button"
                  disabled={savingConsent}
                  onClick={saveBiometricConsent}
                  className="px-4 py-2 text-xs font-semibold bg-[#0B1F3A] text-white rounded-lg hover:bg-[#16345E] disabled:opacity-60"
                >
                  {savingConsent ? 'Saving...' : 'Save Consent Preferences'}
                </button>
              </div>
            </div>
          )}

          {/* TAB: MY ATTENDANCE */}
          {activeTab === 'attendance' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                  <h3 className="font-semibold text-base text-slate-900">
                    Semester Attendance Report
                  </h3>
                  <p className="text-xs text-slate-500">
                    Computed from Sum of Present Classes across All Subjects ÷ Sum of Conducted Classes across All Subjects.
                  </p>
                  <div className="flex items-baseline gap-3 pt-2">
                    <span className="font-mono tabular-nums text-4xl font-bold text-[#0B1F3A]">
                      {data.report.semesterSummary.percentage.toFixed(2)}%
                    </span>
                    <CategoryStatusText category={data.report.semesterSummary.category} />
                  </div>
                  <p className="text-sm text-slate-700 font-medium">
                    {data.report.semesterSummary.requirementMessage}
                  </p>
                  <div className="pt-3 border-t border-slate-100 grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-500 block">Present</span>
                      <span className="font-mono font-semibold text-slate-900">
                        {data.report.semesterSummary.present}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Absent</span>
                      <span className="font-mono font-semibold text-red-700">
                        {data.report.semesterSummary.absent}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-500 block">Conducted</span>
                      <span className="font-mono font-semibold text-slate-900">
                        {data.report.semesterSummary.conducted}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
                  <h3 className="font-semibold text-base text-slate-900">
                    University Attendance Thresholds
                  </h3>
                  <ul className="space-y-2.5 text-sm pt-2">
                    <li className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="flex items-center gap-2 text-emerald-700 font-medium">
                        <CheckCircle2 className="w-4 h-4" /> Eligible
                      </span>
                      <span className="font-mono text-xs text-slate-700">
                        {data.report.policy.minEligiblePercent}% and above
                      </span>
                    </li>
                    <li className="flex items-center justify-between py-2 border-b border-slate-100">
                      <span className="text-amber-700 font-medium">Shortage Warning</span>
                      <span className="font-mono text-xs text-slate-700">
                        {data.report.policy.criticalShortagePercent}% to below{' '}
                        {data.report.policy.minEligiblePercent}%
                      </span>
                    </li>
                    <li className="flex items-center justify-between py-2">
                      <span className="text-red-700 font-medium">Critical Shortage</span>
                      <span className="font-mono text-xs text-slate-700">
                        Below {data.report.policy.criticalShortagePercent}%
                      </span>
                    </li>
                  </ul>
                </div>
              </div>

              <AttendanceBarChart
                title="Monthly Attendance Breakdown"
                targetPercent={data.report.policy.minEligiblePercent}
                items={data.report.monthlyHistory.map((m) => ({
                  label: m.label,
                  sublabel: `${m.present} / ${m.conducted} classes`,
                  percentage: m.percentage,
                }))}
              />
            </div>
          )}

          {/* TAB: SUBJECT ATTENDANCE */}
          {activeTab === 'subjects' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <h3 className="font-semibold text-base text-slate-900">
                  Subject-Wise Attendance Breakdown
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Separate attendance calculation and recovery target for every enrolled course.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Subject</th>
                      <th className="py-3 px-4">Faculty</th>
                      <th className="py-3 px-4 text-right">Present</th>
                      <th className="py-3 px-4 text-right">Absent</th>
                      <th className="py-3 px-4 text-right">Conducted</th>
                      <th className="py-3 px-4 text-right">Attendance %</th>
                      <th className="py-3 px-4">Status</th>
                      <th className="py-3 px-4">Recovery Guidance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {data.report.subjects.map((sub) => (
                      <tr key={sub.subjectId} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <div className="font-medium text-slate-900">{sub.subjectName}</div>
                          <div className="text-xs font-mono text-slate-500">{sub.subjectCode}</div>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{sub.teacherName}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{sub.present}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-red-700">{sub.absent}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{sub.conducted}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-slate-900">
                          {sub.percentage.toFixed(2)}%
                        </td>
                        <td className="py-3 px-4">
                          <CategoryStatusText category={sub.category} />
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">{sub.requirementMessage}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: TIMETABLE */}
          {activeTab === 'timetable' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <h3 className="font-semibold text-base text-slate-900">
                  Weekly Class Timetable · Section {data.report.sectionName}
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Day</th>
                      <th className="py-3 px-4">Time</th>
                      <th className="py-3 px-4">Subject</th>
                      <th className="py-3 px-4">Faculty</th>
                      <th className="py-3 px-4">Room</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {data.weeklyTimetable.map((slot) => (
                      <tr key={slot.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-medium text-slate-900">{slot.day_of_week}</td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-700">
                          {slot.start_time} - {slot.end_time}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-mono text-xs text-[#1D4ED8] mr-2">{slot.subject_code}</span>
                          <span className="text-slate-900">{slot.subject_name}</span>
                        </td>
                        <td className="py-3 px-4 text-slate-600">{slot.teacher_name}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">{slot.room_no}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: ATTENDANCE HISTORY */}
          {activeTab === 'history' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="p-6 border-b border-slate-200">
                <h3 className="font-semibold text-base text-slate-900">
                  Period-by-Period Finalized Attendance History
                </h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
                      <th className="py-3 px-4">Date</th>
                      <th className="py-3 px-4">Time</th>
                      <th className="py-3 px-4">Session ID</th>
                      <th className="py-3 px-4">Subject</th>
                      <th className="py-3 px-4">Topic</th>
                      <th className="py-3 px-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {data.history.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4 font-mono tabular-nums text-xs">{row.session_date}</td>
                        <td className="py-3 px-4 font-mono tabular-nums text-xs text-slate-600">
                          {row.start_time} - {row.end_time}
                        </td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-500">{row.session_code}</td>
                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-900">{row.subject_name}</span>
                          <span className="text-xs text-slate-500 ml-1.5">({row.subject_code})</span>
                        </td>
                        <td className="py-3 px-4 text-xs text-slate-600">{row.topic || '—'}</td>
                        <td className="py-3 px-4">
                          <AttendanceStatusText status={row.status} />
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
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div>
                <h3 className="font-semibold text-base text-slate-900">Parent Notification History</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Automated alerts dispatched to your registered parent/guardian after finalized absences.
                </p>
              </div>
              {data.notifications.length === 0 ? (
                <p className="text-sm text-slate-500 py-6 text-center">
                  No absence notifications have been sent for your record.
                </p>
              ) : (
                <div className="divide-y divide-slate-100">
                  {data.notifications.map((n) => (
                    <div key={n.id} className="py-4 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                        <span className="text-xs font-mono text-slate-500">{n.created_at}</span>
                      </div>
                      <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans bg-slate-50 p-3 rounded-lg border border-slate-200">
                        {n.message}
                      </pre>
                      <p className="text-xs text-slate-500">
                        Recipient: {n.parent_name} · Channels: {n.delivery_summary || 'Logged'}
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
