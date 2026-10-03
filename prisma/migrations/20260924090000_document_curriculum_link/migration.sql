-- P4 Public Front End: "สร้างคลังข้อสอบ + Search" — ส่วนขยายของ M3
-- (คลังข้อสอบและเอกสาร, ดู prisma/exam-document-schema.md) เพื่อรองรับ filter
-- "หลักสูตร/ชั้น/ปี/วิชา" ของงานนี้ (ดู prisma/exam-bank-pages.md §2 สำหรับเหตุผลเต็ม)
--
-- Hand-authored to match Prisma's real migration conventions — Prisma CLI
-- cannot run in this environment (see prisma/MIGRATIONS.md). Verified for
-- real against local PostgreSQL via prisma/dev-migrate-verify.mjs.
--
-- เพิ่มคอลัมน์ nullable 3 ตัวใน "documents": levelId/subjectId (ผูกตรงแบบเดียวกับ
-- Question ข้อ 4 ใน exam-document-schema.md — ไม่ผูก curriculumLevelSubjectId
-- เฉพาะเจาะจง เพราะเอกสาร เช่น ข้อสอบเก่าที่พิมพ์แล้ว ผูกกับ "ชั้น+วิชา" ในความเป็น
-- จริง ไม่ใช่หลักสูตรเวอร์ชันใดเวอร์ชันหนึ่ง) และ academicYearId (ปีที่ใช้สอบจริง
-- — ตรงไปยัง academic_years แทนการอ้อมผ่าน exam_sessions เพราะเอกสารสาธารณะสนใจ
-- แค่ "ปีไหน" ไม่ใช่ "รอบสอบ/session ใด") ทั้งสามเป็น nullable เพราะเอกสารบาง
-- ประเภท (CIRCULAR/OTHER) ไม่จำเป็นต้องผูกชั้น/วิชา/ปีใดเลย

-- AlterTable
ALTER TABLE "documents" ADD COLUMN "levelId" TEXT;
ALTER TABLE "documents" ADD COLUMN "subjectId" TEXT;
ALTER TABLE "documents" ADD COLUMN "academicYearId" TEXT;

-- CreateIndex
CREATE INDEX "documents_levelId_subjectId_idx" ON "documents"("levelId", "subjectId");
CREATE INDEX "documents_academicYearId_idx" ON "documents"("academicYearId");

-- AddForeignKey
-- ON DELETE SET NULL: level/subject/academic_year ที่ผูกอยู่ เป็นข้อมูลจัดหมวดหมู่
-- เสริม ไม่ใช่ identity ของเอกสาร — หากถูกลบ (กรณีหายาก เพราะปกติ soft-delete)
-- เอกสารเองต้องไม่หายไปด้วย
ALTER TABLE "documents" ADD CONSTRAINT "documents_levelId_fkey" FOREIGN KEY ("levelId") REFERENCES "education_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "subjects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "documents" ADD CONSTRAINT "documents_academicYearId_fkey" FOREIGN KEY ("academicYearId") REFERENCES "academic_years"("id") ON DELETE SET NULL ON UPDATE CASCADE;
