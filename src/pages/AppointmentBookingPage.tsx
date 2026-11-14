import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Calendar,
  CheckCircle2,
  Clock,
  Mail,
  Phone,
  User,
} from 'lucide-react';
import { apiFetch } from '../lib/api';

interface AppointmentMeta {
  departments: Array<{
    id: number;
    code: string;
    name: string;
    hod_name: string | null;
  }>;
  advisors: Array<{
    faculty_id: string;
    full_name: string;
    designation: string;
    department_code: string;
  }>;
  supabaseReady: boolean;
}

interface BookingResponse {
  bookingCode: string;
  savedToSupabase: boolean;
  tableMissing: boolean;
  message: string;
  appointment: {
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
  };
}

const TIME_SLOTS = [
  '09:30 AM',
  '10:30 AM',
  '11:30 AM',
  '01:30 PM',
  '02:30 PM',
  '03:30 PM',
  '04:30 PM',
];

const PURPOSE_OPTIONS = [
  'Attendance Shortage Review',
  'Faculty Academic Consultation',
  'Parent-Teacher Meeting',
  'Medical / Excused Leave Verification',
  'Departmental Counseling',
  'Administrative Records Request',
];

export function AppointmentBookingPage() {
  const todayIso = new Date().toISOString().slice(0, 10);

  const [meta, setMeta] = useState<AppointmentMeta | null>(null);
  const [form, setForm] = useState({
    requesterRole: 'Student',
    fullName: '',
    email: '',
    phone: '',
    referenceId: '',
    departmentCode: 'CSE',
    appointmentWith: 'Academic Dean / Administration Office',
    preferredDate: todayIso,
    preferredTime: '10:30 AM',
    purpose: PURPOSE_OPTIONS[0],
    notes: '',
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<BookingResponse | null>(null);

  useEffect(() => {
    apiFetch<AppointmentMeta>('/api/appointments/meta')
      .then((res) => {
        setMeta(res);
        setForm((prev) => ({
          ...prev,
          departmentCode: res.departments[0]?.code || prev.departmentCode,
          appointmentWith:
            res.advisors[0]
              ? `${res.advisors[0].full_name} (${res.advisors[0].department_code})`
              : prev.appointmentWith,
        }));
      })
      .catch(() => {
        // Fallback options already populated
      });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch<BookingResponse>('/api/appointments', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      setConfirmation(res);
      setForm((prev) => ({
        ...prev,
        fullName: '',
        email: '',
        phone: '',
        referenceId: '',
        notes: '',
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit appointment request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-6">
          <Link
            to="/"
            className="font-display text-lg font-bold tracking-tight text-[#0B1F3A] whitespace-nowrap shrink-0"
          >
            University Attendance ERP
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <Link to="/admin/login" className="hover:text-[#0B1F3A] whitespace-nowrap">
              Admin Login
            </Link>
            <Link to="/teacher/login" className="hover:text-[#0B1F3A] whitespace-nowrap">
              Teacher Login
            </Link>
            <Link to="/student/login" className="hover:text-[#0B1F3A] whitespace-nowrap">
              Student Login
            </Link>
            <Link to="/parent/login" className="hover:text-[#0B1F3A] whitespace-nowrap">
              Parent Access
            </Link>
            <Link to="/appointments" className="text-[#1D4ED8] font-semibold whitespace-nowrap">
              Book Appointment
            </Link>
          </nav>

          <Link
            to="/"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Portals</span>
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-8">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold text-[#1D4ED8] uppercase tracking-wider">
            Campus Counseling &amp; Advisory Desk
          </p>
          <h1 className="font-display text-3xl font-bold text-[#0B1F3A] tracking-tight mt-1">
            Book an Academic or Administrative Appointment
          </h1>
          <p className="text-sm text-slate-600 mt-2 leading-relaxed">
            Schedule an in-person or online meeting with department faculty, academic advisors, or the university attendance office. Submissions are recorded immediately for administrative review.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Booking Form */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-7 bg-white border border-slate-200 rounded-xl p-6 sm:p-8 space-y-5"
          >
            {error && (
              <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {error}
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  I am a *
                </label>
                <select
                  value={form.requesterRole}
                  onChange={(e) => setForm({ ...form, requesterRole: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                >
                  <option value="Student">Student</option>
                  <option value="Parent / Guardian">Parent / Guardian</option>
                  <option value="Faculty">Faculty Member</option>
                  <option value="Visitor">Prospective Student / Visitor</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  USN / Faculty ID (Optional)
                </label>
                <input
                  type="text"
                  value={form.referenceId}
                  onChange={(e) => setForm({ ...form, referenceId: e.target.value })}
                  placeholder="e.g. 1MS24CS001"
                  className="w-full px-3 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Full Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={form.fullName}
                    onChange={(e) => setForm({ ...form, fullName: e.target.value })}
                    placeholder="Your full name"
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Email Address *
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="email"
                    required
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    placeholder="name@domain.edu"
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Phone Number *
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="tel"
                    required
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="+91 98450 00000"
                    className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Department *
                </label>
                <select
                  value={form.departmentCode}
                  onChange={(e) => setForm({ ...form, departmentCode: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                >
                  {(meta?.departments && meta.departments.length > 0
                    ? meta.departments
                    : [
                        { id: 1, code: 'CSE', name: 'Computer Science & Engineering', hod_name: null },
                        { id: 2, code: 'DSAI', name: 'Data Science & AI', hod_name: null },
                        { id: 3, code: 'ECE', name: 'Electronics & Communication', hod_name: null },
                      ]
                  ).map((d) => (
                    <option key={d.code} value={d.code}>
                      {d.code} · {d.name}
                    </option>
                  ))}
                  <option value="ADMIN">ADMIN · University Registrar &amp; Attendance Office</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Appointment With *
                </label>
                <select
                  value={form.appointmentWith}
                  onChange={(e) => setForm({ ...form, appointmentWith: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                >
                  {meta?.advisors?.map((adv) => {
                    const label = `${adv.full_name} (${adv.department_code})`;
                    return (
                      <option key={adv.faculty_id} value={label}>
                        {adv.full_name} — {adv.designation} ({adv.department_code})
                      </option>
                    );
                  })}
                  <option value="Academic Dean / Administration Office">
                    Academic Dean / Administration Office
                  </option>
                  <option value="Attendance Review Committee">
                    Attendance Review Committee
                  </option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Preferred Date *
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="date"
                    required
                    min={todayIso}
                    value={form.preferredDate}
                    onChange={(e) => setForm({ ...form, preferredDate: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 text-sm font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Preferred Time Slot *
                </label>
                <div className="relative">
                  <Clock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <select
                    value={form.preferredTime}
                    onChange={(e) => setForm({ ...form, preferredTime: e.target.value })}
                    className="w-full pl-9 pr-3 py-2.5 text-sm font-mono border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                  >
                    {TIME_SLOTS.map((slot) => (
                      <option key={slot} value={slot}>
                        {slot}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1.5">
                  Purpose *
                </label>
                <select
                  value={form.purpose}
                  onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                  className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                >
                  {PURPOSE_OPTIONS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                Additional Context / Supporting Details
              </label>
              <textarea
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="Share course codes, dates, or specific questions ahead of the meeting..."
                className="w-full px-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 px-4 bg-[#0B1F3A] hover:bg-[#16345E] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {submitting ? 'Submitting Appointment Request...' : 'Confirm & Book Appointment'}
            </button>
          </form>

          {/* Right Info & Confirmation Column */}
          <div className="lg:col-span-5 space-y-6">
            {confirmation && (
              <div className="bg-white border border-emerald-300 rounded-xl p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                  <div>
                    <h2 className="font-display font-semibold text-base text-slate-900">
                      Appointment Request Submitted
                    </h2>
                    <p className="text-xs text-slate-600 mt-1">{confirmation.message}</p>
                  </div>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-2 text-xs">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Reference Code</span>
                    <span className="font-mono font-semibold text-[#1D4ED8]">
                      {confirmation.bookingCode}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Visitor</span>
                    <span className="font-medium text-slate-900">
                      {confirmation.appointment.full_name}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Scheduled With</span>
                    <span className="font-medium text-slate-900 text-right">
                      {confirmation.appointment.appointment_with}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Date &amp; Slot</span>
                    <span className="font-mono tabular-nums text-slate-900">
                      {confirmation.appointment.preferred_date} · {confirmation.appointment.preferred_time}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Status</span>
                    <span className="font-semibold text-amber-700">
                      {confirmation.appointment.status}
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <h2 className="font-display font-semibold text-base text-slate-900">
                University Advisory Hours
              </h2>
              <div className="space-y-3 text-xs text-slate-600">
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <span>Monday – Friday</span>
                  <span className="font-mono tabular-nums font-medium text-slate-900">
                    09:30 AM – 05:00 PM
                  </span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-slate-100">
                  <span>Saturday (Counseling Desk)</span>
                  <span className="font-mono tabular-nums font-medium text-slate-900">
                    10:00 AM – 01:30 PM
                  </span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span>Attendance Appeals Desk</span>
                  <span className="font-mono font-medium text-slate-900">
                    Academic Block · Room A-104
                  </span>
                </div>
              </div>
              <p className="text-xs text-slate-500 leading-relaxed pt-2 border-t border-slate-100">
                Students requesting medical or authorized attendance exemptions should bring supporting documents or reference numbers to their scheduled slot.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
