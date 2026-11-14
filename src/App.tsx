/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import type { AppRole } from './lib/api';
import { PortalGateway } from './pages/PortalGateway';
import { RoleLoginPage } from './pages/RoleLoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { StudentDashboard } from './pages/StudentDashboard';
import { TeacherDashboard } from './pages/TeacherDashboard';
import { ParentDashboard } from './pages/ParentDashboard';
import { AppointmentBookingPage } from './pages/AppointmentBookingPage';

function ProtectedRoleRoute({
  role,
  children,
}: {
  role: AppRole;
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F4F7FB] flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-xl px-6 py-4 text-sm text-slate-600">
          Verifying university session...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to={`/${role}/login`} replace />;
  }

  if (user.role !== role) {
    return <Navigate to={`/${user.role}/dashboard`} replace />;
  }

  return <>{children}</>;
}

function PublicOnlyLogin({ role }: { role: AppRole }) {
  const { user, loading } = useAuth();
  if (!loading && user && user.role === role) {
    return <Navigate to={`/${role}/dashboard`} replace />;
  }
  return <RoleLoginPage role={role} />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<PortalGateway />} />

          {/* Separate Role Login Pages */}
          <Route path="/admin/login" element={<PublicOnlyLogin role="admin" />} />
          <Route path="/student/login" element={<PublicOnlyLogin role="student" />} />
          <Route path="/teacher/login" element={<PublicOnlyLogin role="teacher" />} />
          <Route path="/parent/login" element={<PublicOnlyLogin role="parent" />} />
          <Route path="/parent/access/:token" element={<RoleLoginPage role="parent" />} />
          <Route path="/appointments" element={<AppointmentBookingPage />} />
          <Route path="/book-appointment" element={<AppointmentBookingPage />} />

          {/* Role-Protected Dashboards */}
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoleRoute role="admin">
                <AdminDashboard />
              </ProtectedRoleRoute>
            }
          />
          <Route
            path="/student/dashboard"
            element={
              <ProtectedRoleRoute role="student">
                <StudentDashboard />
              </ProtectedRoleRoute>
            }
          />
          <Route
            path="/teacher/dashboard"
            element={
              <ProtectedRoleRoute role="teacher">
                <TeacherDashboard />
              </ProtectedRoleRoute>
            }
          />
          <Route
            path="/parent/dashboard"
            element={
              <ProtectedRoleRoute role="parent">
                <ParentDashboard />
              </ProtectedRoleRoute>
            }
          />

          {/* Convenience Redirects */}
          <Route path="/admin" element={<Navigate to="/admin/login" replace />} />
          <Route path="/student" element={<Navigate to="/student/login" replace />} />
          <Route path="/teacher" element={<Navigate to="/teacher/login" replace />} />
          <Route path="/parent" element={<Navigate to="/parent/login" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
