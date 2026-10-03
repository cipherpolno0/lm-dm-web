-- P3 Authentication & RBAC — Auth.js (Credentials provider) + Session foundation.
-- ดู adr/0003-authjs-server-side-authorization.md, architecture.md §3.4, ADR-0004,
-- requirements.md §8 (Login function spec), user-flows.md F5.1-F5.4/F6.5

-- =====================================================================
-- 1) users.password_hash — เก็บ bcrypt hash เท่านั้น ไม่เคยเก็บ plaintext
--    Nullable โดยตั้งใจ: รองรับผู้ใช้ที่ถูกสร้างโดย Admin แต่ยังไม่ตั้งรหัสผ่าน
--    (สถานะ PENDING_VERIFICATION/PENDING_APPROVAL) หรือผู้ใช้ที่จะผูก OAuth ในอนาคต
--    (นอกขอบเขตงานนี้ — ดู prisma/AUTH.md) — authorize() ปฏิเสธ credentials login
--    แบบ generic เมื่อ password_hash เป็น NULL เพื่อไม่ leak ว่าบัญชีมีอยู่จริง
-- =====================================================================
ALTER TABLE "users" ADD COLUMN "passwordHash" TEXT;

-- =====================================================================
-- 2) login_lockouts — ตาราง Postgres (counter + expiry) สำหรับ rate-limiting
--    การ login ผิดพลาด ตาม architecture.md §3.4 และ ADR-0004 ข้อ 2 (ไม่ใช้ Redis)
--    เป็น "operational state" ที่ mutable/reset ได้ ไม่ใช่ audit history —
--    ประวัติการพยายาม login แยกเก็บแบบ append-only ใน login_audit_logs (ข้อ 3)
-- =====================================================================
CREATE TABLE "login_lockouts" (
    "userId" TEXT NOT NULL,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "login_lockouts_pkey" PRIMARY KEY ("userId"),
    CONSTRAINT "login_lockouts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- =====================================================================
-- 3) login_failure_reason + login_audit_logs — audit การ login ทุกครั้งแบบ
--    append-only (แยกจาก audit_logs ทั่วไป เพราะ login attempt ที่ email ไม่มีอยู่
--    จริงไม่มี User row ให้ actorId อ้างอิง และ semantics เป็น "authentication event"
--    ไม่ใช่ CRUD บน entity) ตาม requirements.md §8 Login spec ("Audit: บันทึกทุกครั้ง
--    ที่ login สำเร็จ/ล้มเหลว พร้อม timestamp, IP, user-agent")
--    failureReason เก็บไว้สำหรับ diagnostics ฝั่ง server เท่านั้น — ห้ามส่งค่านี้ตรงๆ
--    ให้ client (ดู data-policy.md: ห้าม log/leak รายละเอียดที่ช่วย account enumeration)
-- =====================================================================
CREATE TYPE "login_failure_reason" AS ENUM ('INVALID_CREDENTIALS', 'ACCOUNT_LOCKED', 'ACCOUNT_INACTIVE');

CREATE TABLE "login_audit_logs" (
    "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
    "emailAttempted" TEXT NOT NULL,
    "userId" TEXT,
    "success" BOOLEAN NOT NULL,
    "failureReason" "login_failure_reason",
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_audit_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "login_audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "login_audit_logs_userId_idx" ON "login_audit_logs"("userId");
CREATE INDEX "login_audit_logs_emailAttempted_idx" ON "login_audit_logs"("emailAttempted");
CREATE INDEX "login_audit_logs_createdAt_idx" ON "login_audit_logs"("createdAt");

-- Custom (hand-added, beyond what `prisma migrate dev` generates automatically —
-- Prisma officially supports editing a migration.sql before applying it):
-- login_audit_logs ต้อง append-only เช่นเดียวกับ audit_logs (dev-rules.md ข้อ 6:
-- เก็บ history/audit ต้องไม่ overwrite ประวัติเดิม) — ป้องกันระดับฐานข้อมูลเป็น
-- defense-in-depth เผื่อบั๊กที่ application layer
CREATE OR REPLACE FUNCTION login_audit_logs_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'login_audit_logs is append-only: % is not permitted on this table', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER login_audit_logs_no_update
  BEFORE UPDATE ON "login_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION login_audit_logs_prevent_mutation();

CREATE TRIGGER login_audit_logs_no_delete
  BEFORE DELETE ON "login_audit_logs"
  FOR EACH ROW EXECUTE FUNCTION login_audit_logs_prevent_mutation();
