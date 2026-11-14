import crypto from 'node:crypto';
import { db, initializeSchema } from './db.ts';
import { hashPassword } from './auth.ts';
import { formatAbsenceMessage } from './notifications.ts';

function formatDateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

export function seedDatabaseIfEmpty() {
  initializeSchema();

  const existingCount = (db.prepare(`SELECT COUNT(*) AS cnt FROM profiles`).get() as { cnt: number }).cnt;
  if (existingCount > 0) {
    return;
  }

  const runSeed = db.transaction(() => {
    // 1. Attendance Policy
    db.prepare(
      `INSERT INTO attendance_policies (name, min_eligible_percent, critical_shortage_percent, late_counts_as_present, excused_counts_as_present, is_active)
       VALUES (?, ?, ?, ?, ?, 1)`
    ).run('University Standard Policy (AY 2026-27)', 75, 65, 1, 1);

    // 2. Academic Year
    const ayId = Number(
      db
        .prepare(
          `INSERT INTO academic_years (label, start_date, end_date, is_current)
           VALUES (?, ?, ?, 1)`
        )
        .run('2026-2027', '2026-08-01', '2027-05-31').lastInsertRowid
    );

    // 3. Departments
    const deptCseId = Number(
      db
        .prepare(`INSERT INTO departments (code, name, hod_name) VALUES (?, ?, ?)`)
        .run('CSE', 'Computer Science & Engineering', 'Dr. Vikramaditya Rao').lastInsertRowid
    );
    const deptDsaiId = Number(
      db
        .prepare(`INSERT INTO departments (code, name, hod_name) VALUES (?, ?, ?)`)
        .run('DSAI', 'Data Science & Artificial Intelligence', 'Dr. Kavitha Deshmukh').lastInsertRowid
    );
    const deptEceId = Number(
      db
        .prepare(`INSERT INTO departments (code, name, hod_name) VALUES (?, ?, ?)`)
        .run('ECE', 'Electronics & Communication', 'Prof. Arvind Krishnan').lastInsertRowid
    );

    // 4. Courses
    const courseCseId = Number(
      db
        .prepare(`INSERT INTO courses (department_id, code, name, duration_years) VALUES (?, ?, ?, 4)`)
        .run(deptCseId, 'BTECH-CSE', 'B.Tech in Computer Science & Engineering').lastInsertRowid
    );
    const courseDsaiId = Number(
      db
        .prepare(`INSERT INTO courses (department_id, code, name, duration_years) VALUES (?, ?, ?, 4)`)
        .run(deptDsaiId, 'BTECH-AI', 'B.Tech in AI & Data Science').lastInsertRowid
    );
    const courseEceId = Number(
      db
        .prepare(`INSERT INTO courses (department_id, code, name, duration_years) VALUES (?, ?, ?, 4)`)
        .run(deptEceId, 'BTECH-ECE', 'B.Tech in Electronics & Communication').lastInsertRowid
    );

    // 5. Semesters
    const sem5CseId = Number(
      db
        .prepare(
          `INSERT INTO semesters (academic_year_id, course_id, number, name, start_date, end_date, is_active)
           VALUES (?, ?, 5, 'Semester 5 (Odd)', '2026-08-01', '2026-12-20', 1)`
        )
        .run(ayId, courseCseId).lastInsertRowid
    );
    const sem5DsaiId = Number(
      db
        .prepare(
          `INSERT INTO semesters (academic_year_id, course_id, number, name, start_date, end_date, is_active)
           VALUES (?, ?, 5, 'Semester 5 (Odd)', '2026-08-01', '2026-12-20', 1)`
        )
        .run(ayId, courseDsaiId).lastInsertRowid
    );
    const sem3EceId = Number(
      db
        .prepare(
          `INSERT INTO semesters (academic_year_id, course_id, number, name, start_date, end_date, is_active)
           VALUES (?, ?, 3, 'Semester 3 (Odd)', '2026-08-01', '2026-12-20', 1)`
        )
        .run(ayId, courseEceId).lastInsertRowid
    );

    // 6. Sections
    const secCse5aId = Number(
      db
        .prepare(`INSERT INTO sections (department_id, semester_id, name, capacity) VALUES (?, ?, ?, 60)`)
        .run(deptCseId, sem5CseId, 'CSE-5A').lastInsertRowid
    );
    const secCse5bId = Number(
      db
        .prepare(`INSERT INTO sections (department_id, semester_id, name, capacity) VALUES (?, ?, ?, 60)`)
        .run(deptCseId, sem5CseId, 'CSE-5B').lastInsertRowid
    );
    const secDsai5aId = Number(
      db
        .prepare(`INSERT INTO sections (department_id, semester_id, name, capacity) VALUES (?, ?, ?, 60)`)
        .run(deptDsaiId, sem5DsaiId, 'DSAI-5A').lastInsertRowid
    );
    const secEce3aId = Number(
      db
        .prepare(`INSERT INTO sections (department_id, semester_id, name, capacity) VALUES (?, ?, ?, 60)`)
        .run(deptEceId, sem3EceId, 'ECE-3A').lastInsertRowid
    );

    const insertProfile = db.prepare(
      `INSERT INTO profiles (full_name, email, phone, password_hash, status) VALUES (?, ?, ?, ?, 'active')`
    );
    const insertRole = db.prepare(`INSERT INTO user_roles (profile_id, role) VALUES (?, ?)`);

    // 7. Admin User
    const adminPass = hashPassword('Admin@123');
    const adminProfileId = Number(
      insertProfile.run('Dr. Siddharth Menon', 'admin@uniattend.edu', '+919845000001', adminPass)
        .lastInsertRowid
    );
    insertRole.run(adminProfileId, 'admin');

    // 8. Teachers
    const teacherPass = hashPassword('Teacher@123');
    const t1ProfileId = Number(
      insertProfile.run('Dr. Ananya Sharma', 'ananya.sharma@uniattend.edu', '+919845001101', teacherPass)
        .lastInsertRowid
    );
    insertRole.run(t1ProfileId, 'teacher');
    const teacher1Id = Number(
      db
        .prepare(
          `INSERT INTO teachers (profile_id, faculty_id, department_id, designation, specialization)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(t1ProfileId, 'FAC-101', deptCseId, 'Associate Professor', 'Database Systems & AI').lastInsertRowid
    );

    const t2ProfileId = Number(
      insertProfile.run('Prof. Rajesh Verma', 'rajesh.verma@uniattend.edu', '+919845001102', teacherPass)
        .lastInsertRowid
    );
    insertRole.run(t2ProfileId, 'teacher');
    const teacher2Id = Number(
      db
        .prepare(
          `INSERT INTO teachers (profile_id, faculty_id, department_id, designation, specialization)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(t2ProfileId, 'FAC-102', deptCseId, 'Assistant Professor', 'Algorithms & Applied Statistics')
        .lastInsertRowid
    );

    const t3ProfileId = Number(
      insertProfile.run('Dr. Meera Nair', 'meera.nair@uniattend.edu', '+919845001103', teacherPass)
        .lastInsertRowid
    );
    insertRole.run(t3ProfileId, 'teacher');
    const teacher3Id = Number(
      db
        .prepare(
          `INSERT INTO teachers (profile_id, faculty_id, department_id, designation, specialization)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(t3ProfileId, 'FAC-103', deptDsaiId, 'Professor', 'Machine Learning & Neural Systems')
        .lastInsertRowid
    );

    // 9. Subjects
    const subDbmsId = Number(
      db
        .prepare(
          `INSERT INTO subjects (department_id, semester_id, section_id, teacher_id, code, name, credits, weekly_hours)
           VALUES (?, ?, ?, ?, ?, ?, 4, 4)`
        )
        .run(deptCseId, sem5CseId, secCse5aId, teacher1Id, 'CS501', 'Database Management Systems')
        .lastInsertRowid
    );
    const subDsaId = Number(
      db
        .prepare(
          `INSERT INTO subjects (department_id, semester_id, section_id, teacher_id, code, name, credits, weekly_hours)
           VALUES (?, ?, ?, ?, ?, ?, 4, 4)`
        )
        .run(deptCseId, sem5CseId, secCse5aId, teacher2Id, 'CS502', 'Data Structures & Algorithms')
        .lastInsertRowid
    );
    const subStatsId = Number(
      db
        .prepare(
          `INSERT INTO subjects (department_id, semester_id, section_id, teacher_id, code, name, credits, weekly_hours)
           VALUES (?, ?, ?, ?, ?, ?, 3, 3)`
        )
        .run(deptCseId, sem5CseId, secCse5aId, teacher2Id, 'MA503', 'Probability & Statistics')
        .lastInsertRowid
    );
    const subAiId = Number(
      db
        .prepare(
          `INSERT INTO subjects (department_id, semester_id, section_id, teacher_id, code, name, credits, weekly_hours)
           VALUES (?, ?, ?, ?, ?, ?, 4, 4)`
        )
        .run(deptCseId, sem5CseId, secCse5aId, teacher1Id, 'CS504', 'Artificial Intelligence')
        .lastInsertRowid
    );
    const subCse5bDbmsId = Number(
      db
        .prepare(
          `INSERT INTO subjects (department_id, semester_id, section_id, teacher_id, code, name, credits, weekly_hours)
           VALUES (?, ?, ?, ?, ?, ?, 4, 4)`
        )
        .run(deptCseId, sem5CseId, secCse5bId, teacher1Id, 'CS501', 'Database Management Systems')
        .lastInsertRowid
    );
    const subDsaiMlId = Number(
      db
        .prepare(
          `INSERT INTO subjects (department_id, semester_id, section_id, teacher_id, code, name, credits, weekly_hours)
           VALUES (?, ?, ?, ?, ?, ?, 4, 4)`
        )
        .run(deptDsaiId, sem5DsaiId, secDsai5aId, teacher3Id, 'AI501', 'Statistical Machine Learning')
        .lastInsertRowid
    );
    const subEceSigId = Number(
      db
        .prepare(
          `INSERT INTO subjects (department_id, semester_id, section_id, teacher_id, code, name, credits, weekly_hours)
           VALUES (?, ?, ?, ?, ?, ?, 4, 4)`
        )
        .run(deptEceId, sem3EceId, secEce3aId, teacher3Id, 'EC301', 'Signals & Systems')
        .lastInsertRowid
    );

    // 10. Timetables (Includes Monday 9-10 DBMS, 10-11 DSA, 11-12 Statistics, 1-2 AI + full Tue-Sat schedule so Today always has slots!)
    const insertTt = db.prepare(
      `INSERT INTO timetables (department_id, semester_id, section_id, subject_id, teacher_id, day_of_week, start_time, end_time, room_no)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const days: Array<'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday' | 'Saturday'> = [
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    const ttCse5aIds: Record<string, number[]> = {};
    for (const day of days) {
      const id1 = Number(
        insertTt.run(deptCseId, sem5CseId, secCse5aId, subDbmsId, teacher1Id, day, '09:00', '10:00', 'LH-301')
          .lastInsertRowid
      );
      const id2 = Number(
        insertTt.run(deptCseId, sem5CseId, secCse5aId, subDsaId, teacher2Id, day, '10:00', '11:00', 'LH-301')
          .lastInsertRowid
      );
      const id3 = Number(
        insertTt.run(deptCseId, sem5CseId, secCse5aId, subStatsId, teacher2Id, day, '11:00', '12:00', 'LH-302')
          .lastInsertRowid
      );
      const id4 = Number(
        insertTt.run(deptCseId, sem5CseId, secCse5aId, subAiId, teacher1Id, day, '13:00', '14:00', 'AI-Lab-1')
          .lastInsertRowid
      );
      ttCse5aIds[day] = [id1, id2, id3, id4];

      // Secondary sections
      insertTt.run(deptCseId, sem5CseId, secCse5bId, subCse5bDbmsId, teacher1Id, day, '14:00', '15:00', 'LH-304');
      insertTt.run(deptDsaiId, sem5DsaiId, secDsai5aId, subDsaiMlId, teacher3Id, day, '09:00', '10:00', 'DS-201');
      insertTt.run(deptEceId, sem3EceId, secEce3aId, subEceSigId, teacher3Id, day, '11:00', '12:00', 'EC-105');
    }

    // 11. Students + Parents
    const studentPass = hashPassword('Student@123');
    const parentPass = hashPassword('Parent@123');

    const studentSeedList = [
      {
        usn: '1MS24CS001',
        name: 'Aarav Mehta',
        email: 'aarav.mehta@uniattend.edu',
        phone: '+919845110001',
        dept: deptCseId,
        course: courseCseId,
        sem: sem5CseId,
        sec: secCse5aId,
        consent: 1,
        descriptor: 'Oval face, short dark hair, rectangular eyeglasses, warm medium skin tone.',
        parentName: 'Rajiv Mehta',
        parentEmail: 'parent.mehta@uniattend.edu',
        parentPhone: '+919845220001',
        relationship: 'Father',
        whatsappConsent: 1,
        // ~88% attendance
        targetRate: 0.88,
      },
      {
        usn: '1MS24CS002',
        name: 'Diya Kulkarni',
        email: 'diya.kulkarni@uniattend.edu',
        phone: '+919845110002',
        dept: deptCseId,
        course: courseCseId,
        sem: sem5CseId,
        sec: secCse5aId,
        consent: 1,
        descriptor: 'Round face, shoulder-length wavy black hair, no glasses.',
        parentName: 'Sunita Kulkarni',
        parentEmail: 'parent.kulkarni@uniattend.edu',
        parentPhone: '+919845220002',
        relationship: 'Mother',
        whatsappConsent: 1,
        // ~71% Shortage Warning
        targetRate: 0.71,
      },
      {
        usn: '1MS24CS003',
        name: 'Rohan Iyer',
        email: 'rohan.iyer@uniattend.edu',
        phone: '+919845110003',
        dept: deptCseId,
        course: courseCseId,
        sem: sem5CseId,
        sec: secCse5aId,
        consent: 1,
        descriptor: 'Square jawline, short parted hair, light beard.',
        parentName: 'Venkatesh Iyer',
        parentEmail: 'parent.iyer@uniattend.edu',
        parentPhone: '+919845220003',
        relationship: 'Father',
        whatsappConsent: 0,
        // ~58% Critical Shortage
        targetRate: 0.58,
      },
      {
        usn: '1MS24CS004',
        name: 'Sneha Reddy',
        email: 'sneha.reddy@uniattend.edu',
        phone: '+919845110004',
        dept: deptCseId,
        course: courseCseId,
        sem: sem5CseId,
        sec: secCse5aId,
        consent: 1,
        descriptor: 'Oval face, braided dark hair, silver earrings.',
        parentName: 'Prakash Reddy',
        parentEmail: 'parent.reddy@uniattend.edu',
        parentPhone: '+919845220004',
        relationship: 'Father',
        whatsappConsent: 1,
        targetRate: 0.92,
      },
      {
        usn: '1MS24CS005',
        name: 'Kabir Malhotra',
        email: 'kabir.malhotra@uniattend.edu',
        phone: '+919845110005',
        dept: deptCseId,
        course: courseCseId,
        sem: sem5CseId,
        sec: secCse5aId,
        consent: 0,
        descriptor: null,
        parentName: 'Neha Malhotra',
        parentEmail: 'parent.malhotra@uniattend.edu',
        parentPhone: '+919845220005',
        relationship: 'Mother',
        whatsappConsent: 1,
        targetRate: 0.79,
      },
      {
        usn: '1MS24CS006',
        name: 'Ananya Chatterjee',
        email: 'ananya.c@uniattend.edu',
        phone: '+919845110006',
        dept: deptCseId,
        course: courseCseId,
        sem: sem5CseId,
        sec: secCse5aId,
        consent: 1,
        descriptor: 'Heart-shaped face, round glasses, shoulder-length straight hair.',
        parentName: 'Subhash Chatterjee',
        parentEmail: 'parent.chatterjee@uniattend.edu',
        parentPhone: '+919845220006',
        relationship: 'Father',
        whatsappConsent: 1,
        targetRate: 0.84,
      },
      {
        usn: '1MS24CS007',
        name: 'Vikram Joshi',
        email: 'vikram.joshi@uniattend.edu',
        phone: '+919845110007',
        dept: deptCseId,
        course: courseCseId,
        sem: sem5CseId,
        sec: secCse5bId,
        consent: 1,
        descriptor: 'Tall forehead, short cropped hair.',
        parentName: 'Mahesh Joshi',
        parentEmail: 'parent.joshi@uniattend.edu',
        parentPhone: '+919845220007',
        relationship: 'Father',
        whatsappConsent: 1,
        targetRate: 0.85,
      },
      {
        usn: '1MS24CS008',
        name: 'Meghna Bhat',
        email: 'meghna.bhat@uniattend.edu',
        phone: '+919845110008',
        dept: deptCseId,
        course: courseCseId,
        sem: sem5CseId,
        sec: secCse5bId,
        consent: 1,
        descriptor: 'Oval face, tied ponytail.',
        parentName: 'Shankar Bhat',
        parentEmail: 'parent.bhat@uniattend.edu',
        parentPhone: '+919845220008',
        relationship: 'Father',
        whatsappConsent: 0,
        targetRate: 0.69,
      },
      {
        usn: '1MS24AI001',
        name: 'Ishaan Verma',
        email: 'ishaan.verma@uniattend.edu',
        phone: '+919845110009',
        dept: deptDsaiId,
        course: courseDsaiId,
        sem: sem5DsaiId,
        sec: secDsai5aId,
        consent: 1,
        descriptor: 'Oval face, thin rimless glasses.',
        parentName: 'Deepak Verma',
        parentEmail: 'parent.verma@uniattend.edu',
        parentPhone: '+919845220009',
        relationship: 'Father',
        whatsappConsent: 1,
        targetRate: 0.91,
      },
      {
        usn: '1MS24EC001',
        name: 'Tanvi Nair',
        email: 'tanvi.nair@uniattend.edu',
        phone: '+919845110010',
        dept: deptEceId,
        course: courseEceId,
        sem: sem3EceId,
        sec: secEce3aId,
        consent: 1,
        descriptor: 'Round face, dark curly hair.',
        parentName: 'Suresh Nair',
        parentEmail: 'parent.nair@uniattend.edu',
        parentPhone: '+919845220010',
        relationship: 'Father',
        whatsappConsent: 1,
        targetRate: 0.62,
      },
    ];

    const createdStudents: Array<{
      id: number;
      usn: string;
      name: string;
      sec: number;
      targetRate: number;
      parentId: number;
      parentEmail: string;
      parentPhone: string;
      deptName: string;
    }> = [];

    for (const s of studentSeedList) {
      const stuProfileId = Number(
        insertProfile.run(s.name, s.email, s.phone, studentPass).lastInsertRowid
      );
      insertRole.run(stuProfileId, 'student');

      const stuId = Number(
        db
          .prepare(
            `INSERT INTO students (profile_id, usn, department_id, course_id, semester_id, section_id, admission_year, face_consent, face_descriptor)
             VALUES (?, ?, ?, ?, ?, ?, 2024, ?, ?)`
          )
          .run(stuProfileId, s.usn, s.dept, s.course, s.sem, s.sec, s.consent, s.descriptor)
          .lastInsertRowid
      );

      const parProfileId = Number(
        insertProfile.run(s.parentName, s.parentEmail, s.parentPhone, parentPass).lastInsertRowid
      );
      insertRole.run(parProfileId, 'parent');

      const token =
        s.usn === '1MS24CS001'
          ? 'parent-demo-token-cs001'
          : s.usn === '1MS24CS002'
          ? 'parent-demo-token-cs002'
          : crypto.randomUUID();

      const parId = Number(
        db
          .prepare(
            `INSERT INTO parents (profile_id, occupation, preferred_channel, whatsapp_consent, access_token)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(parProfileId, 'Parent / Guardian', 'email', s.whatsappConsent, token).lastInsertRowid
      );

      db.prepare(
        `INSERT INTO student_parents (student_id, parent_id, relationship, is_primary) VALUES (?, ?, ?, 1)`
      ).run(stuId, parId, s.relationship);

      const deptName =
        s.dept === deptCseId
          ? 'Computer Science & Engineering'
          : s.dept === deptDsaiId
          ? 'Data Science & Artificial Intelligence'
          : 'Electronics & Communication';

      createdStudents.push({
        id: stuId,
        usn: s.usn,
        name: s.name,
        sec: s.sec,
        targetRate: s.targetRate,
        parentId: parId,
        parentEmail: s.parentEmail,
        parentPhone: s.parentPhone,
        deptName,
      });
    }

    // 12. Historical Finalized Class Sessions (past 21 days so Monthly/Weekly/Daily reports are rich & real)
    const insertSession = db.prepare(
      `INSERT INTO class_sessions (session_code, timetable_id, department_id, semester_id, section_id, subject_id, teacher_id, session_date, start_time, end_time, topic, status, finalized_at, finalized_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'finalized', ?, ?)`
    );
    const insertAtt = db.prepare(
      `INSERT INTO attendance (session_id, student_id, status, marked_by, source, confidence_score, liveness_passed, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    );

    const cse5aSubjects = [
      { id: subDbmsId, code: 'CS501', name: 'Database Management Systems', teacherId: teacher1Id, teacherProf: t1ProfileId, start: '09:00', end: '10:00', topics: ['ER Modeling & Normalization', 'B+ Tree Indexing', 'ACID Transactions & Locking', 'Query Optimization', 'Distributed Databases'] },
      { id: subDsaId, code: 'CS502', name: 'Data Structures & Algorithms', teacherId: teacher2Id, teacherProf: t2ProfileId, start: '10:00', end: '11:00', topics: ['AVL & Red-Black Trees', 'Graph Shortest Paths', 'Dynamic Programming', 'Greedy Interval Scheduling', 'Minimum Spanning Trees'] },
      { id: subStatsId, code: 'MA503', name: 'Probability & Statistics', teacherId: teacher2Id, teacherProf: t2ProfileId, start: '11:00', end: '12:00', topics: ['Random Variables', 'Hypothesis Testing', 'Chi-Square Distributions', 'Linear Regression', 'Bayesian Inference'] },
      { id: subAiId, code: 'CS504', name: 'Artificial Intelligence', teacherId: teacher1Id, teacherProf: t1ProfileId, start: '13:00', end: '14:00', topics: ['A* Heuristic Search', 'Minimax & Alpha-Beta', 'Propositional Logic', 'Markov Decision Processes', 'Constraint Satisfaction'] },
    ];

    const cse5aStudents = createdStudents.filter((s) => s.sec === secCse5aId);
    const cse5bStudents = createdStudents.filter((s) => s.sec === secCse5bId);
    const dsaiStudents = createdStudents.filter((s) => s.sec === secDsai5aId);
    const eceStudents = createdStudents.filter((s) => s.sec === secEce3aId);

    const sampleNotificationIds: Array<{
      attId: number;
      sessId: number;
      student: (typeof createdStudents)[number];
      subName: string;
      date: string;
      start: string;
      end: string;
      idx: number;
    }> = [];

    // Generate 8 historical class days spread across last 3 weeks (excluding today so today is fresh for taking attendance!)
    const offsets = [28, 25, 22, 18, 14, 10, 6, 2];
    offsets.forEach((daysAgo, dayIdx) => {
      const dateStr = formatDateOffset(daysAgo);

      cse5aSubjects.forEach((sub, subIdx) => {
        const sessionCode = `SES-${dateStr.replace(/-/g, '')}-${sub.code}-5A`;
        const ttId = ttCse5aIds['Monday']?.[subIdx] ?? null;
        const sessId = Number(
          insertSession.run(
            sessionCode,
            ttId,
            deptCseId,
            sem5CseId,
            secCse5aId,
            sub.id,
            sub.teacherId,
            dateStr,
            sub.start,
            sub.end,
            sub.topics[dayIdx % sub.topics.length],
            `${dateStr} ${sub.end}:00`,
            sub.teacherProf
          ).lastInsertRowid
        );

        cse5aStudents.forEach((stu, stuIdx) => {
          // Deterministic distribution matching each student's targetRate across subjects
          const totalIdx = dayIdx * cse5aSubjects.length + subIdx;
          let status: 'Present' | 'Absent' | 'Late' | 'Excused' = 'Present';
          if (stu.usn === '1MS24CS001') {
            // 28/32 = 87.50%
            if ([5, 13, 21, 29].includes(totalIdx)) status = 'Absent';
          } else if (stu.usn === '1MS24CS002') {
            // 23/32 = 71.88% (Shortage Warning)
            if (totalIdx % 3 === 1 && totalIdx < 27) status = 'Absent';
          } else if (stu.usn === '1MS24CS003') {
            // 19/32 = 59.38% (Critical Shortage)
            if (totalIdx % 2 === 1 && totalIdx < 26) status = 'Absent';
          } else {
            const threshold = Math.round(stu.targetRate * 10);
            if ((totalIdx + stuIdx) % 10 >= threshold) {
              status = 'Absent';
            } else if ((totalIdx + stuIdx) % 17 === 0) {
              status = 'Late';
            }
          }

          const useAi = subIdx === 0 && dayIdx % 2 === 0 && stu.usn !== '1MS24CS005';
          const attId = Number(
            insertAtt.run(
              sessId,
              stu.id,
              status,
              sub.teacherProf,
              useAi ? 'face_ai' : 'manual',
              useAi ? 0.94 : null,
              useAi ? 1 : null,
              status === 'Late' ? 'Arrived 7 mins after bell' : null
            ).lastInsertRowid
          );

          if (status === 'Absent' && daysAgo <= 10) {
            sampleNotificationIds.push({
              attId,
              sessId,
              student: stu,
              subName: sub.name,
              date: dateStr,
              start: sub.start,
              end: sub.end,
              idx: sampleNotificationIds.length,
            });
          }
        });
      });

      // Also record CSE-5B, DSAI-5A, ECE-3A sessions on even indices
      if (dayIdx % 2 === 0) {
        const s5b = Number(
          insertSession.run(
            `SES-${dateStr.replace(/-/g, '')}-CS501-5B`,
            null,
            deptCseId,
            sem5CseId,
            secCse5bId,
            subCse5bDbmsId,
            teacher1Id,
            dateStr,
            '14:00',
            '15:00',
            'Relational Algebra & SQL Joins',
            `${dateStr} 15:00:00`,
            t1ProfileId
          ).lastInsertRowid
        );
        for (const stu of cse5bStudents) {
          const st = stu.usn === '1MS24CS008' && dayIdx === 2 ? 'Absent' : 'Present';
          insertAtt.run(s5b, stu.id, st, t1ProfileId, 'manual', null, null, null);
        }

        const sDsai = Number(
          insertSession.run(
            `SES-${dateStr.replace(/-/g, '')}-AI501-DS`,
            null,
            deptDsaiId,
            sem5DsaiId,
            secDsai5aId,
            subDsaiMlId,
            teacher3Id,
            dateStr,
            '09:00',
            '10:00',
            'Gradient Descent & Regularization',
            `${dateStr} 10:00:00`,
            t3ProfileId
          ).lastInsertRowid
        );
        for (const stu of dsaiStudents) {
          insertAtt.run(sDsai, stu.id, 'Present', t3ProfileId, 'manual', null, null, null);
        }

        const sEce = Number(
          insertSession.run(
            `SES-${dateStr.replace(/-/g, '')}-EC301-EC`,
            null,
            deptEceId,
            sem3EceId,
            secEce3aId,
            subEceSigId,
            teacher3Id,
            dateStr,
            '11:00',
            '12:00',
            'Fourier Transform Applications',
            `${dateStr} 12:00:00`,
            t3ProfileId
          ).lastInsertRowid
        );
        for (const stu of eceStudents) {
          const st = dayIdx === 2 || dayIdx === 4 ? 'Absent' : 'Present';
          insertAtt.run(sEce, stu.id, st, t3ProfileId, 'manual', null, null, null);
        }
      }
    });

    // 13. Seed Notifications + Notification Logs for recent finalized absences
    const insertNotif = db.prepare(
      `INSERT INTO notifications (attendance_id, session_id, student_id, parent_id, title, message, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    );
    const insertLog = db.prepare(
      `INSERT INTO notification_logs (notification_id, parent_id, channel, recipient, status, provider_response, error_message, sent_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );

    for (const item of sampleNotificationIds.slice(0, 12)) {
      const title = `Absence Alert: ${item.student.name} (${item.student.usn}) — ${item.subName}`;
      const message = formatAbsenceMessage({
        attendanceId: item.attId,
        studentId: item.student.id,
        studentName: item.student.name,
        usn: item.student.usn,
        departmentName: item.student.deptName,
        subjectName: item.subName,
        sessionDate: item.date,
        startTime: item.start,
        endTime: item.end,
      });

      const notifId = Number(
        insertNotif.run(
          item.attId,
          item.sessId,
          item.student.id,
          item.student.parentId,
          title,
          message,
          `${item.date} ${item.end}:05`
        ).lastInsertRowid
      );

      const isFailedDemo = item.idx % 4 === 3;
      insertLog.run(
        notifId,
        item.student.parentId,
        'email',
        item.student.parentEmail,
        isFailedDemo ? 'failed' : 'sent',
        isFailedDemo ? null : 'Delivered via Resend gateway',
        isFailedDemo ? 'Temporary SMTP timeout (retry available)' : null,
        isFailedDemo ? null : `${item.date} ${item.end}:06`,
        `${item.date} ${item.end}:05`
      );
      insertLog.run(
        notifId,
        item.student.parentId,
        'sms',
        item.student.parentPhone,
        'sent',
        'Dispatched via MSG91 flow',
        null,
        `${item.date} ${item.end}:06`,
        `${item.date} ${item.end}:05`
      );
    }

    // 14. Initial Audit Log
    db.prepare(
      `INSERT INTO audit_logs (actor_profile_id, actor_role, action, entity_type, entity_id, new_state, reason)
       VALUES (?, 'admin', 'POLICY_INITIALIZED', 'attendance_policies', '1', ?, 'Initial academic year attendance threshold setup')`
    ).run(adminProfileId, JSON.stringify({ minEligiblePercent: 75, criticalShortagePercent: 65 }));
  });

  runSeed();
}
