import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, EyeOff, GraduationCap, KeyRound, Lock, Mail } from 'lucide-react';
import { apiFetch, type AppRole } from '../lib/api';
import { useAuth } from '../context/AuthContext';

const CAMPUS_HERO_SRC = '/src/assets/images/university_campus_hero_1794652647874.jpg';

const ROLE_CONFIG: Record<
  AppRole,
  {
    title: string;
    subtitle: string;
    identifierLabel: string;
    identifierPlaceholder: string;
    identifierType: string;
    demoIdentifier: string;
    demoPassword: string;
    redirectPath: string;
  }
> = {
  admin: {
    title: 'Administrator Login',
    subtitle: 'University governance, academic setup, and attendance oversight.',
    identifierLabel: 'Admin Email',
    identifierPlaceholder: 'admin@uniattend.edu',
    identifierType: 'email',
    demoIdentifier: 'admin@uniattend.edu',
    demoPassword: 'Admin@123',
    redirectPath: '/admin/dashboard',
  },
  student: {
    title: 'Student Login',
    subtitle: 'Access your attendance summary, shortage status, and class timetable.',
    identifierLabel: 'USN / Student ID',
    identifierPlaceholder: '1MS24CS001',
    identifierType: 'text',
    demoIdentifier: '1MS24CS001',
    demoPassword: 'Student@123',
    redirectPath: '/student/dashboard',
  },
  teacher: {
    title: 'Teacher Login',
    subtitle: 'Manage assigned classes, run attendance sessions, and finalize rosters.',
    identifierLabel: 'Faculty ID',
    identifierPlaceholder: 'FAC-101',
    identifierType: 'text',
    demoIdentifier: 'FAC-101',
    demoPassword: 'Teacher@123',
    redirectPath: '/teacher/dashboard',
  },
  parent: {
    title: 'Parent Access Portal',
    subtitle: 'View your linked student’s attendance history and absence alerts.',
    identifierLabel: 'Parent Email',
    identifierPlaceholder: 'parent.mehta@uniattend.edu',
    identifierType: 'email',
    demoIdentifier: 'parent.mehta@uniattend.edu',
    demoPassword: 'Parent@123',
    redirectPath: '/parent/dashboard',
  },
};

export function RoleLoginPage({ role }: { role: AppRole }) {
  const cfg = ROLE_CONFIG[role];
  const { login, loginWithParentToken } = useAuth();
  const navigate = useNavigate();
  const params = useParams<{ token?: string }>();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  // Parent Access Token field
  const [parentTokenInput, setParentTokenInput] = useState(params.token || '');

  // Forgot Password modal state
  const [forgotOpen, setForgotOpen] = useState(false);
  const [forgotIdentifier, setForgotIdentifier] = useState('');
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [forgotMessage, setForgotMessage] = useState<string | null>(null);
  const [forgotError, setForgotError] = useState<string | null>(null);

  useEffect(() => {
    if (role === 'parent' && params.token) {
      setSubmitting(true);
      loginWithParentToken(params.token)
        .then(() => navigate('/parent/dashboard', { replace: true }))
        .catch((err) => {
          setError(err instanceof Error ? err.message : 'Invalid parent access link.');
          setSubmitting(false);
        });
    }
  }, [role, params.token, loginWithParentToken, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(role, identifier, password);
      navigate(cfg.redirectPath, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleParentTokenLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!parentTokenInput.trim()) return;
    setError(null);
    setSubmitting(true);
    try {
      await loginWithParentToken(parentTokenInput.trim());
      navigate('/parent/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Invalid parent access token.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    setForgotMessage(null);
    try {
      const res = await apiFetch<{ message: string; resetCode: string }>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ role, identifier: forgotIdentifier }),
      });
      setForgotMessage(res.message);
      setIssuedCode(res.resetCode);
      setResetCode(res.resetCode);
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'Unable to request reset.');
    }
  };

  const handleCompleteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setForgotError(null);
    try {
      const res = await apiFetch<{ message: string }>('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ resetCode, newPassword }),
      });
      setForgotMessage(res.message);
      setIssuedCode(null);
      setTimeout(() => {
        setForgotOpen(false);
        setForgotMessage(null);
        setNewPassword('');
      }, 1500);
    } catch (err) {
      setForgotError(err instanceof Error ? err.message : 'Unable to reset password.');
    }
  };

  const fillDemoCredentials = () => {
    setIdentifier(cfg.demoIdentifier);
    setPassword(cfg.demoPassword);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-[#F4F7FB] flex flex-col lg:flex-row">
      {/* Left Brand / Campus Panel */}
      <div className="lg:w-1/2 bg-[#0B1F3A] text-white p-8 lg:p-12 flex flex-col justify-between relative overflow-hidden">
        <div className="relative z-10 flex items-center justify-between gap-4">
          <Link to="/" className="inline-flex items-center gap-2.5 text-white hover:opacity-90">
            <div className="w-8 h-8 rounded-lg bg-[#1D4ED8] flex items-center justify-center">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <span className="font-display font-bold text-lg tracking-tight">University ERP</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-200 hover:text-white whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>All Portals</span>
          </Link>
        </div>

        <div className="relative z-10 my-10 space-y-6">
          <div className="rounded-xl overflow-hidden border border-white/15 bg-[#122B4D] aspect-[16/9]">
            {!imgError ? (
              <img
                src={CAMPUS_HERO_SRC}
                alt="University campus"
                referrerPolicy="no-referrer"
                onError={() => setImgError(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-[#122B4D] to-[#1D4ED8]" />
            )}
          </div>
          <div>
            <h2 className="font-display text-2xl font-bold text-white" style={{ textWrap: 'balance' }}>
              {cfg.title}
            </h2>
            <p className="text-sm text-blue-100/80 mt-2 max-w-md leading-relaxed">
              {cfg.subtitle}
            </p>
          </div>
        </div>

        <div className="relative z-10 flex flex-wrap items-center gap-4 text-xs text-blue-200/75 border-t border-white/10 pt-5">
          <span>Role-Scoped Portals:</span>
          <Link to="/admin/login" className={role === 'admin' ? 'text-white font-semibold underline' : 'hover:text-white'}>
            Admin
          </Link>
          <Link to="/teacher/login" className={role === 'teacher' ? 'text-white font-semibold underline' : 'hover:text-white'}>
            Teacher
          </Link>
          <Link to="/student/login" className={role === 'student' ? 'text-white font-semibold underline' : 'hover:text-white'}>
            Student
          </Link>
          <Link to="/parent/login" className={role === 'parent' ? 'text-white font-semibold underline' : 'hover:text-white'}>
            Parent
          </Link>
        </div>
      </div>

      {/* Right Authentication Form */}
      <div className="lg:w-1/2 flex items-center justify-center p-6 sm:p-10 lg:p-16">
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 space-y-6">
          <div>
            <p className="text-xs font-medium text-[#1D4ED8] uppercase tracking-wider">
              {role} Authentication
            </p>
            <h1 className="font-display text-2xl font-bold text-slate-900 mt-1">
              Sign in to {cfg.title.replace(' Login', '')}
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Enter your verified university credentials to continue.
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1.5">
                {cfg.identifierLabel}
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={cfg.identifierType}
                  required
                  value={identifier}
                  onChange={(e) => setIdentifier(e.target.value)}
                  placeholder={cfg.identifierPlaceholder}
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-[#1D4ED8]"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-slate-700">Password</label>
                <button
                  type="button"
                  onClick={() => {
                    setForgotIdentifier(identifier);
                    setForgotOpen(true);
                  }}
                  className="text-xs font-medium text-[#1D4ED8] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="w-full pl-9 pr-10 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] focus:border-[#1D4ED8]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-2.5 px-4 bg-[#0B1F3A] hover:bg-[#16345E] disabled:opacity-60 text-white text-sm font-semibold rounded-lg transition-colors"
            >
              {submitting ? 'Verifying Credentials...' : `Sign In as ${role.charAt(0).toUpperCase() + role.slice(1)}`}
            </button>
          </form>

          {role === 'parent' && (
            <div className="pt-5 border-t border-slate-200 space-y-3">
              <p className="text-xs font-semibold text-slate-700">
                Or open via Parent Notification Link Token
              </p>
              <form onSubmit={handleParentTokenLogin} className="flex gap-2">
                <input
                  type="text"
                  value={parentTokenInput}
                  onChange={(e) => setParentTokenInput(e.target.value)}
                  placeholder="parent-demo-token-cs001"
                  className="flex-1 px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                />
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-3 py-2 text-xs font-semibold bg-[#EFF6FF] text-[#1D4ED8] hover:bg-blue-100 rounded-lg whitespace-nowrap"
                >
                  Verify Link
                </button>
              </form>
            </div>
          )}

          {/* Seeded Account Helper for Evaluation */}
          <div className="pt-5 border-t border-slate-200 flex items-center justify-between gap-3 text-xs">
            <div className="text-slate-500 font-mono">
              {cfg.demoIdentifier} · {cfg.demoPassword}
            </div>
            <button
              type="button"
              onClick={fillDemoCredentials}
              className="text-[#1D4ED8] font-medium hover:underline whitespace-nowrap shrink-0"
            >
              Fill Credentials
            </button>
          </div>
        </div>
      </div>

      {/* Forgot Password Modal */}
      {forgotOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-xl max-w-md w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-[#1D4ED8]" />
                <h3 className="font-display font-semibold text-slate-900">Reset {role} Password</h3>
              </div>
              <button
                type="button"
                onClick={() => setForgotOpen(false)}
                className="text-xs text-slate-500 hover:text-slate-800"
              >
                Close
              </button>
            </div>

            {forgotError && (
              <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {forgotError}
              </div>
            )}
            {forgotMessage && (
              <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 space-y-1">
                <p>{forgotMessage}</p>
                {issuedCode && (
                  <p className="font-mono font-semibold">Reset Verification Code: {issuedCode}</p>
                )}
              </div>
            )}

            {!issuedCode ? (
              <form onSubmit={handleRequestReset} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">
                    {cfg.identifierLabel}
                  </label>
                  <input
                    type="text"
                    required
                    value={forgotIdentifier}
                    onChange={(e) => setForgotIdentifier(e.target.value)}
                    placeholder={cfg.identifierPlaceholder}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 px-4 bg-[#1D4ED8] text-white text-sm font-medium rounded-lg hover:bg-blue-700"
                >
                  Request Reset Code
                </button>
              </form>
            ) : (
              <form onSubmit={handleCompleteReset} className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Reset Code</label>
                  <input
                    type="text"
                    required
                    value={resetCode}
                    onChange={(e) => setResetCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">New Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Minimum 6 characters"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <button
                  type="submit"
                  className="w-full py-2 px-4 bg-[#0B1F3A] text-white text-sm font-medium rounded-lg hover:bg-[#16345E]"
                >
                  Update Password
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
