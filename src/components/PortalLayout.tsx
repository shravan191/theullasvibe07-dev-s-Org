import React, { useState } from 'react';
import { GraduationCap, LogOut, Menu, X } from 'lucide-react';
import type { AuthUser } from '../lib/api';

export interface NavItem {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

interface PortalLayoutProps {
  user: AuthUser;
  portalLabel: string;
  navItems: NavItem[];
  activeTab: string;
  onSelectTab: (id: string) => void;
  onLogout: () => void;
  headerAction?: React.ReactNode;
  children: React.ReactNode;
}

export function PortalLayout({
  user,
  portalLabel,
  navItems,
  activeTab,
  onSelectTab,
  onLogout,
  headerAction,
  children,
}: PortalLayoutProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeNav = navItems.find((n) => n.id === activeTab);

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#0B1F3A] text-white">
      <div className="px-5 py-5 border-b border-white/10 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-[#1D4ED8] flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <span className="font-display font-bold text-base tracking-tight whitespace-nowrap truncate">
            University ERP
          </span>
        </div>
        <button
          type="button"
          onClick={() => setMobileOpen(false)}
          className="lg:hidden p-1.5 text-slate-300 hover:text-white rounded-md"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="px-5 py-3 border-b border-white/10 text-xs text-blue-200/80">
        {portalLabel}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = item.id === activeTab;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                onSelectTab(item.id);
                setMobileOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors text-left whitespace-nowrap ${
                isActive
                  ? 'bg-[#1D4ED8] text-white'
                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="truncate">{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-4 border-t border-white/10 space-y-3">
        <div className="text-xs">
          <p className="font-medium text-white truncate">{user.fullName}</p>
          <p className="text-blue-200/70 truncate font-mono mt-0.5">
            {user.usn || user.facultyId || user.email}
          </p>
        </div>
        <button
          type="button"
          onClick={onLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-200 bg-white/10 hover:bg-white/15 transition-colors whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[#F4F7FB]">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative w-64 max-w-[80vw] h-full z-10">
            {sidebarContent}
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean 3-Zone Top Header */}
        <header className="sticky top-0 z-30 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg"
              aria-label="Open navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 whitespace-nowrap hidden sm:inline">
                {portalLabel}
              </span>
              <span className="text-slate-300 hidden sm:inline">/</span>
              <h1 className="font-display font-semibold text-slate-900 truncate">
                {activeNav?.label || 'Dashboard'}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {headerAction}
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-700">{user.fullName}</span>
              <span aria-hidden="true">·</span>
              <span className="capitalize">{user.role}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
