-- P2 Database & Sangha Domain: organizations, hierarchy, positions,
-- appointments, contacts, addresses, organization status & history.
-- Hand-authored to match Prisma's real migration conventions — Prisma CLI
-- cannot run in this environment (see prisma/MIGRATIONS.md). Verified for
-- real against local PostgreSQL via prisma/dev-migrate-verify.mjs.

-- CreateEnum
CREATE TYPE "organization_type" AS ENUM ('MAHATHERASAMAKHOM', 'SANGHA_ZONE', 'SANGHA_REGION', 'SANGHA_PROVINCE', 'SANGHA_DISTRICT', 'SANGHA_SUBDISTRICT', 'TEMPLE', 'STUDY_INSTITUTE', 'EXAM_OFFICE');

-- CreateEnum
CREATE TYPE "organization_status" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED', 'DISSOLVED', 'MERGED');

-- CreateEnum
CREATE TYPE "address_type" AS ENUM ('MAIN', 'MAILING', 'OTHER');

-- CreateEnum
CREATE TYPE "contact_type" AS ENUM ('PHONE', 'MOBILE', 'FAX', 'EMAIL', 'WEBSITE', 'LINE', 'OTHER');

-- CreateEnum
CREATE TYPE "appointment_status" AS ENUM ('ACTIVE', 'RESIGNED', 'REMOVED', 'TRANSFERRED', 'DECEASED', 'EXPIRED');

-- CreateTable
-- Reference/lookup data for valid (child, parent) organization type pairs.
-- Created BEFORE "organizations" because the hierarchy-validation trigger on
-- "organizations" (added further below) reads from this table, and it must
-- already contain the seed rows below before the first organization row can
-- be inserted.
CREATE TABLE "organization_hierarchy_rules" (
    "id" TEXT NOT NULL,
    "childType" "organization_type" NOT NULL,
    "parentType" "organization_type",
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_hierarchy_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
-- Two partial unique indexes instead of one plain UNIQUE constraint, because
-- Postgres treats every NULL as distinct under a normal UNIQUE constraint —
-- that would silently allow duplicate "root" rules (parentType IS NULL) for
-- the same childType.
CREATE UNIQUE INDEX "organization_hierarchy_rules_root_key" ON "organization_hierarchy_rules"("childType") WHERE "parentType" IS NULL;
CREATE UNIQUE INDEX "organization_hierarchy_rules_pair_key" ON "organization_hierarchy_rules"("childType", "parentType") WHERE "parentType" IS NOT NULL;

-- Seed data: allowed parent/child organization-type pairs, based on the
-- general structure of Thai Sangha ecclesiastical administration
-- (มหาเถรสมาคม → หน → ภาค → จังหวัด → อำเภอ → ตำบล → วัด, plus สำนักเรียน and
-- สำนักงานแม่กองธรรม/บาลีสนามหลวง as separate branches under มหาเถรสมาคม).
-- NOTE FOR OWNER REVIEW: this seed set is a reasonable starting point, not a
-- verified-with-domain-expert final ruleset — please review/adjust rows here
-- before the Real-data Readiness Gate (data-policy.md ข้อ 4). Since this is
-- reference data (not a schema shape), rows can be added/edited later via a
-- normal DML migration, with no schema change required.
INSERT INTO "organization_hierarchy_rules" ("id", "childType", "parentType", "notes") VALUES
    ('hr_mahatherasamakhom_root', 'MAHATHERASAMAKHOM', NULL, 'มหาเถรสมาคม — หน่วยงานสูงสุด ไม่มี parent'),
    ('hr_zone_under_mahathera', 'SANGHA_ZONE', 'MAHATHERASAMAKHOM', 'หน (เช่น หนกลาง หนเหนือ หนตะวันออก หนใต้) อยู่ภายใต้มหาเถรสมาคม'),
    ('hr_region_under_zone', 'SANGHA_REGION', 'SANGHA_ZONE', 'ภาค อยู่ภายใต้หน'),
    ('hr_province_under_region', 'SANGHA_PROVINCE', 'SANGHA_REGION', 'จังหวัด อยู่ภายใต้ภาค'),
    ('hr_district_under_province', 'SANGHA_DISTRICT', 'SANGHA_PROVINCE', 'อำเภอ อยู่ภายใต้จังหวัด'),
    ('hr_subdistrict_under_district', 'SANGHA_SUBDISTRICT', 'SANGHA_DISTRICT', 'ตำบล อยู่ภายใต้อำเภอ'),
    ('hr_temple_under_subdistrict', 'TEMPLE', 'SANGHA_SUBDISTRICT', 'วัด อยู่ภายใต้เจ้าคณะตำบล'),
    ('hr_studyinst_under_temple', 'STUDY_INSTITUTE', 'TEMPLE', 'สำนักเรียนที่ตั้งอยู่ในวัด (กรณีทั่วไป)'),
    ('hr_studyinst_under_province', 'STUDY_INSTITUTE', 'SANGHA_PROVINCE', 'สำนักเรียนบางแห่งขึ้นตรงกับเจ้าคณะจังหวัด (ไม่ผูกกับวัดใดวัดหนึ่ง)'),
    ('hr_examoffice_under_mahathera', 'EXAM_OFFICE', 'MAHATHERASAMAKHOM', 'สำนักงานแม่กองธรรม/บาลีสนามหลวง อยู่ภายใต้มหาเถรสมาคมโดยตรง');

-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "code" TEXT,
    "type" "organization_type" NOT NULL,
    "name" TEXT NOT NULL,
    "nameEn" TEXT,
    "parentId" TEXT,
    "status" "organization_status" NOT NULL DEFAULT 'ACTIVE',
    "establishedDate" TIMESTAMP(3),
    "dissolvedDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organizations_code_key" ON "organizations"("code") WHERE "code" IS NOT NULL;
CREATE INDEX "organizations_type_idx" ON "organizations"("type");
CREATE INDEX "organizations_parentId_idx" ON "organizations"("parentId");
CREATE INDEX "organizations_status_idx" ON "organizations"("status");

-- AddForeignKey
ALTER TABLE "organizations" ADD CONSTRAINT "organizations_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Custom (hand-added, beyond what `prisma migrate dev` generates automatically
-- — same technique used for audit_logs' immutability trigger in the P1
-- migration): enforce that an organization's (type, parentId) always matches
-- an allowed pair in organization_hierarchy_rules, as defense in depth beyond
-- what a plain FK can express (e.g. a TEMPLE must not be a direct child of a
-- SANGHA_PROVINCE, skipping the district/subdistrict levels).
CREATE OR REPLACE FUNCTION organizations_validate_hierarchy()
RETURNS TRIGGER AS $$
DECLARE
  parent_type_var "organization_type";
  rule_exists BOOLEAN;
BEGIN
  IF NEW."parentId" IS NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM "organization_hierarchy_rules"
      WHERE "childType" = NEW."type" AND "parentType" IS NULL
    ) INTO rule_exists;
    IF NOT rule_exists THEN
      RAISE EXCEPTION 'organization type % cannot be top-level (no parent) — no matching root rule in organization_hierarchy_rules', NEW."type";
    END IF;
  ELSE
    IF NEW."parentId" = NEW."id" THEN
      RAISE EXCEPTION 'organization cannot be its own parent (id=%)', NEW."id";
    END IF;

    SELECT "type" INTO parent_type_var FROM "organizations" WHERE "id" = NEW."parentId";
    IF parent_type_var IS NULL THEN
      RAISE EXCEPTION 'parent organization % does not exist', NEW."parentId";
    END IF;

    SELECT EXISTS(
      SELECT 1 FROM "organization_hierarchy_rules"
      WHERE "childType" = NEW."type" AND "parentType" = parent_type_var
    ) INTO rule_exists;
    IF NOT rule_exists THEN
      RAISE EXCEPTION 'organization type % cannot have a parent of type % — no matching rule in organization_hierarchy_rules', NEW."type", parent_type_var;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organizations_validate_hierarchy_trigger
  BEFORE INSERT OR UPDATE OF "type", "parentId" ON "organizations"
  FOR EACH ROW EXECUTE FUNCTION organizations_validate_hierarchy();

-- CreateTable
CREATE TABLE "organization_status_history" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "status" "organization_status" NOT NULL,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "documentRef" TEXT,
    "recordedByActorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "organization_status_history_organizationId_effectiveFrom_key" ON "organization_status_history"("organizationId", "effectiveFrom");
CREATE INDEX "organization_status_history_organizationId_idx" ON "organization_status_history"("organizationId");
CREATE INDEX "organization_status_history_recordedByActorId_idx" ON "organization_status_history"("recordedByActorId");

-- AddForeignKey
ALTER TABLE "organization_status_history" ADD CONSTRAINT "organization_status_history_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization_status_history" ADD CONSTRAINT "organization_status_history_recordedByActorId_fkey" FOREIGN KEY ("recordedByActorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Custom: append-only immutability, same pattern as audit_logs (data-policy.md
-- ข้อ 7 — "audit record เขียนได้ครั้งเดียว ไม่แก้ไขย้อนหลัง").
CREATE OR REPLACE FUNCTION organization_status_history_prevent_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'organization_status_history is append-only: % is not permitted on this table', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER organization_status_history_no_update
  BEFORE UPDATE ON "organization_status_history"
  FOR EACH ROW EXECUTE FUNCTION organization_status_history_prevent_mutation();

CREATE TRIGGER organization_status_history_no_delete
  BEFORE DELETE ON "organization_status_history"
  FOR EACH ROW EXECUTE FUNCTION organization_status_history_prevent_mutation();

-- CreateTable
CREATE TABLE "addresses" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "addressType" "address_type" NOT NULL,
    "houseNo" TEXT,
    "moo" TEXT,
    "soi" TEXT,
    "road" TEXT,
    "subDistrict" TEXT,
    "district" TEXT,
    "province" TEXT,
    "postalCode" TEXT,
    "country" TEXT NOT NULL DEFAULT 'ไทย',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "addresses_organizationId_addressType_idx" ON "addresses"("organizationId", "addressType");
-- Partial unique index: at most one CURRENT, non-deleted address per
-- (organization, address type) — prevents two "current" main addresses
-- existing at once for the same organization.
CREATE UNIQUE INDEX "addresses_org_type_current_key" ON "addresses"("organizationId", "addressType") WHERE "isCurrent" = true AND "deletedAt" IS NULL;

-- AddForeignKey
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" "contact_type" NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contacts_organizationId_idx" ON "contacts"("organizationId");

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "positions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "titleEn" TEXT,
    "applicableOrgType" "organization_type",
    "rankLevel" INTEGER,
    "isUniquePerOrganization" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "positions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "positions_code_key" ON "positions"("code");
CREATE INDEX "positions_applicableOrgType_idx" ON "positions"("applicableOrgType");

-- CreateTable
CREATE TABLE "persons" (
    "id" TEXT NOT NULL,
    "referenceCode" TEXT,
    "prefix" TEXT,
    "fullName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "persons_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "persons_referenceCode_key" ON "persons"("referenceCode");

-- CreateTable
CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "appointingOrganizationId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "status" "appointment_status" NOT NULL DEFAULT 'ACTIVE',
    "documentRef" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "appointments_organizationId_positionId_personId_startDate_key" ON "appointments"("organizationId", "positionId", "personId", "startDate");
CREATE INDEX "appointments_organizationId_positionId_status_idx" ON "appointments"("organizationId", "positionId", "status");
CREATE INDEX "appointments_personId_idx" ON "appointments"("personId");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_personId_fkey" FOREIGN KEY ("personId") REFERENCES "persons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_appointingOrganizationId_fkey" FOREIGN KEY ("appointingOrganizationId") REFERENCES "organizations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
