export type AppRole = 'admin' | 'teacher' | 'student' | 'parent';

export interface AuthUser {
  profileId: number;
  email: string;
  fullName: string;
  phone: string | null;
  role: AppRole;
  studentId?: number;
  usn?: string;
  teacherId?: number;
  facultyId?: string;
  parentId?: number;
}

const TOKEN_KEY = 'uniattend_session_token';

export function getStoredToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string | null) {
  try {
    if (token) {
      sessionStorage.setItem(TOKEN_KEY, token);
    } else {
      sessionStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export async function apiFetch<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getStoredToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
  });

  const text = await res.text();
  let data: Record<string, unknown> = {};
  try {
    data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    data = { error: text || `HTTP ${res.status}` };
  }

  if (!res.ok) {
    throw new Error((data.error as string) || `Request failed (${res.status})`);
  }

  return data as T;
}
