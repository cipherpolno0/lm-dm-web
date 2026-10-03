# Education Schema — โดเมนนักธรรม/ธรรมศึกษา/บาลี (M2)

Phase: P2 Database & Sangha Domain — งาน "ออกแบบโดเมนนักธรรม/ธรรมศึกษา/บาลี"
ขอบเขตตามที่ระบุ: **programs, levels, subjects, curriculum, academic years, exam
sessions, exam centers และ relationships** — ตรงกับโมดูล M2 (หลักสูตรและระดับการศึกษา)
ใน requirements.md

Implementation อยู่ใน `prisma/schema.prisma` (ต่อจาก P2 org-domain) และ
`prisma/migrations/20260923141654_education_domain/migration.sql` — เอกสารนี้อธิบาย
ทุกตาราง/คอลัมน์/constraint พร้อมเหตุผลการออกแบบ และ function specification ของ
operation หลัก

## ขอบเขตและสิ่งที่ตั้งใจไม่รวม (Out of Scope)

- **คลังข้อสอบจริง** (โจทย์ข้อสอบ, versioning ของโจทย์, workflow อนุมัติ) — เป็น M3
  (คลังข้อสอบ) คนละโมดูล จะออกแบบแยกในงานถัดไป
- **การจัดสอบ/บันทึกคะแนนนักเรียนรายบุคคล** (ใบสมัครสอบ, การตรวจข้อสอบ, ผลสอบรายคน)
  — เป็น M4 (แบบทดสอบ/จัดสอบ) โมดูลนี้ออกแบบเฉพาะ **โครงสร้างอ้างอิง** (reference
  structure: มีระดับชั้นอะไรบ้าง, วิชาอะไรบ้าง, สอบวันไหน, ที่ไหน) ที่ M3/M4 จะต้องอ้างอิง
  ภายหลัง ไม่ใช่ตัวข้อมูลการสอบจริงของนักเรียนแต่ละคน
- **ทะเบียนนักเรียน/ผู้เข้าสอบ** — ผูกกับ `Person` (stub จาก P2 org-domain) หรือทะเบียน
  ฉบับเต็มในอนาคต ไม่ได้ออกแบบในงานนี้

## หลักการออกแบบสำคัญ (Key Design Decisions)

1. **ไม่ hard-code ชั้น/ปี ตามที่ระบุในวิธีตรวจสอบ** — `Level` (ระดับชั้น) และ
   `AcademicYear` (ปีการศึกษา) เป็น**ตารางข้อมูล ไม่ใช่ enum** เพิ่มปีการศึกษาใหม่ทุกปี
   หรือเพิ่มระดับชั้นใหม่ทำได้ด้วย `INSERT` ธรรมดา ไม่ต้อง migrate schema — **ทดสอบจริง
   แล้ว**: เพิ่มปีการศึกษาใหม่ (2569) และสร้างรอบสอบปีนั้นโดยใช้หลักสูตรเดิม สำเร็จโดยไม่
   ต้องแก้ schema/โค้ดเลย (ดูผลทดสอบ #3 ในหัวข้อถัดไป) แม้แต่ `Program` (นักธรรม/
   ธรรมศึกษา/บาลี) เองก็เป็นตารางข้อมูล ไม่ใช่ enum เผื่อกรณีในอนาคตมีสายการศึกษาเพิ่มเติม
2. **Curriculum เป็น append-only** — เหมือน `OrganizationStatusHistory` ใน P2
   org-domain (ไม่มี `effectiveTo` — "หลักสูตรที่ใช้จริง ณ ปีใด" หาได้จาก query: หา
   curriculum ของ program นั้นที่ `effectiveFromYear` ล่าสุดที่ ≤ ปีที่สนใจ) เหตุผล:
   ต้องย้อนดูได้เสมอว่า "ปีการศึกษา X ใช้หลักสูตรเวอร์ชันไหน" แม้หลักสูตรจะถูกปรับปรุงไป
   แล้วในภายหลัง — บังคับด้วย DB trigger เดียวกับที่ใช้กับ `audit_logs`/
   `organization_status_history` **ทดสอบจริงแล้ว** ว่าปฏิเสธ UPDATE/DELETE ทั้งคู่
   แก้ไขข้อผิดพลาด = เพิ่มเวอร์ชันใหม่ (ตาม data-policy.md ข้อ 7) ไม่ใช่แก้ของเดิม
3. **`ExamSession` ผูก `curriculumId` อย่างชัดเจน** ไม่ใช้วิธี derive จากวันที่ ณ runtime
   — เพราะแม้หลักสูตรปัจจุบันของ program จะเปลี่ยนไปแล้ว รอบสอบเก่าต้องยังอ้างอิงหลักสูตร
   เวอร์ชันที่ใช้จริง ณ ตอนนั้นได้เสมอ (ความถูกต้องเชิงประวัติศาสตร์)
4. **`CurriculumLevelSubject` เป็นตาราง mutable** (ต่างจาก `Curriculum` เอง) — เพราะ
   เนื้อหาหลักสูตร (วิชา/คะแนน) อาจต้องแก้ไขระหว่างเตรียมข้อมูลก่อนนำไปใช้จริง แต่มี
   Validation rule ที่ application layer (ดู Function Specification ข้อ 3) ห้ามแก้ไข
   เนื้อหาของหลักสูตรเวอร์ชันที่มีรอบสอบที่ดำเนินการไปแล้วอ้างอิงอยู่
5. **`ExamCenter` เชื่อมกับ `Organization` จาก P2 org-domain ได้ (optional)** — สนามสอบ
   จำนวนมากคือวัดหรือหน่วยงานที่ขึ้นทะเบียนอยู่แล้ว การเชื่อมแบบ FK (แทนการพิมพ์ชื่อ/ที่อยู่
   ซ้ำ) ทำให้ข้อมูลสนามสอบสอดคล้องกับทะเบียนหน่วยงานจริงอัตโนมัติ — แต่ยังรองรับสนามสอบ
   ที่ไม่ใช่หน่วยงานที่ขึ้นทะเบียน (organizationId เป็น null ได้)
6. **`ExamSchedule` ไม่ผูกกับ `ExamCenter` โดยตรง** — เพราะการสอบสนามหลวงจริงกำหนด
   วัน-เวลาสอบแต่ละวิชาจากส่วนกลางเพียงชุดเดียว ใช้เหมือนกันทุกสนามสอบทั่วประเทศ
   (ต่างจากระบบที่แต่ละสนามสอบมีตารางเวลาของตัวเอง) การแยกตารางนี้ออกจาก center ตรงกับ
   ความเป็นจริงและลดความซับซ้อนของโมเดล

## Enum Reference

| Enum | ค่า | ใช้กับ |
|---|---|---|
| `exam_type` | MULTIPLE_CHOICE, ESSAY, MIXED | CurriculumLevelSubject.examType |
| `exam_session_status` | PLANNED, REGISTRATION_OPEN, REGISTRATION_CLOSED, IN_PROGRESS, COMPLETED, CANCELLED | ExamSession.status |

## แผนภาพความสัมพันธ์ (Relationships)

```mermaid
erDiagram
    PROGRAMS ||--o{ EDUCATION_LEVELS : "has levels"
    PROGRAMS ||--o{ CURRICULA : "has curriculum versions"
    PROGRAMS ||--o{ EXAM_SESSIONS : "administers"

    ACADEMIC_YEARS ||--o{ CURRICULA : "curriculum effective from"
    ACADEMIC_YEARS ||--o{ EXAM_SESSIONS : "exam session in year"

    CURRICULA ||--o{ CURRICULUM_LEVEL_SUBJECTS : "defines content"
    CURRICULA ||--o{ EXAM_SESSIONS : "used by session"

    EDUCATION_LEVELS ||--o{ CURRICULUM_LEVEL_SUBJECTS : "subjects at this level"
    SUBJECTS ||--o{ CURRICULUM_LEVEL_SUBJECTS : "used in curriculum"

    CURRICULUM_LEVEL_SUBJECTS ||--o{ EXAM_SCHEDULES : "scheduled as"
    EXAM_SESSIONS ||--o{ EXAM_SCHEDULES : "has timetable"
    EXAM_SESSIONS ||--o{ EXAM_SESSION_CENTERS : "held at"
    EXAM_CENTERS ||--o{ EXAM_SESSION_CENTERS : "hosts"
    ORGANIZATIONS ||--o{ EXAM_CENTERS : "may be an exam center (optional)"

    PROGRAMS {
        string id PK
        string code UK
        string name
    }
    EDUCATION_LEVELS {
        string id PK
        string programId FK
        string code "UK with programId"
        int sortOrder
    }
    ACADEMIC_YEARS {
        string id PK
        int yearBE UK
    }
    CURRICULA {
        string id PK
        string programId FK
        string effectiveFromYearId FK "UK with programId"
        note "append-only: DB trigger blocks UPDATE/DELETE"
    }
    SUBJECTS {
        string id PK
        string code UK
    }
    CURRICULUM_LEVEL_SUBJECTS {
        string id PK
        string curriculumId FK
        string levelId FK
        string subjectId FK "UK together"
        int maxScore
        int passScore
        enum examType
    }
    EXAM_CENTERS {
        string id PK
        string code UK
        string organizationId FK "nullable, -> organizations"
    }
    EXAM_SESSIONS {
        string id PK
        string programId FK
        string academicYearId FK
        string curriculumId FK "explicit, not derived"
        int roundNumber "UK with program+year"
        enum status
    }
    EXAM_SESSION_CENTERS {
        string id PK
        string examSessionId FK
        string examCenterId FK "UK together"
    }
    EXAM_SCHEDULES {
        string id PK
        string examSessionId FK
        string curriculumLevelSubjectId FK "UK together"
        datetime startAt
        datetime endAt
    }
```

## Data Dictionary

### ตาราง: `academic_years`

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| yearBE | integer | ไม่ | พ.ศ. — UNIQUE |
| label | text | ได้ | ป้ายชื่อแสดงผล |
| startDate/endDate | timestamp(3) | ได้ | ช่วงเวลาของปีการศึกษา |
| isActive | boolean | ไม่ | default true |
| createdAt/updatedAt | timestamp(3) | ไม่ | |

**Constraints**: PK(id); UNIQUE(yearBE)

### ตาราง: `programs`

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| code | text | ไม่ | UNIQUE (เช่น NAK_THAM, DHAMMA_STUDIES, PALI) |
| name / nameEn | text | ไม่/ได้ | ชื่อสายการศึกษา |
| description | text | ได้ | |
| isActive | boolean | ไม่ | default true |
| createdAt/updatedAt/deletedAt | timestamp(3) | ไม่/ไม่/ได้ | soft delete |

**Constraints**: PK(id); UNIQUE(code)

**Seed มือกทดสอบ**: NAK_THAM (นักธรรม), DHAMMA_STUDIES (ธรรมศึกษา), PALI (บาลี)

### ตาราง: `education_levels`

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| programId | text | ไม่ | FK → programs.id |
| code | text | ไม่ | UNIQUE ร่วมกับ programId (ไม่ unique ข้าม program) |
| name | text | ไม่ | ชื่อระดับชั้น |
| sortOrder | integer | ไม่ | ลำดับแสดงผล — **ไม่ใช่ตัวเลขชั้นทางธุรกิจ** |
| isActive | boolean | ไม่ | default true |
| createdAt/updatedAt/deletedAt | timestamp(3) | ไม่/ไม่/ได้ | soft delete |

**Constraints/Indexes**: PK(id); UNIQUE(programId, code); INDEX(programId);
FK(programId→programs.id, RESTRICT)

**Seed มือกทดสอบ**: นักธรรมชั้นตรี/โท/เอก (sortOrder 1-3), บาลีประโยค 1-2 และ
ป.ธ.3 (sortOrder 1-2 ภายใน program บาลี) — **แสดงว่าจำนวนระดับชั้นต่อ program ไม่เท่ากัน
ได้ และไม่ hard-code จำนวน**

### ตาราง: `subjects`

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| code | text | ไม่ | UNIQUE |
| name / nameEn | text | ไม่/ได้ | ชื่อวิชา |
| description | text | ได้ | |
| isActive | boolean | ไม่ | default true |
| createdAt/updatedAt/deletedAt | timestamp(3) | ไม่/ไม่/ได้ | soft delete |

**Constraints**: PK(id); UNIQUE(code) — master list ใช้ซ้ำได้ข้ามหลายระดับชั้น/หลักสูตร
ผ่านตาราง `curriculum_level_subjects`

### ตาราง: `curricula` (APPEND-ONLY)

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| programId | text | ไม่ | FK → programs.id |
| code | text | ไม่ | UNIQUE ร่วมกับ programId |
| name | text | ไม่ | ชื่อหลักสูตร/เวอร์ชัน |
| description | text | ได้ | |
| effectiveFromYearId | text | ไม่ | FK → academic_years.id — UNIQUE ร่วมกับ programId |
| createdAt | timestamp(3) | ไม่ | เวลาที่บันทึกจริง |

**Constraints/Indexes**: PK(id); UNIQUE(programId, effectiveFromYearId) — ป้องกัน
สอง curriculum เริ่มมีผลปีเดียวกันของ program เดียวกัน; UNIQUE(programId, code);
INDEX(programId); FK(programId→programs.id, RESTRICT); FK(effectiveFromYearId→
academic_years.id, RESTRICT)

**Trigger**: `curricula_no_update`, `curricula_no_delete` — ปฏิเสธ UPDATE/DELETE
ทุกกรณี **(ทดสอบจริงแล้ว)**

**วิธี query "หลักสูตรที่ใช้จริง ณ ปีการศึกษา Y" (application-layer pattern)**:
```sql
SELECT c.* FROM curricula c
JOIN academic_years ay ON ay.id = c."effectiveFromYearId"
WHERE c."programId" = :programId AND ay."yearBE" <= :targetYearBE
ORDER BY ay."yearBE" DESC LIMIT 1;
```
**ทดสอบจริงแล้ว**: สร้าง curriculum เวอร์ชัน 2 (effectiveFromYear=2569) ควบคู่กับ
เวอร์ชัน 1 (effectiveFromYear=2567) แล้ว query ด้วยรูปแบบข้างต้นที่ปี 2568 ได้ผลเป็น
เวอร์ชัน 1 อย่างถูกต้อง และที่ปี 2569 ได้ผลเป็นเวอร์ชัน 2 — ยืนยันว่า pattern
"ไม่ hard-code เวอร์ชันปัจจุบัน" ทำงานถูกต้องจริง

### ตาราง: `curriculum_level_subjects`

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| curriculumId | text | ไม่ | FK → curricula.id |
| levelId | text | ไม่ | FK → education_levels.id |
| subjectId | text | ไม่ | FK → subjects.id |
| maxScore | integer | ไม่ | คะแนนเต็ม |
| passScore | integer | ไม่ | คะแนนผ่าน |
| examType | exam_type | ไม่ | MULTIPLE_CHOICE / ESSAY / MIXED |
| sortOrder | integer | ไม่ | ลำดับแสดงผล |
| isActive | boolean | ไม่ | default true |
| createdAt/updatedAt | timestamp(3) | ไม่ | mutable (ต่างจาก curricula เอง — ดูหัวข้อออกแบบข้อ 4) |

**Constraints/Indexes**: PK(id); UNIQUE(curriculumId, levelId, subjectId);
INDEX(curriculumId, levelId); FK ทั้งสาม (curriculumId/levelId/subjectId) RESTRICT

### ตาราง: `exam_centers`

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| code | text | ไม่ | UNIQUE |
| name | text | ไม่ | |
| organizationId | text | ได้ | FK → organizations.id (P2 org-domain) — nullable |
| province/district | text | ได้ | ใช้เมื่อไม่ได้ผูกกับ organization |
| capacity | integer | ได้ | |
| isActive | boolean | ไม่ | default true |
| createdAt/updatedAt/deletedAt | timestamp(3) | ไม่/ไม่/ได้ | soft delete |

**Constraints/Indexes**: PK(id); UNIQUE(code); INDEX(organizationId);
FK(organizationId→organizations.id, ON DELETE SET NULL) — **ทดสอบจริงแล้ว** ว่า
FK นี้บังคับใช้ได้ข้าม migration (อ้างอิงตาราง `organizations` จาก P2 org-domain
migration ก่อนหน้า) และ trigger ตรวจ hierarchy ของ P2 ยังทำงานเป็นอิสระจากกัน

### ตาราง: `exam_sessions`

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| programId | text | ไม่ | FK → programs.id |
| academicYearId | text | ไม่ | FK → academic_years.id |
| curriculumId | text | ไม่ | FK → curricula.id — **ผูกชัดเจน ไม่ derive runtime** |
| roundNumber | integer | ไม่ | default 1 — UNIQUE ร่วมกับ program+year |
| name | text | ได้ | |
| status | exam_session_status | ไม่ | default PLANNED |
| registrationOpenDate/registrationCloseDate | timestamp(3) | ได้ | |
| examStartDate/examEndDate | timestamp(3) | ได้ | |
| createdAt/updatedAt/deletedAt | timestamp(3) | ไม่/ไม่/ได้ | soft delete |

**Constraints/Indexes**: PK(id); UNIQUE(programId, academicYearId, roundNumber);
INDEX(programId, academicYearId); INDEX(status); FK ทั้งสาม RESTRICT

**ทดสอบจริงแล้ว**: สร้างรอบสอบ 3 ปีติดต่อกัน (2567, 2568, 2569) สำหรับ program
เดียวกันโดยอ้างอิง curriculum เดียวกันทั้งหมด สำเร็จ; ปฏิเสธรอบสอบซ้ำ (program+year+
round เดียวกัน)

### ตาราง: `exam_session_centers`

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| examSessionId | text | ไม่ | FK → exam_sessions.id |
| examCenterId | text | ไม่ | FK → exam_centers.id |
| notes | text | ได้ | |
| createdAt | timestamp(3) | ไม่ | |

**Constraints**: PK(id); UNIQUE(examSessionId, examCenterId); INDEX(examSessionId);
FK ทั้งสอง RESTRICT

### ตาราง: `exam_schedules`

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| examSessionId | text | ไม่ | FK → exam_sessions.id |
| curriculumLevelSubjectId | text | ไม่ | FK → curriculum_level_subjects.id |
| startAt/endAt | timestamp(3) | ไม่ | ช่วงเวลาสอบวิชานี้ |
| createdAt/updatedAt/deletedAt | timestamp(3) | ไม่/ไม่/ได้ | soft delete |

**Constraints/Indexes**: PK(id); UNIQUE(examSessionId, curriculumLevelSubjectId) —
วิชาหนึ่งสอบครั้งเดียวต่อรอบสอบ; INDEX(examSessionId); FK ทั้งสอง RESTRICT

**ทดสอบจริงแล้ว**: สร้างตารางสอบ 1 วิชาในรอบสอบสำเร็จ; ปฏิเสธการสอบวิชาเดียวกันซ้ำใน
รอบสอบเดียวกัน (unique violation)

## ข้อจำกัดที่ทราบและยอมรับ (Known Limitations)

1. **การห้ามแก้ไข `curriculum_level_subjects` ของหลักสูตรที่ถูกใช้ไปแล้วไม่ได้บังคับ
   ด้วย DB constraint** — ต้อง join ข้าม `exam_sessions` เพื่อตรวจว่ามีรอบสอบที่
   `status` ไม่ใช่ PLANNED อ้างอิง curriculum นี้อยู่หรือไม่ ซึ่งเป็น business rule ข้าม
   ตารางที่ตรวจที่ application layer แทน (ดู Function Specification ข้อ 3)
2. **`ExamSchedule.startAt/endAt` ไม่มี constraint ป้องกันเวลาสอบซ้อนกัน** (เช่น สอบ
   2 วิชาเวลาเดียวกันในรอบสอบเดียวกัน) — เป็นการตัดสินใจเชิงธุรกิจที่บางกรณีอาจตั้งใจ
   (สอบคนละกลุ่มผู้เข้าสอบพร้อมกัน) จึงปล่อยให้ตรวจที่ application layer แทนการบังคับ
   ด้วย DB
3. **ไม่มี exam-registration/exam-result ในเฟสนี้** ตามขอบเขตที่ระบุ — เป็นของ M4
4. Prisma Client ยังไม่เคย generate ได้จริงในสภาพแวดล้อมนี้ (ปัญหาเดิม — ดู
   `prisma/MIGRATIONS.md`) — schema/migration นี้ผ่านการทดสอบจริงกับ PostgreSQL แล้ว
   ผ่าน raw SQL เท่านั้น

## Function Specification — Operation หลัก

### 1. เพิ่มปีการศึกษาใหม่ (Add Academic Year) — พิสูจน์ "ไม่ hard-code ปี"

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Central Officer, Super Admin |
| Input | yearBE, label?, startDate?, endDate? |
| Process | (1) ตรวจ yearBE ไม่ซ้ำ (2) INSERT ลง academic_years (3) เขียน AuditLog |
| Output | AcademicYear record ใหม่ |
| Permission | เฉพาะ Central Officer/Super Admin (ข้อมูลอ้างอิงระดับส่วนกลาง) |
| Validation | yearBE ต้องเป็นจำนวนเต็มบวกสมเหตุสมผล (เช่น 2400-2700) และไม่ซ้ำ |
| Error State | 409 หาก yearBE ซ้ำ (unique violation) |
| Audit | AuditLog entityType="AcademicYear", action=CREATE |
| Acceptance Criteria | AC1: เพิ่มปีใหม่สำเร็จโดยไม่ต้องแก้ schema/โค้ดใดๆ (ทดสอบจริงแล้ว — เพิ่มปี 2569 ระหว่างทดสอบ, ดู prisma/MIGRATIONS.md); AC2: ปฏิเสธปีซ้ำ |

### 2. เผยแพร่หลักสูตรเวอร์ชันใหม่ (Publish New Curriculum Version)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Central Officer, Super Admin |
| Input | programId, code, name, effectiveFromYearId, description?, รายการ (levelId, subjectId, maxScore, passScore, examType, sortOrder)[] |
| Process | (1) เริ่ม transaction (2) ตรวจ programId, effectiveFromYearId มีอยู่จริง (3) ตรวจไม่มี curriculum อื่นของ program เดียวกันที่ effectiveFromYearId เดียวกันอยู่แล้ว (4) INSERT curricula (append-only) (5) INSERT curriculum_level_subjects ทุกแถวที่ระบุ (6) เขียน AuditLog (7) commit |
| Output | Curriculum ใหม่พร้อม curriculum_level_subjects ทั้งหมด |
| Permission | เฉพาะ Central Officer/Super Admin |
| Validation | (a) unique(programId, effectiveFromYearId) (b) unique(programId, code) (c) ทุก (levelId, subjectId) ต้องมีอยู่จริงและ levelId ต้องอยู่ใน programId เดียวกัน (ตรวจที่ application layer — ไม่ใช่ DB constraint ข้าม 2 FK) (d) maxScore ≥ passScore > 0 |
| Error State | 409 หากซ้ำ; 400 หาก level ไม่ได้อยู่ใน program เดียวกัน หรือ maxScore < passScore; transaction rollback ทั้งหมดหากขั้นตอนใดล้มเหลว |
| Audit | AuditLog entityType="Curriculum", action=CREATE, after=snapshot ของ curriculum + รายการวิชาทั้งหมด |
| Acceptance Criteria | AC1: เผยแพร่หลักสูตรใหม่สำเร็จพร้อมเนื้อหาครบในธุรกรรมเดียว; AC2: หลักสูตรที่เผยแพร่แล้วแก้ไข/ลบไม่ได้อีก (ทดสอบจริงแล้วที่ระดับ DB — trigger ปฏิเสธ UPDATE/DELETE); AC3: การ query "หลักสูตรปัจจุบัน ณ ปี Y" ให้ผลถูกต้องทันทีหลังเผยแพร่ (ทดสอบจริงแล้ว) |

### 3. แก้ไขเนื้อหาหลักสูตรก่อนใช้งานจริง (Edit Curriculum Content Before First Use)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Central Officer, Super Admin |
| Input | curriculumLevelSubjectId, ฟิลด์ที่จะแก้ (maxScore/passScore/examType/sortOrder/isActive) |
| Process | (1) ตรวจว่า curriculum ที่แถวนี้สังกัดยังไม่มี exam_sessions ที่ status ≠ PLANNED อ้างอิงอยู่ (2) UPDATE curriculum_level_subjects (3) เขียน AuditLog (before/after) |
| Output | CurriculumLevelSubject ที่อัปเดตแล้ว |
| Permission | เฉพาะ Central Officer/Super Admin |
| Validation | ห้ามแก้ไขหากมีรอบสอบที่เริ่มดำเนินการแล้ว (status ∈ {REGISTRATION_OPEN, REGISTRATION_CLOSED, IN_PROGRESS, COMPLETED}) อ้างอิง curriculum นี้ — ตรวจที่ application layer (ดูข้อจำกัดที่ทราบข้อ 1) |
| Error State | 409 หากมีรอบสอบที่ดำเนินการแล้วอ้างอิงอยู่ (ป้องกันแก้ไขเกณฑ์คะแนนย้อนหลังหลังสอบไปแล้ว) |
| Audit | AuditLog entityType="CurriculumLevelSubject", action=UPDATE |
| Acceptance Criteria | AC1: แก้ไขได้เมื่อยังไม่มีรอบสอบอ้างอิง; AC2: ปฏิเสธเมื่อมีรอบสอบที่ดำเนินการแล้วอ้างอิงอยู่ |

### 4. สร้างรอบสอบใหม่ (Create Exam Session)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Central Officer, Super Admin |
| Input | programId, academicYearId, curriculumId, roundNumber?, name?, registrationOpenDate?, registrationCloseDate?, examStartDate?, examEndDate? |
| Process | (1) ตรวจ programId/academicYearId/curriculumId มีอยู่จริงและ curriculum นั้นสังกัด programId เดียวกัน (2) INSERT exam_sessions (status=PLANNED) (3) เขียน AuditLog |
| Output | ExamSession ใหม่ |
| Permission | เฉพาะ Central Officer/Super Admin |
| Validation | (a) unique(programId, academicYearId, roundNumber) (b) curriculum.programId ต้องตรงกับ programId ที่ระบุ (c) examEndDate ≥ examStartDate ถ้าระบุทั้งคู่ |
| Error State | 409 หากซ้ำรอบ; 400 หาก curriculum ไม่ตรง program หรือวันที่ไม่สมเหตุสมผล |
| Audit | AuditLog entityType="ExamSession", action=CREATE |
| Acceptance Criteria | AC1: สร้างรอบสอบสำเร็จเมื่อข้อมูลถูกต้อง (ทดสอบจริงแล้ว — สร้าง 3 รอบคนละปีสำเร็จ); AC2: ปฏิเสธรอบซ้ำ (ทดสอบจริงแล้ว) |

### 5. กำหนดตารางสอบ (Create Exam Schedule)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Central Officer, Super Admin |
| Input | examSessionId, curriculumLevelSubjectId, startAt, endAt |
| Process | (1) ตรวจ examSessionId มีอยู่จริงและ curriculumLevelSubjectId สังกัด curriculum เดียวกันกับ examSession นั้น (2) INSERT exam_schedules (3) เขียน AuditLog |
| Output | ExamSchedule ใหม่ |
| Permission | เฉพาะ Central Officer/Super Admin |
| Validation | (a) unique(examSessionId, curriculumLevelSubjectId) (b) endAt > startAt (c) curriculumLevelSubject.curriculumId ต้องตรงกับ examSession.curriculumId (ตรวจที่ application layer) |
| Error State | 409 หากวิชานี้ถูกกำหนดตารางสอบในรอบเดียวกันแล้ว (ทดสอบจริงแล้ว); 400 หาก curriculum ไม่ตรงกัน หรือ endAt ≤ startAt |
| Audit | AuditLog entityType="ExamSchedule", action=CREATE |
| Acceptance Criteria | AC1: กำหนดตารางสอบสำเร็จเมื่อข้อมูลถูกต้อง (ทดสอบจริงแล้ว); AC2: ปฏิเสธการกำหนดวิชาเดียวกันซ้ำในรอบเดียวกัน (ทดสอบจริงแล้ว — unique violation) |
