import crypto from 'node:crypto';
import express from 'express';
import { db, getSupabaseMigrationSql } from './db.ts';
import {
  buildUserContext,
  hashPassword,
  requireAuth,
  requireRole,
  signAuthToken,
  verifyPassword,
  writeAuditLog,
  type AppRole,
  type AuthRequest,
} from './auth.ts';
import {
  getActivePolicy,
  getAllStudentsAttendanceSummaries,
  getStudentAttendanceReport,
} from './calculations.ts';
import { processFinalizedSessionNotifications, retryNotificationLog } from './notifications.ts';
import { verifyClassroomFacesWithGemini } from './faceAi.ts';
import {
  checkAppointmentsTableReady,
  checkSupabaseConnection,
  fetchAppointmentsFromSupabase,
  fetchSupabaseManagementReports,
  getSupabaseAppointmentsSql,
  getSupabaseManagementReportsSql,
  saveAppointmentToSupabase,
  syncAllAppointmentsToSupabase,
  syncAllReportsToSupabase,
  updateAppointmentStatusInSupabase,
} from './supabaseSync.ts';

export const apiRouter = express.Router();

function getTodayDayName(): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const d = days[new Date().getDay()];
  return d === 'Sunday' ? 'Monday' : d;
}

function getTodayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// ============================================================
// 1. AUTHENTICATION ROUTES
// ============================================================
apiRouter.post('/auth/login', (req, res) => {
  const { role, identifier, password } = req.body as {
    role?: AppRole;
    identifier?: string;
    password?: string;
  };

  if (!role || !identifier || !password) {
    return res.status(400).json({ error: 'Role, identifier, and password are required.' });
  }

  const trimmedId = identifier.trim();
  let profileRow:
    | { id: number; password_hash: string; status: string }
    | undefined;

  if (role === 'admin' || role === 'parent') {
    profileRow = db
      .prepare(
        `SELECT p.id, p.password_hash, p.status
         FROM profiles p
         JOIN user_roles ur ON ur.profile_id = p.id
         WHERE LOWER(p.email) = LOWER(?) AND ur.role = ?`
      )
      .get(trimmedId, role) as { id: number; password_hash: string; status: string } | undefined;
  } else if (role === 'student') {
    profileRow = db
      .prepare(
        `SELECT p.id, p.password_hash, p.status
         FROM students s
         JOIN profiles p ON p.id = s.profile_id
         JOIN user_roles ur ON ur.profile_id = p.id
         WHERE (UPPER(s.usn) = UPPER(?) OR LOWER(p.email) = LOWER(?)) AND ur.role = 'student'`
      )
      .get(trimmedId, trimmedId) as { id: number; password_hash: string; status: string } | undefined;
  } else if (role === 'teacher') {
    profileRow = db
      .prepare(
        `SELECT p.id, p.password_hash, p.status
         FROM teachers t
         JOIN profiles p ON p.id = t.profile_id
         JOIN user_roles ur ON ur.profile_id = p.id
         WHERE (UPPER(t.faculty_id) = UPPER(?) OR LOWER(p.email) = LOWER(?)) AND ur.role = 'teacher'`
      )
      .get(trimmedId, trimmedId) as { id: number; password_hash: string; status: string } | undefined;
  }

  if (!profileRow) {
    return res.status(401).json({ error: 'Invalid credentials or role mismatch.' });
  }
  if (profileRow.status !== 'active') {
    return res.status(403).json({ error: 'Account is currently inactive. Contact university administrator.' });
  }
  if (!verifyPassword(password, profileRow.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials.' });
  }

  const user = buildUserContext(profileRow.id, role);
  if (!user) {
    return res.status(403).json({ error: 'Role profile record not found.' });
  }

  const token = signAuthToken(profileRow.id, role);
  res.cookie('uniattend_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: '/',
  });

  writeAuditLog({
    actorProfileId: profileRow.id,
    actorRole: role,
    action: 'USER_LOGIN',
    entityType: 'profiles',
    entityId: profileRow.id,
    reason: `${role} authenticated`,
  });

  return res.json({ token, user });
});

apiRouter.post('/auth/parent-access', (req, res) => {
  const { accessToken } = req.body as { accessToken?: string };
  if (!accessToken) {
    return res.status(400).json({ error: 'Parent access token is required.' });
  }

  const row = db
    .prepare(
      `SELECT p.id AS profileId
       FROM parents par
       JOIN profiles p ON p.id = par.profile_id
       JOIN user_roles ur ON ur.profile_id = p.id
       WHERE par.access_token = ? AND ur.role = 'parent' AND p.status = 'active'`
    )
    .get(accessToken.trim()) as { profileId: number } | undefined;

  if (!row) {
    return res.status(401).json({ error: 'Invalid or expired parent notification access link.' });
  }

  const user = buildUserContext(row.profileId, 'parent');
  if (!user) {
    return res.status(401).json({ error: 'Unable to load parent context.' });
  }

  const token = signAuthToken(row.profileId, 'parent');
  res.cookie('uniattend_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 1000 * 60 * 60 * 24 * 7,
    path: '/',
  });
  return res.json({ token, user });
});

apiRouter.post('/auth/forgot-password', (req, res) => {
  const { role, identifier } = req.body as { role?: AppRole; identifier?: string };
  if (!role || !identifier) {
    return res.status(400).json({ error: 'Role and identifier are required.' });
  }

  const trimmed = identifier.trim();
  let profileId: number | undefined;
  let email: string | undefined;

  if (role === 'student') {
    const r = db
      .prepare(
        `SELECT p.id, p.email FROM students s JOIN profiles p ON p.id = s.profile_id
         WHERE UPPER(s.usn) = UPPER(?) OR LOWER(p.email) = LOWER(?)`
      )
      .get(trimmed, trimmed) as { id: number; email: string } | undefined;
    profileId = r?.id;
    email = r?.email;
  } else if (role === 'teacher') {
    const r = db
      .prepare(
        `SELECT p.id, p.email FROM teachers t JOIN profiles p ON p.id = t.profile_id
         WHERE UPPER(t.faculty_id) = UPPER(?) OR LOWER(p.email) = LOWER(?)`
      )
      .get(trimmed, trimmed) as { id: number; email: string } | undefined;
    profileId = r?.id;
    email = r?.email;
  } else {
    const r = db
      .prepare(
        `SELECT p.id, p.email FROM profiles p JOIN user_roles ur ON ur.profile_id = p.id
         WHERE LOWER(p.email) = LOWER(?) AND ur.role = ?`
      )
      .get(trimmed, role) as { id: number; email: string } | undefined;
    profileId = r?.id;
    email = r?.email;
  }

  if (!profileId || !email) {
    return res.status(404).json({ error: 'No matching active account found for the given identifier.' });
  }

  const resetCode = crypto.randomBytes(3).toString('hex').toUpperCase();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 30).toISOString();

  db.prepare(`UPDATE profiles SET reset_token = ?, reset_expires_at = ? WHERE id = ?`).run(
    resetCode,
    expiresAt,
    profileId
  );

  writeAuditLog({
    actorProfileId: profileId,
    actorRole: role,
    action: 'PASSWORD_RESET_REQUESTED',
    entityType: 'profiles',
    entityId: profileId,
  });

  return res.json({
    message: `Password reset verification code issued for ${email}.`,
    resetCode,
  });
});

apiRouter.post('/auth/reset-password', (req, res) => {
  const { resetCode, newPassword } = req.body as { resetCode?: string; newPassword?: string };
  if (!resetCode || !newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'Valid reset code and password (min 6 chars) are required.' });
  }

  const row = db
    .prepare(`SELECT id, reset_expires_at FROM profiles WHERE UPPER(reset_token) = UPPER(?)`)
    .get(resetCode.trim()) as { id: number; reset_expires_at: string | null } | undefined;

  if (!row || !row.reset_expires_at || new Date(row.reset_expires_at).getTime() < Date.now()) {
    return res.status(400).json({ error: 'Invalid or expired reset code.' });
  }

  const newHash = hashPassword(newPassword);
  db.prepare(
    `UPDATE profiles SET password_hash = ?, reset_token = NULL, reset_expires_at = NULL, updated_at = datetime('now') WHERE id = ?`
  ).run(newHash, row.id);

  writeAuditLog({
    actorProfileId: row.id,
    actorRole: 'user',
    action: 'PASSWORD_RESET_COMPLETED',
    entityType: 'profiles',
    entityId: row.id,
  });

  return res.json({ message: 'Password updated successfully. You may now sign in.' });
});

apiRouter.post('/auth/logout', (_req, res) => {
  res.clearCookie('uniattend_token', { path: '/' });
  res.json({ ok: true });
});

apiRouter.get('/auth/me', requireAuth, (req: AuthRequest, res) => {
  res.json({ user: req.user });
});

// ============================================================
// 2. ADMIN ROUTES
// ============================================================
apiRouter.get('/admin/dashboard', requireAuth, requireRole('admin'), (req, res) => {
  const departmentId = req.query.departmentId ? Number(req.query.departmentId) : undefined;
  const semesterId = req.query.semesterId ? Number(req.query.semesterId) : undefined;
  const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;
  const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;
  const dateFrom = typeof req.query.dateFrom === 'string' && req.query.dateFrom ? req.query.dateFrom : undefined;
  const dateTo = typeof req.query.dateTo === 'string' && req.query.dateTo ? req.query.dateTo : undefined;
  const usn = typeof req.query.usn === 'string' && req.query.usn ? req.query.usn : undefined;

  const policy = getActivePolicy();
  const studentSummaries = getAllStudentsAttendanceSummaries({
    departmentId,
    semesterId,
    sectionId,
    subjectId,
    dateFrom,
    dateTo,
    usn,
  });

  const totalStudents = studentSummaries.length;
  const totalTeachers = (db.prepare(`SELECT COUNT(*) AS cnt FROM teachers`).get() as { cnt: number }).cnt;
  const totalDepartments = (db.prepare(`SELECT COUNT(*) AS cnt FROM departments`).get() as { cnt: number }).cnt;
  const totalSubjects = (db.prepare(`SELECT COUNT(*) AS cnt FROM subjects`).get() as { cnt: number }).cnt;

  let sumPresent = 0;
  let sumAbsent = 0;
  let sumConducted = 0;
  let below75Count = 0;
  let below65Count = 0;

  for (const stu of studentSummaries) {
    sumPresent += stu.present;
    sumAbsent += stu.absent;
    sumConducted += stu.conducted;
    if (stu.conducted > 0 && stu.percentage < policy.minEligiblePercent) {
      below75Count += 1;
    }
    if (stu.conducted > 0 && stu.percentage < policy.criticalShortagePercent) {
      below65Count += 1;
    }
  }

  const overallUniversityPercentage =
    sumConducted > 0 ? Math.round(((sumPresent / sumConducted) * 100 + Number.EPSILON) * 100) / 100 : 0;

  // Present/Absent students in most recent finalized date (or filtered date)
  const latestDateRow = db
    .prepare(
      `SELECT MAX(session_date) AS latestDate FROM class_sessions WHERE status = 'finalized'`
    )
    .get() as { latestDate: string | null };

  const targetDate = dateTo || dateFrom || latestDateRow?.latestDate || getTodayIso();
  const dayCounts = db
    .prepare(
      `SELECT
         COUNT(DISTINCT CASE WHEN a.status IN ('Present', 'Late', 'Excused') THEN a.student_id END) AS presentStudents,
         COUNT(DISTINCT CASE WHEN a.status = 'Absent' THEN a.student_id END) AS absentStudents
       FROM attendance a
       JOIN class_sessions cs ON cs.id = a.session_id
       WHERE cs.status = 'finalized' AND cs.session_date = ?`
    )
    .get(targetDate) as { presentStudents: number; absentStudents: number };

  // Department-wise breakdown
  const deptMap = new Map<string, { code: string; name: string; present: number; conducted: number; students: number }>();
  for (const s of studentSummaries) {
    const existing = deptMap.get(s.departmentCode) || {
      code: s.departmentCode,
      name: s.departmentName,
      present: 0,
      conducted: 0,
      students: 0,
    };
    existing.present += s.present;
    existing.conducted += s.conducted;
    existing.students += 1;
    deptMap.set(s.departmentCode, existing);
  }
  const departmentBreakdown = Array.from(deptMap.values()).map((d) => ({
    ...d,
    percentage: d.conducted > 0 ? Math.round(((d.present / d.conducted) * 100 + Number.EPSILON) * 100) / 100 : 0,
  }));

  const recentSessions = db
    .prepare(
      `SELECT
         cs.id, cs.session_code, cs.session_date, cs.start_time, cs.end_time, cs.status, cs.topic,
         sub.code AS subject_code, sub.name AS subject_name,
         sec.name AS section_name, tp.full_name AS teacher_name,
         SUM(CASE WHEN a.status IN ('Present','Late','Excused') THEN 1 ELSE 0 END) AS present_cnt,
         SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_cnt
       FROM class_sessions cs
       JOIN subjects sub ON sub.id = cs.subject_id
       JOIN sections sec ON sec.id = cs.section_id
       JOIN teachers t ON t.id = cs.teacher_id
       JOIN profiles tp ON tp.id = t.profile_id
       LEFT JOIN attendance a ON a.session_id = cs.id
       GROUP BY cs.id
       ORDER BY cs.session_date DESC, cs.start_time DESC
       LIMIT 12`
    )
    .all();

  res.json({
    kpis: {
      totalStudents,
      totalTeachers,
      totalDepartments,
      totalSubjects,
      presentStudents: Number(dayCounts?.presentStudents ?? 0),
      absentStudents: Number(dayCounts?.absentStudents ?? 0),
      latestSessionDate: targetDate,
      below75Count,
      below65Count,
      overallUniversityPercentage,
      totalPresentRecords: sumPresent,
      totalAbsentRecords: sumAbsent,
      totalConductedRecords: sumConducted,
    },
    policy,
    departmentBreakdown,
    shortageStudents: studentSummaries.filter((s) => s.conducted > 0 && s.percentage < policy.minEligiblePercent),
    students: studentSummaries,
    recentSessions,
  });
});

apiRouter.get('/admin/academics', requireAuth, requireRole('admin', 'teacher'), (_req, res) => {
  const departments = db.prepare(`SELECT * FROM departments ORDER BY code ASC`).all();
  const courses = db
    .prepare(
      `SELECT c.*, d.code AS department_code, d.name AS department_name
       FROM courses c JOIN departments d ON d.id = c.department_id ORDER BY c.code ASC`
    )
    .all();
  const academicYears = db.prepare(`SELECT * FROM academic_years ORDER BY label DESC`).all();
  const semesters = db
    .prepare(
      `SELECT sem.*, ay.label AS academic_year_label, c.code AS course_code, c.name AS course_name
       FROM semesters sem
       JOIN academic_years ay ON ay.id = sem.academic_year_id
       JOIN courses c ON c.id = sem.course_id
       ORDER BY sem.number ASC`
    )
    .all();
  const sections = db
    .prepare(
      `SELECT sec.*, d.code AS department_code, sem.name AS semester_name
       FROM sections sec
       JOIN departments d ON d.id = sec.department_id
       JOIN semesters sem ON sem.id = sec.semester_id
       ORDER BY sec.name ASC`
    )
    .all();
  const subjects = db
    .prepare(
      `SELECT sub.*, d.code AS department_code, sem.name AS semester_name, sec.name AS section_name,
              t.faculty_id, tp.full_name AS teacher_name
       FROM subjects sub
       JOIN departments d ON d.id = sub.department_id
       JOIN semesters sem ON sem.id = sub.semester_id
       JOIN sections sec ON sec.id = sub.section_id
       JOIN teachers t ON t.id = sub.teacher_id
       JOIN profiles tp ON tp.id = t.profile_id
       ORDER BY sub.code ASC, sec.name ASC`
    )
    .all();
  const teachers = db
    .prepare(
      `SELECT t.id, t.faculty_id, t.designation, t.specialization, t.department_id,
              d.code AS department_code, d.name AS department_name,
              p.full_name, p.email, p.phone, p.status
       FROM teachers t
       JOIN profiles p ON p.id = t.profile_id
       JOIN departments d ON d.id = t.department_id
       ORDER BY t.faculty_id ASC`
    )
    .all();

  res.json({ departments, courses, academicYears, semesters, sections, subjects, teachers });
});

// Admin Students CRUD
apiRouter.get('/admin/students', requireAuth, requireRole('admin'), (req, res) => {
  const summaries = getAllStudentsAttendanceSummaries({
    departmentId: req.query.departmentId ? Number(req.query.departmentId) : undefined,
    semesterId: req.query.semesterId ? Number(req.query.semesterId) : undefined,
    sectionId: req.query.sectionId ? Number(req.query.sectionId) : undefined,
    usn: typeof req.query.usn === 'string' ? req.query.usn : undefined,
  });
  res.json({ students: summaries });
});

apiRouter.post('/admin/students', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
  const {
    fullName,
    email,
    phone,
    usn,
    departmentId,
    courseId,
    semesterId,
    sectionId,
    admissionYear,
    password,
    faceConsent,
    parentName,
    parentEmail,
    parentPhone,
  } = req.body;

  if (!fullName || !email || !usn || !departmentId || !courseId || !semesterId || !sectionId) {
    return res.status(400).json({ error: 'All student identity and academic placement fields are required.' });
  }

  try {
    const created = db.transaction(() => {
      const pId = Number(
        db
          .prepare(
            `INSERT INTO profiles (full_name, email, phone, password_hash, status) VALUES (?, ?, ?, ?, 'active')`
          )
          .run(fullName.trim(), email.trim(), phone || null, hashPassword(password || 'Student@123'))
          .lastInsertRowid
      );
      db.prepare(`INSERT INTO user_roles (profile_id, role, granted_by) VALUES (?, 'student', ?)`).run(
        pId,
        req.user?.profileId ?? null
      );

      const stuId = Number(
        db
          .prepare(
            `INSERT INTO students (profile_id, usn, department_id, course_id, semester_id, section_id, admission_year, face_consent)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .run(
            pId,
            usn.trim().toUpperCase(),
            Number(departmentId),
            Number(courseId),
            Number(semesterId),
            Number(sectionId),
            Number(admissionYear || new Date().getFullYear()),
            faceConsent ? 1 : 0
          ).lastInsertRowid
      );

      if (parentName && parentEmail) {
        const parProfId = Number(
          db
            .prepare(
              `INSERT INTO profiles (full_name, email, phone, password_hash, status) VALUES (?, ?, ?, ?, 'active')`
            )
            .run(parentName.trim(), parentEmail.trim(), parentPhone || null, hashPassword('Parent@123'))
            .lastInsertRowid
        );
        db.prepare(`INSERT INTO user_roles (profile_id, role, granted_by) VALUES (?, 'parent', ?)`).run(
          parProfId,
          req.user?.profileId ?? null
        );
        const parId = Number(
          db
            .prepare(
              `INSERT INTO parents (profile_id, preferred_channel, whatsapp_consent, access_token)
               VALUES (?, 'email', 1, ?)`
            )
            .run(parProfId, crypto.randomUUID()).lastInsertRowid
        );
        db.prepare(
          `INSERT INTO student_parents (student_id, parent_id, relationship, is_primary) VALUES (?, ?, 'Guardian', 1)`
        ).run(stuId, parId);
      }

      writeAuditLog({
        actorProfileId: req.user?.profileId,
        actorRole: 'admin',
        action: 'STUDENT_CREATED',
        entityType: 'students',
        entityId: stuId,
        newState: { usn: usn.trim().toUpperCase(), fullName, email },
      });

      return stuId;
    })();

    res.status(201).json({ id: created, message: 'Student enrolled successfully.' });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to create student.' });
  }
});

apiRouter.patch('/admin/students/:id', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
  const studentId = Number(req.params.id);
  const { fullName, email, phone, departmentId, courseId, semesterId, sectionId, faceConsent } = req.body;

  const existing = db
    .prepare(
      `SELECT s.*, p.full_name, p.email, p.phone FROM students s JOIN profiles p ON p.id = s.profile_id WHERE s.id = ?`
    )
    .get(studentId) as { profile_id: number; usn: string; full_name: string } | undefined;

  if (!existing) {
    return res.status(404).json({ error: 'Student not found.' });
  }

  db.transaction(() => {
    db.prepare(
      `UPDATE profiles SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), phone = COALESCE(?, phone), updated_at = datetime('now') WHERE id = ?`
    ).run(fullName || null, email || null, phone ?? null, existing.profile_id);

    db.prepare(
      `UPDATE students
       SET department_id = COALESCE(?, department_id),
           course_id = COALESCE(?, course_id),
           semester_id = COALESCE(?, semester_id),
           section_id = COALESCE(?, section_id),
           face_consent = COALESCE(?, face_consent),
           updated_at = datetime('now')
       WHERE id = ?`
    ).run(
      departmentId ? Number(departmentId) : null,
      courseId ? Number(courseId) : null,
      semesterId ? Number(semesterId) : null,
      sectionId ? Number(sectionId) : null,
      faceConsent !== undefined ? (faceConsent ? 1 : 0) : null,
      studentId
    );

    writeAuditLog({
      actorProfileId: req.user?.profileId,
      actorRole: 'admin',
      action: 'STUDENT_UPDATED',
      entityType: 'students',
      entityId: studentId,
      newState: req.body,
    });
  })();

  res.json({ message: 'Student updated.' });
});

apiRouter.delete('/admin/students/:id', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
  const studentId = Number(req.params.id);
  const stu = db.prepare(`SELECT profile_id, usn FROM students WHERE id = ?`).get(studentId) as
    | { profile_id: number; usn: string }
    | undefined;
  if (!stu) return res.status(404).json({ error: 'Student not found.' });

  db.prepare(`DELETE FROM profiles WHERE id = ?`).run(stu.profile_id);
  writeAuditLog({
    actorProfileId: req.user?.profileId,
    actorRole: 'admin',
    action: 'STUDENT_DELETED',
    entityType: 'students',
    entityId: studentId,
    previousState: stu,
  });
  res.json({ message: 'Student record deleted.' });
});

// Admin Teachers CRUD
apiRouter.post('/admin/teachers', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
  const { fullName, email, phone, facultyId, departmentId, designation, specialization, password } = req.body;
  if (!fullName || !email || !facultyId || !departmentId) {
    return res.status(400).json({ error: 'Full name, email, Faculty ID, and department are required.' });
  }
  try {
    const id = db.transaction(() => {
      const pId = Number(
        db
          .prepare(
            `INSERT INTO profiles (full_name, email, phone, password_hash, status) VALUES (?, ?, ?, ?, 'active')`
          )
          .run(fullName.trim(), email.trim(), phone || null, hashPassword(password || 'Teacher@123'))
          .lastInsertRowid
      );
      db.prepare(`INSERT INTO user_roles (profile_id, role, granted_by) VALUES (?, 'teacher', ?)`).run(
        pId,
        req.user?.profileId ?? null
      );
      const tId = Number(
        db
          .prepare(
            `INSERT INTO teachers (profile_id, faculty_id, department_id, designation, specialization)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(
            pId,
            facultyId.trim().toUpperCase(),
            Number(departmentId),
            designation || 'Assistant Professor',
            specialization || null
          ).lastInsertRowid
      );
      writeAuditLog({
        actorProfileId: req.user?.profileId,
        actorRole: 'admin',
        action: 'TEACHER_CREATED',
        entityType: 'teachers',
        entityId: tId,
        newState: { facultyId, fullName, email },
      });
      return tId;
    })();
    res.status(201).json({ id, message: 'Teacher added successfully.' });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Unable to add teacher.' });
  }
});

apiRouter.delete('/admin/teachers/:id', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
  const teacherId = Number(req.params.id);
  const tch = db.prepare(`SELECT profile_id, faculty_id FROM teachers WHERE id = ?`).get(teacherId) as
    | { profile_id: number; faculty_id: string }
    | undefined;
  if (!tch) return res.status(404).json({ error: 'Teacher not found.' });
  try {
    db.prepare(`DELETE FROM profiles WHERE id = ?`).run(tch.profile_id);
    writeAuditLog({
      actorProfileId: req.user?.profileId,
      actorRole: 'admin',
      action: 'TEACHER_DELETED',
      entityType: 'teachers',
      entityId: teacherId,
      previousState: tch,
    });
    res.json({ message: 'Teacher removed.' });
  } catch (err) {
    res.status(400).json({ error: 'Cannot delete teacher while assigned to active subjects or sessions.' });
  }
});

// Admin Departments, Courses, Semesters, Sections, Subjects
apiRouter.post('/admin/departments', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
  const { code, name, hodName } = req.body;
  if (!code || !name) return res.status(400).json({ error: 'Code and name are required.' });
  try {
    const id = Number(
      db
        .prepare(`INSERT INTO departments (code, name, hod_name) VALUES (?, ?, ?)`)
        .run(code.trim().toUpperCase(), name.trim(), hodName || null).lastInsertRowid
    );
    writeAuditLog({
      actorProfileId: req.user?.profileId,
      actorRole: 'admin',
      action: 'DEPARTMENT_CREATED',
      entityType: 'departments',
      entityId: id,
    });
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create department.' });
  }
});

apiRouter.delete('/admin/departments/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    db.prepare(`DELETE FROM departments WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'Department has linked students or teachers.' });
  }
});

apiRouter.post('/admin/courses', requireAuth, requireRole('admin'), (req, res) => {
  const { departmentId, code, name, durationYears } = req.body;
  if (!departmentId || !code || !name) return res.status(400).json({ error: 'Missing required fields.' });
  try {
    const id = Number(
      db
        .prepare(`INSERT INTO courses (department_id, code, name, duration_years) VALUES (?, ?, ?, ?)`)
        .run(Number(departmentId), code.trim().toUpperCase(), name.trim(), Number(durationYears || 4))
        .lastInsertRowid
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create course.' });
  }
});

apiRouter.delete('/admin/courses/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    db.prepare(`DELETE FROM courses WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'Course is referenced by existing students.' });
  }
});

apiRouter.post('/admin/semesters', requireAuth, requireRole('admin'), (req, res) => {
  const { academicYearId, courseId, number, name, startDate, endDate } = req.body;
  if (!academicYearId || !courseId || !number || !name) {
    return res.status(400).json({ error: 'Missing required semester fields.' });
  }
  try {
    const id = Number(
      db
        .prepare(
          `INSERT INTO semesters (academic_year_id, course_id, number, name, start_date, end_date, is_active)
           VALUES (?, ?, ?, ?, ?, ?, 1)`
        )
        .run(
          Number(academicYearId),
          Number(courseId),
          Number(number),
          name.trim(),
          startDate || '2026-08-01',
          endDate || '2026-12-20'
        ).lastInsertRowid
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create semester.' });
  }
});

apiRouter.post('/admin/sections', requireAuth, requireRole('admin'), (req, res) => {
  const { departmentId, semesterId, name, capacity } = req.body;
  if (!departmentId || !semesterId || !name) return res.status(400).json({ error: 'Missing fields.' });
  try {
    const id = Number(
      db
        .prepare(`INSERT INTO sections (department_id, semester_id, name, capacity) VALUES (?, ?, ?, ?)`)
        .run(Number(departmentId), Number(semesterId), name.trim().toUpperCase(), Number(capacity || 60))
        .lastInsertRowid
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create section.' });
  }
});

apiRouter.post('/admin/subjects', requireAuth, requireRole('admin'), (req, res) => {
  const { departmentId, semesterId, sectionId, teacherId, code, name, credits, weeklyHours } = req.body;
  if (!departmentId || !semesterId || !sectionId || !teacherId || !code || !name) {
    return res.status(400).json({ error: 'Missing required subject fields.' });
  }
  try {
    const id = Number(
      db
        .prepare(
          `INSERT INTO subjects (department_id, semester_id, section_id, teacher_id, code, name, credits, weekly_hours)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          Number(departmentId),
          Number(semesterId),
          Number(sectionId),
          Number(teacherId),
          code.trim().toUpperCase(),
          name.trim(),
          Number(credits || 4),
          Number(weeklyHours || 4)
        ).lastInsertRowid
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to create subject.' });
  }
});

apiRouter.delete('/admin/subjects/:id', requireAuth, requireRole('admin'), (req, res) => {
  try {
    db.prepare(`DELETE FROM subjects WHERE id = ?`).run(Number(req.params.id));
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: 'Cannot delete subject with recorded class sessions.' });
  }
});

// Admin Timetables
apiRouter.get('/admin/timetables', requireAuth, requireRole('admin'), (req, res) => {
  const sectionId = req.query.sectionId ? Number(req.query.sectionId) : undefined;
  const rows = db
    .prepare(
      `SELECT tt.*, d.code AS department_code, sem.name AS semester_name, sec.name AS section_name,
              sub.code AS subject_code, sub.name AS subject_name,
              t.faculty_id, tp.full_name AS teacher_name
       FROM timetables tt
       JOIN departments d ON d.id = tt.department_id
       JOIN semesters sem ON sem.id = tt.semester_id
       JOIN sections sec ON sec.id = tt.section_id
       JOIN subjects sub ON sub.id = tt.subject_id
       JOIN teachers t ON t.id = tt.teacher_id
       JOIN profiles tp ON tp.id = t.profile_id
       ${sectionId ? 'WHERE tt.section_id = ?' : ''}
       ORDER BY CASE tt.day_of_week
         WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
         WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 END,
         tt.start_time ASC`
    )
    .all(...(sectionId ? [sectionId] : []));
  res.json({ timetables: rows });
});

apiRouter.post('/admin/timetables', requireAuth, requireRole('admin'), (req, res) => {
  const { subjectId, dayOfWeek, startTime, endTime, roomNo } = req.body;
  if (!subjectId || !dayOfWeek || !startTime || !endTime) {
    return res.status(400).json({ error: 'Subject, day, start time, and end time are required.' });
  }
  const sub = db.prepare(`SELECT * FROM subjects WHERE id = ?`).get(Number(subjectId)) as
    | { department_id: number; semester_id: number; section_id: number; teacher_id: number }
    | undefined;
  if (!sub) return res.status(404).json({ error: 'Subject not found.' });

  try {
    const id = Number(
      db
        .prepare(
          `INSERT INTO timetables (department_id, semester_id, section_id, subject_id, teacher_id, day_of_week, start_time, end_time, room_no)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          sub.department_id,
          sub.semester_id,
          sub.section_id,
          Number(subjectId),
          sub.teacher_id,
          dayOfWeek,
          startTime,
          endTime,
          roomNo || 'LH-101'
        ).lastInsertRowid
    );
    res.status(201).json({ id });
  } catch (err) {
    res.status(400).json({ error: 'Schedule conflict: section already has a class at that day and start time.' });
  }
});

apiRouter.delete('/admin/timetables/:id', requireAuth, requireRole('admin'), (req, res) => {
  db.prepare(`DELETE FROM timetables WHERE id = ?`).run(Number(req.params.id));
  res.json({ ok: true });
});

// Admin Attendance Records + Authorized Correction (triggers recalculation + audit log)
apiRouter.get('/admin/attendance', requireAuth, requireRole('admin'), (req, res) => {
  const where: string[] = ['1=1'];
  const params: unknown[] = [];

  if (req.query.departmentId) {
    where.push('cs.department_id = ?');
    params.push(Number(req.query.departmentId));
  }
  if (req.query.semesterId) {
    where.push('cs.semester_id = ?');
    params.push(Number(req.query.semesterId));
  }
  if (req.query.sectionId) {
    where.push('cs.section_id = ?');
    params.push(Number(req.query.sectionId));
  }
  if (req.query.subjectId) {
    where.push('cs.subject_id = ?');
    params.push(Number(req.query.subjectId));
  }
  if (req.query.date) {
    where.push('cs.session_date = ?');
    params.push(String(req.query.date));
  }
  if (req.query.usn) {
    where.push('(UPPER(s.usn) LIKE UPPER(?) OR UPPER(sp.full_name) LIKE UPPER(?))');
    params.push(`%${String(req.query.usn).trim()}%`, `%${String(req.query.usn).trim()}%`);
  }

  const records = db
    .prepare(
      `SELECT
         a.id AS attendance_id,
         a.status AS attendance_status,
         a.source,
         a.confidence_score,
         a.notes,
         a.updated_at,
         cs.id AS session_id,
         cs.session_code,
         cs.session_date,
         cs.start_time,
         cs.end_time,
         cs.status AS session_status,
         s.id AS student_id,
         s.usn,
         sp.full_name AS student_name,
         d.code AS department_code,
         sem.name AS semester_name,
         sec.name AS section_name,
         sub.code AS subject_code,
         sub.name AS subject_name,
         tp.full_name AS teacher_name
       FROM attendance a
       JOIN class_sessions cs ON cs.id = a.session_id
       JOIN students s ON s.id = a.student_id
       JOIN profiles sp ON sp.id = s.profile_id
       JOIN departments d ON d.id = cs.department_id
       JOIN semesters sem ON sem.id = cs.semester_id
       JOIN sections sec ON sec.id = cs.section_id
       JOIN subjects sub ON sub.id = cs.subject_id
       JOIN teachers t ON t.id = cs.teacher_id
       JOIN profiles tp ON tp.id = t.profile_id
       WHERE ${where.join(' AND ')}
       ORDER BY cs.session_date DESC, cs.start_time DESC, s.usn ASC
       LIMIT 200`
    )
    .all(...params);

  res.json({ records });
});

apiRouter.patch('/admin/attendance/:attendanceId', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
  const attendanceId = Number(req.params.attendanceId);
  const { status, reason } = req.body as {
    status?: 'Present' | 'Absent' | 'Late' | 'Pending Review' | 'Excused';
    reason?: string;
  };
  if (!status) return res.status(400).json({ error: 'New status is required.' });

  const existing = db
    .prepare(`SELECT * FROM attendance WHERE id = ?`)
    .get(attendanceId) as { id: number; session_id: number; student_id: number; status: string } | undefined;

  if (!existing) return res.status(404).json({ error: 'Attendance record not found.' });

  db.prepare(
    `UPDATE attendance SET status = ?, notes = COALESCE(?, notes), updated_at = datetime('now') WHERE id = ?`
  ).run(status, reason || null, attendanceId);

  writeAuditLog({
    actorProfileId: req.user?.profileId,
    actorRole: 'admin',
    action: 'ATTENDANCE_CORRECTED',
    entityType: 'attendance',
    entityId: attendanceId,
    previousState: { status: existing.status },
    newState: { status },
    reason: reason || 'Authorized administrator correction',
  });

  if (status === 'Absent') {
    await processFinalizedSessionNotifications(existing.session_id);
  }

  void syncAllReportsToSupabase();

  res.json({ message: 'Attendance corrected and metrics recalculated.' });
});

apiRouter.post('/admin/sessions/:sessionId/cancel', requireAuth, requireRole('admin', 'teacher'), (req: AuthRequest, res) => {
  const sessionId = Number(req.params.sessionId);
  const sess = db.prepare(`SELECT * FROM class_sessions WHERE id = ?`).get(sessionId) as
    | { id: number; teacher_id: number; status: string }
    | undefined;
  if (!sess) return res.status(404).json({ error: 'Session not found.' });
  if (req.user?.role === 'teacher' && sess.teacher_id !== req.user.teacherId) {
    return res.status(403).json({ error: 'Cannot cancel another teacher’s session.' });
  }

  db.prepare(`UPDATE class_sessions SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`).run(sessionId);
  writeAuditLog({
    actorProfileId: req.user?.profileId,
    actorRole: req.user?.role || 'admin',
    action: 'SESSION_CANCELLED',
    entityType: 'class_sessions',
    entityId: sessionId,
    previousState: { status: sess.status },
    newState: { status: 'cancelled' },
    reason: 'Cancelled classes are excluded from attendance calculations',
  });
  void syncAllReportsToSupabase();
  res.json({ message: 'Session marked cancelled and excluded from attendance totals.' });
});

// Admin Parents & Notifications
apiRouter.get('/admin/parents', requireAuth, requireRole('admin'), (_req, res) => {
  const rows = db
    .prepare(
      `SELECT
         par.id AS parent_id,
         par.occupation,
         par.preferred_channel,
         par.whatsapp_consent,
         par.access_token,
         pp.full_name AS parent_name,
         pp.email AS parent_email,
         pp.phone AS parent_phone,
         s.id AS student_id,
         s.usn,
         sp.full_name AS student_name,
         spl.relationship
       FROM parents par
       JOIN profiles pp ON pp.id = par.profile_id
       LEFT JOIN student_parents spl ON spl.parent_id = par.id
       LEFT JOIN students s ON s.id = spl.student_id
       LEFT JOIN profiles sp ON sp.id = s.profile_id
       ORDER BY pp.full_name ASC`
    )
    .all();
  res.json({ parents: rows });
});

apiRouter.patch('/admin/parents/:id', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
  const parentId = Number(req.params.id);
  const { fullName, email, phone, preferredChannel, whatsappConsent } = req.body;
  const par = db.prepare(`SELECT profile_id FROM parents WHERE id = ?`).get(parentId) as
    | { profile_id: number }
    | undefined;
  if (!par) return res.status(404).json({ error: 'Parent record not found.' });

  db.prepare(
    `UPDATE profiles SET full_name = COALESCE(?, full_name), email = COALESCE(?, email), phone = COALESCE(?, phone), updated_at = datetime('now') WHERE id = ?`
  ).run(fullName || null, email || null, phone ?? null, par.profile_id);

  db.prepare(
    `UPDATE parents SET preferred_channel = COALESCE(?, preferred_channel), whatsapp_consent = COALESCE(?, whatsapp_consent), updated_at = datetime('now') WHERE id = ?`
  ).run(
    preferredChannel || null,
    whatsappConsent !== undefined ? (whatsappConsent ? 1 : 0) : null,
    parentId
  );

  writeAuditLog({
    actorProfileId: req.user?.profileId,
    actorRole: 'admin',
    action: 'PARENT_CONTACT_UPDATED',
    entityType: 'parents',
    entityId: parentId,
    newState: req.body,
  });

  res.json({ message: 'Parent contact details updated.' });
});

apiRouter.get('/admin/notifications', requireAuth, requireRole('admin'), (_req, res) => {
  const logs = db
    .prepare(
      `SELECT
         nl.id AS log_id,
         nl.channel,
         nl.recipient,
         nl.status,
         nl.error_message,
         nl.provider_response,
         nl.retry_count,
         nl.sent_at,
         nl.created_at,
         n.title,
         n.message,
         s.usn,
         sp.full_name AS student_name,
         pp.full_name AS parent_name
       FROM notification_logs nl
       JOIN notifications n ON n.id = nl.notification_id
       JOIN parents par ON par.id = nl.parent_id
       JOIN profiles pp ON pp.id = par.profile_id
       JOIN students s ON s.id = n.student_id
       JOIN profiles sp ON sp.id = s.profile_id
       ORDER BY nl.created_at DESC
       LIMIT 150`
    )
    .all();
  res.json({ logs });
});

apiRouter.post('/admin/notifications/retry/:logId', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
  try {
    const result = await retryNotificationLog(Number(req.params.logId));
    writeAuditLog({
      actorProfileId: req.user?.profileId,
      actorRole: 'admin',
      action: 'NOTIFICATION_RETRIED',
      entityType: 'notification_logs',
      entityId: req.params.logId,
      newState: result,
    });
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : 'Retry failed.' });
  }
});

// Admin Policy & Settings & Audit Logs & Reports
apiRouter.get('/admin/policy', requireAuth, requireRole('admin'), (_req, res) => {
  res.json({ policy: getActivePolicy() });
});

apiRouter.patch('/admin/policy', requireAuth, requireRole('admin'), (req: AuthRequest, res) => {
  const { minEligiblePercent, criticalShortagePercent, lateCountsAsPresent, excusedCountsAsPresent } = req.body;
  const minVal = Number(minEligiblePercent);
  const critVal = Number(criticalShortagePercent);

  if (!Number.isFinite(minVal) || !Number.isFinite(critVal) || critVal >= minVal || minVal >= 100 || critVal <= 0) {
    return res.status(400).json({ error: 'Invalid thresholds. Ensure 0 < Critical < Eligible < 100.' });
  }

  const prev = getActivePolicy();
  db.prepare(
    `UPDATE attendance_policies
     SET min_eligible_percent = ?,
         critical_shortage_percent = ?,
         late_counts_as_present = ?,
         excused_counts_as_present = ?,
         updated_by = ?,
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(minVal, critVal, lateCountsAsPresent ? 1 : 0, excusedCountsAsPresent ? 1 : 0, req.user?.profileId ?? null, prev.id);

  const updated = getActivePolicy();
  writeAuditLog({
    actorProfileId: req.user?.profileId,
    actorRole: 'admin',
    action: 'POLICY_UPDATED',
    entityType: 'attendance_policies',
    entityId: prev.id,
    previousState: prev,
    newState: updated,
  });

  void syncAllReportsToSupabase();

  res.json({ policy: updated });
});

apiRouter.get('/admin/audit-logs', requireAuth, requireRole('admin'), (_req, res) => {
  const logs = db
    .prepare(
      `SELECT al.*, p.full_name AS actor_name
       FROM audit_logs al
       LEFT JOIN profiles p ON p.id = al.actor_profile_id
       ORDER BY al.created_at DESC
       LIMIT 100`
    )
    .all();
  res.json({ logs });
});

apiRouter.get('/admin/supabase-sql', requireAuth, requireRole('admin'), (_req, res) => {
  const reportSql = getSupabaseManagementReportsSql();
  const migrationSql = getSupabaseMigrationSql();
  res.json({
    sql: `${reportSql}\n\n${migrationSql}`,
    reportSql,
    migrationSql,
  });
});

apiRouter.get('/admin/supabase/status', requireAuth, requireRole('admin'), async (_req, res) => {
  const status = await checkSupabaseConnection();
  res.json({
    ...status,
    reportSetupSql: getSupabaseManagementReportsSql(),
  });
});

apiRouter.post('/admin/supabase/sync', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
  const result = await syncAllReportsToSupabase();
  writeAuditLog({
    actorProfileId: req.user?.profileId,
    actorRole: 'admin',
    action: result.ok ? 'SUPABASE_REPORTS_SYNCED' : 'SUPABASE_SYNC_ATTEMPTED',
    entityType: 'supabase_backend',
    entityId: result.projectRef || 'unconfigured',
    newState: result,
    reason: result.message,
  });
  res.status(result.ok ? 200 : 200).json(result);
});

apiRouter.get('/admin/supabase/reports', requireAuth, requireRole('admin'), async (req, res) => {
  const reportType = typeof req.query.type === 'string' && req.query.type ? req.query.type : undefined;
  const data = await fetchSupabaseManagementReports(reportType);
  res.json(data);
});

apiRouter.get('/admin/reports', requireAuth, requireRole('admin'), (req, res) => {
  const type = String(req.query.type || 'student');
  const policy = getActivePolicy();

  const filters = {
    departmentId: req.query.departmentId ? Number(req.query.departmentId) : undefined,
    semesterId: req.query.semesterId ? Number(req.query.semesterId) : undefined,
    sectionId: req.query.sectionId ? Number(req.query.sectionId) : undefined,
    subjectId: req.query.subjectId ? Number(req.query.subjectId) : undefined,
    dateFrom: typeof req.query.dateFrom === 'string' && req.query.dateFrom ? req.query.dateFrom : undefined,
    dateTo: typeof req.query.dateTo === 'string' && req.query.dateTo ? req.query.dateTo : undefined,
    usn: typeof req.query.usn === 'string' && req.query.usn ? req.query.usn : undefined,
  };

  if (type === 'daily' || type === 'weekly' || type === 'monthly') {
    const groupExpr =
      type === 'daily'
        ? 'cs.session_date'
        : type === 'weekly'
        ? "strftime('%Y-W%W', cs.session_date)"
        : 'substr(cs.session_date, 1, 7)';

    const rows = db
      .prepare(
        `SELECT
           ${groupExpr} AS period,
           COUNT(DISTINCT cs.id) AS sessions_conducted,
           SUM(CASE WHEN a.status IN ('Present', 'Late', 'Excused') THEN 1 ELSE 0 END) AS present_count,
           SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
           COUNT(a.id) AS total_records
         FROM class_sessions cs
         JOIN attendance a ON a.session_id = cs.id
         WHERE cs.status = 'finalized' AND a.status != 'Pending Review'
         GROUP BY ${groupExpr}
         ORDER BY period DESC`
      )
      .all() as Array<{
      period: string;
      sessions_conducted: number;
      present_count: number;
      absent_count: number;
      total_records: number;
    }>;

    return res.json({
      type,
      columns: ['Period', 'Sessions Conducted', 'Present', 'Absent', 'Total Marks', 'Attendance %'],
      rows: rows.map((r) => ({
        Period: r.period,
        'Sessions Conducted': r.sessions_conducted,
        Present: r.present_count,
        Absent: r.absent_count,
        'Total Marks': r.total_records,
        'Attendance %':
          r.total_records > 0
            ? `${(Math.round(((r.present_count / r.total_records) * 100 + Number.EPSILON) * 100) / 100).toFixed(2)}%`
            : '0.00%',
      })),
    });
  }

  if (type === 'subject') {
    const rows = db
      .prepare(
        `SELECT
           sub.code, sub.name, sec.name AS section_name, tp.full_name AS teacher_name,
           COUNT(DISTINCT cs.id) AS sessions_conducted,
           SUM(CASE WHEN a.status IN ('Present', 'Late', 'Excused') THEN 1 ELSE 0 END) AS present_count,
           SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
           COUNT(a.id) AS total_records
         FROM subjects sub
         JOIN sections sec ON sec.id = sub.section_id
         JOIN teachers t ON t.id = sub.teacher_id
         JOIN profiles tp ON tp.id = t.profile_id
         LEFT JOIN class_sessions cs ON cs.subject_id = sub.id AND cs.status = 'finalized'
         LEFT JOIN attendance a ON a.session_id = cs.id AND a.status != 'Pending Review'
         GROUP BY sub.id
         ORDER BY sub.code ASC`
      )
      .all() as Array<{
      code: string;
      name: string;
      section_name: string;
      teacher_name: string;
      sessions_conducted: number;
      present_count: number;
      absent_count: number;
      total_records: number;
    }>;
    return res.json({
      type,
      columns: ['Subject Code', 'Subject Name', 'Section', 'Faculty', 'Sessions', 'Present', 'Absent', 'Attendance %'],
      rows: rows.map((r) => ({
        'Subject Code': r.code,
        'Subject Name': r.name,
        Section: r.section_name,
        Faculty: r.teacher_name,
        Sessions: r.sessions_conducted,
        Present: r.present_count || 0,
        Absent: r.absent_count || 0,
        'Attendance %':
          r.total_records > 0
            ? `${(Math.round(((r.present_count / r.total_records) * 100 + Number.EPSILON) * 100) / 100).toFixed(2)}%`
            : '0.00%',
      })),
    });
  }

  if (type === 'department' || type === 'semester') {
    const isDept = type === 'department';
    const rows = db
      .prepare(
        `SELECT
           ${isDept ? 'd.code AS key_code, d.name AS key_name' : 'sem.name AS key_code, c.name AS key_name'},
           COUNT(DISTINCT s.id) AS students_count,
           SUM(CASE WHEN a.status IN ('Present', 'Late', 'Excused') THEN 1 ELSE 0 END) AS present_count,
           SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_count,
           COUNT(a.id) AS total_records
         FROM ${isDept ? 'departments d' : 'semesters sem JOIN courses c ON c.id = sem.course_id'}
         LEFT JOIN students s ON s.${isDept ? 'department_id = d.id' : 'semester_id = sem.id'}
         LEFT JOIN attendance a ON a.student_id = s.id AND a.status != 'Pending Review'
         LEFT JOIN class_sessions cs ON cs.id = a.session_id AND cs.status = 'finalized'
         WHERE a.id IS NULL OR cs.id IS NOT NULL
         GROUP BY ${isDept ? 'd.id' : 'sem.id'}`
      )
      .all() as Array<{
      key_code: string;
      key_name: string;
      students_count: number;
      present_count: number;
      absent_count: number;
      total_records: number;
    }>;

    return res.json({
      type,
      columns: [isDept ? 'Dept Code' : 'Semester', isDept ? 'Department' : 'Program', 'Students', 'Present', 'Absent', 'Attendance %'],
      rows: rows.map((r) => ({
        [isDept ? 'Dept Code' : 'Semester']: r.key_code,
        [isDept ? 'Department' : 'Program']: r.key_name,
        Students: r.students_count,
        Present: r.present_count || 0,
        Absent: r.absent_count || 0,
        'Attendance %':
          r.total_records > 0
            ? `${(Math.round(((r.present_count / r.total_records) * 100 + Number.EPSILON) * 100) / 100).toFixed(2)}%`
            : '0.00%',
      })),
    });
  }

  if (type === 'notifications') {
    const rows = db
      .prepare(
        `SELECT nl.created_at, s.usn, sp.full_name AS student_name, pp.full_name AS parent_name,
                nl.channel, nl.recipient, nl.status, nl.retry_count
         FROM notification_logs nl
         JOIN notifications n ON n.id = nl.notification_id
         JOIN students s ON s.id = n.student_id
         JOIN profiles sp ON sp.id = s.profile_id
         JOIN parents par ON par.id = nl.parent_id
         JOIN profiles pp ON pp.id = par.profile_id
         ORDER BY nl.created_at DESC`
      )
      .all() as Array<{
      created_at: string;
      usn: string;
      student_name: string;
      parent_name: string;
      channel: string;
      recipient: string;
      status: string;
      retry_count: number;
    }>;
    return res.json({
      type,
      columns: ['Timestamp', 'USN', 'Student', 'Parent', 'Channel', 'Recipient', 'Status', 'Retries'],
      rows: rows.map((r) => ({
        Timestamp: r.created_at,
        USN: r.usn,
        Student: r.student_name,
        Parent: r.parent_name,
        Channel: r.channel.toUpperCase(),
        Recipient: r.recipient,
        Status: r.status.toUpperCase(),
        Retries: r.retry_count,
      })),
    });
  }

  // 'student' or 'shortage'
  const students = getAllStudentsAttendanceSummaries(filters);
  const filtered =
    type === 'shortage'
      ? students.filter((s) => s.conducted > 0 && s.percentage < policy.minEligiblePercent)
      : students;

  return res.json({
    type,
    columns: ['USN', 'Student Name', 'Department', 'Section', 'Present', 'Conducted', 'Attendance %', 'Category', 'Classes Needed'],
    rows: filtered.map((s) => ({
      USN: s.usn,
      'Student Name': s.fullName,
      Department: s.departmentCode,
      Section: s.sectionName,
      Present: s.present,
      Conducted: s.conducted,
      'Attendance %': `${s.percentage.toFixed(2)}%`,
      Category: s.category,
      'Classes Needed': s.additionalClassesNeeded,
    })),
  });
});

// ============================================================
// 3. TEACHER ROUTES (STRICTLY SCOPED TO ASSIGNED CLASSES)
// ============================================================
apiRouter.get('/teacher/dashboard', requireAuth, requireRole('teacher'), (req: AuthRequest, res) => {
  const teacherId = req.user!.teacherId!;
  const todayDay = getTodayDayName();
  const todayDate = getTodayIso();

  const profile = db
    .prepare(
      `SELECT t.id, t.faculty_id, t.designation, t.specialization, d.code AS department_code, d.name AS department_name,
              p.full_name, p.email, p.phone
       FROM teachers t
       JOIN profiles p ON p.id = t.profile_id
       JOIN departments d ON d.id = t.department_id
       WHERE t.id = ?`
    )
    .get(teacherId);

  const assignedSubjects = db
    .prepare(
      `SELECT sub.*, d.code AS department_code, d.name AS department_name,
              sem.name AS semester_name, sec.name AS section_name,
              (SELECT COUNT(*) FROM students st WHERE st.section_id = sub.section_id) AS enrolled_students
       FROM subjects sub
       JOIN departments d ON d.id = sub.department_id
       JOIN semesters sem ON sem.id = sub.semester_id
       JOIN sections sec ON sec.id = sub.section_id
       WHERE sub.teacher_id = ?
       ORDER BY sub.code ASC`
    )
    .all(teacherId);

  const todaysTimetable = db
    .prepare(
      `SELECT tt.*, sub.code AS subject_code, sub.name AS subject_name, sec.name AS section_name,
              sem.name AS semester_name, d.code AS department_code,
              cs.id AS existing_session_id, cs.session_code, cs.status AS session_status
       FROM timetables tt
       JOIN subjects sub ON sub.id = tt.subject_id
       JOIN sections sec ON sec.id = tt.section_id
       JOIN semesters sem ON sem.id = tt.semester_id
       JOIN departments d ON d.id = tt.department_id
       LEFT JOIN class_sessions cs ON cs.subject_id = tt.subject_id
         AND cs.section_id = tt.section_id
         AND cs.session_date = ?
         AND cs.start_time = tt.start_time
       WHERE tt.teacher_id = ? AND tt.day_of_week = ?
       ORDER BY tt.start_time ASC`
    )
    .all(todayDate, teacherId, todayDay);

  const conductedStats = db
    .prepare(
      `SELECT
         COUNT(*) AS totalConducted,
         SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS activeSessions
       FROM class_sessions
       WHERE teacher_id = ? AND status = 'finalized'`
    )
    .get(teacherId) as { totalConducted: number; activeSessions: number };

  const recentSessions = db
    .prepare(
      `SELECT cs.*, sub.code AS subject_code, sub.name AS subject_name, sec.name AS section_name,
              SUM(CASE WHEN a.status IN ('Present','Late','Excused') THEN 1 ELSE 0 END) AS present_cnt,
              SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_cnt,
              SUM(CASE WHEN a.status = 'Pending Review' THEN 1 ELSE 0 END) AS pending_cnt
       FROM class_sessions cs
       JOIN subjects sub ON sub.id = cs.subject_id
       JOIN sections sec ON sec.id = cs.section_id
       LEFT JOIN attendance a ON a.session_id = cs.id
       WHERE cs.teacher_id = ?
       GROUP BY cs.id
       ORDER BY cs.session_date DESC, cs.start_time DESC
       LIMIT 20`
    )
    .all(teacherId);

  res.json({
    profile,
    todayDay,
    todayDate,
    assignedSubjects,
    todaysTimetable,
    totalConducted: Number(conductedStats?.totalConducted ?? 0),
    recentSessions,
  });
});

apiRouter.get('/teacher/timetable', requireAuth, requireRole('teacher'), (req: AuthRequest, res) => {
  const teacherId = req.user!.teacherId!;
  const rows = db
    .prepare(
      `SELECT tt.*, sub.code AS subject_code, sub.name AS subject_name, sec.name AS section_name,
              sem.name AS semester_name, d.code AS department_code
       FROM timetables tt
       JOIN subjects sub ON sub.id = tt.subject_id
       JOIN sections sec ON sec.id = tt.section_id
       JOIN semesters sem ON sem.id = tt.semester_id
       JOIN departments d ON d.id = tt.department_id
       WHERE tt.teacher_id = ?
       ORDER BY CASE tt.day_of_week
         WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
         WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 END,
         tt.start_time ASC`
    )
    .all(teacherId);
  res.json({ timetable: rows });
});

apiRouter.post('/teacher/sessions', requireAuth, requireRole('teacher'), (req: AuthRequest, res) => {
  const teacherId = req.user!.teacherId!;
  const { subjectId, timetableId, sessionDate, startTime, endTime, topic } = req.body;

  if (!subjectId) {
    return res.status(400).json({ error: 'Subject selection is required.' });
  }

  const subject = db
    .prepare(`SELECT * FROM subjects WHERE id = ? AND teacher_id = ?`)
    .get(Number(subjectId), teacherId) as
    | {
        id: number;
        code: string;
        department_id: number;
        semester_id: number;
        section_id: number;
        teacher_id: number;
      }
    | undefined;

  if (!subject) {
    return res.status(403).json({ error: 'You are not assigned to this subject/section.' });
  }

  const sDate = (sessionDate || getTodayIso()).trim();
  const sStart = (startTime || '09:00').trim();
  const sEnd = (endTime || '10:00').trim();

  // Prevent duplicate session for same subject, section, date, start_time
  const existing = db
    .prepare(
      `SELECT id FROM class_sessions
       WHERE subject_id = ? AND section_id = ? AND session_date = ? AND start_time = ?`
    )
    .get(subject.id, subject.section_id, sDate, sStart) as { id: number } | undefined;

  if (existing) {
    return res.json({ sessionId: existing.id, reused: true });
  }

  const sessionCode = `SES-${sDate.replace(/-/g, '')}-${subject.code}-${sStart.replace(':', '')}-${crypto
    .randomBytes(2)
    .toString('hex')
    .toUpperCase()}`;

  const sessionId = db.transaction(() => {
    const newId = Number(
      db
        .prepare(
          `INSERT INTO class_sessions (session_code, timetable_id, department_id, semester_id, section_id, subject_id, teacher_id, session_date, start_time, end_time, topic, status)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'in_progress')`
        )
        .run(
          sessionCode,
          timetableId ? Number(timetableId) : null,
          subject.department_id,
          subject.semester_id,
          subject.section_id,
          subject.id,
          teacherId,
          sDate,
          sStart,
          sEnd,
          topic || null
        ).lastInsertRowid
    );

    // Pre-populate attendance roster as Present (teacher can mark Absent/Late/Excused/Pending Review before finalization)
    const sectionStudents = db
      .prepare(`SELECT id FROM students WHERE section_id = ?`)
      .all(subject.section_id) as Array<{ id: number }>;

    const insAtt = db.prepare(
      `INSERT OR IGNORE INTO attendance (session_id, student_id, status, marked_by, source)
       VALUES (?, ?, 'Present', ?, 'manual')`
    );
    for (const stu of sectionStudents) {
      insAtt.run(newId, stu.id, req.user!.profileId);
    }

    writeAuditLog({
      actorProfileId: req.user?.profileId,
      actorRole: 'teacher',
      action: 'SESSION_STARTED',
      entityType: 'class_sessions',
      entityId: newId,
      newState: { sessionCode, subjectId: subject.id, sectionId: subject.section_id, sDate, sStart },
    });

    return newId;
  })();

  res.status(201).json({ sessionId, sessionCode });
});

apiRouter.get('/teacher/sessions/:sessionId', requireAuth, requireRole('teacher'), (req: AuthRequest, res) => {
  const sessionId = Number(req.params.sessionId);
  const teacherId = req.user!.teacherId!;

  const session = db
    .prepare(
      `SELECT cs.*, sub.code AS subject_code, sub.name AS subject_name, sec.name AS section_name,
              sem.name AS semester_name, d.code AS department_code, d.name AS department_name
       FROM class_sessions cs
       JOIN subjects sub ON sub.id = cs.subject_id
       JOIN sections sec ON sec.id = cs.section_id
       JOIN semesters sem ON sem.id = cs.semester_id
       JOIN departments d ON d.id = cs.department_id
       WHERE cs.id = ? AND cs.teacher_id = ?`
    )
    .get(sessionId, teacherId) as { id: number; section_id: number } | undefined;

  if (!session) {
    return res.status(404).json({ error: 'Class session not found or not assigned to you.' });
  }

  const roster = db
    .prepare(
      `SELECT
         s.id AS student_id,
         s.usn,
         s.face_consent,
         s.face_descriptor,
         p.full_name,
         p.email,
         a.id AS attendance_id,
         COALESCE(a.status, 'Present') AS status,
         a.source,
         a.confidence_score,
         a.liveness_passed,
         a.notes
       FROM students s
       JOIN profiles p ON p.id = s.profile_id
       LEFT JOIN attendance a ON a.student_id = s.id AND a.session_id = ?
       WHERE s.section_id = ?
       ORDER BY s.usn ASC`
    )
    .all(sessionId, session.section_id);

  const faceLogs = db
    .prepare(
      `SELECT fvl.*, p.full_name AS student_name
       FROM face_verification_logs fvl
       LEFT JOIN students s ON s.id = fvl.student_id
       LEFT JOIN profiles p ON p.id = s.profile_id
       WHERE fvl.session_id = ?
       ORDER BY fvl.created_at DESC`
    )
    .all(sessionId);

  res.json({ session, roster, faceLogs });
});

apiRouter.put('/teacher/sessions/:sessionId/attendance', requireAuth, requireRole('teacher'), (req: AuthRequest, res) => {
  const sessionId = Number(req.params.sessionId);
  const teacherId = req.user!.teacherId!;
  const { records, topic } = req.body as {
    records?: Array<{
      studentId: number;
      status: 'Present' | 'Absent' | 'Late' | 'Pending Review' | 'Excused';
      notes?: string;
    }>;
    topic?: string;
  };

  const session = db
    .prepare(`SELECT id, status FROM class_sessions WHERE id = ? AND teacher_id = ?`)
    .get(sessionId, teacherId) as { id: number; status: string } | undefined;

  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.status === 'finalized' || session.status === 'cancelled') {
    return res.status(400).json({ error: 'Session is locked and cannot be edited by teacher.' });
  }

  db.transaction(() => {
    if (topic !== undefined) {
      db.prepare(`UPDATE class_sessions SET topic = ?, updated_at = datetime('now') WHERE id = ?`).run(
        topic,
        sessionId
      );
    }

    const upsert = db.prepare(
      `INSERT INTO attendance (session_id, student_id, status, marked_by, source, notes, updated_at)
       VALUES (?, ?, ?, ?, 'manual', ?, datetime('now'))
       ON CONFLICT(session_id, student_id) DO UPDATE SET
         status = excluded.status,
         marked_by = excluded.marked_by,
         notes = COALESCE(excluded.notes, attendance.notes),
         updated_at = datetime('now')`
    );

    for (const r of records || []) {
      upsert.run(sessionId, Number(r.studentId), r.status, req.user!.profileId, r.notes || null);
    }
  })();

  res.json({ message: 'Attendance draft saved.' });
});

apiRouter.post('/teacher/sessions/:sessionId/face-verify', requireAuth, requireRole('teacher'), async (req: AuthRequest, res) => {
  const sessionId = Number(req.params.sessionId);
  const teacherId = req.user!.teacherId!;
  const { imageBase64, mimeType } = req.body as { imageBase64?: string; mimeType?: string };

  if (!imageBase64) {
    return res.status(400).json({ error: 'Camera frame image is required.' });
  }

  const session = db
    .prepare(`SELECT id, section_id, status FROM class_sessions WHERE id = ? AND teacher_id = ?`)
    .get(sessionId, teacherId) as { id: number; section_id: number; status: string } | undefined;

  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.status === 'finalized' || session.status === 'cancelled') {
    return res.status(400).json({ error: 'Session is already locked.' });
  }

  const candidates = db
    .prepare(
      `SELECT s.id AS studentId, s.usn, p.full_name AS fullName, s.face_consent AS faceConsent,
              s.face_descriptor AS faceDescriptor, s.face_reference_image AS faceReferenceImage
       FROM students s
       JOIN profiles p ON p.id = s.profile_id
       WHERE s.section_id = ?`
    )
    .all(session.section_id) as Array<{
    studentId: number;
    usn: string;
    fullName: string;
    faceConsent: number;
    faceDescriptor: string | null;
    faceReferenceImage: string | null;
  }>;

  const alreadyPresentRows = db
    .prepare(
      `SELECT student_id FROM attendance WHERE session_id = ? AND status = 'Present' AND source = 'face_ai'`
    )
    .all(sessionId) as Array<{ student_id: number }>;

  try {
    const result = await verifyClassroomFacesWithGemini({
      sessionId,
      imageBase64,
      mimeType: mimeType || 'image/jpeg',
      candidates: candidates.map((c) => ({
        ...c,
        faceConsent: Boolean(c.faceConsent),
      })),
      alreadyPresentStudentIds: alreadyPresentRows.map((r) => r.student_id),
    });

    // Apply results: ONLY matched + liveness -> Present; uncertain -> Pending Review; NEVER auto-mark Absent!
    const upsertAtt = db.prepare(
      `INSERT INTO attendance (session_id, student_id, status, marked_by, source, confidence_score, liveness_passed, notes, updated_at)
       VALUES (?, ?, ?, ?, 'face_ai', ?, ?, ?, datetime('now'))
       ON CONFLICT(session_id, student_id) DO UPDATE SET
         status = excluded.status,
         source = 'face_ai',
         confidence_score = excluded.confidence_score,
         liveness_passed = excluded.liveness_passed,
         notes = excluded.notes,
         updated_at = datetime('now')`
    );

    for (const m of result.matches) {
      if (!m.studentId) continue;
      if (m.disposition === 'matched') {
        upsertAtt.run(
          sessionId,
          m.studentId,
          'Present',
          req.user!.profileId,
          m.confidence,
          1,
          m.reason
        );
      } else if (m.disposition === 'pending_review') {
        upsertAtt.run(
          sessionId,
          m.studentId,
          'Pending Review',
          req.user!.profileId,
          m.confidence,
          m.livenessPassed ? 1 : 0,
          m.reason
        );
      }
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({
      error: err instanceof Error ? err.message : 'Face verification failed.',
    });
  }
});

apiRouter.post('/teacher/sessions/:sessionId/review-face', requireAuth, requireRole('teacher'), (req: AuthRequest, res) => {
  const sessionId = Number(req.params.sessionId);
  const teacherId = req.user!.teacherId!;
  const { studentId, decision } = req.body as {
    studentId?: number;
    decision?: 'Present' | 'Absent' | 'Late';
  };

  if (!studentId || !decision) {
    return res.status(400).json({ error: 'Student ID and review decision are required.' });
  }

  const session = db
    .prepare(`SELECT id, status FROM class_sessions WHERE id = ? AND teacher_id = ?`)
    .get(sessionId, teacherId) as { id: number; status: string } | undefined;
  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.status === 'finalized') return res.status(400).json({ error: 'Session already finalized.' });

  db.prepare(
    `UPDATE attendance
     SET status = ?, notes = ?, updated_at = datetime('now')
     WHERE session_id = ? AND student_id = ?`
  ).run(decision, `Teacher verified uncertain face match as ${decision}`, sessionId, Number(studentId));

  db.prepare(
    `INSERT INTO face_verification_logs (session_id, student_id, liveness_passed, disposition, raw_notes, reviewed_by)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    Number(studentId),
    decision === 'Present' ? 1 : 0,
    decision === 'Present' ? 'teacher_approved' : 'teacher_rejected',
    `Teacher manually resolved Pending Review -> ${decision}`,
    req.user!.profileId
  );

  res.json({ message: `Review resolved as ${decision}.` });
});

apiRouter.post('/teacher/sessions/:sessionId/finalize', requireAuth, requireRole('teacher'), async (req: AuthRequest, res) => {
  const sessionId = Number(req.params.sessionId);
  const teacherId = req.user!.teacherId!;

  const session = db
    .prepare(`SELECT id, status FROM class_sessions WHERE id = ? AND teacher_id = ?`)
    .get(sessionId, teacherId) as { id: number; status: string } | undefined;

  if (!session) return res.status(404).json({ error: 'Session not found.' });
  if (session.status === 'finalized') {
    return res.json({ message: 'Session was already finalized.', alreadyFinalized: true });
  }
  if (session.status === 'cancelled') {
    return res.status(400).json({ error: 'Cancelled sessions cannot be finalized.' });
  }

  const pendingCnt = (
    db
      .prepare(`SELECT COUNT(*) AS cnt FROM attendance WHERE session_id = ? AND status = 'Pending Review'`)
      .get(sessionId) as { cnt: number }
  ).cnt;

  if (pendingCnt > 0) {
    return res.status(400).json({
      error: `${pendingCnt} student(s) still in Pending Review. Review uncertain face matches before finalizing.`,
    });
  }

  db.prepare(
    `UPDATE class_sessions
     SET status = 'finalized', finalized_at = datetime('now'), finalized_by = ?, updated_at = datetime('now')
     WHERE id = ?`
  ).run(req.user!.profileId, sessionId);

  writeAuditLog({
    actorProfileId: req.user?.profileId,
    actorRole: 'teacher',
    action: 'SESSION_FINALIZED',
    entityType: 'class_sessions',
    entityId: sessionId,
    previousState: { status: session.status },
    newState: { status: 'finalized' },
  });

  // Automatically trigger deduplicated parent notifications ONLY AFTER finalization
  const notificationResult = await processFinalizedSessionNotifications(sessionId);
  void syncAllReportsToSupabase();

  res.json({
    message: 'Attendance finalized and calculations updated.',
    notifications: notificationResult,
  });
});

apiRouter.get('/teacher/reports', requireAuth, requireRole('teacher'), (req: AuthRequest, res) => {
  const teacherId = req.user!.teacherId!;
  const subjectId = req.query.subjectId ? Number(req.query.subjectId) : undefined;

  const assignedSubjects = db
    .prepare(
      `SELECT sub.id, sub.code, sub.name, sub.section_id, sec.name AS section_name
       FROM subjects sub
       JOIN sections sec ON sec.id = sub.section_id
       WHERE sub.teacher_id = ? ${subjectId ? 'AND sub.id = ?' : ''}`
    )
    .all(...(subjectId ? [teacherId, subjectId] : [teacherId])) as Array<{
    id: number;
    code: string;
    name: string;
    section_id: number;
    section_name: string;
  }>;

  const reports = assignedSubjects.map((sub) => {
    const students = getAllStudentsAttendanceSummaries({
      sectionId: sub.section_id,
      subjectId: sub.id,
    });
    return {
      subject: sub,
      students,
    };
  });

  res.json({ reports });
});

// ============================================================
// 4. STUDENT ROUTES (STRICTLY OWN DATA ONLY)
// ============================================================
apiRouter.get('/student/dashboard', requireAuth, requireRole('student'), (req: AuthRequest, res) => {
  const studentId = req.user!.studentId!;
  const report = getStudentAttendanceReport(studentId);
  if (!report) return res.status(404).json({ error: 'Student profile not found.' });

  const todayDay = getTodayDayName();
  const todaysTimetable = db
    .prepare(
      `SELECT tt.*, sub.code AS subject_code, sub.name AS subject_name, tp.full_name AS teacher_name
       FROM timetables tt
       JOIN subjects sub ON sub.id = tt.subject_id
       JOIN teachers t ON t.id = tt.teacher_id
       JOIN profiles tp ON tp.id = t.profile_id
       WHERE tt.section_id = ? AND tt.day_of_week = ?
       ORDER BY tt.start_time ASC`
    )
    .all(report.sectionId, todayDay);

  const weeklyTimetable = db
    .prepare(
      `SELECT tt.*, sub.code AS subject_code, sub.name AS subject_name, tp.full_name AS teacher_name
       FROM timetables tt
       JOIN subjects sub ON sub.id = tt.subject_id
       JOIN teachers t ON t.id = tt.teacher_id
       JOIN profiles tp ON tp.id = t.profile_id
       WHERE tt.section_id = ?
       ORDER BY CASE tt.day_of_week
         WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
         WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 END,
         tt.start_time ASC`
    )
    .all(report.sectionId);

  const history = db
    .prepare(
      `SELECT
         a.id, a.status, a.source, a.notes, a.marked_at,
         cs.session_code, cs.session_date, cs.start_time, cs.end_time, cs.topic,
         sub.code AS subject_code, sub.name AS subject_name,
         tp.full_name AS teacher_name
       FROM attendance a
       JOIN class_sessions cs ON cs.id = a.session_id
       JOIN subjects sub ON sub.id = cs.subject_id
       JOIN teachers t ON t.id = cs.teacher_id
       JOIN profiles tp ON tp.id = t.profile_id
       WHERE a.student_id = ? AND cs.status = 'finalized' AND a.status != 'Pending Review'
       ORDER BY cs.session_date DESC, cs.start_time DESC
       LIMIT 100`
    )
    .all(studentId);

  const notifications = db
    .prepare(
      `SELECT n.id, n.title, n.message, n.created_at,
              pp.full_name AS parent_name,
              GROUP_CONCAT(nl.channel || ':' || nl.status, ', ') AS delivery_summary
       FROM notifications n
       JOIN parents par ON par.id = n.parent_id
       JOIN profiles pp ON pp.id = par.profile_id
       LEFT JOIN notification_logs nl ON nl.notification_id = n.id
       WHERE n.student_id = ?
       GROUP BY n.id
       ORDER BY n.created_at DESC`
    )
    .all(studentId);

  res.json({
    report,
    todayDay,
    todaysTimetable,
    weeklyTimetable,
    history,
    notifications,
  });
});

apiRouter.patch('/student/face-consent', requireAuth, requireRole('student'), (req: AuthRequest, res) => {
  const studentId = req.user!.studentId!;
  const { faceConsent, faceReferenceImage, faceDescriptor } = req.body as {
    faceConsent: boolean;
    faceReferenceImage?: string;
    faceDescriptor?: string;
  };

  db.prepare(
    `UPDATE students
     SET face_consent = ?,
         face_reference_image = COALESCE(?, face_reference_image),
         face_descriptor = COALESCE(?, face_descriptor),
         updated_at = datetime('now')
     WHERE id = ?`
  ).run(faceConsent ? 1 : 0, faceReferenceImage || null, faceDescriptor || null, studentId);

  writeAuditLog({
    actorProfileId: req.user?.profileId,
    actorRole: 'student',
    action: 'FACE_CONSENT_UPDATED',
    entityType: 'students',
    entityId: studentId,
    newState: { faceConsent: Boolean(faceConsent), hasImage: Boolean(faceReferenceImage) },
  });

  res.json({ message: 'Biometric consent preferences saved.' });
});

// ============================================================
// 5. PARENT ROUTES (STRICTLY LINKED STUDENTS ONLY)
// ============================================================
apiRouter.get('/parent/dashboard', requireAuth, requireRole('parent'), (req: AuthRequest, res) => {
  const parentId = req.user!.parentId!;

  const parentProfile = db
    .prepare(
      `SELECT par.id, par.occupation, par.preferred_channel, par.whatsapp_consent, par.access_token,
              p.full_name, p.email, p.phone
       FROM parents par
       JOIN profiles p ON p.id = par.profile_id
       WHERE par.id = ?`
    )
    .get(parentId);

  const linkedRows = db
    .prepare(
      `SELECT sp.student_id, sp.relationship
       FROM student_parents sp
       WHERE sp.parent_id = ?`
    )
    .all(parentId) as Array<{ student_id: number; relationship: string }>;

  const children = linkedRows
    .map((link) => {
      const report = getStudentAttendanceReport(link.student_id);
      if (!report) return null;

      const history = db
        .prepare(
          `SELECT a.id, a.status, cs.session_code, cs.session_date, cs.start_time, cs.end_time,
                  sub.code AS subject_code, sub.name AS subject_name, tp.full_name AS teacher_name
           FROM attendance a
           JOIN class_sessions cs ON cs.id = a.session_id
           JOIN subjects sub ON sub.id = cs.subject_id
           JOIN teachers t ON t.id = cs.teacher_id
           JOIN profiles tp ON tp.id = t.profile_id
           WHERE a.student_id = ? AND cs.status = 'finalized' AND a.status != 'Pending Review'
           ORDER BY cs.session_date DESC, cs.start_time DESC
           LIMIT 60`
        )
        .all(link.student_id);

      return {
        relationship: link.relationship,
        report,
        history,
      };
    })
    .filter(Boolean);

  const notifications = db
    .prepare(
      `SELECT n.id, n.title, n.message, n.created_at, s.usn, sp.full_name AS student_name,
              GROUP_CONCAT(nl.channel || ':' || nl.status, ', ') AS delivery_summary
       FROM notifications n
       JOIN students s ON s.id = n.student_id
       JOIN profiles sp ON sp.id = s.profile_id
       LEFT JOIN notification_logs nl ON nl.notification_id = n.id
       WHERE n.parent_id = ?
       GROUP BY n.id
       ORDER BY n.created_at DESC`
    )
    .all(parentId);

  res.json({
    parentProfile,
    children,
    notifications,
  });
});

// ============================================================
// 6. APPOINTMENT BOOKING ROUTES (DUAL-SYNC TO SUPABASE)
// ============================================================
apiRouter.get('/appointments/meta', async (_req, res) => {
  const departments = db
    .prepare(`SELECT id, code, name, hod_name FROM departments ORDER BY code ASC`)
    .all();

  const advisors = db
    .prepare(
      `SELECT t.faculty_id, p.full_name, t.designation, d.code AS department_code
       FROM teachers t
       JOIN profiles p ON p.id = t.profile_id
       JOIN departments d ON d.id = t.department_id
       ORDER BY p.full_name ASC`
    )
    .all();

  const supabaseCheck = await checkAppointmentsTableReady();

  res.json({
    departments,
    advisors,
    supabaseReady: supabaseCheck.ready,
  });
});

apiRouter.post('/appointments', async (req, res) => {
  const {
    fullName,
    email,
    phone,
    requesterRole,
    referenceId,
    departmentCode,
    appointmentWith,
    preferredDate,
    preferredTime,
    purpose,
    notes,
  } = req.body as {
    fullName?: string;
    email?: string;
    phone?: string;
    requesterRole?: string;
    referenceId?: string;
    departmentCode?: string;
    appointmentWith?: string;
    preferredDate?: string;
    preferredTime?: string;
    purpose?: string;
    notes?: string;
  };

  if (
    !fullName?.trim() ||
    !email?.trim() ||
    !phone?.trim() ||
    !departmentCode?.trim() ||
    !appointmentWith?.trim() ||
    !preferredDate?.trim() ||
    !preferredTime?.trim() ||
    !purpose?.trim()
  ) {
    return res.status(400).json({
      error: 'Please complete all required appointment fields (name, email, phone, department, staff, date, time, and purpose).',
    });
  }

  const bookingCode = `APT-${preferredDate.replace(/-/g, '')}-${crypto
    .randomBytes(2)
    .toString('hex')
    .toUpperCase()}`;

  const payload = {
    booking_code: bookingCode,
    full_name: fullName.trim(),
    email: email.trim(),
    phone: phone.trim(),
    requester_role: (requesterRole || 'Student').trim(),
    reference_id: referenceId?.trim() || null,
    department_code: departmentCode.trim(),
    appointment_with: appointmentWith.trim(),
    preferred_date: preferredDate.trim(),
    preferred_time: preferredTime.trim(),
    purpose: purpose.trim(),
    notes: notes?.trim() || null,
    status: 'Pending',
  };

  const insertRes = db
    .prepare(
      `INSERT INTO appointments
         (booking_code, full_name, email, phone, requester_role, reference_id, department_code, appointment_with, preferred_date, preferred_time, purpose, notes, status, synced_to_supabase)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending', 0)`
    )
    .run(
      payload.booking_code,
      payload.full_name,
      payload.email,
      payload.phone,
      payload.requester_role,
      payload.reference_id,
      payload.department_code,
      payload.appointment_with,
      payload.preferred_date,
      payload.preferred_time,
      payload.purpose,
      payload.notes
    );

  const localId = Number(insertRes.lastInsertRowid);
  const sbResult = await saveAppointmentToSupabase(payload);

  if (sbResult.ok) {
    db.prepare(`UPDATE appointments SET synced_to_supabase = 1 WHERE id = ?`).run(localId);
  }

  writeAuditLog({
    actorRole: 'public',
    action: 'APPOINTMENT_BOOKED',
    entityType: 'appointments',
    entityId: bookingCode,
    newState: { ...payload, savedToSupabase: sbResult.ok },
    reason: sbResult.ok
      ? 'Saved to Supabase appointments table'
      : `Saved locally (${sbResult.error || 'Supabase table pending'})`,
  });

  return res.status(201).json({
    bookingCode,
    appointment: { id: localId, ...payload },
    savedToSupabase: sbResult.ok,
    tableMissing: sbResult.tableMissing,
    message: sbResult.ok
      ? `Appointment ${bookingCode} confirmed and saved directly to your Supabase database.`
      : sbResult.tableMissing
      ? `Appointment ${bookingCode} recorded locally, waiting for the one-time 'appointments' table SQL setup in Supabase.`
      : `Appointment ${bookingCode} saved locally (${sbResult.error}).`,
  });
});

apiRouter.get('/admin/appointments', requireAuth, requireRole('admin'), async (_req, res) => {
  const localAppointments = db
    .prepare(`SELECT * FROM appointments ORDER BY created_at DESC LIMIT 200`)
    .all();

  const sbFetch = await fetchAppointmentsFromSupabase();
  res.json({
    localAppointments,
    supabaseAppointments: sbFetch.appointments,
    supabaseReady: sbFetch.ready,
    supabaseError: sbFetch.error,
    appointmentsSql: getSupabaseAppointmentsSql(),
  });
});

apiRouter.patch('/admin/appointments/:id', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
  const id = Number(req.params.id);
  const { status } = req.body as { status?: 'Pending' | 'Confirmed' | 'Completed' | 'Cancelled' };
  if (!status || !['Pending', 'Confirmed', 'Completed', 'Cancelled'].includes(status)) {
    return res.status(400).json({ error: 'Valid appointment status is required.' });
  }

  const row = db
    .prepare(`SELECT id, booking_code, status FROM appointments WHERE id = ?`)
    .get(id) as { id: number; booking_code: string; status: string } | undefined;

  if (!row) return res.status(404).json({ error: 'Appointment not found.' });

  db.prepare(`UPDATE appointments SET status = ? WHERE id = ?`).run(status, id);
  const sbUpdate = await updateAppointmentStatusInSupabase(row.booking_code, status);

  writeAuditLog({
    actorProfileId: req.user?.profileId,
    actorRole: 'admin',
    action: 'APPOINTMENT_STATUS_UPDATED',
    entityType: 'appointments',
    entityId: row.booking_code,
    previousState: { status: row.status },
    newState: { status, syncedToSupabase: sbUpdate.ok },
  });

  res.json({
    message: sbUpdate.ok
      ? `Appointment ${row.booking_code} updated to ${status} in Supabase.`
      : `Appointment ${row.booking_code} updated to ${status} locally.`,
    syncedToSupabase: sbUpdate.ok,
  });
});

apiRouter.post('/admin/appointments/sync', requireAuth, requireRole('admin'), async (req: AuthRequest, res) => {
  const rows = db
    .prepare(
      `SELECT booking_code, full_name, email, phone, requester_role, reference_id,
              department_code, appointment_with, preferred_date, preferred_time, purpose, notes, status
       FROM appointments
       ORDER BY created_at DESC`
    )
    .all() as Array<{
    booking_code: string;
    full_name: string;
    email: string;
    phone: string;
    requester_role: string;
    reference_id: string | null;
    department_code: string;
    appointment_with: string;
    preferred_date: string;
    preferred_time: string;
    purpose: string;
    notes: string | null;
    status: string;
  }>;

  const result = await syncAllAppointmentsToSupabase(rows);
  if (result.ok) {
    db.prepare(`UPDATE appointments SET synced_to_supabase = 1`).run();
  }

  writeAuditLog({
    actorProfileId: req.user?.profileId,
    actorRole: 'admin',
    action: 'APPOINTMENTS_SYNCED_TO_SUPABASE',
    entityType: 'appointments',
    entityId: 'batch',
    newState: result,
  });

  res.json({
    ...result,
    message: result.ok
      ? `Synced ${result.syncedCount} appointment record(s) to Supabase.`
      : result.error || 'Unable to sync appointments to Supabase.',
  });
});

