-- P4 Public Front End: "สร้างห้องสมุด PDF/Download" — ส่วนขยายของ M3
-- (คลังข้อสอบและเอกสาร, ดู prisma/exam-document-schema.md) เพื่อรองรับ
-- "public/private access" ที่งานนี้ระบุ (ดู prisma/library-pages.md §2 สำหรับ
-- เหตุผลเต็ม)
--
-- Hand-authored to match Prisma's real migration conventions — Prisma CLI
-- cannot run in this environment (see prisma/MIGRATIONS.md). Verified for
-- real against local PostgreSQL via prisma/dev-migrate-verify.mjs.
--
-- เพิ่มคอลัมน์ "isPublic" (NOT NULL, default false — deny-by-default: เอกสารใหม่
-- ที่ไม่ได้ระบุชัดเจนถือเป็น private/internal ก่อนเสมอ) ใน "documents" เพื่อแยก
-- เอกสารที่เผยแพร่ต่อ Guest ได้ (isPublic=true) ออกจากเอกสารที่ต้อง login ก่อน
-- จึงจะเห็น (isPublic=false — เทียบเท่าระดับ "Internal" ใน data-policy.md ข้อ 2)
-- ค่า default=false ทำให้ script/seed เดิมที่ insert เอกสารไปแล้วก่อนหน้านี้
-- (เช่นจากงาน "สร้างคลังข้อสอบ + Search") ยังคง valid โดยไม่ต้องแก้ย้อนหลัง แต่
-- prisma/seed.ts อัปเดตให้ตั้งค่าฟิลด์นี้อย่างชัดเจนสำหรับทุกแถวแล้ว (ไม่พึ่ง
-- default โดยปริยายในข้อมูลจำลอง)

-- AlterTable
ALTER TABLE "documents" ADD COLUMN "isPublic" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "documents_isPublic_idx" ON "documents"("isPublic");
