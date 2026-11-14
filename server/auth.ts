import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db } from './db.ts';

export type AppRole = 'admin' | 'teacher' | 'student' | 'parent';

export interface AuthenticatedUser {
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

export interface AuthRequest extends Request {
  user?: AuthenticatedUser;
}

const AUTH_SECRET =
  process.env.AUTH_SECRET ||
  crypto
    .createHash('sha256')
    .update(`uniattend-ai-${process.cwd()}-local-secret`)
    .digest('hex');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, keyHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const keyBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== keyBuf.length) return false;
  return crypto.timingSafeEqual(derived, keyBuf);
}

interface TokenPayload {
  profileId: number;
  role: AppRole;
  exp: number;
}

export function signAuthToken(profileId: number, role: AppRole): string {
  const payload: TokenPayload = {
    profileId,
    role,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 7, // 7 days
  };
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyAuthToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [encoded, sig] = parts;
    const expectedSig = crypto.createHmac('sha256', AUTH_SECRET).update(encoded).digest('base64url');
    const sigBuf = Buffer.from(sig);
    const expectedBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as TokenPayload;
    if (!payload.profileId || !payload.role || !payload.exp || Date.now() > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  const result: Record<string, string> = {};
  if (!cookieHeader) return result;
  for (const part of cookieHeader.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    result[k] = decodeURIComponent(v);
  }
  return result;
}

export function buildUserContext(profileId: number, role: AppRole): AuthenticatedUser | null {
  const profile = db
    .prepare(
      `SELECT p.id, p.full_name, p.email, p.phone, p.status
       FROM profiles p
       JOIN user_roles ur ON ur.profile_id = p.id
       WHERE p.id = ? AND ur.role = ? AND p.status = 'active'`
    )
    .get(profileId, role) as
    | { id: number; full_name: string; email: string; phone: string | null; status: string }
    | undefined;

  if (!profile) return null;

  const ctx: AuthenticatedUser = {
    profileId: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    phone: profile.phone,
    role,
  };

  if (role === 'student') {
    const stu = db
      .prepare(`SELECT id, usn FROM students WHERE profile_id = ?`)
      .get(profile.id) as { id: number; usn: string } | undefined;
    if (!stu) return null;
    ctx.studentId = stu.id;
    ctx.usn = stu.usn;
  } else if (role === 'teacher') {
    const tch = db
      .prepare(`SELECT id, faculty_id FROM teachers WHERE profile_id = ?`)
      .get(profile.id) as { id: number; faculty_id: string } | undefined;
    if (!tch) return null;
    ctx.teacherId = tch.id;
    ctx.facultyId = tch.faculty_id;
  } else if (role === 'parent') {
    const par = db
      .prepare(`SELECT id FROM parents WHERE profile_id = ?`)
      .get(profile.id) as { id: number } | undefined;
    if (!par) return null;
    ctx.parentId = par.id;
  }

  return ctx;
}

export function extractTokenFromRequest(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = parseCookieHeader(req.headers.cookie);
  return cookies.uniattend_token || null;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const token = extractTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ error: 'Authentication required.' });
  }
  const decoded = verifyAuthToken(token);
  if (!decoded) {
    return res.status(401).json({ error: 'Invalid or expired session token.' });
  }
  const user = buildUserContext(decoded.profileId, decoded.role);
  if (!user) {
    return res.status(401).json({ error: 'User account or role verification failed.' });
  }
  req.user = user;
  next();
}

export function requireRole(...allowedRoles: AppRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Access denied for this role.' });
    }
    next();
  };
}

export function writeAuditLog(params: {
  actorProfileId?: number | null;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string | number;
  previousState?: unknown;
  newState?: unknown;
  reason?: string;
}) {
  db.prepare(
    `INSERT INTO audit_logs (actor_profile_id, actor_role, action, entity_type, entity_id, previous_state, new_state, reason)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    params.actorProfileId ?? null,
    params.actorRole,
    params.action,
    params.entityType,
    String(params.entityId),
    params.previousState !== undefined ? JSON.stringify(params.previousState) : null,
    params.newState !== undefined ? JSON.stringify(params.newState) : null,
    params.reason ?? null
  );
}
