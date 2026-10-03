-- P2 Database & Sangha Domain: คลังข้อสอบและเอกสาร (M3) — exam sets, questions,
-- choices, answer keys, document metadata, versions, categories, tags.
-- Hand-authored to match Prisma's real migration conventions — Prisma CLI
-- cannot run in this environment (see prisma/MIGRATIONS.md). Verified for
-- real against local PostgreSQL via prisma/dev-migrate-verify.mjs.
--
-- Design principle (see prisma/exam-document-schema.md for full rationale):
-- "identity" tables (questions, documents) are separated from "versioned
-- content" tables (question_versions, document_versions). A versioned row
-- may be freely edited while status = 'DRAFT'. The instant its status
-- changes away from DRAFT (submitted into the approval workflow), a
-- conditional BEFORE UPDATE/DELETE trigger locks that row permanently —
-- further edits require inserting a brand-new version row. This directly
-- implements "เวอร์ชัน — ห้ามลบ/เขียนทับของเดิมเมื่อมีการแก้ไข" while still
-- allowing normal editing during drafting (unlike the flat append-only
-- pattern used for audit_logs / organization_status_history / curricula).

-- CreateEnum
CREATE TYPE "approval_status" AS ENUM ('DRAFT', 'PENDING_REVIEW', 'APPROVED', 'REJECTED', 'RETIRED');

-- CreateEnum
CREATE TYPE "document_type" AS ENUM ('EXAM_PAPER_PRINT', 'ANSWER_SHEET_TEMPLATE', 'CIRCULAR', 'STUDY_MATERIAL', 'OTHER');

-- CreateTable
-- หมวดหมู่ — ใช้ร่วมกันได้ทั้งข้อสอบและเอกสาร ควบคุมโดย admin (ต่างจาก tags ที่เปิดกว้างกว่า)
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_code_key" ON "categories"("code") WHERE "code" IS NOT NULL;

-- CreateTable
-- แท็ก — free-form กว่า categories ไม่มีสถานะ/soft delete เพราะเป็นข้อมูลเสริมการค้นหาล้วนๆ
CREATE TABLE "tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tags_name_key" ON "tags"("name");

-- CreateTable
-- "ตัวตน" ของข้อสอบ — คงที่ตลอดอายุข้อสอบ ผูก subject+level โดยตรง (ไม่ผูก
-- curriculumLevelSubjectId เจาะจง) เพื่อให้นำข้อสอบกลับมาใช้ข้ามหลักสูตรเวอร์ชันใหม่ได้
-- questionType ใช้ enum "exam_type" เดิมจากโดเมนการศึกษา (MULTIPLE_CHOICE=ปรนัย /
-- ESSAY=อัตนัย / MIXED) แทนการสร้าง enum ใหม่ที่ความหมายซ้ำกัน
CREATE TABLE "questions" (
    "id" TEXT NOT NULL,
    "subjectId" TEXT NOT NULL,
    "levelId" TEXT NOT NULL,
    "questionType" "exam_type" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- ดัชนีนี้รองรับการค้นข้อสอบตาม "ชั้น/วิชา" โดยตรง (ส่วน "หลักสูตร/ปี" ค้นผ่าน
-- exam_sets/exam_set_items ด้านล่าง — ดูเหตุผลใน exam-document-schema.md)
CREATE INDEX "questions_subjectId_levelId_idx" ON "questions"("subjectId", "levelId");

-- CreateTable
CREATE TABLE "question_categories" (
    "questionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_categories_pkey" PRIMARY KEY ("questionId","categoryId")
);

-- CreateIndex
CREATE INDEX "question_categories_categoryId_idx" ON "question_categories"("categoryId");

-- CreateTable
CREATE TABLE "question_tags" (
    "questionId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_tags_pkey" PRIMARY KEY ("questionId","tagId")
);

-- CreateIndex
CREATE INDEX "question_tags_tagId_idx" ON "question_tags"("tagId");

-- CreateTable
-- เนื้อหาข้อสอบที่มีเวอร์ชัน (versionNo เพิ่มทีละ 1 ต่อ questionId) — แก้ไขได้อิสระขณะ
-- status='DRAFT' เท่านั้น ล็อกถาวรทันทีที่พ้น DRAFT (ดู trigger ท้ายไฟล์นี้)
CREATE TABLE "question_versions" (
    "id" TEXT NOT NULL,
    "questionId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "status" "approval_status" NOT NULL DEFAULT 'DRAFT',
    "authorActorId" TEXT,
    "approvedByActorId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_versions_questionId_versionNo_key" ON "question_versions"("questionId", "versionNo");

-- CreateIndex
CREATE INDEX "question_versions_status_idx" ON "question_versions"("status");

-- CreateTable
-- ตัวเลือกคำตอบ (ปรนัย) — ผูกกับ question_versions หนึ่งเวอร์ชันเท่านั้น ล็อกถาวรตาม
-- สถานะของ question_versions แม่ (ดู trigger ท้ายไฟล์นี้)
CREATE TABLE "question_choices" (
    "id" TEXT NOT NULL,
    "questionVersionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "question_choices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "question_choices_questionVersionId_label_key" ON "question_choices"("questionVersionId", "label");

-- CreateIndex
CREATE INDEX "question_choices_questionVersionId_idx" ON "question_choices"("questionVersionId");

-- CreateTable
-- เฉลย — แยกตารางจาก question_versions โดยเจตนา เพื่อให้กำหนดสิทธิ์ SELECT เข้มงวดกว่า
-- ตัวข้อสอบได้ในอนาคตโดยไม่ต้องเปลี่ยนโครงสร้างตาราง รองรับทั้งปรนัย (correctChoiceId)
-- และอัตนัย (modelAnswer/scoringGuide) ในแถวเดียวกัน ล็อกถาวรตามสถานะของ
-- question_versions แม่เช่นเดียวกับ question_choices
CREATE TABLE "answer_keys" (
    "id" TEXT NOT NULL,
    "questionVersionId" TEXT NOT NULL,
    "correctChoiceId" TEXT,
    "modelAnswer" TEXT,
    "scoringGuide" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "answer_keys_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "answer_keys_questionVersionId_key" ON "answer_keys"("questionVersionId");

-- CreateTable
-- "ตัวตน" ของเอกสาร — เนื้อหา/ไฟล์จริงอยู่ใน document_versions เช่นเดียวกับ questions
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentType" "document_type" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_documentType_idx" ON "documents"("documentType");

-- CreateTable
CREATE TABLE "document_categories" (
    "documentId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_categories_pkey" PRIMARY KEY ("documentId","categoryId")
);

-- CreateIndex
CREATE INDEX "document_categories_categoryId_idx" ON "document_categories"("categoryId");

-- CreateTable
CREATE TABLE "document_tags" (
    "documentId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_tags_pkey" PRIMARY KEY ("documentId","tagId")
);

-- CreateIndex
CREATE INDEX "document_tags_tagId_idx" ON "document_tags"("tagId");

-- CreateTable
-- เนื้อหาเอกสารที่มีเวอร์ชัน — pattern เดียวกับ question_versions ทุกประการ
-- fileKey/fileName/mimeType/fileSize เป็นเพียงคอลัมน์ placeholder สำหรับอ้างอิงไฟล์จริง
-- ใน object storage ในอนาคต (M8) — ยังไม่เชื่อมกับระบบจัดเก็บไฟล์จริงในงานนี้
CREATE TABLE "document_versions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "fileKey" TEXT,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "status" "approval_status" NOT NULL DEFAULT 'DRAFT',
    "authorActorId" TEXT,
    "approvedByActorId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_versions_documentId_versionNo_key" ON "document_versions"("documentId", "versionNo");

-- CreateIndex
CREATE INDEX "document_versions_status_idx" ON "document_versions"("status");

-- CreateTable
-- ชุดข้อสอบ — ผูกกับ curriculum_level_subjects เสมอ (ค้นตามหลักสูตร/ชั้น/วิชาได้โดยตรง)
-- และผูกกับ exam_sessions แบบ optional (ค้นตามปีได้ผ่าน exam_sessions.academicYearId
-- เมื่อเป็นชุดที่ใช้สอบจริง — เป็น null ได้สำหรับชุดฝึกซ้อม/คลังส่วนกลาง) — นี่คือจุดที่
-- ตอบโจทย์ "ค้นตามหลักสูตร/ชั้น/ปี/วิชาได้ด้วย index ที่เหมาะสม"
CREATE TABLE "exam_sets" (
    "id" TEXT NOT NULL,
    "curriculumLevelSubjectId" TEXT NOT NULL,
    "examSessionId" TEXT,
    "name" TEXT NOT NULL,
    "status" "approval_status" NOT NULL DEFAULT 'DRAFT',
    "authorActorId" TEXT,
    "approvedByActorId" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "exam_sets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "exam_sets_curriculumLevelSubjectId_idx" ON "exam_sets"("curriculumLevelSubjectId");

-- CreateIndex
CREATE INDEX "exam_sets_examSessionId_idx" ON "exam_sets"("examSessionId");

-- CreateIndex
CREATE INDEX "exam_sets_status_idx" ON "exam_sets"("status");

-- CreateTable
-- ข้อสอบแต่ละข้อภายในชุดข้อสอบ — อ้างอิง question_versions เจาะจง (ไม่ใช่ questions
-- เฉยๆ) เพื่อให้ชุดข้อสอบที่ประกาศใช้แล้วอ้างอิงเนื้อหาข้อสอบเวอร์ชันที่แน่นอนตลอดไป
-- ล็อกถาวรตามสถานะของ exam_sets แม่เช่นเดียวกับ question_choices/answer_keys
CREATE TABLE "exam_set_items" (
    "id" TEXT NOT NULL,
    "examSetId" TEXT NOT NULL,
    "questionVersionId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "score" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_set_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "exam_set_items_examSetId_sortOrder_key" ON "exam_set_items"("examSetId", "sortOrder");

-- CreateIndex
CREATE INDEX "exam_set_items_examSetId_idx" ON "exam_set_items"("examSetId");

-- CreateIndex
CREATE INDEX "exam_set_items_questionVersionId_idx" ON "exam_set_items"("questionVersionId");

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "questions" ADD CONSTRAINT "questions_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "education_levels"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_categories" ADD CONSTRAINT "question_categories_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "question_categories" ADD CONSTRAINT "question_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "question_tags" ADD CONSTRAINT "question_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_authorActorId_fkey" FOREIGN KEY ("authorActorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "question_versions" ADD CONSTRAINT "question_versions_approvedByActorId_fkey" FOREIGN KEY ("approvedByActorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_choices" ADD CONSTRAINT "question_choices_questionVersionId_fkey" FOREIGN KEY ("questionVersionId") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "answer_keys" ADD CONSTRAINT "answer_keys_questionVersionId_fkey" FOREIGN KEY ("questionVersionId") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "answer_keys" ADD CONSTRAINT "answer_keys_correctChoiceId_fkey" FOREIGN KEY ("correctChoiceId") REFERENCES "question_choices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_categories" ADD CONSTRAINT "document_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_tags" ADD CONSTRAINT "document_tags_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_authorActorId_fkey" FOREIGN KEY ("authorActorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "document_versions" ADD CONSTRAINT "document_versions_approvedByActorId_fkey" FOREIGN KEY ("approvedByActorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_sets" ADD CONSTRAINT "exam_sets_curriculumLevelSubjectId_fkey" FOREIGN KEY ("curriculumLevelSubjectId") REFERENCES "curriculum_level_subjects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_sets" ADD CONSTRAINT "exam_sets_examSessionId_fkey" FOREIGN KEY ("examSessionId") REFERENCES "exam_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exam_sets" ADD CONSTRAINT "exam_sets_authorActorId_fkey" FOREIGN KEY ("authorActorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "exam_sets" ADD CONSTRAINT "exam_sets_approvedByActorId_fkey" FOREIGN KEY ("approvedByActorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "exam_set_items" ADD CONSTRAINT "exam_set_items_examSetId_fkey" FOREIGN KEY ("examSetId") REFERENCES "exam_sets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "exam_set_items" ADD CONSTRAINT "exam_set_items_questionVersionId_fkey" FOREIGN KEY ("questionVersionId") REFERENCES "question_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Conditional-immutability triggers ("ล็อกเมื่อพ้น DRAFT")
-- ต่างจาก curricula/organization_status_history/audit_logs (ล็อกทันทีตั้งแต่แถวแรก)
-- ตารางเหล่านี้แก้ไข/ลบได้อิสระขณะยังอยู่ในสถานะ DRAFT เท่านั้น

CREATE OR REPLACE FUNCTION question_versions_prevent_mutation_after_draft()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'question_versions: row % is locked (status=%) — % is not permitted once past DRAFT; insert a new version instead', OLD."id", OLD."status", TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER question_versions_lock_after_draft_update
  BEFORE UPDATE ON "question_versions"
  FOR EACH ROW EXECUTE FUNCTION question_versions_prevent_mutation_after_draft();

CREATE TRIGGER question_versions_lock_after_draft_delete
  BEFORE DELETE ON "question_versions"
  FOR EACH ROW EXECUTE FUNCTION question_versions_prevent_mutation_after_draft();

CREATE OR REPLACE FUNCTION question_choices_prevent_mutation_after_parent_draft()
RETURNS TRIGGER AS $$
DECLARE
  parent_status "approval_status";
BEGIN
  SELECT "status" INTO parent_status FROM "question_versions" WHERE "id" = OLD."questionVersionId";
  IF parent_status IS NOT NULL AND parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'question_choices: parent question_version % is locked (status=%) — % is not permitted; insert a new question version instead', OLD."questionVersionId", parent_status, TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER question_choices_lock_after_parent_draft_update
  BEFORE UPDATE ON "question_choices"
  FOR EACH ROW EXECUTE FUNCTION question_choices_prevent_mutation_after_parent_draft();

CREATE TRIGGER question_choices_lock_after_parent_draft_delete
  BEFORE DELETE ON "question_choices"
  FOR EACH ROW EXECUTE FUNCTION question_choices_prevent_mutation_after_parent_draft();

CREATE OR REPLACE FUNCTION answer_keys_prevent_mutation_after_parent_draft()
RETURNS TRIGGER AS $$
DECLARE
  parent_status "approval_status";
BEGIN
  SELECT "status" INTO parent_status FROM "question_versions" WHERE "id" = OLD."questionVersionId";
  IF parent_status IS NOT NULL AND parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'answer_keys: parent question_version % is locked (status=%) — % is not permitted; insert a new question version instead', OLD."questionVersionId", parent_status, TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER answer_keys_lock_after_parent_draft_update
  BEFORE UPDATE ON "answer_keys"
  FOR EACH ROW EXECUTE FUNCTION answer_keys_prevent_mutation_after_parent_draft();

CREATE TRIGGER answer_keys_lock_after_parent_draft_delete
  BEFORE DELETE ON "answer_keys"
  FOR EACH ROW EXECUTE FUNCTION answer_keys_prevent_mutation_after_parent_draft();

CREATE OR REPLACE FUNCTION document_versions_prevent_mutation_after_draft()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'document_versions: row % is locked (status=%) — % is not permitted once past DRAFT; insert a new version instead', OLD."id", OLD."status", TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER document_versions_lock_after_draft_update
  BEFORE UPDATE ON "document_versions"
  FOR EACH ROW EXECUTE FUNCTION document_versions_prevent_mutation_after_draft();

CREATE TRIGGER document_versions_lock_after_draft_delete
  BEFORE DELETE ON "document_versions"
  FOR EACH ROW EXECUTE FUNCTION document_versions_prevent_mutation_after_draft();

CREATE OR REPLACE FUNCTION exam_sets_prevent_mutation_after_draft()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD."status" <> 'DRAFT' THEN
    RAISE EXCEPTION 'exam_sets: row % is locked (status=%) — % is not permitted once past DRAFT; create a new exam set instead', OLD."id", OLD."status", TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exam_sets_lock_after_draft_update
  BEFORE UPDATE ON "exam_sets"
  FOR EACH ROW EXECUTE FUNCTION exam_sets_prevent_mutation_after_draft();

CREATE TRIGGER exam_sets_lock_after_draft_delete
  BEFORE DELETE ON "exam_sets"
  FOR EACH ROW EXECUTE FUNCTION exam_sets_prevent_mutation_after_draft();

CREATE OR REPLACE FUNCTION exam_set_items_prevent_mutation_after_parent_draft()
RETURNS TRIGGER AS $$
DECLARE
  parent_status "approval_status";
BEGIN
  SELECT "status" INTO parent_status FROM "exam_sets" WHERE "id" = OLD."examSetId";
  IF parent_status IS NOT NULL AND parent_status <> 'DRAFT' THEN
    RAISE EXCEPTION 'exam_set_items: parent exam_set % is locked (status=%) — % is not permitted; create a new exam set instead', OLD."examSetId", parent_status, TG_OP;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER exam_set_items_lock_after_parent_draft_update
  BEFORE UPDATE ON "exam_set_items"
  FOR EACH ROW EXECUTE FUNCTION exam_set_items_prevent_mutation_after_parent_draft();

CREATE TRIGGER exam_set_items_lock_after_parent_draft_delete
  BEFORE DELETE ON "exam_set_items"
  FOR EACH ROW EXECUTE FUNCTION exam_set_items_prevent_mutation_after_parent_draft();

-- Seed data: minimal mock reference data to prove the schema, incl. the
-- curriculum/level/year/subject search path via exam_sets + exam_sessions.
-- MOCK DATA ONLY per data-policy.md ข้อ 3 — no real persons/organizations.
-- Reuses existing seed rows from the education-domain migration:
-- prog_naktham / ay_2567 / ay_2568 / lvl_nt_tri / subj_dhammavibhaga /
-- subj_essay / cur_naktham_v1 / cls_nt_tri_dhammavibhaga.
INSERT INTO "categories" ("id", "name", "code", "createdAt", "updatedAt") VALUES
    ('cat_dhamma_ethics', 'หมวดศีลธรรม', 'ETHICS', now(), now()),
    ('cat_pali_grammar', 'หมวดไวยากรณ์บาลี', 'PALI_GRAMMAR', now(), now());

INSERT INTO "tags" ("id", "name", "createdAt") VALUES
    ('tag_practice_set', 'ชุดฝึกซ้อม', now()),
    ('tag_official_2568', 'สนามหลวง 2568', now());

INSERT INTO "questions" ("id", "subjectId", "levelId", "questionType", "createdAt", "updatedAt") VALUES
    ('q_dhammavibhaga_001', 'subj_dhammavibhaga', 'lvl_nt_tri', 'MULTIPLE_CHOICE', now(), now()),
    ('q_essay_001', 'subj_essay', 'lvl_nt_tri', 'ESSAY', now(), now());

INSERT INTO "question_categories" ("questionId", "categoryId", "createdAt") VALUES
    ('q_dhammavibhaga_001', 'cat_dhamma_ethics', now());

INSERT INTO "question_tags" ("questionId", "tagId", "createdAt") VALUES
    ('q_dhammavibhaga_001', 'tag_practice_set', now());

-- q_dhammavibhaga_001: หนึ่งเวอร์ชัน APPROVED (locked) เพื่อทดสอบว่า trigger ล็อกจริง
INSERT INTO "question_versions" ("id", "questionId", "versionNo", "content", "status", "approvedAt", "createdAt", "updatedAt") VALUES
    ('qv_dhammavibhaga_001_v1', 'q_dhammavibhaga_001', 1, 'ข้อใดเป็นองค์ประกอบของศีล 5 (มือกทดสอบ)', 'APPROVED', now(), now(), now());

-- q_essay_001: หนึ่งเวอร์ชัน DRAFT (ยังแก้ไขได้) เพื่อทดสอบว่ายังแก้ได้จริงขณะ DRAFT
INSERT INTO "question_versions" ("id", "questionId", "versionNo", "content", "status", "createdAt", "updatedAt") VALUES
    ('qv_essay_001_v1', 'q_essay_001', 1, 'จงแต่งความเรียงแก้กระทู้ธรรมหัวข้อ "สติเป็นเครื่องกั้นความประมาท" (มือกทดสอบ)', 'DRAFT', now(), now());

INSERT INTO "question_choices" ("id", "questionVersionId", "label", "content", "sortOrder", "createdAt", "updatedAt") VALUES
    ('qc_dhammavibhaga_001_a', 'qv_dhammavibhaga_001_v1', 'ก', 'เว้นจากการฆ่าสัตว์ (มือกทดสอบ)', 1, now(), now()),
    ('qc_dhammavibhaga_001_b', 'qv_dhammavibhaga_001_v1', 'ข', 'เว้นจากการลักทรัพย์ (มือกทดสอบ)', 2, now(), now());

INSERT INTO "answer_keys" ("id", "questionVersionId", "correctChoiceId", "createdAt", "updatedAt") VALUES
    ('ak_dhammavibhaga_001', 'qv_dhammavibhaga_001_v1', 'qc_dhammavibhaga_001_a', now(), now());

INSERT INTO "documents" ("id", "title", "documentType", "createdAt", "updatedAt") VALUES
    ('doc_answer_sheet_template', 'แบบฟอร์มกระดาษคำตอบมาตรฐาน (มือกทดสอบ)', 'ANSWER_SHEET_TEMPLATE', now(), now());

INSERT INTO "document_categories" ("documentId", "categoryId", "createdAt") VALUES
    ('doc_answer_sheet_template', 'cat_dhamma_ethics', now());

INSERT INTO "document_versions" ("id", "documentId", "versionNo", "fileName", "status", "createdAt", "updatedAt") VALUES
    ('dv_answer_sheet_template_v1', 'doc_answer_sheet_template', 1, 'answer-sheet-template-v1.pdf (placeholder — ยังไม่เชื่อม object storage)', 'DRAFT', now(), now());

-- exam_sets: ผูก curriculum_level_subject (cls_nt_tri_dhammavibhaga = คู่ curriculum
-- naktham v1 / level TRI / subject dhammavibhaga) — หนึ่งชุดเป็นคลังส่วนกลาง
-- (examSessionId = NULL) อีกหนึ่งชุดผูกกับปีการศึกษา 2568 ผ่าน exam_sessions เพื่อ
-- ทดสอบการค้นตามปีจริง
INSERT INTO "exam_sessions" ("id", "programId", "academicYearId", "curriculumId", "roundNumber", "name", "status", "createdAt", "updatedAt") VALUES
    ('es_naktham_2568_r1', 'prog_naktham', 'ay_2568', 'cur_naktham_v1', 1, 'สอบสนามหลวงนักธรรม 2568 รอบที่ 1 (มือกทดสอบ)', 'PLANNED', now(), now());

INSERT INTO "exam_sets" ("id", "curriculumLevelSubjectId", "examSessionId", "name", "status", "createdAt", "updatedAt") VALUES
    ('xset_practice_dhammavibhaga_tri', 'cls_nt_tri_dhammavibhaga', NULL, 'ชุดฝึกซ้อมธรรมวิภาค ชั้นตรี (มือกทดสอบ)', 'DRAFT', now(), now()),
    ('xset_official_dhammavibhaga_tri_2568', 'cls_nt_tri_dhammavibhaga', 'es_naktham_2568_r1', 'ชุดข้อสอบสนามหลวงธรรมวิภาค ชั้นตรี 2568 (มือกทดสอบ)', 'APPROVED', now(), now());

INSERT INTO "exam_set_items" ("id", "examSetId", "questionVersionId", "sortOrder", "score", "createdAt") VALUES
    ('xsi_official_001', 'xset_official_dhammavibhaga_tri_2568', 'qv_dhammavibhaga_001_v1', 1, 2, now());
