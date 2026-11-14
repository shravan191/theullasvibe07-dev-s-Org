import { db } from './db.ts';

export interface AttendancePolicy {
  id: number;
  name: string;
  minEligiblePercent: number;
  criticalShortagePercent: number;
  lateCountsAsPresent: boolean;
  excusedCountsAsPresent: boolean;
}

export type AttendanceCategory = 'Eligible' | 'Shortage Warning' | 'Critical Shortage';

export interface AttendanceMetricSummary {
  present: number;
  absent: number;
  late: number;
  excused: number;
  conducted: number;
  percentage: number;
  category: AttendanceCategory;
  additionalClassesNeeded: number;
  requirementMessage: string;
}

export interface SubjectAttendanceItem extends AttendanceMetricSummary {
  subjectId: number;
  subjectCode: string;
  subjectName: string;
  credits: number;
  teacherName: string;
}

export interface MonthlyAttendancePoint {
  month: string;
  label: string;
  present: number;
  absent: number;
  conducted: number;
  percentage: number;
}

export interface StudentFullAttendanceReport {
  studentId: number;
  usn: string;
  fullName: string;
  email: string;
  phone: string | null;
  departmentId: number;
  departmentCode: string;
  departmentName: string;
  courseName: string;
  semesterId: number;
  semesterName: string;
  semesterNumber: number;
  sectionId: number;
  sectionName: string;
  faceConsent: boolean;
  policy: AttendancePolicy;
  overall: AttendanceMetricSummary;
  semesterSummary: AttendanceMetricSummary;
  subjects: SubjectAttendanceItem[];
  monthlyHistory: MonthlyAttendancePoint[];
}

export function getActivePolicy(): AttendancePolicy {
  const row = db
    .prepare(
      `SELECT id, name, min_eligible_percent, critical_shortage_percent, late_counts_as_present, excused_counts_as_present
       FROM attendance_policies
       WHERE is_active = 1
       ORDER BY id DESC
       LIMIT 1`
    )
    .get() as
    | {
        id: number;
        name: string;
        min_eligible_percent: number;
        critical_shortage_percent: number;
        late_counts_as_present: number;
        excused_counts_as_present: number;
      }
    | undefined;

  if (!row) {
    return {
      id: 1,
      name: 'University Standard Policy',
      minEligiblePercent: 75,
      criticalShortagePercent: 65,
      lateCountsAsPresent: true,
      excusedCountsAsPresent: true,
    };
  }

  return {
    id: row.id,
    name: row.name,
    minEligiblePercent: Number(row.min_eligible_percent),
    criticalShortagePercent: Number(row.critical_shortage_percent),
    lateCountsAsPresent: Boolean(row.late_counts_as_present),
    excusedCountsAsPresent: Boolean(row.excused_counts_as_present),
  };
}

export function round2(val: number): number {
  if (!Number.isFinite(val)) return 0;
  return Math.round((val + Number.EPSILON) * 100) / 100;
}

/**
 * FORMULA 1 & 2 & 3:
 * Percentage = (Present / Conducted) * 100
 */
export function calculatePercentage(present: number, conducted: number): number {
  if (!Number.isFinite(present) || !Number.isFinite(conducted) || conducted <= 0) {
    return 0;
  }
  const safePresent = Math.max(0, Math.min(present, conducted));
  return round2((safePresent / conducted) * 100);
}

/**
 * FORMULA 4:
 * >= target => Eligible
 * >= critical && < target => Shortage Warning
 * < critical => Critical Shortage
 */
export function classifyAttendance(
  percentage: number,
  conducted: number,
  policy: Pick<AttendancePolicy, 'minEligiblePercent' | 'criticalShortagePercent'>
): AttendanceCategory {
  if (conducted <= 0) return 'Eligible';
  if (percentage >= policy.minEligiblePercent) return 'Eligible';
  if (percentage >= policy.criticalShortagePercent) return 'Shortage Warning';
  return 'Critical Shortage';
}

/**
 * FORMULA 5:
 * Required Classes = CEILING((Target * Conducted - 100 * Present) / (100 - Target))
 */
export function calculateAdditionalClassesRequired(
  present: number,
  conducted: number,
  targetPercentage: number
): { classesNeeded: number; message: string } {
  if (!Number.isFinite(targetPercentage) || targetPercentage <= 0 || targetPercentage >= 100) {
    return {
      classesNeeded: 0,
      message: 'Attendance target configuration requires attention.',
    };
  }
  if (conducted <= 0) {
    return {
      classesNeeded: 0,
      message: 'No finalized classes conducted yet.',
    };
  }

  const currentPct = calculatePercentage(present, conducted);
  if (currentPct >= targetPercentage) {
    return {
      classesNeeded: 0,
      message: 'Attendance requirement achieved.',
    };
  }

  const numerator = targetPercentage * conducted - 100 * present;
  const denominator = 100 - targetPercentage;
  if (denominator <= 0) {
    return { classesNeeded: 0, message: 'Attendance requirement achieved.' };
  }

  const needed = Math.max(0, Math.ceil(numerator / denominator));
  if (needed === 0) {
    return {
      classesNeeded: 0,
      message: 'Attendance requirement achieved.',
    };
  }

  const noun = needed === 1 ? 'class' : 'classes';
  return {
    classesNeeded: needed,
    message: `Attend the next ${needed} ${noun} to reach ${targetPercentage}% attendance.`,
  };
}

export function buildMetricSummary(
  counts: { present: number; absent: number; late: number; excused: number },
  policy: AttendancePolicy
): AttendanceMetricSummary {
  const effectivePresent =
    counts.present +
    (policy.lateCountsAsPresent ? counts.late : 0) +
    (policy.excusedCountsAsPresent ? counts.excused : 0);
  const conducted = counts.present + counts.absent + counts.late + counts.excused;
  const percentage = calculatePercentage(effectivePresent, conducted);
  const category = classifyAttendance(percentage, conducted, policy);
  const req = calculateAdditionalClassesRequired(effectivePresent, conducted, policy.minEligiblePercent);

  return {
    present: effectivePresent,
    absent: counts.absent,
    late: counts.late,
    excused: counts.excused,
    conducted,
    percentage,
    category,
    additionalClassesNeeded: req.classesNeeded,
    requirementMessage: req.message,
  };
}

export function getStudentAttendanceReport(studentId: number): StudentFullAttendanceReport | null {
  const policy = getActivePolicy();

  const studentRow = db
    .prepare(
      `SELECT
         s.id AS student_id,
         s.usn,
         s.face_consent,
         p.full_name,
         p.email,
         p.phone,
         d.id AS department_id,
         d.code AS department_code,
         d.name AS department_name,
         c.name AS course_name,
         sem.id AS semester_id,
         sem.name AS semester_name,
         sem.number AS semester_number,
         sec.id AS section_id,
         sec.name AS section_name
       FROM students s
       JOIN profiles p ON p.id = s.profile_id
       JOIN departments d ON d.id = s.department_id
       JOIN courses c ON c.id = s.course_id
       JOIN semesters sem ON sem.id = s.semester_id
       JOIN sections sec ON sec.id = s.section_id
       WHERE s.id = ?`
    )
    .get(studentId) as
    | {
        student_id: number;
        usn: string;
        face_consent: number;
        full_name: string;
        email: string;
        phone: string | null;
        department_id: number;
        department_code: string;
        department_name: string;
        course_name: string;
        semester_id: number;
        semester_name: string;
        semester_number: number;
        section_id: number;
        section_name: string;
      }
    | undefined;

  if (!studentRow) return null;

  // Subjects registered for student's section & semester
  const subjectRows = db
    .prepare(
      `SELECT
         sub.id AS subject_id,
         sub.code AS subject_code,
         sub.name AS subject_name,
         sub.credits,
         tp.full_name AS teacher_name
       FROM subjects sub
       JOIN teachers t ON t.id = sub.teacher_id
       JOIN profiles tp ON tp.id = t.profile_id
       WHERE sub.section_id = ? AND sub.semester_id = ?
       ORDER BY sub.code ASC`
    )
    .all(studentRow.section_id, studentRow.semester_id) as Array<{
    subject_id: number;
    subject_code: string;
    subject_name: string;
    credits: number;
    teacher_name: string;
  }>;

  // Finalized non-cancelled, non-pending attendance records for this student
  const subjectCountRows = db
    .prepare(
      `SELECT
         cs.subject_id,
         SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present_cnt,
         SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_cnt,
         SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) AS late_cnt,
         SUM(CASE WHEN a.status = 'Excused' THEN 1 ELSE 0 END) AS excused_cnt
       FROM attendance a
       JOIN class_sessions cs ON cs.id = a.session_id
       WHERE a.student_id = ?
         AND cs.status = 'finalized'
         AND a.status != 'Pending Review'
       GROUP BY cs.subject_id`
    )
    .all(studentId) as Array<{
    subject_id: number;
    present_cnt: number;
    absent_cnt: number;
    late_cnt: number;
    excused_cnt: number;
  }>;

  const countsMap = new Map(subjectCountRows.map((r) => [r.subject_id, r]));

  let totalPresentRaw = 0;
  let totalAbsentRaw = 0;
  let totalLateRaw = 0;
  let totalExcusedRaw = 0;

  const subjects: SubjectAttendanceItem[] = subjectRows.map((sub) => {
    const c = countsMap.get(sub.subject_id);
    const present = Number(c?.present_cnt ?? 0);
    const absent = Number(c?.absent_cnt ?? 0);
    const late = Number(c?.late_cnt ?? 0);
    const excused = Number(c?.excused_cnt ?? 0);

    totalPresentRaw += present;
    totalAbsentRaw += absent;
    totalLateRaw += late;
    totalExcusedRaw += excused;

    const summary = buildMetricSummary({ present, absent, late, excused }, policy);
    return {
      subjectId: sub.subject_id,
      subjectCode: sub.subject_code,
      subjectName: sub.subject_name,
      credits: sub.credits,
      teacherName: sub.teacher_name,
      ...summary,
    };
  });

  // Semester attendance MUST be (Sum of Present in all subjects / Sum of Conducted in all subjects) * 100
  const semesterSummary = buildMetricSummary(
    {
      present: totalPresentRaw,
      absent: totalAbsentRaw,
      late: totalLateRaw,
      excused: totalExcusedRaw,
    },
    policy
  );

  // Overall across all finalized sessions for the student (same as semester when single active semester, or across all semesters)
  const overallTotals = db
    .prepare(
      `SELECT
         SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present_cnt,
         SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_cnt,
         SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) AS late_cnt,
         SUM(CASE WHEN a.status = 'Excused' THEN 1 ELSE 0 END) AS excused_cnt
       FROM attendance a
       JOIN class_sessions cs ON cs.id = a.session_id
       WHERE a.student_id = ?
         AND cs.status = 'finalized'
         AND a.status != 'Pending Review'`
    )
    .get(studentId) as {
    present_cnt: number | null;
    absent_cnt: number | null;
    late_cnt: number | null;
    excused_cnt: number | null;
  };

  const overall = buildMetricSummary(
    {
      present: Number(overallTotals?.present_cnt ?? 0),
      absent: Number(overallTotals?.absent_cnt ?? 0),
      late: Number(overallTotals?.late_cnt ?? 0),
      excused: Number(overallTotals?.excused_cnt ?? 0),
    },
    policy
  );

  // Monthly history from finalized sessions
  const monthlyRows = db
    .prepare(
      `SELECT
         substr(cs.session_date, 1, 7) AS month,
         SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present_cnt,
         SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_cnt,
         SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) AS late_cnt,
         SUM(CASE WHEN a.status = 'Excused' THEN 1 ELSE 0 END) AS excused_cnt
       FROM attendance a
       JOIN class_sessions cs ON cs.id = a.session_id
       WHERE a.student_id = ?
         AND cs.status = 'finalized'
         AND a.status != 'Pending Review'
       GROUP BY substr(cs.session_date, 1, 7)
       ORDER BY month ASC`
    )
    .all(studentId) as Array<{
    month: string;
    present_cnt: number;
    absent_cnt: number;
    late_cnt: number;
    excused_cnt: number;
  }>;

  const monthlyHistory: MonthlyAttendancePoint[] = monthlyRows.map((m) => {
    const summary = buildMetricSummary(
      {
        present: Number(m.present_cnt ?? 0),
        absent: Number(m.absent_cnt ?? 0),
        late: Number(m.late_cnt ?? 0),
        excused: Number(m.excused_cnt ?? 0),
      },
      policy
    );
    const [yr, mo] = m.month.split('-');
    const dateObj = new Date(Number(yr), Number(mo) - 1, 1);
    const label = Number.isNaN(dateObj.getTime())
      ? m.month
      : dateObj.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    return {
      month: m.month,
      label,
      present: summary.present,
      absent: summary.absent,
      conducted: summary.conducted,
      percentage: summary.percentage,
    };
  });

  return {
    studentId: studentRow.student_id,
    usn: studentRow.usn,
    fullName: studentRow.full_name,
    email: studentRow.email,
    phone: studentRow.phone,
    departmentId: studentRow.department_id,
    departmentCode: studentRow.department_code,
    departmentName: studentRow.department_name,
    courseName: studentRow.course_name,
    semesterId: studentRow.semester_id,
    semesterName: studentRow.semester_name,
    semesterNumber: studentRow.semester_number,
    sectionId: studentRow.section_id,
    sectionName: studentRow.section_name,
    faceConsent: Boolean(studentRow.face_consent),
    policy,
    overall,
    semesterSummary,
    subjects,
    monthlyHistory,
  };
}

export function getAllStudentsAttendanceSummaries(filters?: {
  departmentId?: number;
  semesterId?: number;
  sectionId?: number;
  subjectId?: number;
  dateFrom?: string;
  dateTo?: string;
  usn?: string;
}) {
  const policy = getActivePolicy();
  const whereClauses: string[] = ['1=1'];
  const params: unknown[] = [];

  if (filters?.departmentId) {
    whereClauses.push('s.department_id = ?');
    params.push(filters.departmentId);
  }
  if (filters?.semesterId) {
    whereClauses.push('s.semester_id = ?');
    params.push(filters.semesterId);
  }
  if (filters?.sectionId) {
    whereClauses.push('s.section_id = ?');
    params.push(filters.sectionId);
  }
  if (filters?.usn) {
    whereClauses.push('(UPPER(s.usn) LIKE UPPER(?) OR UPPER(p.full_name) LIKE UPPER(?))');
    params.push(`%${filters.usn.trim()}%`, `%${filters.usn.trim()}%`);
  }

  const students = db
    .prepare(
      `SELECT
         s.id AS student_id,
         s.usn,
         p.full_name,
         p.email,
         p.phone,
         d.id AS department_id,
         d.code AS department_code,
         d.name AS department_name,
         sem.id AS semester_id,
         sem.name AS semester_name,
         sec.id AS section_id,
         sec.name AS section_name
       FROM students s
       JOIN profiles p ON p.id = s.profile_id
       JOIN departments d ON d.id = s.department_id
       JOIN semesters sem ON sem.id = s.semester_id
       JOIN sections sec ON sec.id = s.section_id
       WHERE ${whereClauses.join(' AND ')}
       ORDER BY s.usn ASC`
    )
    .all(...params) as Array<{
    student_id: number;
    usn: string;
    full_name: string;
    email: string;
    phone: string | null;
    department_id: number;
    department_code: string;
    department_name: string;
    semester_id: number;
    semester_name: string;
    section_id: number;
    section_name: string;
  }>;

  const attWhere: string[] = ["cs.status = 'finalized'", "a.status != 'Pending Review'"];
  const attParams: unknown[] = [];
  if (filters?.subjectId) {
    attWhere.push('cs.subject_id = ?');
    attParams.push(filters.subjectId);
  }
  if (filters?.dateFrom) {
    attWhere.push('cs.session_date >= ?');
    attParams.push(filters.dateFrom);
  }
  if (filters?.dateTo) {
    attWhere.push('cs.session_date <= ?');
    attParams.push(filters.dateTo);
  }

  const attRows = db
    .prepare(
      `SELECT
         a.student_id,
         SUM(CASE WHEN a.status = 'Present' THEN 1 ELSE 0 END) AS present_cnt,
         SUM(CASE WHEN a.status = 'Absent' THEN 1 ELSE 0 END) AS absent_cnt,
         SUM(CASE WHEN a.status = 'Late' THEN 1 ELSE 0 END) AS late_cnt,
         SUM(CASE WHEN a.status = 'Excused' THEN 1 ELSE 0 END) AS excused_cnt
       FROM attendance a
       JOIN class_sessions cs ON cs.id = a.session_id
       WHERE ${attWhere.join(' AND ')}
       GROUP BY a.student_id`
    )
    .all(...attParams) as Array<{
    student_id: number;
    present_cnt: number;
    absent_cnt: number;
    late_cnt: number;
    excused_cnt: number;
  }>;

  const attMap = new Map(attRows.map((r) => [r.student_id, r]));

  return students.map((stu) => {
    const c = attMap.get(stu.student_id);
    const summary = buildMetricSummary(
      {
        present: Number(c?.present_cnt ?? 0),
        absent: Number(c?.absent_cnt ?? 0),
        late: Number(c?.late_cnt ?? 0),
        excused: Number(c?.excused_cnt ?? 0),
      },
      policy
    );
    return {
      studentId: stu.student_id,
      usn: stu.usn,
      fullName: stu.full_name,
      email: stu.email,
      phone: stu.phone,
      departmentId: stu.department_id,
      departmentCode: stu.department_code,
      departmentName: stu.department_name,
      semesterId: stu.semester_id,
      semesterName: stu.semester_name,
      sectionId: stu.section_id,
      sectionName: stu.section_name,
      ...summary,
    };
  });
}
