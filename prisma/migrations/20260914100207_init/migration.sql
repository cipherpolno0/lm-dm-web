-- CreateEnum
CREATE TYPE "user_role" AS ENUM ('SUPER_ADMIN', 'CENTRAL_OFFICER', 'REGIONAL_ADMIN', 'REGISTRAR_STAFF', 'TEACHER', 'EXAMINER', 'STUDENT', 'AUDITOR');

-- CreateEnum
CREATE TYPE "user_status" AS ENUM ('PENDING_VERIFICATION', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "audit_action" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" "user_role" NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "action" "audit_action" NOT NULL,
    "actorId" TEXT,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_idx" ON "audit_logs"("actorId");

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Custom (hand-added, beyond what `prisma migrate dev` generates automatically —
-- Prisma officially supports editing a migration.sql before applying it):
-- enforce audit_logs immutability at the database level as defense in depth.
-- Per data-policy.md ข้อ 7 และ dev-rules.md ข้อ 6: audit records ต้องไม่ถูก
-- update/delete แม้ application-level code จะมีบั๊ก
CREATE OR REPLACE FUNCTION audit_logs_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_logs is append-only: % is not permitted on this table', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_no_update
  BEFORE UPDATE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_prevent_mutation();

CREATE TRIGGER audit_logs_no_delete
  BEFORE DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION audit_logs_prevent_mutation();
