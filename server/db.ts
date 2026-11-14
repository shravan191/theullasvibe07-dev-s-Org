import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'uniattend.db');
export const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function initializeSchema() {
  db.exec(`
    -- 1. profiles
    CREATE TABLE IF NOT EXISTS profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT,
      password_hash TEXT NOT NULL,
      avatar_url TEXT,
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'suspended')),
      reset_token TEXT,
      reset_expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 2. user_roles
    CREATE TABLE IF NOT EXISTS user_roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student', 'parent')),
      granted_by INTEGER REFERENCES profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (profile_id, role)
    );

    -- 7. departments
    CREATE TABLE IF NOT EXISTS departments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      hod_name TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 8. courses
    CREATE TABLE IF NOT EXISTS courses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      duration_years INTEGER NOT NULL DEFAULT 4,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 9. academic_years
    CREATE TABLE IF NOT EXISTS academic_years (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      label TEXT NOT NULL UNIQUE,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 10. semesters
    CREATE TABLE IF NOT EXISTS semesters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
      course_id INTEGER NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
      number INTEGER NOT NULL,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (academic_year_id, course_id, number)
    );

    -- 11. sections
    CREATE TABLE IF NOT EXISTS sections (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      semester_id INTEGER NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      capacity INTEGER NOT NULL DEFAULT 60,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (semester_id, name)
    );

    -- 3. students
    CREATE TABLE IF NOT EXISTS students (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
      usn TEXT NOT NULL UNIQUE,
      department_id INTEGER NOT NULL REFERENCES departments(id),
      course_id INTEGER NOT NULL REFERENCES courses(id),
      semester_id INTEGER NOT NULL REFERENCES semesters(id),
      section_id INTEGER NOT NULL REFERENCES sections(id),
      admission_year INTEGER NOT NULL,
      face_consent INTEGER NOT NULL DEFAULT 0,
      face_descriptor TEXT,
      face_reference_image TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 4. teachers
    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
      faculty_id TEXT NOT NULL UNIQUE,
      department_id INTEGER NOT NULL REFERENCES departments(id),
      designation TEXT NOT NULL DEFAULT 'Assistant Professor',
      specialization TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 5. parents
    CREATE TABLE IF NOT EXISTS parents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id INTEGER NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
      occupation TEXT,
      preferred_channel TEXT NOT NULL DEFAULT 'email' CHECK (preferred_channel IN ('sms', 'email', 'whatsapp')),
      whatsapp_consent INTEGER NOT NULL DEFAULT 0,
      access_token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 6. student_parents
    CREATE TABLE IF NOT EXISTS student_parents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      parent_id INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      relationship TEXT NOT NULL DEFAULT 'Guardian',
      is_primary INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (student_id, parent_id)
    );

    -- 12. subjects
    CREATE TABLE IF NOT EXISTS subjects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      semester_id INTEGER NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
      section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      code TEXT NOT NULL,
      name TEXT NOT NULL,
      credits INTEGER NOT NULL DEFAULT 4,
      weekly_hours INTEGER NOT NULL DEFAULT 4,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (code, section_id, semester_id)
    );

    -- 13. timetables
    CREATE TABLE IF NOT EXISTS timetables (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      department_id INTEGER NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      semester_id INTEGER NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
      section_id INTEGER NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
      subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      day_of_week TEXT NOT NULL CHECK (day_of_week IN ('Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday')),
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      room_no TEXT NOT NULL DEFAULT 'LH-101',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (section_id, day_of_week, start_time)
    );

    -- 14. class_sessions
    CREATE TABLE IF NOT EXISTS class_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_code TEXT NOT NULL UNIQUE,
      timetable_id INTEGER REFERENCES timetables(id) ON DELETE SET NULL,
      department_id INTEGER NOT NULL REFERENCES departments(id),
      semester_id INTEGER NOT NULL REFERENCES semesters(id),
      section_id INTEGER NOT NULL REFERENCES sections(id),
      subject_id INTEGER NOT NULL REFERENCES subjects(id),
      teacher_id INTEGER NOT NULL REFERENCES teachers(id),
      session_date TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      topic TEXT,
      status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('scheduled', 'in_progress', 'finalized', 'cancelled')),
      finalized_at TEXT,
      finalized_by INTEGER REFERENCES profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (subject_id, section_id, session_date, start_time)
    );

    -- 15. attendance
    CREATE TABLE IF NOT EXISTS attendance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      status TEXT NOT NULL CHECK (status IN ('Present', 'Absent', 'Late', 'Pending Review', 'Excused')),
      marked_by INTEGER REFERENCES profiles(id),
      source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'face_ai')),
      confidence_score REAL,
      liveness_passed INTEGER,
      notes TEXT,
      marked_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (session_id, student_id)
    );

    -- 16. attendance_policies
    CREATE TABLE IF NOT EXISTS attendance_policies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL DEFAULT 'University Standard Policy',
      min_eligible_percent REAL NOT NULL DEFAULT 75.0,
      critical_shortage_percent REAL NOT NULL DEFAULT 65.0,
      late_counts_as_present INTEGER NOT NULL DEFAULT 1,
      excused_counts_as_present INTEGER NOT NULL DEFAULT 1,
      is_active INTEGER NOT NULL DEFAULT 1,
      updated_by INTEGER REFERENCES profiles(id),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 17. notifications
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      attendance_id INTEGER NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
      session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      parent_id INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (attendance_id, parent_id)
    );

    -- 18. notification_logs
    CREATE TABLE IF NOT EXISTS notification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      notification_id INTEGER NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
      parent_id INTEGER NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
      channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'whatsapp')),
      recipient TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
      provider_response TEXT,
      error_message TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      sent_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (notification_id, channel)
    );

    -- 19. audit_logs
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_profile_id INTEGER REFERENCES profiles(id) ON DELETE SET NULL,
      actor_role TEXT NOT NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      previous_state TEXT,
      new_state TEXT,
      reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 20. face_verification_logs
    CREATE TABLE IF NOT EXISTS face_verification_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
      student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
      matched_usn TEXT,
      confidence_score REAL,
      liveness_passed INTEGER NOT NULL DEFAULT 0,
      duplicate_detected INTEGER NOT NULL DEFAULT 0,
      disposition TEXT NOT NULL CHECK (disposition IN ('matched', 'pending_review', 'unrecognized', 'duplicate_rejected', 'teacher_approved', 'teacher_rejected')),
      raw_notes TEXT,
      reviewed_by INTEGER REFERENCES profiles(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- 21. appointments
    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      booking_code TEXT NOT NULL UNIQUE,
      full_name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      requester_role TEXT NOT NULL DEFAULT 'Student',
      reference_id TEXT,
      department_code TEXT NOT NULL,
      appointment_with TEXT NOT NULL,
      preferred_date TEXT NOT NULL,
      preferred_time TEXT NOT NULL,
      purpose TEXT NOT NULL,
      notes TEXT,
      status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Confirmed', 'Completed', 'Cancelled')),
      synced_to_supabase INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- Performance & Relational Indexes
    CREATE INDEX IF NOT EXISTS idx_students_usn ON students(usn);
    CREATE INDEX IF NOT EXISTS idx_students_section ON students(section_id);
    CREATE INDEX IF NOT EXISTS idx_teachers_faculty_id ON teachers(faculty_id);
    CREATE INDEX IF NOT EXISTS idx_subjects_teacher ON subjects(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_timetables_section_day ON timetables(section_id, day_of_week);
    CREATE INDEX IF NOT EXISTS idx_timetables_teacher ON timetables(teacher_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_date_status ON class_sessions(session_date, status);
    CREATE INDEX IF NOT EXISTS idx_sessions_subject ON class_sessions(subject_id, status);
    CREATE INDEX IF NOT EXISTS idx_attendance_session ON attendance(session_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance(student_id);
    CREATE INDEX IF NOT EXISTS idx_notification_logs_status ON notification_logs(status);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_face_logs_session ON face_verification_logs(session_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(preferred_date DESC, created_at DESC);
  `);
}

export function getSupabaseMigrationSql(): string {
  return `-- University Attendance ERP — PostgreSQL / Supabase Migration & Row Level Security Script
-- Generated for all 20 relational tables with PKs, FKs, unique constraints, indexes, and RLS policies.

CREATE TYPE app_role AS ENUM ('admin', 'teacher', 'student', 'parent');
CREATE TYPE session_status AS ENUM ('scheduled', 'in_progress', 'finalized', 'cancelled');
CREATE TYPE attendance_status AS ENUM ('Present', 'Absent', 'Late', 'Pending Review', 'Excused');

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  avatar_url TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_roles (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  granted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (profile_id, role)
);

CREATE TABLE departments (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  hod_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE courses (
  id BIGSERIAL PRIMARY KEY,
  department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  duration_years INT NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE academic_years (
  id BIGSERIAL PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE semesters (
  id BIGSERIAL PRIMARY KEY,
  academic_year_id BIGINT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
  course_id BIGINT NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  number INT NOT NULL,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (academic_year_id, course_id, number)
);

CREATE TABLE sections (
  id BIGSERIAL PRIMARY KEY,
  department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  semester_id BIGINT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  capacity INT NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (semester_id, name)
);

CREATE TABLE students (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  usn TEXT NOT NULL UNIQUE,
  department_id BIGINT NOT NULL REFERENCES departments(id),
  course_id BIGINT NOT NULL REFERENCES courses(id),
  semester_id BIGINT NOT NULL REFERENCES semesters(id),
  section_id BIGINT NOT NULL REFERENCES sections(id),
  admission_year INT NOT NULL,
  face_consent BOOLEAN NOT NULL DEFAULT false,
  face_descriptor TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE teachers (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  faculty_id TEXT NOT NULL UNIQUE,
  department_id BIGINT NOT NULL REFERENCES departments(id),
  designation TEXT NOT NULL DEFAULT 'Assistant Professor',
  specialization TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE parents (
  id BIGSERIAL PRIMARY KEY,
  profile_id UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  occupation TEXT,
  preferred_channel TEXT NOT NULL DEFAULT 'email',
  whatsapp_consent BOOLEAN NOT NULL DEFAULT false,
  access_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE student_parents (
  id BIGSERIAL PRIMARY KEY,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id BIGINT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  relationship TEXT NOT NULL DEFAULT 'Guardian',
  is_primary BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (student_id, parent_id)
);

CREATE TABLE subjects (
  id BIGSERIAL PRIMARY KEY,
  department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  semester_id BIGINT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  teacher_id BIGINT NOT NULL REFERENCES teachers(id),
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  credits INT NOT NULL DEFAULT 4,
  weekly_hours INT NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (code, section_id, semester_id)
);

CREATE TABLE timetables (
  id BIGSERIAL PRIMARY KEY,
  department_id BIGINT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  semester_id BIGINT NOT NULL REFERENCES semesters(id) ON DELETE CASCADE,
  section_id BIGINT NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
  subject_id BIGINT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  teacher_id BIGINT NOT NULL REFERENCES teachers(id),
  day_of_week TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  room_no TEXT NOT NULL DEFAULT 'LH-101',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (section_id, day_of_week, start_time)
);

CREATE TABLE class_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_code TEXT NOT NULL UNIQUE,
  timetable_id BIGINT REFERENCES timetables(id) ON DELETE SET NULL,
  department_id BIGINT NOT NULL REFERENCES departments(id),
  semester_id BIGINT NOT NULL REFERENCES semesters(id),
  section_id BIGINT NOT NULL REFERENCES sections(id),
  subject_id BIGINT NOT NULL REFERENCES subjects(id),
  teacher_id BIGINT NOT NULL REFERENCES teachers(id),
  session_date DATE NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  topic TEXT,
  status session_status NOT NULL DEFAULT 'in_progress',
  finalized_at TIMESTAMPTZ,
  finalized_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (subject_id, section_id, session_date, start_time)
);

CREATE TABLE attendance (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status attendance_status NOT NULL,
  marked_by UUID REFERENCES profiles(id),
  source TEXT NOT NULL DEFAULT 'manual',
  confidence_score DOUBLE PRECISION,
  liveness_passed BOOLEAN,
  notes TEXT,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, student_id)
);

CREATE TABLE attendance_policies (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT 'University Standard Policy',
  min_eligible_percent NUMERIC(5,2) NOT NULL DEFAULT 75.00,
  critical_shortage_percent NUMERIC(5,2) NOT NULL DEFAULT 65.00,
  late_counts_as_present BOOLEAN NOT NULL DEFAULT true,
  excused_counts_as_present BOOLEAN NOT NULL DEFAULT true,
  is_active BOOLEAN NOT NULL DEFAULT true,
  updated_by UUID REFERENCES profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notifications (
  id BIGSERIAL PRIMARY KEY,
  attendance_id BIGINT NOT NULL REFERENCES attendance(id) ON DELETE CASCADE,
  session_id BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  student_id BIGINT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  parent_id BIGINT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (attendance_id, parent_id)
);

CREATE TABLE notification_logs (
  id BIGSERIAL PRIMARY KEY,
  notification_id BIGINT NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  parent_id BIGINT NOT NULL REFERENCES parents(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('sms', 'email', 'whatsapp')),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_response TEXT,
  error_message TEXT,
  retry_count INT NOT NULL DEFAULT 0,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (notification_id, channel)
);

CREATE TABLE audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  previous_state JSONB,
  new_state JSONB,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE face_verification_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES class_sessions(id) ON DELETE CASCADE,
  student_id BIGINT REFERENCES students(id) ON DELETE SET NULL,
  matched_usn TEXT,
  confidence_score DOUBLE PRECISION,
  liveness_passed BOOLEAN NOT NULL DEFAULT false,
  duplicate_detected BOOLEAN NOT NULL DEFAULT false,
  disposition TEXT NOT NULL,
  raw_notes TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE parents ENABLE ROW LEVEL SECURITY;
ALTER TABLE class_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION has_role(uid UUID, target_role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_roles WHERE profile_id = uid AND role = target_role
  );
$$;

CREATE POLICY "Admin full access students" ON students
  FOR ALL USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Students view own record" ON students
  FOR SELECT USING (profile_id = auth.uid());

CREATE POLICY "Parents view linked student" ON students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM student_parents sp
      JOIN parents p ON p.id = sp.parent_id
      WHERE sp.student_id = students.id AND p.profile_id = auth.uid()
    )
  );

CREATE POLICY "Students view own attendance" ON attendance
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM students s WHERE s.id = attendance.student_id AND s.profile_id = auth.uid()
    )
  );

CREATE POLICY "Teachers manage assigned session attendance" ON attendance
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM class_sessions cs
      JOIN teachers t ON t.id = cs.teacher_id
      WHERE cs.id = attendance.session_id AND t.profile_id = auth.uid()
    )
  );
`;
}
