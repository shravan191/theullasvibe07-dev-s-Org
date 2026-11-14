import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { apiFetch, getStoredToken, setStoredToken, type AppRole, type AuthUser } from '../lib/api';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (role: AppRole, identifier: string, password: string) => Promise<AuthUser>;
  loginWithParentToken: (accessToken: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const token = getStoredToken();
      if (!token) {
        // Still check HTTP-only cookie session
        const res = await apiFetch<{ user: AuthUser }>('/api/auth/me');
        setUser(res.user);
      } else {
        const res = await apiFetch<{ user: AuthUser }>('/api/auth/me');
        setUser(res.user);
      }
    } catch {
      setUser(null);
      setStoredToken(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = useCallback(async (role: AppRole, identifier: string, password: string) => {
    const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ role, identifier, password }),
    });
    setStoredToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const loginWithParentToken = useCallback(async (accessToken: string) => {
    const res = await apiFetch<{ token: string; user: AuthUser }>('/api/auth/parent-access', {
      method: 'POST',
      body: JSON.stringify({ accessToken }),
    });
    setStoredToken(res.token);
    setUser(res.user);
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // Ignore network errors on logout
    }
    setStoredToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithParentToken, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return ctx;
}
