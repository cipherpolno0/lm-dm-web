-- P3 Authentication & RBAC — Scope-based permission (M9)
--
-- เพิ่มสองตารางสำหรับ "scope" ที่ permission matrix (roles-permissions.md) อ้างอิง:
--   1. user_organization_scopes — ขอบเขตตามลำดับชั้นการปกครอง (Regional Admin
--      เห็นเฉพาะเขตตน + เขตย่อยใต้บังคับบัญชา, Registrar Staff เห็นเฉพาะสังกัดตน)
--      คำนวณการ "ครอบคลุมเขตย่อย" (cascade ลงล่าง) ด้วย recursive CTE เดินขึ้นจาก
--      องค์กรเป้าหมายผ่าน parentId จนถึงราก แล้วตรวจว่าผ่านองค์กรที่ user มี scope
--      แถวที่ยัง active (revokedAt IS NULL) หรือไม่ — ไม่ denormalize เป็น closure
--      table เพื่อเลี่ยงปัญหาข้อมูลไม่ตรงกันเมื่อมีการย้าย/ปรับโครงสร้างองค์กร
--   2. user_program_scopes — ขอบเขตตามสายการศึกษา (Teacher/Examiner ที่รับผิดชอบ
--      เฉพาะนักธรรม หรือเฉพาะบาลี ไม่ควรแตะข้อสอบ/หลักสูตรของสายอื่น)
--
-- ทั้งสองตาราง append-only ในความหมาย "ไม่ overwrite ประวัติ": การถอน scope ใช้
-- UPDATE ตั้ง revokedAt (ไม่ DELETE แถว) เพื่อให้ตรวจสอบย้อนหลังได้ว่าใครเคยมีสิทธิ์
-- อะไรช่วงเวลาใด (data-policy.md ข้อ 7) — บังคับด้วย trigger ที่ห้าม DELETE และห้าม
-- UPDATE คอลัมน์อื่นนอกจาก revokedAt/revokedById หลัง grant ครั้งแรก
--
-- Partial unique index (ไม่มี syntax ใน Prisma schema language — เขียนตรงนี้เท่านั้น,
-- ตามธรรมเนียมเดิมของโปรเจกต์ เช่น organizations_code_key): ผู้ใช้หนึ่งคนมี scope
-- "active" ซ้ำกันในองค์กร/โปรแกรมเดียวกันไม่ได้ในเวลาเดียวกัน (ป้องกัน grant ซ้ำ)

-- =====================================================================
-- user_organization_scopes
-- =====================================================================
CREATE TABLE "user_organization_scopes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,

    CONSTRAINT "user_organization_scopes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "user_organization_scopes"
    ADD CONSTRAINT "user_organization_scopes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_organization_scopes"
    ADD CONSTRAINT "user_organization_scopes_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_organization_scopes"
    ADD CONSTRAINT "user_organization_scopes_grantedById_fkey"
    FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_organization_scopes"
    ADD CONSTRAINT "user_organization_scopes_revokedById_fkey"
    FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "user_organization_scopes_userId_idx" ON "user_organization_scopes"("userId");
CREATE INDEX "user_organization_scopes_organizationId_idx" ON "user_organization_scopes"("organizationId");

-- หนึ่งคนมี scope active ซ้ำในองค์กรเดียวกันไม่ได้ (grant ใหม่ต้อง revoke ของเดิมก่อน)
CREATE UNIQUE INDEX "user_organization_scopes_active_key"
    ON "user_organization_scopes"("userId", "organizationId")
    WHERE "revokedAt" IS NULL;

CREATE OR REPLACE FUNCTION user_organization_scopes_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'user_organization_scopes is append-only: DELETE is not permitted — revoke by setting revokedAt instead';
  END IF;
  -- อนุญาต UPDATE ได้เฉพาะการ "ถอน" สิทธิ์ (ตั้ง revokedAt/revokedById ครั้งแรก) —
  -- ห้ามแก้ userId/organizationId/grantedById/createdAt ของแถวเดิม และห้ามยกเลิก
  -- การถอนสิทธิ์ที่ทำไปแล้ว (revokedAt ต้องไม่ถูกเปลี่ยนกลับเป็น NULL)
  IF NEW."userId" <> OLD."userId"
     OR NEW."organizationId" <> OLD."organizationId"
     OR NEW."createdAt" <> OLD."createdAt"
     OR (OLD."grantedById" IS DISTINCT FROM NEW."grantedById")
     OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS NULL) THEN
    RAISE EXCEPTION 'user_organization_scopes: only granting revokedAt/revokedById (revocation) may be updated; grant a new row instead of editing an existing one';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_organization_scopes_no_delete
  BEFORE DELETE ON "user_organization_scopes"
  FOR EACH ROW EXECUTE FUNCTION user_organization_scopes_prevent_mutation();

CREATE TRIGGER user_organization_scopes_restrict_update
  BEFORE UPDATE ON "user_organization_scopes"
  FOR EACH ROW EXECUTE FUNCTION user_organization_scopes_prevent_mutation();

-- =====================================================================
-- user_program_scopes
-- =====================================================================
CREATE TABLE "user_program_scopes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "programId" TEXT NOT NULL,
    "grantedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedById" TEXT,

    CONSTRAINT "user_program_scopes_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "user_program_scopes"
    ADD CONSTRAINT "user_program_scopes_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_program_scopes"
    ADD CONSTRAINT "user_program_scopes_programId_fkey"
    FOREIGN KEY ("programId") REFERENCES "programs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "user_program_scopes"
    ADD CONSTRAINT "user_program_scopes_grantedById_fkey"
    FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "user_program_scopes"
    ADD CONSTRAINT "user_program_scopes_revokedById_fkey"
    FOREIGN KEY ("revokedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "user_program_scopes_userId_idx" ON "user_program_scopes"("userId");
CREATE INDEX "user_program_scopes_programId_idx" ON "user_program_scopes"("programId");

CREATE UNIQUE INDEX "user_program_scopes_active_key"
    ON "user_program_scopes"("userId", "programId")
    WHERE "revokedAt" IS NULL;

CREATE OR REPLACE FUNCTION user_program_scopes_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'user_program_scopes is append-only: DELETE is not permitted — revoke by setting revokedAt instead';
  END IF;
  IF NEW."userId" <> OLD."userId"
     OR NEW."programId" <> OLD."programId"
     OR NEW."createdAt" <> OLD."createdAt"
     OR (OLD."grantedById" IS DISTINCT FROM NEW."grantedById")
     OR (OLD."revokedAt" IS NOT NULL AND NEW."revokedAt" IS NULL) THEN
    RAISE EXCEPTION 'user_program_scopes: only granting revokedAt/revokedById (revocation) may be updated; grant a new row instead of editing an existing one';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_program_scopes_no_delete
  BEFORE DELETE ON "user_program_scopes"
  FOR EACH ROW EXECUTE FUNCTION user_program_scopes_prevent_mutation();

CREATE TRIGGER user_program_scopes_restrict_update
  BEFORE UPDATE ON "user_program_scopes"
  FOR EACH ROW EXECUTE FUNCTION user_program_scopes_prevent_mutation();

-- =====================================================================
-- users.personId — เชื่อม "ตัวตนผู้ใช้ที่ login" (User) กับ "ระเบียนทะเบียนบุคคล"
-- (Person, M1 Sangha Registry) เพื่อให้ scope "เฉพาะของตน" (OWN_RECORD, เช่น
-- Student ดูทะเบียน/ผลสอบของตนเอง) ตรวจสอบได้จริง — ก่อนหน้านี้ไม่มีการเชื่อมนี้เลย
-- ในสคีมา (ช่องว่างเชิงโครงสร้างที่งาน RBAC นี้ต้องอุดตามที่ระบุใน roles-permissions.md)
-- Nullable + unique: ไม่ใช่ผู้ใช้ทุกคนจะมีระเบียน Person (เช่น เจ้าหน้าที่ธุรการที่ไม่ใช่
-- พระ/สามเณร/นักเรียนที่ขึ้นทะเบียน) และหนึ่ง Person ผูกกับหนึ่ง User เท่านั้น
-- =====================================================================
ALTER TABLE "users" ADD COLUMN "personId" TEXT;

ALTER TABLE "users"
    ADD CONSTRAINT "users_personId_fkey"
    FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "users_personId_key" ON "users"("personId") WHERE "personId" IS NOT NULL;
