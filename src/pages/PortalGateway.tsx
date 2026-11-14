import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Building2,
  GraduationCap,
  ShieldCheck,
  Users,
} from 'lucide-react';

const CAMPUS_HERO_SRC = '/src/assets/images/university_campus_hero_1794652647874.jpg';

const PORTALS = [
  {
    title: 'Administrator Portal',
    route: '/admin/login',
    credentialHint: 'Admin Email & Password',
    description:
      'Manage departments, courses, semesters, timetables, attendance policies, audits, parent alerts, and PDF/CSV reports.',
    icon: ShieldCheck,
  },
  {
    title: 'Faculty / Teacher Portal',
    route: '/teacher/login',
    credentialHint: 'Faculty ID & Password',
    description:
      'Launch scheduled class sessions, record period attendance, run AI camera verification, review uncertain matches, and finalize rosters.',
    icon: BookOpen,
  },
  {
    title: 'Student Portal',
    route: '/student/login',
    credentialHint: 'USN / Student ID & Password',
    description:
      'Track live overall and subject-wise percentages, shortage warnings, required recovery classes, timetables, and biometric consent.',
    icon: GraduationCap,
  },
  {
    title: 'Parent / Guardian Portal',
    route: '/parent/login',
    credentialHint: 'Parent Email or Notification Link',
    description:
      'Monitor your linked student’s attendance summary, period-by-period history, and absence notification alerts.',
    icon: Users,
  },
];

export function PortalGateway() {
  const [imgError, setImgError] = useState(false);

  return (
    <div className="min-h-screen bg-[#F4F7FB] text-slate-900 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-8">
          <Link
            to="/"
            className="font-display text-lg font-bold tracking-tight text-[#0B1F3A] whitespace-nowrap shrink-0"
          >
            University Attendance ERP
          </Link>

          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <Link to="/admin/login" className="hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0">
              Admin Login
            </Link>
            <Link to="/teacher/login" className="hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0">
              Teacher Login
            </Link>
            <Link to="/student/login" className="hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0">
              Student Login
            </Link>
            <Link to="/parent/login" className="hover:text-[#0B1F3A] transition-colors whitespace-nowrap shrink-0">
              Parent Access
            </Link>
            <Link to="/appointments" className="text-[#1D4ED8] hover:text-[#0B1F3A] font-semibold transition-colors whitespace-nowrap shrink-0">
              Book Appointment
            </Link>
          </nav>

          <div className="shrink-0 flex items-center gap-2.5">
            <Link
              to="/appointments"
              className="hidden sm:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold border border-slate-300 bg-white text-[#0B1F3A] hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Book Appointment</span>
            </Link>
            <Link
              to="/student/login"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold bg-[#0B1F3A] text-white hover:bg-[#16345E] transition-colors whitespace-nowrap shrink-0"
            >
              <span>Student Portal</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-[1440px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-10 lg:py-14 space-y-12">
        {/* Split Hero */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          <div className="lg:col-span-6 bg-white border border-slate-200 rounded-xl p-8 lg:p-10 flex flex-col justify-between">
            <div className="space-y-5">
              <div className="text-xs font-medium text-[#1D4ED8] flex items-center gap-2">
                <span>Academic Year 2026–2027</span>
                <span aria-hidden="true">·</span>
                <span>University Attendance ERP</span>
              </div>

              <h1
                className="font-display font-bold text-[#0B1F3A] tracking-tight leading-[1.15]"
                style={{ fontSize: 'clamp(2rem, 3.6vw, 3rem)', textWrap: 'balance' }}
              >
                Unified University Attendance &amp; Academic Compliance
              </h1>

              <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                Period-by-period attendance recording, real-time shortage calculation, automated parent absence alerts, and teacher-verified AI facial recognition across every department.
              </p>
            </div>

            <div className="pt-8 mt-8 border-t border-slate-200 grid grid-cols-3 gap-4">
              <div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0B1F3A]">75%</div>
                <div className="text-xs text-slate-500 mt-1">Default Eligibility Target</div>
              </div>
              <div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0B1F3A]">5</div>
                <div className="text-xs text-slate-500 mt-1">Automated Formulas</div>
              </div>
              <div>
                <div className="font-mono tabular-nums text-2xl font-bold text-[#0B1F3A]">4</div>
                <div className="text-xs text-slate-500 mt-1">Role-Scoped Portals</div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 bg-[#0B1F3A] border border-slate-200 rounded-xl overflow-hidden min-h-[280px] relative">
            {!imgError ? (
              <img
                src={CAMPUS_HERO_SRC}
                alt="University engineering complex campus"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover lg:h-full"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#0B1F3A] via-[#123361] to-[#1D4ED8] flex flex-col items-center justify-center p-8 text-white">
                <Building2 className="w-12 h-12 text-blue-200 mb-3" />
                <p className="font-display font-semibold text-lg">University Campus Network</p>
                <p className="text-xs text-blue-200 mt-1">Academic Attendance Governance</p>
              </div>
            )}
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#0B1F3A]/90 via-[#0B1F3A]/40 to-transparent p-6">
              <p className="text-sm font-medium text-white">
                Single source of truth across Admin, Faculty, Student, and Parent portals
              </p>
              <p className="text-xs text-blue-100/80 mt-0.5">
                Finalized period sessions · Deduplicated parent alerts · Auditable corrections
              </p>
            </div>
          </div>
        </section>

        {/* Role Portal Selection Grid */}
        <section className="space-y-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-xl font-semibold text-[#0B1F3A]">
              Select Your University Portal
            </h2>
            <span className="text-xs text-slate-500">
              Separate role-authenticated access routes
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {PORTALS.map((portal) => {
              const Icon = portal.icon;
              return (
                <Link
                  key={portal.route}
                  to={portal.route}
                  className="group bg-white border border-slate-200 hover:border-[#1D4ED8] rounded-xl p-6 flex flex-col justify-between transition-colors"
                >
                  <div>
                    <div className="w-10 h-10 rounded-lg bg-[#EFF6FF] text-[#1D4ED8] flex items-center justify-center mb-4">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="font-display font-semibold text-base text-slate-900 group-hover:text-[#1D4ED8] transition-colors">
                      {portal.title}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1">{portal.credentialHint}</p>
                    <p className="text-sm text-slate-600 mt-3 leading-relaxed">
                      {portal.description}
                    </p>
                  </div>

                  <div className="pt-5 mt-5 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-[#1D4ED8]">
                    <span>Sign In</span>
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </Link>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="bg-white border-t border-slate-200 py-5">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
          <span>University Attendance Management ERP</span>
          <div className="flex items-center gap-4">
            <Link to="/admin/login" className="hover:text-slate-900">Admin</Link>
            <Link to="/teacher/login" className="hover:text-slate-900">Teacher</Link>
            <Link to="/student/login" className="hover:text-slate-900">Student</Link>
            <Link to="/parent/login" className="hover:text-slate-900">Parent</Link>
            <Link to="/appointments" className="text-[#1D4ED8] font-medium hover:underline">Book Appointment</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
