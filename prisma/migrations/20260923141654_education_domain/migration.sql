-- P2 Database & Sangha Domain: education domain (M2) — programs, levels,
-- subjects, curriculum, academic years, exam sessions, exam centers.
-- Hand-authored to match Prisma's real migration conventions — Prisma CLI
-- cannot run in this environment (see prisma/MIGRATIONS.md). Verified for
-- real against local PostgreSQL via prisma/dev-migrate-verify.mjs.

-- CreateEnum
CREATE TYPE "exam_type" AS ENUM ('MULTIPLE_CHOICE', 'ESSAY', 'MIXED');

-- CreateEnum
CREATE TYPE "exam_session_status" AS ENUM ('PLANNED', 'REGISTRATION_OPEN', 'REGISTRATION_CLOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
-- ปีการศึกษา (พ.ศ.) — ตารางข้อมูล ไม่ hard-code เป็น enum ตามที่ระบุ เพิ่มปีใหม่ด้วย
-- INSERT ธรรมดา
CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL,
    "yearBE" INTEGER NOT NULL,
    "label" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_yearBE_key" ON "academic_years"("yearBE");

-- CreateTable
-- สายการศึกษา (นักธรรม/ธรรมศึกษา/บาลี) — ตารางข้อมูล ไม่ hard-code เป็น enum
CREATE TABLE "programs" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "programs_code_key" ON "programs"("code");

-- CreateTable
-- ระดับชั้นภายในสายการศึกษา (ตรี/โท/เอก, ประโยค 1-2 ถึง ป.ธ.9 ฯลฯ) — ตารางข้อมูล
-- ไม่ hard-code เป็น enum ตามที่ระบุ ("ไม่ hard-code ชั้น")
CREATE TABLE "education_levels" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "education_levels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "education_levels_programId_code_key" ON "education_levels"("programId", "code");
CREATE INDEX "education_levels_programId_idx" ON "education_levels"("programId");

-- AddForeignKey
ALTER TABLE "education_levels" ADD CONSTRAINT "education_levels_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "subjects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "subjects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "subjects_code_key" ON "subjects"("code");

-- CreateTable
-- หลักสูตร (เวอร์ชัน) ของสายการศึกษา — APPEND-ONLY (ดูเหตุผลใน schema.prisma และ
-- prisma/education-schema.md) บังคับ immutable ด้วย trigger แบบเดียวกับ
-- organization_status_history ใน P2 org-domain migration
CREATE TABLE "curricula" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "effectiveFromYearId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "curricula_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "curricula_programId_effectiveFromYearId_key" ON "curricula"("programId", "effectiveFromYearId");
CREATE UNIQUE INDEX "curricula_programId_code_key" ON "curricula"("programId", "code");
CREATE INDEX "curricula_programId_idx" ON "curricula"("programId");

-- AddForeignKey
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curricula" ADD CONSTRAINT "curricula_effectiveFromYearId_fkey" FOREIGN KEY ("effectiveFromYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Custom: append-only immutability, same pattern as audit_logs and
-- organization_status_history (data-policy.md ข้อ 7 — "เขียนได้ครั้งเดียว
-- ไม่แก้ไขย้อนหลัง"). แก้ไขข้อผิดพลาดของหลักสูตร = เพิ่มเวอร์ชันใหม่ที่แก้ไข ไม่ใช่
-- update ของเดิม
CREATE OR REPLACE FUNCTION curricula_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'curricula is append-only: % is not permitted on this table', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER curricula_no_update
  BEFORE UPDATE ON "curricula"
  FOR EACH ROW EXECUTE FUNCTION curricula_prevent_mutation();

CREATE TRIGGER curricula_no_delete
  BEFORE DELETE ON "curricula"
  FOR EACH ROW EXECUTE FUNCTION curricula_prevent_mutation();

-- CreateTable
-- เนื้อหาหลักสูตรจริง (วิชา/คะแนน/ประเภทข้อสอบ ต่อระดับชั้นต่อเวอร์ชันหลักสูตร) —
-- mutable ตามปกติ (ต่างจาก curricula เอง) ดูเหตุผลใน schema.prisma
CREATE TABLE "curriculum_level_subjects" (
    "id" TEXT NOT NULL,
    "curriculumId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "maxScore" INTEGER NOT NULL,
    "passScore" INTEGER NOT NULL,
    "examType" "exam_type" NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "curriculum_level_subjects_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "curriculum_level_subjects_curriculumId_levelId_subjectId_key" ON "curriculum_level_subjects"("curriculumId", "levelId", "subjectId");
CREATE INDEX "curriculum_level_subjects_curriculumId_levelId_idx" ON "curriculum_level_subjects"("curriculumId", "levelId");

-- AddForeignKey
ALTER TABLE "curriculum_level_subjects" ADD CONSTRAINT "curriculum_level_subjects_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "curricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curriculum_level_subjects" ADD CONSTRAINT "curriculum_level_subjects_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "education_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "curriculum_level_subjects" ADD CONSTRAINT "curriculum_level_subjects_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
-- สนามสอบ — organizationId อ้างอิงตาราง organizations จาก P2 org-domain migration
-- ที่มีอยู่แล้ว (nullable เพราะไม่ใช่ทุกสนามสอบจะเป็นหน่วยงานที่ขึ้นทะเบียนไว้)
CREATE TABLE "exam_centers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "organizationId" TEXT,
    "province" TEXT,
    "district" TEXT,
    "capacity" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "exam_centers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_centers_code_key" ON "exam_centers"("code");
CREATE INDEX "exam_centers_organizationId_idx" ON "exam_centers"("organizationId");

-- AddForeignKey
ALTER TABLE "exam_centers" ADD CONSTRAINT "exam_centers_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
-- รอบสอบ — ผูก curriculum ที่ใช้จริงอย่างชัดเจน (ไม่ derive จากวันที่ ณ runtime) เพื่อ
-- รักษาความถูกต้องทางประวัติศาสตร์แม้ curriculum เวอร์ชันปัจจุบันจะเปลี่ยนไปแล้ว
CREATE TABLE "exam_sessions" (
    "id" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "academicYearId" TEXT NOT NULL,
    "curriculumId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL DEFAULT 1,
    "name" TEXT,
    "status" "exam_session_status" NOT NULL DEFAULT 'PLANNED',
    "registrationOpenDate" TIMESTAMP(3),
    "registrationCloseDate" TIMESTAMP(3),
    "examStartDate" TIMESTAMP(3),
    "examEndDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "exam_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_sessions_programId_academicYearId_roundNumber_key" ON "exam_sessions"("programId", "academicYearId", "roundNumber");
CREATE INDEX "exam_sessions_programId_academicYearId_idx" ON "exam_sessions"("programId", "academicYearId");
CREATE INDEX "exam_sessions_status_idx" ON "exam_sessions"("status");

-- AddForeignKey
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_programId_fkey" FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_sessions" ADD CONSTRAINT "exam_sessions_curriculumId_fkey" FOREIGN KEY ("curriculumId") REFERENCES "curricula"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "exam_session_centers" (
    "id" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "examCenterId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_session_centers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_session_centers_examSessionId_examCenterId_key" ON "exam_session_centers"("examSessionId", "examCenterId");
CREATE INDEX "exam_session_centers_examSessionId_idx" ON "exam_session_centers"("examSessionId");

-- AddForeignKey
ALTER TABLE "exam_session_centers" ADD CONSTRAINT "exam_session_centers_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "exam_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_session_centers" ADD CONSTRAINT "exam_session_centers_examCenterId_fkey" FOREIGN KEY ("examCenterId") REFERENCES "exam_centers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
-- ตารางสอบ — กำหนดจากส่วนกลางเพียงชุดเดียวต่อรอบสอบ ใช้เหมือนกันทุกสนามสอบ (ไม่ผูกกับ
-- exam_centers โดยตรง — ดูเหตุผลใน schema.prisma)
CREATE TABLE "exam_schedules" (
    "id" TEXT NOT NULL,
    "examSessionId" TEXT NOT NULL,
    "curriculumLevelSubjectId" TEXT NOT NULL,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "exam_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_schedules_examSessionId_curriculumLevelSubjectId_key" ON "exam_schedules"("examSessionId", "curriculumLevelSubjectId");
CREATE INDEX "exam_schedules_examSessionId_idx" ON "exam_schedules"("examSessionId");

-- AddForeignKey
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "exam_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_schedules" ADD CONSTRAINT "exam_schedules_curriculumLevelSubjectId_fkey" FOREIGN KEY ("curriculumLevelSubjectId") REFERENCES "curriculum_level_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Seed data: minimal mock reference data to prove the schema supports the
-- real นักธรรม/ธรรมศึกษา/บาลี structure without hardcoding levels/years.
-- MOCK DATA ONLY per data-policy.md ข้อ 3 — no real persons/organizations.
INSERT INTO "academic_years" ("id", "yearBE", "label", "isActive", "createdAt", "updatedAt") VALUES
    ('ay_2567', 2567, 'ปีการศึกษา 2567', true, now(), now()),
    ('ay_2568', 2568, 'ปีการศึกษา 2568', true, now(), now());

INSERT INTO "programs" ("id", "code", "name", "nameEn", "createdAt", "updatedAt") VALUES
    ('prog_naktham', 'NAK_THAM', 'นักธรรม', 'Nak Tham (Dhamma Studies for monks)', now(), now()),
    ('prog_dhammastudies', 'DHAMMA_STUDIES', 'ธรรมศึกษา', 'Dhamma Studies (for laypeople)', now(), now()),
    ('prog_pali', 'PALI', 'บาลี', 'Pali Studies', now(), now());

INSERT INTO "education_levels" ("id", "programId", "code", "name", "sortOrder", "createdAt", "updatedAt") VALUES
    ('lvl_nt_tri', 'prog_naktham', 'TRI', 'นักธรรมชั้นตรี', 1, now(), now()),
    ('lvl_nt_tho', 'prog_naktham', 'THO', 'นักธรรมชั้นโท', 2, now(), now()),
    ('lvl_nt_ek', 'prog_naktham', 'EK', 'นักธรรมชั้นเอก', 3, now(), now()),
    ('lvl_pali_1_2', 'prog_pali', 'PT1_2', 'ประโยค 1-2', 1, now(), now()),
    ('lvl_pali_pt3', 'prog_pali', 'PT3', 'เปรียญธรรม 3 ประโยค (ป.ธ.3)', 2, now(), now());

INSERT INTO "subjects" ("id", "code", "name", "createdAt", "updatedAt") VALUES
    ('subj_dhammavibhaga', 'DHAMMAVIBHAGA', 'ธรรมวิภาค', now(), now()),
    ('subj_essay', 'ESSAY_DHAMMA', 'เรียงความแก้กระทู้ธรรม', now(), now()),
    ('subj_pali_translation', 'PALI_TRANSLATION', 'แปลบาลีเป็นไทย', now(), now());

INSERT INTO "curricula" ("id", "programId", "code", "name", "effectiveFromYearId", "createdAt") VALUES
    ('cur_naktham_v1', 'prog_naktham', 'NT-V1', 'หลักสูตรนักธรรม (มือกทดสอบ) เวอร์ชัน 1', 'ay_2567', now());

INSERT INTO "curriculum_level_subjects" ("id", "curriculumId", "levelId", "subjectId", "maxScore", "passScore", "examType", "sortOrder", "createdAt", "updatedAt") VALUES
    ('cls_nt_tri_dhammavibhaga', 'cur_naktham_v1', 'lvl_nt_tri', 'subj_dhammavibhaga', 100, 50, 'ESSAY', 1, now(), now()),
    ('cls_nt_tri_essay', 'cur_naktham_v1', 'lvl_nt_tri', 'subj_essay', 100, 50, 'ESSAY', 2, now(), now());
