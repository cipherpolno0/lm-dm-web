/**
 * prisma/seed.ts — สร้างข้อมูลจำลอง (mock/seed data) สำหรับ development และ test
 *
 * งาน: "สร้าง Seed Data แบบสมมติ" (Phase: P2 Database & Sangha Domain)
 * ขอบเขต: องค์กร, บุคลากรจำลอง (persons + appointments), หลักสูตร/วิชา (education
 * domain), ข้อสอบ (question bank), เอกสาร (documents), และสมาชิกจำลอง (User accounts
 * — ยังไม่มีโมดูล "ระบบสมาชิก" (M5) แยกต่างหากในสคีมาปัจจุบัน ดูหัวข้อ "ขอบเขต" ท้าย
 * ไฟล์นี้)
 *
 * ทำไมใช้ raw `pg` แทน `@prisma/client` (เหตุผลเดียวกับที่ใช้ทั้งโปรเจกต์มาตลอด):
 * `npx prisma generate` ใช้งานไม่ได้จริงในสภาพแวดล้อมที่พัฒนางานนี้ (binaries.prisma.sh
 * ถูกบล็อก — ดู prisma/MIGRATIONS.md หัวข้อ 1) จึงไม่มี @prisma/client ที่ generate
 * จริงให้ import ได้ สคริปต์นี้จึงเขียนด้วย `pg` ตรงๆ เหมือน
 * prisma/dev-migrate-verify.mjs และ prisma/test-exam-document-domain.mjs — เมื่อ
 * Prisma CLI ใช้งานได้จริงในอนาคต ควรเขียนสคริปต์นี้ใหม่ด้วย `prisma.$transaction` +
 * `upsert()` (ความหมาย/idempotency เดิมทุกประการ) แต่ raw SQL พร้อม
 * `ON CONFLICT ... DO UPDATE/DO NOTHING` ที่ใช้ตอนนี้ก็ทำงานถูกต้องและผ่านการทดสอบจริง
 * แล้ว (ดู "คำสั่ง/การทดสอบที่รันจริง" ใน prisma/exam-document-schema.md — จะย้ายผลทดสอบ
 * เฉพาะของ seed มาไว้ที่นี่/MIGRATIONS.md ตามที่ระบุด้านล่าง)
 *
 * Idempotency (ข้อกำหนด: "seed ทำซ้ำได้และไม่สร้าง duplicate"):
 * ทุกแถวที่ seed นี้สร้างใช้ id ที่กำหนดตายตัวเอง (ขึ้นต้นด้วย "seed_" เพื่อแยกจาก id
 * แบบ cuid() ที่แอปจริงจะสร้าง และแยกจาก id มือกทดสอบที่ฝังอยู่ใน migration.sql ของแต่
 * ละโดเมน) แล้ว upsert ด้วย `ON CONFLICT (id) DO UPDATE` สำหรับตารางที่แก้ไขได้ปกติ
 * หรือ `ON CONFLICT (id) DO NOTHING` สำหรับตารางที่ DB trigger บังคับ immutable
 * (audit-style append-only เช่น organization_status_history, curricula หรือ
 * conditional-immutable เมื่อพ้นสถานะ DRAFT เช่น question_versions/
 * document_versions/exam_sets และตารางลูกที่ล็อกตามสถานะของแถวแม่) รันคำสั่งนี้กี่ครั้ง
 * ก็ได้ผลลัพธ์เดิมเสมอ ไม่มีแถวซ้ำ — ทดสอบจริงแล้วโดยรันสคริปต์นี้ 2 ครั้งติดต่อกันแล้ว
 * เทียบจำนวนแถวทุกตาราง (ดูผลทดสอบใน prisma/MIGRATIONS.md §9)
 *
 * ข้อมูลทั้งหมดในไฟล์นี้เป็นข้อมูลสมมติ 100% (data-policy.md ข้อ 3) — ชื่อบุคคล/หน่วยงาน
 * ทุกรายการมีคำว่า "(ข้อมูลจำลอง)" กำกับ และอีเมลใช้โดเมน .invalid (RFC 2606 — โดเมนที่
 * รับประกันว่าจะไม่มีอยู่จริงเสมอ) เพื่อไม่ให้สับสนกับข้อมูลบุคคล/องค์กรจริงโดยไม่ตั้งใจ
 *
 * Usage:
 *   npm run db:seed          (= tsx prisma/seed.ts)
 *
 * Failure mode & recovery:
 *   สคริปต์ทั้งหมดรันภายใน transaction เดียว (BEGIN...COMMIT) — ถ้าขั้นตอนใดล้มเหลว
 *   จะ ROLLBACK ทั้งหมดอัตโนมัติ (ไม่มีข้อมูลจำลองค้างอยู่บางส่วน) แล้ว process.exit(1)
 *   พร้อม log ข้อผิดพลาดเต็ม แก้ไขสาเหตุ (เช่น migration ยังไม่ apply ครบ — รัน
 *   `node prisma/dev-migrate-verify.mjs` ก่อน) แล้วรัน `npm run db:seed` ใหม่ได้ทันที
 *   (idempotent — ไม่ต้อง reset ฐานข้อมูลก่อน)
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";
import bcrypt from "bcryptjs";
import { MOCK_USER_PASSWORD } from "./seed-constants.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envLocalPath = path.join(__dirname, "..", ".env.local");
  try {
    const content = readFileSync(envLocalPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?\s*$/);
      if (m) return m[1];
    }
  } catch {
    // fall through
  }
  throw new Error(
    "DATABASE_URL not found in process.env or .env.local — cannot connect to seed the database"
  );
}

type Row = Record<string, unknown>;

/** Insert one row, upserting by its own fixed `id` (mutable tables — safe to re-run). */
async function upsert(
  client: pg.Client,
  table: string,
  row: Row
): Promise<void> {
  const columns = Object.keys(row);
  const values = Object.values(row);
  const columnList = columns.map((c) => `"${c}"`).join(", ");
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const updateList = columns
    .filter((c) => c !== "id")
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(", ");
  const sql = updateList
    ? `INSERT INTO "${table}" (${columnList}) VALUES (${placeholders})
       ON CONFLICT (id) DO UPDATE SET ${updateList}`
    : `INSERT INTO "${table}" (${columnList}) VALUES (${placeholders})
       ON CONFLICT (id) DO NOTHING`;
  await client.query(sql, values);
}

/**
 * Insert one row by its fixed `id`, but never UPDATE an existing row — required for
 * tables locked by a DB trigger (flat append-only, e.g. organization_status_history,
 * curricula; or conditional-immutable once status leaves DRAFT, e.g.
 * question_versions/document_versions/exam_sets and their locked children). Content
 * here is static mock data, so "do nothing if already present" is exactly correct
 * idempotency — attempting an UPDATE on a locked row would make the trigger reject it.
 */
async function insertIfAbsent(
  client: pg.Client,
  table: string,
  row: Row
): Promise<void> {
  const columns = Object.keys(row);
  const values = Object.values(row);
  const columnList = columns.map((c) => `"${c}"`).join(", ");
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const sql = `INSERT INTO "${table}" (${columnList}) VALUES (${placeholders})
               ON CONFLICT (id) DO NOTHING`;
  await client.query(sql, values);
}

/** Join tables with a composite PK (no separate `id` column) — always safe as DO NOTHING. */
async function linkIfAbsent(
  client: pg.Client,
  table: string,
  conflictCols: string[],
  row: Row
): Promise<void> {
  const columns = Object.keys(row);
  const values = Object.values(row);
  const columnList = columns.map((c) => `"${c}"`).join(", ");
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(", ");
  const conflictList = conflictCols.map((c) => `"${c}"`).join(", ");
  const sql = `INSERT INTO "${table}" (${columnList}) VALUES (${placeholders})
               ON CONFLICT (${conflictList}) DO NOTHING`;
  await client.query(sql, values);
}

// ---------------------------------------------------------------------------
// 1. Users (สมาชิกจำลอง — บัญชีผู้ใช้ระบบ ครอบคลุมทุก UserRole ที่มีในสคีมาปัจจุบัน)
// ---------------------------------------------------------------------------
// MOCK_USER_PASSWORD (รหัสผ่านทดสอบ/dev เท่านั้น ไม่ใช่ secret จริง) มาจาก
// ./seed-constants.mjs เพื่อให้ prisma/test-auth-login.mjs ใช้ค่าเดียวกันได้โดย
// ไม่ต้อง import ไฟล์ .ts นี้ตรงๆ — ผู้ใช้จริงตั้งรหัสผ่านของตัวเองผ่านขั้นตอน
// สมัครสมาชิก F5.1 ซึ่งอยู่นอกขอบเขตงานนี้ (ดู prisma/AUTH.md)

async function seedUsers(client: pg.Client) {
  const passwordHash = await bcrypt.hash(MOCK_USER_PASSWORD, 12);
  const users: Row[] = [
    { id: "seed_user_super_admin", email: "mock.super.admin@sangha-system.invalid", name: "ผู้ดูแลระบบสูงสุด (ข้อมูลจำลอง)", role: "SUPER_ADMIN", status: "ACTIVE", passwordHash },
    { id: "seed_user_central_officer", email: "mock.central.officer@sangha-system.invalid", name: "เจ้าหน้าที่ส่วนกลาง (ข้อมูลจำลอง)", role: "CENTRAL_OFFICER", status: "ACTIVE", passwordHash },
    { id: "seed_user_regional_admin", email: "mock.regional.admin@sangha-system.invalid", name: "ผู้ดูแลระดับภาค (ข้อมูลจำลอง)", role: "REGIONAL_ADMIN", status: "ACTIVE", passwordHash },
    { id: "seed_user_registrar_staff", email: "mock.registrar.staff@sangha-system.invalid", name: "เจ้าหน้าที่ทะเบียน (ข้อมูลจำลอง)", role: "REGISTRAR_STAFF", status: "PENDING_APPROVAL", passwordHash },
    { id: "seed_user_teacher", email: "mock.teacher@sangha-system.invalid", name: "ครูสอนธรรม/ผู้แต่งข้อสอบ (ข้อมูลจำลอง)", role: "TEACHER", status: "ACTIVE", passwordHash },
    { id: "seed_user_examiner", email: "mock.examiner@sangha-system.invalid", name: "กรรมการออกข้อสอบ (ข้อมูลจำลอง)", role: "EXAMINER", status: "ACTIVE", passwordHash },
    { id: "seed_user_student", email: "mock.student@sangha-system.invalid", name: "นักเรียนธรรมศึกษา (ข้อมูลจำลอง)", role: "STUDENT", status: "ACTIVE", passwordHash },
    { id: "seed_user_auditor", email: "mock.auditor@sangha-system.invalid", name: "ผู้ตรวจสอบ (ข้อมูลจำลอง)", role: "AUDITOR", status: "ACTIVE", passwordHash },
  ];
  for (const u of users) {
    await upsert(client, "users", { ...u, updatedAt: new Date() });
  }
  return users.length;
}

// ---------------------------------------------------------------------------
// 2. Organizations — สายการปกครองคณะสงฆ์จำลองครบ 7 ชั้น + สำนักเรียน + สำนักงานแม่กองธรรม
// ---------------------------------------------------------------------------
const ORG = {
  mahathera: "seed_org_mahathera",
  zone1: "seed_org_zone_1",
  region1: "seed_org_region_1",
  province1: "seed_org_province_1",
  district1: "seed_org_district_1",
  subdistrict1: "seed_org_subdistrict_1",
  temple1: "seed_org_temple_1",
  temple2: "seed_org_temple_2",
  studyInstitute1: "seed_org_study_institute_1",
  examOffice: "seed_org_exam_office",
} as const;

async function seedOrganizations(client: pg.Client) {
  const orgs: Array<Row & { establishedDate: string }> = [
    { id: ORG.mahathera, code: "MOCK-MAHATHERA", type: "MAHATHERASAMAKHOM", name: "มหาเถรสมาคม (ข้อมูลจำลอง)", nameEn: "Sangha Supreme Council (Mock)", parentId: null, status: "ACTIVE", establishedDate: "1980-01-01" },
    { id: ORG.zone1, code: "MOCK-ZONE-1", type: "SANGHA_ZONE", name: "หนกลาง (ข้อมูลจำลอง)", nameEn: null, parentId: ORG.mahathera, status: "ACTIVE", establishedDate: "1980-01-01" },
    { id: ORG.region1, code: "MOCK-REGION-1", type: "SANGHA_REGION", name: "ภาค 1 (ข้อมูลจำลอง)", nameEn: null, parentId: ORG.zone1, status: "ACTIVE", establishedDate: "1980-01-01" },
    { id: ORG.province1, code: "MOCK-PROVINCE-1", type: "SANGHA_PROVINCE", name: "จังหวัดมือกทดสอบ (ข้อมูลจำลอง)", nameEn: null, parentId: ORG.region1, status: "ACTIVE", establishedDate: "1980-01-01" },
    { id: ORG.district1, code: "MOCK-DISTRICT-1", type: "SANGHA_DISTRICT", name: "อำเภอมือกทดสอบ (ข้อมูลจำลอง)", nameEn: null, parentId: ORG.province1, status: "ACTIVE", establishedDate: "1980-01-01" },
    { id: ORG.subdistrict1, code: "MOCK-SUBDISTRICT-1", type: "SANGHA_SUBDISTRICT", name: "ตำบลมือกทดสอบ (ข้อมูลจำลอง)", nameEn: null, parentId: ORG.district1, status: "ACTIVE", establishedDate: "1980-01-01" },
    { id: ORG.temple1, code: "MOCK-TEMPLE-1", type: "TEMPLE", name: "วัดมือกทดสอบหนึ่ง (ข้อมูลจำลอง)", nameEn: null, parentId: ORG.subdistrict1, status: "ACTIVE", establishedDate: "1975-01-01" },
    { id: ORG.temple2, code: "MOCK-TEMPLE-2", type: "TEMPLE", name: "วัดมือกทดสอบสอง (ข้อมูลจำลอง)", nameEn: null, parentId: ORG.subdistrict1, status: "ACTIVE", establishedDate: "1988-01-01" },
    { id: ORG.studyInstitute1, code: "MOCK-STUDY-INST-1", type: "STUDY_INSTITUTE", name: "สำนักเรียนวัดมือกทดสอบหนึ่ง (ข้อมูลจำลอง)", nameEn: null, parentId: ORG.temple1, status: "ACTIVE", establishedDate: "1990-01-01" },
    { id: ORG.examOffice, code: "MOCK-EXAM-OFFICE", type: "EXAM_OFFICE", name: "สำนักงานแม่กองธรรมสนามหลวง (ข้อมูลจำลอง)", nameEn: null, parentId: ORG.mahathera, status: "ACTIVE", establishedDate: "1980-01-01" },
  ];

  // เรียง insert จากบนลงล่าง (parent ก่อน child) เพราะ organizations_validate_hierarchy_trigger
  // ต้องเจอ parent ที่มีอยู่จริงแล้วในตารางก่อนจึงจะอนุญาตให้สร้าง/แก้ไข child ได้
  for (const org of orgs) {
    await upsert(client, "organizations", {
      id: org.id,
      code: org.code,
      type: org.type,
      name: org.name,
      nameEn: org.nameEn,
      parentId: org.parentId,
      status: org.status,
      establishedDate: new Date(org.establishedDate),
      dissolvedDate: null,
      updatedAt: new Date(),
    });
  }

  // OrganizationStatusHistory — append-only, หนึ่งแถวเริ่มต้น (ACTIVE) ต่อหน่วยงาน
  for (const org of orgs) {
    await insertIfAbsent(client, "organization_status_history", {
      id: `seed_orghist_${org.id}`,
      organizationId: org.id,
      status: "ACTIVE",
      effectiveFrom: new Date(org.establishedDate),
      reason: "บันทึกเริ่มต้นข้อมูลจำลอง (seed)",
      documentRef: null,
      recordedByActorId: "seed_user_central_officer",
    });
  }

  // Addresses — ที่อยู่หลัก (MAIN) หนึ่งแถวต่อหน่วยงาน
  for (const org of orgs) {
    await upsert(client, "addresses", {
      id: `seed_address_${org.id}`,
      organizationId: org.id,
      addressType: "MAIN",
      houseNo: "99",
      moo: "1",
      soi: null,
      road: "ถนนมือกทดสอบ",
      subDistrict: "ตำบลมือกทดสอบ",
      district: "อำเภอมือกทดสอบ",
      province: "จังหวัดมือกทดสอบ",
      postalCode: "10000",
      country: "ไทย",
      isCurrent: true,
      updatedAt: new Date(),
    });
  }

  // Contacts — เบอร์โทร + อีเมลมือกทดสอบสำหรับหน่วยงานหลักบางแห่ง (ไม่จำเป็นต้องครบทุกแห่ง)
  const contactOrgs = [ORG.mahathera, ORG.province1, ORG.district1, ORG.temple1, ORG.temple2, ORG.examOffice];
  for (const orgId of contactOrgs) {
    await upsert(client, "contacts", {
      id: `seed_contact_phone_${orgId}`,
      organizationId: orgId,
      type: "PHONE",
      value: "02-000-0000",
      label: "สำนักงาน (มือกทดสอบ)",
      isPrimary: true,
      updatedAt: new Date(),
    });
    await upsert(client, "contacts", {
      id: `seed_contact_email_${orgId}`,
      organizationId: orgId,
      type: "EMAIL",
      value: `contact.${orgId}@sangha-system.invalid`,
      label: "อีเมลติดต่อ (มือกทดสอบ)",
      isPrimary: false,
      updatedAt: new Date(),
    });
  }

  return { organizations: orgs.length, statusHistory: orgs.length, addresses: orgs.length, contacts: contactOrgs.length * 2 };
}

// ---------------------------------------------------------------------------
// 3. Positions (catalog) + Persons (มือกทดสอบ) + Appointments
// ---------------------------------------------------------------------------
const POS = {
  abbot: "seed_pos_abbot",
  subdistrictChief: "seed_pos_subdistrict_chief",
  districtChief: "seed_pos_district_chief",
  provinceChief: "seed_pos_province_chief",
  regionChief: "seed_pos_region_chief",
  mahatheraCouncil: "seed_pos_mahathera_council",
  dhammaExamChief: "seed_pos_dhamma_exam_chief",
  dhammaTeacher: "seed_pos_dhamma_teacher",
} as const;

async function seedPositions(client: pg.Client) {
  const positions: Row[] = [
    { id: POS.abbot, code: "ABBOT", title: "เจ้าอาวาส", titleEn: "Abbot", applicableOrgType: "TEMPLE", rankLevel: 1, isUniquePerOrganization: true, isActive: true },
    { id: POS.subdistrictChief, code: "SUBDISTRICT_CHIEF", title: "เจ้าคณะตำบล", titleEn: null, applicableOrgType: "SANGHA_SUBDISTRICT", rankLevel: 2, isUniquePerOrganization: true, isActive: true },
    { id: POS.districtChief, code: "DISTRICT_CHIEF", title: "เจ้าคณะอำเภอ", titleEn: null, applicableOrgType: "SANGHA_DISTRICT", rankLevel: 3, isUniquePerOrganization: true, isActive: true },
    { id: POS.provinceChief, code: "PROVINCE_CHIEF", title: "เจ้าคณะจังหวัด", titleEn: null, applicableOrgType: "SANGHA_PROVINCE", rankLevel: 4, isUniquePerOrganization: true, isActive: true },
    { id: POS.regionChief, code: "REGION_CHIEF", title: "เจ้าคณะภาค", titleEn: null, applicableOrgType: "SANGHA_REGION", rankLevel: 5, isUniquePerOrganization: true, isActive: true },
    { id: POS.mahatheraCouncil, code: "MAHATHERA_COUNCIL", title: "กรรมการมหาเถรสมาคม", titleEn: null, applicableOrgType: "MAHATHERASAMAKHOM", rankLevel: 6, isUniquePerOrganization: false, isActive: true },
    { id: POS.dhammaExamChief, code: "DHAMMA_EXAM_CHIEF", title: "แม่กองธรรมสนามหลวง", titleEn: null, applicableOrgType: "EXAM_OFFICE", rankLevel: 6, isUniquePerOrganization: true, isActive: true },
    { id: POS.dhammaTeacher, code: "DHAMMA_TEACHER", title: "ครูสอนธรรม", titleEn: null, applicableOrgType: "STUDY_INSTITUTE", rankLevel: null, isUniquePerOrganization: false, isActive: true },
  ];
  for (const p of positions) {
    await upsert(client, "positions", { ...p, updatedAt: new Date() });
  }
  return positions.length;
}

const PERSON = Array.from({ length: 10 }, (_, i) => `seed_person_${String(i + 1).padStart(2, "0")}`);

async function seedPersons(client: pg.Client) {
  const persons: Row[] = [
    { id: PERSON[0], referenceCode: "MOCKP-001", prefix: "พระ", fullName: "พระสมมติ ปญฺญาวชิโร (ข้อมูลจำลอง)" },
    { id: PERSON[1], referenceCode: "MOCKP-002", prefix: "พระครู", fullName: "พระครูสมมติ ธมฺมรกฺขิโต (ข้อมูลจำลอง)" },
    { id: PERSON[2], referenceCode: "MOCKP-003", prefix: "พระ", fullName: "พระสมมติ สุเมโธ (ข้อมูลจำลอง)" },
    { id: PERSON[3], referenceCode: "MOCKP-004", prefix: "พระ", fullName: "พระสมมติ กิตฺติสาโร (ข้อมูลจำลอง)" },
    { id: PERSON[4], referenceCode: "MOCKP-005", prefix: "สามเณร", fullName: "สามเณรสมมติ ใจดี (ข้อมูลจำลอง)" },
    { id: PERSON[5], referenceCode: "MOCKP-006", prefix: "พระ", fullName: "พระสมมติ ฐิตปญฺโญ (ข้อมูลจำลอง)" },
    { id: PERSON[6], referenceCode: "MOCKP-007", prefix: "พระครู", fullName: "พระครูสมมติวินัยธร (ข้อมูลจำลอง)" },
    { id: PERSON[7], referenceCode: "MOCKP-008", prefix: "พระ", fullName: "พระสมมติ อริยวํโส (ข้อมูลจำลอง)" },
    { id: PERSON[8], referenceCode: "MOCKP-009", prefix: "พระ", fullName: "พระสมมติ ปริยัติกวี (ข้อมูลจำลอง)" },
    { id: PERSON[9], referenceCode: "MOCKP-010", prefix: "พระ", fullName: "พระสมมติ ญาณวิสุทธิ์ (ข้อมูลจำลอง)" },
  ];
  for (const p of persons) {
    await upsert(client, "persons", { ...p, updatedAt: new Date() });
  }
  return persons.length;
}

async function seedAppointments(client: pg.Client) {
  const appointments: Array<Row & { startDate: string; endDate: string | null }> = [
    // เจ้าอาวาสปัจจุบันของวัดมือกทดสอบหนึ่ง — สืบต่อจากรูปที่ลาออกด้านล่าง (ประวัติไม่ถูกเขียนทับ)
    { id: "seed_appt_01", organizationId: ORG.temple1, positionId: POS.abbot, personId: PERSON[0], appointingOrganizationId: ORG.subdistrict1, startDate: "2020-01-01", endDate: null, status: "ACTIVE", documentRef: "คำสั่งมือกทดสอบ ที่ 1/2563", notes: null },
    // ประวัติ: เจ้าอาวาสวัดมือกทดสอบหนึ่งคนก่อนหน้า (ลาออก) — คนละแถวจากข้างบน แสดงว่าไม่ overwrite ประวัติเดิม
    { id: "seed_appt_02_historical", organizationId: ORG.temple1, positionId: POS.abbot, personId: PERSON[5], appointingOrganizationId: ORG.subdistrict1, startDate: "2010-01-01", endDate: "2019-12-31", status: "RESIGNED", documentRef: "คำสั่งมือกทดสอบ ที่ 12/2562", notes: "ลาออกเนื่องจากอายุ (ข้อมูลจำลอง)" },
    { id: "seed_appt_03", organizationId: ORG.temple2, positionId: POS.abbot, personId: PERSON[1], appointingOrganizationId: ORG.subdistrict1, startDate: "2019-06-01", endDate: null, status: "ACTIVE", documentRef: "คำสั่งมือกทดสอบ ที่ 5/2562", notes: null },
    { id: "seed_appt_04", organizationId: ORG.subdistrict1, positionId: POS.subdistrictChief, personId: PERSON[6], appointingOrganizationId: ORG.district1, startDate: "2018-01-01", endDate: null, status: "ACTIVE", documentRef: "คำสั่งมือกทดสอบ ที่ 3/2561", notes: null },
    { id: "seed_appt_05", organizationId: ORG.district1, positionId: POS.districtChief, personId: PERSON[7], appointingOrganizationId: ORG.province1, startDate: "2017-01-01", endDate: null, status: "ACTIVE", documentRef: "คำสั่งมือกทดสอบ ที่ 2/2560", notes: null },
    { id: "seed_appt_06", organizationId: ORG.province1, positionId: POS.provinceChief, personId: PERSON[8], appointingOrganizationId: ORG.region1, startDate: "2015-01-01", endDate: null, status: "ACTIVE", documentRef: "คำสั่งมือกทดสอบ ที่ 1/2558", notes: null },
    { id: "seed_appt_07", organizationId: ORG.region1, positionId: POS.regionChief, personId: PERSON[9], appointingOrganizationId: ORG.mahathera, startDate: "2012-01-01", endDate: null, status: "ACTIVE", documentRef: "คำสั่งมือกทดสอบ ที่ 1/2555", notes: null },
    // บุคคลเดียวกันดำรงตำแหน่งที่หน่วยงานอื่นพร้อมกันได้ (isUniquePerOrganization ตรวจ
    // เฉพาะ "ต่อหน่วยงาน" ไม่ใช่ต่อคน)
    { id: "seed_appt_08", organizationId: ORG.examOffice, positionId: POS.dhammaExamChief, personId: PERSON[9], appointingOrganizationId: ORG.mahathera, startDate: "2012-01-01", endDate: null, status: "ACTIVE", documentRef: "คำสั่งมือกทดสอบ ที่ 2/2555", notes: null },
    { id: "seed_appt_09", organizationId: ORG.mahathera, positionId: POS.mahatheraCouncil, personId: PERSON[2], appointingOrganizationId: null, startDate: "2021-01-01", endDate: null, status: "ACTIVE", documentRef: "คำสั่งมือกทดสอบ ที่ 1/2564", notes: null },
    { id: "seed_appt_10", organizationId: ORG.studyInstitute1, positionId: POS.dhammaTeacher, personId: PERSON[3], appointingOrganizationId: ORG.temple1, startDate: "2022-06-01", endDate: null, status: "ACTIVE", documentRef: "คำสั่งมือกทดสอบ ที่ 4/2565", notes: null },
  ];
  for (const a of appointments) {
    await upsert(client, "appointments", {
      id: a.id,
      organizationId: a.organizationId,
      positionId: a.positionId,
      personId: a.personId,
      appointingOrganizationId: a.appointingOrganizationId,
      startDate: new Date(a.startDate),
      endDate: a.endDate ? new Date(a.endDate) : null,
      status: a.status,
      documentRef: a.documentRef,
      notes: a.notes,
      updatedAt: new Date(),
    });
  }
  return appointments.length;
}

// ---------------------------------------------------------------------------
// 3b. RBAC scope (P3 M9) — เชื่อม User↔Person (OWN_RECORD) + ตัวอย่าง scope จริง
//     สำหรับทดสอบ deny-by-default/organization+program scope end-to-end
//     (ดู roles-permissions.md และ src/lib/scope.ts)
// ---------------------------------------------------------------------------
async function seedRbacScopes(client: pg.Client) {
  // เชื่อม mock student user กับ seed_person_05 ("สามเณรสมมติ ใจดี" — ระเบียนที่
  // ไม่มี Appointment ผูกอยู่แล้ว จึงว่างพอให้ใช้เป็น "ระเบียนของตนเอง" ของบัญชี
  // ทดสอบนี้ได้โดยไม่ชนกับข้อมูลจำลองอื่น) ต้องรันหลัง seedPersons เท่านั้น
  // (FK constraint) — เป็นเหตุผลที่ฟังก์ชันนี้ไม่ได้รวมเข้ากับ seedUsers()
  await client.query(
    `UPDATE users SET "personId" = $2, "updatedAt" = now() WHERE id = $1 AND "personId" IS DISTINCT FROM $2`,
    ["seed_user_student", PERSON[4]],
  );

  // Organization scope: Regional Admin ครอบคลุมจังหวัดมือกทดสอบ (+ อำเภอ/ตำบล/วัด/
  // สำนักเรียนทั้งหมดใต้จังหวัดนี้ ผ่าน recursive lookup) — Registrar Staff ครอบคลุม
  // เฉพาะวัดที่ตนสังกัด (องค์กรใบ ไม่มีลูกหลานให้ cascade)
  await insertIfAbsent(client, "user_organization_scopes", {
    id: "seed_scope_org_regional_admin_province1",
    userId: "seed_user_regional_admin",
    organizationId: ORG.province1,
    grantedById: "seed_user_super_admin",
  });
  await insertIfAbsent(client, "user_organization_scopes", {
    id: "seed_scope_org_registrar_staff_temple1",
    userId: "seed_user_registrar_staff",
    organizationId: ORG.temple1,
    grantedById: "seed_user_super_admin",
  });

  // Program scope: Teacher/Examiner รับผิดชอบเฉพาะสายนักธรรม (prog_naktham) —
  // ใช้ทดสอบว่าถูกปฏิเสธเมื่อพยายามแตะทรัพยากรของสายธรรมศึกษา/บาลีแทน
  await insertIfAbsent(client, "user_program_scopes", {
    id: "seed_scope_program_teacher_naktham",
    userId: "seed_user_teacher",
    programId: "prog_naktham",
    grantedById: "seed_user_super_admin",
  });
  await insertIfAbsent(client, "user_program_scopes", {
    id: "seed_scope_program_examiner_naktham",
    userId: "seed_user_examiner",
    programId: "prog_naktham",
    grantedById: "seed_user_super_admin",
  });

  return { organizationScopes: 2, programScopes: 2 };
}

// ---------------------------------------------------------------------------
// 4. Education domain extensions — วิชา/ระดับชั้นใหม่ + หลักสูตรธรรมศึกษาชุดแรก
//    (ต่อยอดจาก reference data ที่ migration 20260923141654_education_domain
//    seed ไว้แล้ว: ay_2567/ay_2568, prog_naktham/prog_dhammastudies/prog_pali,
//    subj_essay ฯลฯ — อ้างอิงโดย id ตรงๆ เพราะเป็นข้อมูลอ้างอิงที่ตั้งใจให้มีหนึ่งชุด
//    เดียวทั้งระบบ ไม่ใช่สร้างซ้ำ)
// ---------------------------------------------------------------------------
const LEVEL_DS = {
  tri: "seed_level_ds_tri",
  tho: "seed_level_ds_tho",
  ek: "seed_level_ds_ek",
} as const;
const SUBJECT_NEW = {
  vinaya: "seed_subj_vinaya",
  buddhistHistory: "seed_subj_buddhist_history",
} as const;
const CURRICULUM_DS_V1 = "seed_curriculum_ds_v1";
const CLS = {
  dsTriEssay: "seed_cls_ds_tri_essay",
  dsTriVinaya: "seed_cls_ds_tri_vinaya",
} as const;

async function seedEducationExtensions(client: pg.Client) {
  // ตรวจก่อนว่า reference data ต้นทางจาก education-domain migration มีอยู่จริง —
  // ถ้าไม่มี (เช่น migration ยังไม่ apply) ให้ fail ทันทีพร้อมข้อความชัดเจน แทนที่จะ
  // ปล่อยให้ FK violation error ที่อ่านยากโผล่ขึ้นมาแทน
  const { rows: existingProgram } = await client.query(
    `SELECT id FROM programs WHERE id = 'prog_dhammastudies'`
  );
  if (existingProgram.length === 0) {
    throw new Error(
      "programs.prog_dhammastudies not found — apply migration 20260923141654_education_domain first (node prisma/dev-migrate-verify.mjs)"
    );
  }

  // ระดับชั้นธรรมศึกษา (program ธรรมศึกษายังไม่มีระดับชั้นใดๆ มาก่อนในทุก migration)
  const levels: Row[] = [
    { id: LEVEL_DS.tri, programId: "prog_dhammastudies", code: "DS_TRI", name: "ธรรมศึกษาชั้นตรี", sortOrder: 1, isActive: true },
    { id: LEVEL_DS.tho, programId: "prog_dhammastudies", code: "DS_THO", name: "ธรรมศึกษาชั้นโท", sortOrder: 2, isActive: true },
    { id: LEVEL_DS.ek, programId: "prog_dhammastudies", code: "DS_EK", name: "ธรรมศึกษาชั้นเอก", sortOrder: 3, isActive: true },
  ];
  for (const l of levels) {
    await upsert(client, "education_levels", { ...l, updatedAt: new Date() });
  }

  // วิชาใหม่ (นอกเหนือจาก subj_dhammavibhaga/subj_essay/subj_pali_translation เดิม)
  const subjects: Row[] = [
    { id: SUBJECT_NEW.vinaya, code: "VINAYA_MUKH", name: "วินัยมุข", nameEn: null, description: null, isActive: true },
    { id: SUBJECT_NEW.buddhistHistory, code: "BUDDHIST_HISTORY", name: "พุทธานุพุทธประวัติ", nameEn: null, description: null, isActive: true },
  ];
  for (const s of subjects) {
    await upsert(client, "subjects", { ...s, updatedAt: new Date() });
  }

  // หลักสูตรธรรมศึกษาชุดแรก (APPEND-ONLY — insertIfAbsent) อ้างอิง academic_years
  // ที่มีอยู่แล้ว (ay_2567) ตาม convention เดิม
  await insertIfAbsent(client, "curricula", {
    id: CURRICULUM_DS_V1,
    programId: "prog_dhammastudies",
    code: "DS-V1",
    name: "หลักสูตรธรรมศึกษา (ข้อมูลจำลอง) เวอร์ชัน 1",
    description: null,
    effectiveFromYearId: "ay_2567",
    createdAt: new Date("2024-01-01"),
  });

  // เนื้อหาหลักสูตร: ธรรมศึกษาตรี × (เรียงความ — reuse subj_essay ข้ามสายการศึกษาตาม
  // ที่ education-schema.md ตั้งใจออกแบบไว้, วินัยมุข — วิชาใหม่)
  const cls: Row[] = [
    { id: CLS.dsTriEssay, curriculumId: CURRICULUM_DS_V1, levelId: LEVEL_DS.tri, subjectId: "subj_essay", maxScore: 100, passScore: 50, examType: "ESSAY", sortOrder: 1, isActive: true },
    { id: CLS.dsTriVinaya, curriculumId: CURRICULUM_DS_V1, levelId: LEVEL_DS.tri, subjectId: SUBJECT_NEW.vinaya, maxScore: 100, passScore: 50, examType: "MULTIPLE_CHOICE", sortOrder: 2, isActive: true },
  ];
  for (const c of cls) {
    await upsert(client, "curriculum_level_subjects", { ...c, updatedAt: new Date() });
  }

  return { levels: levels.length, subjects: subjects.length, curricula: 1, curriculumLevelSubjects: cls.length };
}

// ---------------------------------------------------------------------------
// 5. Exam centers / exam session / exam session centers / exam schedule
// ---------------------------------------------------------------------------
const EXAM_CENTER = {
  temple1: "seed_examcenter_temple1",
  standalone: "seed_examcenter_standalone",
} as const;
const EXAM_SESSION_DS_2568 = "seed_examsession_ds_2568";

async function seedExamLogistics(client: pg.Client) {
  await upsert(client, "exam_centers", {
    id: EXAM_CENTER.temple1,
    code: "MOCK-EC-TEMPLE1",
    name: "สนามสอบวัดมือกทดสอบหนึ่ง (ข้อมูลจำลอง)",
    organizationId: ORG.temple1,
    province: null,
    district: null,
    capacity: 200,
    isActive: true,
    updatedAt: new Date(),
  });
  await upsert(client, "exam_centers", {
    id: EXAM_CENTER.standalone,
    code: "MOCK-EC-STANDALONE",
    name: "สนามสอบชั่วคราวมือกทดสอบ (ข้อมูลจำลอง)",
    organizationId: null,
    province: "จังหวัดมือกทดสอบ",
    district: "อำเภอมือกทดสอบ",
    capacity: 80,
    isActive: true,
    updatedAt: new Date(),
  });

  await upsert(client, "exam_sessions", {
    id: EXAM_SESSION_DS_2568,
    programId: "prog_dhammastudies",
    academicYearId: "ay_2568",
    curriculumId: CURRICULUM_DS_V1,
    roundNumber: 1,
    name: "สอบธรรมศึกษาสนามหลวง 2568 (ข้อมูลจำลอง)",
    status: "PLANNED",
    registrationOpenDate: new Date("2026-10-01"),
    registrationCloseDate: new Date("2026-10-31"),
    examStartDate: new Date("2026-12-01"),
    examEndDate: new Date("2026-12-01"),
    updatedAt: new Date(),
  });

  await upsert(client, "exam_session_centers", {
    id: "seed_esc_ds2568_temple1",
    examSessionId: EXAM_SESSION_DS_2568,
    examCenterId: EXAM_CENTER.temple1,
    notes: null,
  });
  await upsert(client, "exam_session_centers", {
    id: "seed_esc_ds2568_standalone",
    examSessionId: EXAM_SESSION_DS_2568,
    examCenterId: EXAM_CENTER.standalone,
    notes: null,
  });

  await upsert(client, "exam_schedules", {
    id: "seed_examschedule_ds2568_essay",
    examSessionId: EXAM_SESSION_DS_2568,
    curriculumLevelSubjectId: CLS.dsTriEssay,
    startAt: new Date("2026-12-01T09:00:00.000Z"),
    endAt: new Date("2026-12-01T12:00:00.000Z"),
    updatedAt: new Date(),
  });

  return { examCenters: 2, examSessions: 1, examSessionCenters: 2, examSchedules: 1 };
}

// ---------------------------------------------------------------------------
// 6. Categories / Tags (เพิ่มเติมจากที่ migration exam_document_domain seed ไว้แล้ว)
// ---------------------------------------------------------------------------
const CATEGORY_NEW = {
  generalKnowledge: "seed_cat_general_knowledge",
  vinaya: "seed_cat_vinaya",
  // เพิ่มจากงาน "สร้างห้องสมุด PDF/Download" (P4) — ใช้กับเอกสารภายใน (isPublic=false)
  // เพื่อพิสูจน์ว่าหน้าห้องสมุดกรองตามหมวดหมู่ได้ถูกต้องแม้เอกสารนั้นเป็น private —
  // ดู prisma/library-pages.md §4
  internalCirculars: "seed_cat_internal_circulars",
} as const;
const TAG_NEW = {
  ds2568: "seed_tag_ds_2568",
  reviewNeeded: "seed_tag_review_needed",
} as const;

async function seedCategoriesAndTags(client: pg.Client) {
  await upsert(client, "categories", { id: CATEGORY_NEW.generalKnowledge, name: "หมวดความรู้ทั่วไป", code: "GENERAL_KNOWLEDGE", description: null, isActive: true, updatedAt: new Date() });
  await upsert(client, "categories", { id: CATEGORY_NEW.vinaya, name: "หมวดวินัยสงฆ์", code: "VINAYA_CAT", description: null, isActive: true, updatedAt: new Date() });
  await upsert(client, "categories", { id: CATEGORY_NEW.internalCirculars, name: "หมวดหนังสือเวียนภายใน", code: "INTERNAL_CIRCULARS", description: null, isActive: true, updatedAt: new Date() });
  await upsert(client, "tags", { id: TAG_NEW.ds2568, name: "ธรรมศึกษา 2568" });
  await upsert(client, "tags", { id: TAG_NEW.reviewNeeded, name: "รอทบทวน" });
  return { categories: 3, tags: 2 };
}

// ---------------------------------------------------------------------------
// 7. Question bank — ข้อสอบธรรมศึกษาตรี (วินัยมุข ปรนัย APPROVED + DRAFT, เรียงความ APPROVED)
// ---------------------------------------------------------------------------
const QUESTION = {
  vinaya001: "seed_q_vinaya_001",
  essayDs001: "seed_q_essay_ds_001",
  vinaya002Draft: "seed_q_vinaya_002",
  // สองแถวเพิ่มจากงาน "สร้าง Authorization Guard ฝั่ง Server" — ใช้พิสูจน์ RESPONSIBLE_RECORD
  // scope (authorship OR program-scope) แบบ IDOR ผ่าน GET /api/question-versions/[id] จริง
  // (ดู prisma/authz-guards.md): ข้อแรกอยู่สายนักธรรม (prog_naktham, ตรงกับ program scope
  // ของ mock.teacher) แต่คนละผู้แต่ง — Teacher ควรอ่านได้ผ่าน program scope แม้ไม่ได้แต่งเอง
  // ข้อที่สองอยู่สายธรรมศึกษา (prog_dhammastudies, คนละ program กับ scope ของ mock.teacher)
  // และคนละผู้แต่งด้วย — Teacher ไม่ควรอ่านได้เลย (ต้อง 404 แบบ IDOR-safe)
  nakthamOtherAuthor: "seed_q_naktham_other_author",
  dhammastudiesOtherAuthor: "seed_q_ds_other_author",
} as const;
const QUESTION_VERSION = {
  vinaya001V1: "seed_qv_vinaya_001_v1",
  essayDs001V1: "seed_qv_essay_ds_001_v1",
  vinaya002V1Draft: "seed_qv_vinaya_002_v1",
  nakthamOtherAuthorV1: "seed_qv_naktham_other_author_v1",
  dhammastudiesOtherAuthorV1: "seed_qv_ds_other_author_v1",
} as const;

async function seedQuestions(client: pg.Client) {
  const questions: Row[] = [
    { id: QUESTION.vinaya001, subjectId: SUBJECT_NEW.vinaya, levelId: LEVEL_DS.tri, questionType: "MULTIPLE_CHOICE" },
    { id: QUESTION.essayDs001, subjectId: "subj_essay", levelId: LEVEL_DS.tri, questionType: "ESSAY" },
    { id: QUESTION.vinaya002Draft, subjectId: SUBJECT_NEW.vinaya, levelId: LEVEL_DS.tri, questionType: "MULTIPLE_CHOICE" },
    { id: QUESTION.nakthamOtherAuthor, subjectId: SUBJECT_NEW.vinaya, levelId: "lvl_nt_tri", questionType: "MULTIPLE_CHOICE" },
    { id: QUESTION.dhammastudiesOtherAuthor, subjectId: SUBJECT_NEW.vinaya, levelId: LEVEL_DS.tri, questionType: "MULTIPLE_CHOICE" },
  ];
  for (const q of questions) {
    await upsert(client, "questions", { ...q, updatedAt: new Date() });
  }

  await linkIfAbsent(client, "question_categories", ["questionId", "categoryId"], { questionId: QUESTION.vinaya001, categoryId: CATEGORY_NEW.vinaya });
  await linkIfAbsent(client, "question_tags", ["questionId", "tagId"], { questionId: QUESTION.vinaya001, tagId: TAG_NEW.ds2568 });
  await linkIfAbsent(client, "question_tags", ["questionId", "tagId"], { questionId: QUESTION.essayDs001, tagId: TAG_NEW.ds2568 });
  await linkIfAbsent(client, "question_tags", ["questionId", "tagId"], { questionId: QUESTION.vinaya002Draft, tagId: TAG_NEW.reviewNeeded });

  // QuestionVersions — สองแถวถูกอนุมัติแล้ว (ล็อกถาวรตาม trigger), หนึ่งแถวยังเป็น DRAFT
  // (แสดงสถานะ "แก้ไขได้อิสระ" ของ workflow เวอร์ชัน)
  await insertIfAbsent(client, "question_versions", {
    id: QUESTION_VERSION.vinaya001V1,
    questionId: QUESTION.vinaya001,
    versionNo: 1,
    content: "ข้อใดไม่จัดอยู่ในอาบัติปาราชิก (ข้อมูลจำลอง)",
    status: "APPROVED",
    authorActorId: "seed_user_teacher",
    approvedByActorId: "seed_user_examiner",
    approvedAt: new Date(),
    updatedAt: new Date(),
  });
  await insertIfAbsent(client, "question_versions", {
    id: QUESTION_VERSION.essayDs001V1,
    questionId: QUESTION.essayDs001,
    versionNo: 1,
    content: 'จงแต่งความเรียงแก้กระทู้ธรรมหัวข้อ "ความกตัญญูเป็นเครื่องหมายของคนดี" (ข้อมูลจำลอง)',
    status: "APPROVED",
    authorActorId: "seed_user_teacher",
    approvedByActorId: "seed_user_examiner",
    approvedAt: new Date(),
    updatedAt: new Date(),
  });
  await insertIfAbsent(client, "question_versions", {
    id: QUESTION_VERSION.vinaya002V1Draft,
    questionId: QUESTION.vinaya002Draft,
    versionNo: 1,
    content: "(ร่าง) คำถามวินัยมุขที่ยังอยู่ระหว่างแก้ไข (ข้อมูลจำลอง)",
    status: "DRAFT",
    authorActorId: "seed_user_teacher",
    approvedByActorId: null,
    approvedAt: null,
    updatedAt: new Date(),
  });
  // authored by Central Officer (ไม่ใช่ mock.teacher) — สายนักธรรม (prog_naktham) ตรงกับ
  // program scope ของ mock.teacher จึงควรอ่านได้ผ่าน RESPONSIBLE_RECORD (program-scope branch)
  await insertIfAbsent(client, "question_versions", {
    id: QUESTION_VERSION.nakthamOtherAuthorV1,
    questionId: QUESTION.nakthamOtherAuthor,
    versionNo: 1,
    content: "(นักธรรม) คำถามที่แต่งโดยเจ้าหน้าที่ส่วนกลาง ไม่ใช่ครูสอนธรรม (ข้อมูลจำลอง)",
    status: "DRAFT",
    authorActorId: "seed_user_central_officer",
    approvedByActorId: null,
    approvedAt: null,
    updatedAt: new Date(),
  });
  // authored by Central Officer เช่นกัน แต่สายธรรมศึกษา (prog_dhammastudies) — คนละ program
  // กับ scope ของ mock.teacher (prog_naktham) จึงต้องถูกปฏิเสธ (IDOR-safe 404)
  await insertIfAbsent(client, "question_versions", {
    id: QUESTION_VERSION.dhammastudiesOtherAuthorV1,
    questionId: QUESTION.dhammastudiesOtherAuthor,
    versionNo: 1,
    content: "(ธรรมศึกษา) คำถามที่แต่งโดยเจ้าหน้าที่ส่วนกลาง คนละสายกับครูสอนธรรม (ข้อมูลจำลอง)",
    status: "DRAFT",
    authorActorId: "seed_user_central_officer",
    approvedByActorId: null,
    approvedAt: null,
    updatedAt: new Date(),
  });

  // ตัวเลือกคำตอบสำหรับข้อวินัยมุขปรนัยที่อนุมัติแล้ว
  const choices: Row[] = [
    { id: "seed_qc_vinaya_001_a", questionVersionId: QUESTION_VERSION.vinaya001V1, label: "ก", content: "ฆ่ามนุษย์ (ข้อมูลจำลอง)", sortOrder: 1 },
    { id: "seed_qc_vinaya_001_b", questionVersionId: QUESTION_VERSION.vinaya001V1, label: "ข", content: "ลักทรัพย์เกินราคาที่กำหนด (ข้อมูลจำลอง)", sortOrder: 2 },
    { id: "seed_qc_vinaya_001_c", questionVersionId: QUESTION_VERSION.vinaya001V1, label: "ค", content: "ฉันอาหารในเวลาวิกาล (ข้อมูลจำลอง)", sortOrder: 3 },
    { id: "seed_qc_vinaya_001_d", questionVersionId: QUESTION_VERSION.vinaya001V1, label: "ง", content: "อวดอุตริมนุสธรรม (ข้อมูลจำลอง)", sortOrder: 4 },
  ];
  for (const c of choices) {
    await insertIfAbsent(client, "question_choices", { ...c, updatedAt: new Date() });
  }

  await insertIfAbsent(client, "answer_keys", {
    id: "seed_ak_vinaya_001",
    questionVersionId: QUESTION_VERSION.vinaya001V1,
    correctChoiceId: "seed_qc_vinaya_001_c",
    modelAnswer: null,
    scoringGuide: null,
    updatedAt: new Date(),
  });
  await insertIfAbsent(client, "answer_keys", {
    id: "seed_ak_essay_ds_001",
    questionVersionId: QUESTION_VERSION.essayDs001V1,
    correctChoiceId: null,
    modelAnswer: "ตัวอย่างคำตอบ: กล่าวถึงความกตัญญูต่อบิดามารดา ครูอาจารย์ และผู้มีอุปการคุณ (ข้อมูลจำลอง)",
    scoringGuide: "ให้คะแนนตามโครงสร้างเรียงความ 3 ส่วน (คำนำ/เนื้อเรื่อง/สรุป) และการยกหลักธรรมประกอบ (ข้อมูลจำลอง)",
    updatedAt: new Date(),
  });

  return { questions: questions.length, questionVersions: 5, questionChoices: choices.length, answerKeys: 2 };
}

// ---------------------------------------------------------------------------
// 8. Documents
// ---------------------------------------------------------------------------
const DOCUMENT = {
  examCircular2568: "seed_doc_exam_circular_2568",
  vinayaStudyMaterial: "seed_doc_vinaya_study_material",
  // เพิ่มจากงาน "สร้างคลังข้อสอบ + Search" (P4) — ครอบคลุมทุก documentType และ
  // ทุกสถานะที่ต้องพิสูจน์ deny-by-default (APPROVED มองเห็นได้, DRAFT/RETIRED
  // มองไม่เห็น) ผ่าน levelId/subjectId/academicYearId ที่เพิ่มใหม่ในงานนี้ — ดู
  // prisma/exam-bank-pages.md §4
  examPaperDhammavibhagaTri2567: "seed_doc_exampaper_dhammavibhaga_tri_2567",
  examPaperEssayTri2568: "seed_doc_exampaper_essay_tri_2568",
  answerSheetTemplate: "seed_doc_answersheet_template",
  examPaperDhammavibhagaTri2568Draft: "seed_doc_exampaper_dhammavibhaga_tri_2568_draft",
  examPaperEssayTri2567Retired: "seed_doc_exampaper_essay_tri_2567_retired",
  // เพิ่มจากงาน "สร้างห้องสมุด PDF/Download" (P4) — ดู prisma/library-pages.md §4:
  //   - libraryGuideMultiVersion: เอกสาร public (isPublic=true) ที่มี APPROVED
  //     2 เวอร์ชัน เพื่อพิสูจน์ว่าหน้ารายละเอียดแสดง "ประวัติเวอร์ชัน" ครบทุก
  //     APPROVED version (ไม่ใช่แค่เวอร์ชันล่าสุด) — ต่างจาก /exam-bank ที่แสดง
  //     เฉพาะเวอร์ชันล่าสุด
  //   - internalCircularPrivate: เอกสาร internal (isPublic=false) เพื่อพิสูจน์ว่า
  //     Guest มองไม่เห็นแต่ผู้ใช้ที่ login แล้ว (ทุก role) มองเห็นได้
  libraryGuideMultiVersion: "seed_doc_library_guide_multi_version",
  internalCircularPrivate: "seed_doc_internal_circular_private",
} as const;
const DOCUMENT_VERSION = {
  examCircular2568V1: "seed_dv_exam_circular_2568_v1",
  vinayaStudyMaterialV1: "seed_dv_vinaya_study_material_v1",
  examPaperDhammavibhagaTri2567V1: "seed_dv_exampaper_dhammavibhaga_tri_2567_v1",
  examPaperEssayTri2568V1: "seed_dv_exampaper_essay_tri_2568_v1",
  answerSheetTemplateV1: "seed_dv_answersheet_template_v1",
  examPaperDhammavibhagaTri2568DraftV1: "seed_dv_exampaper_dhammavibhaga_tri_2568_draft_v1",
  examPaperEssayTri2567RetiredV1: "seed_dv_exampaper_essay_tri_2567_retired_v1",
  libraryGuideMultiVersionV1: "seed_dv_library_guide_multi_version_v1",
  libraryGuideMultiVersionV2: "seed_dv_library_guide_multi_version_v2",
  internalCircularPrivateV1: "seed_dv_internal_circular_private_v1",
} as const;

async function seedDocuments(client: pg.Client) {
  await upsert(client, "documents", {
    id: DOCUMENT.examCircular2568,
    title: "ระเบียบการสอบธรรมศึกษาสนามหลวง 2568 (ข้อมูลจำลอง)",
    documentType: "CIRCULAR",
    isPublic: true,
    levelId: null,
    subjectId: null,
    academicYearId: "ay_2568",
    updatedAt: new Date(),
  });
  await upsert(client, "documents", {
    id: DOCUMENT.vinayaStudyMaterial,
    title: "เอกสารประกอบการสอนวินัยมุข (ข้อมูลจำลอง)",
    documentType: "STUDY_MATERIAL",
    isPublic: true,
    levelId: LEVEL_DS.tri,
    subjectId: SUBJECT_NEW.vinaya,
    academicYearId: null,
    updatedAt: new Date(),
  });
  // EXAM_PAPER_PRINT ที่อนุมัติแล้ว 2 ฉบับ (คนละวิชา/ปี ระดับชั้นเดียวกัน) — พิสูจน์
  // ว่า filter ชั้น+วิชา+ปีแยกแยะกันถูกต้อง และเป็นข้อมูลจริงชุดแรกของ documentType นี้
  await upsert(client, "documents", {
    id: DOCUMENT.examPaperDhammavibhagaTri2567,
    title: "ข้อสอบธรรมวิภาค นักธรรมชั้นตรี ปีการศึกษา 2567 (ข้อมูลจำลอง)",
    documentType: "EXAM_PAPER_PRINT",
    isPublic: true,
    levelId: "lvl_nt_tri",
    subjectId: "subj_dhammavibhaga",
    academicYearId: "ay_2567",
    updatedAt: new Date(),
  });
  await upsert(client, "documents", {
    id: DOCUMENT.examPaperEssayTri2568,
    title: "ข้อสอบเรียงความแก้กระทู้ธรรม นักธรรมชั้นตรี ปีการศึกษา 2568 (ข้อมูลจำลอง)",
    documentType: "EXAM_PAPER_PRINT",
    isPublic: true,
    levelId: "lvl_nt_tri",
    subjectId: "subj_essay",
    academicYearId: "ay_2568",
    updatedAt: new Date(),
  });
  // ANSWER_SHEET_TEMPLATE ไม่ผูกชั้น/วิชา/ปีใดเลย (ใช้ร่วมกันทุกวิชา) — พิสูจน์ว่า
  // เอกสารที่ levelId/subjectId/academicYearId เป็น null ทั้งหมดยังค้นหา/แสดงผลได้
  // ปกติ (ไม่ error) และไม่ปรากฏเมื่อกรองด้วยชั้น/วิชา/ปีที่ระบุเจาะจง
  await upsert(client, "documents", {
    id: DOCUMENT.answerSheetTemplate,
    title: "แบบฟอร์มกระดาษคำตอบมาตรฐาน (ข้อมูลจำลอง)",
    documentType: "ANSWER_SHEET_TEMPLATE",
    isPublic: true,
    levelId: null,
    subjectId: null,
    academicYearId: null,
    updatedAt: new Date(),
  });
  // DRAFT — มีอยู่จริงในระบบ แต่ต้องไม่ปรากฏต่อ public (deny-by-default พิสูจน์
  // เพิ่มเติมด้วย EXAM_PAPER_PRINT โดยเฉพาะ เพราะเป็น documentType ที่อ่อนไหวสุด)
  await upsert(client, "documents", {
    id: DOCUMENT.examPaperDhammavibhagaTri2568Draft,
    title: "ข้อสอบธรรมวิภาค นักธรรมชั้นตรี ปีการศึกษา 2568 (ฉบับร่าง ยังไม่อนุมัติ ข้อมูลจำลอง)",
    documentType: "EXAM_PAPER_PRINT",
    isPublic: true,
    levelId: "lvl_nt_tri",
    subjectId: "subj_dhammavibhaga",
    academicYearId: "ay_2568",
    updatedAt: new Date(),
  });
  // RETIRED — เคยอนุมัติแล้วแต่ถูกถอดออก (เช่น พิมพ์ผิดพลาด ต้องออกฉบับใหม่แทน) —
  // ต้องไม่ปรากฏต่อ public เหมือน DRAFT (deny-by-default ไม่แยกสถานะที่ไม่ใช่
  // APPROVED ออกจากกัน)
  await upsert(client, "documents", {
    id: DOCUMENT.examPaperEssayTri2567Retired,
    title: "ข้อสอบเรียงความแก้กระทู้ธรรม นักธรรมชั้นตรี ปีการศึกษา 2567 (ถอนแล้ว ข้อมูลจำลอง)",
    documentType: "EXAM_PAPER_PRINT",
    isPublic: true,
    levelId: "lvl_nt_tri",
    subjectId: "subj_essay",
    academicYearId: "ay_2567",
    updatedAt: new Date(),
  });
  // เพิ่มจากงาน "สร้างห้องสมุด PDF/Download" (P4) — ดู prisma/library-pages.md §4
  await upsert(client, "documents", {
    id: DOCUMENT.libraryGuideMultiVersion,
    title: "คู่มือการใช้งานระบบทะเบียน (ข้อมูลจำลอง)",
    documentType: "STUDY_MATERIAL",
    isPublic: true,
    levelId: null,
    subjectId: null,
    academicYearId: null,
    updatedAt: new Date(),
  });
  await upsert(client, "documents", {
    id: DOCUMENT.internalCircularPrivate,
    title: "หนังสือเวียนภายใน สำหรับเจ้าหน้าที่เท่านั้น (ข้อมูลจำลอง)",
    documentType: "CIRCULAR",
    isPublic: false,
    levelId: null,
    subjectId: null,
    academicYearId: null,
    updatedAt: new Date(),
  });

  await linkIfAbsent(client, "document_tags", ["documentId", "tagId"], { documentId: DOCUMENT.examCircular2568, tagId: TAG_NEW.ds2568 });
  await linkIfAbsent(client, "document_categories", ["documentId", "categoryId"], { documentId: DOCUMENT.vinayaStudyMaterial, categoryId: CATEGORY_NEW.vinaya });
  await linkIfAbsent(client, "document_tags", ["documentId", "tagId"], { documentId: DOCUMENT.libraryGuideMultiVersion, tagId: TAG_NEW.ds2568 });
  await linkIfAbsent(client, "document_categories", ["documentId", "categoryId"], { documentId: DOCUMENT.libraryGuideMultiVersion, categoryId: CATEGORY_NEW.generalKnowledge });
  await linkIfAbsent(client, "document_categories", ["documentId", "categoryId"], { documentId: DOCUMENT.internalCircularPrivate, categoryId: CATEGORY_NEW.internalCirculars });

  await insertIfAbsent(client, "document_versions", {
    id: DOCUMENT_VERSION.examCircular2568V1,
    documentId: DOCUMENT.examCircular2568,
    versionNo: 1,
    fileKey: null,
    fileName: "exam-circular-ds-2568-v1.pdf (placeholder — ยังไม่เชื่อม object storage)",
    mimeType: "application/pdf",
    fileSize: null,
    status: "APPROVED",
    authorActorId: "seed_user_central_officer",
    approvedByActorId: "seed_user_super_admin",
    approvedAt: new Date(),
    updatedAt: new Date(),
  });
  await insertIfAbsent(client, "document_versions", {
    id: DOCUMENT_VERSION.vinayaStudyMaterialV1,
    documentId: DOCUMENT.vinayaStudyMaterial,
    versionNo: 1,
    fileKey: null,
    fileName: "vinaya-mukh-study-material-v1-draft.pdf (placeholder — ยังไม่เชื่อม object storage)",
    mimeType: "application/pdf",
    fileSize: null,
    status: "DRAFT",
    authorActorId: "seed_user_teacher",
    approvedByActorId: null,
    approvedAt: null,
    updatedAt: new Date(),
  });
  await insertIfAbsent(client, "document_versions", {
    id: DOCUMENT_VERSION.examPaperDhammavibhagaTri2567V1,
    documentId: DOCUMENT.examPaperDhammavibhagaTri2567,
    versionNo: 1,
    fileKey: null,
    fileName: "exam-paper-dhammavibhaga-tri-2567-v1.pdf (placeholder — ยังไม่เชื่อม object storage)",
    mimeType: "application/pdf",
    fileSize: null,
    status: "APPROVED",
    authorActorId: "seed_user_central_officer",
    approvedByActorId: "seed_user_super_admin",
    approvedAt: new Date("2024-11-01"),
    updatedAt: new Date(),
  });
  await insertIfAbsent(client, "document_versions", {
    id: DOCUMENT_VERSION.examPaperEssayTri2568V1,
    documentId: DOCUMENT.examPaperEssayTri2568,
    versionNo: 1,
    fileKey: null,
    fileName: "exam-paper-essay-tri-2568-v1.pdf (placeholder — ยังไม่เชื่อม object storage)",
    mimeType: "application/pdf",
    fileSize: null,
    status: "APPROVED",
    authorActorId: "seed_user_central_officer",
    approvedByActorId: "seed_user_super_admin",
    approvedAt: new Date("2025-11-01"),
    updatedAt: new Date(),
  });
  await insertIfAbsent(client, "document_versions", {
    id: DOCUMENT_VERSION.answerSheetTemplateV1,
    documentId: DOCUMENT.answerSheetTemplate,
    versionNo: 1,
    fileKey: null,
    fileName: "answer-sheet-template-v1.pdf (placeholder — ยังไม่เชื่อม object storage)",
    mimeType: "application/pdf",
    fileSize: null,
    status: "APPROVED",
    authorActorId: "seed_user_central_officer",
    approvedByActorId: "seed_user_super_admin",
    approvedAt: new Date("2024-01-01"),
    updatedAt: new Date(),
  });
  await insertIfAbsent(client, "document_versions", {
    id: DOCUMENT_VERSION.examPaperDhammavibhagaTri2568DraftV1,
    documentId: DOCUMENT.examPaperDhammavibhagaTri2568Draft,
    versionNo: 1,
    fileKey: null,
    fileName: "exam-paper-dhammavibhaga-tri-2568-draft-v1.pdf (placeholder — ยังไม่เชื่อม object storage)",
    mimeType: "application/pdf",
    fileSize: null,
    status: "DRAFT",
    authorActorId: "seed_user_teacher",
    approvedByActorId: null,
    approvedAt: null,
    updatedAt: new Date(),
  });
  await insertIfAbsent(client, "document_versions", {
    id: DOCUMENT_VERSION.examPaperEssayTri2567RetiredV1,
    documentId: DOCUMENT.examPaperEssayTri2567Retired,
    versionNo: 1,
    fileKey: null,
    fileName: "exam-paper-essay-tri-2567-retired-v1.pdf (placeholder — ยังไม่เชื่อม object storage)",
    mimeType: "application/pdf",
    fileSize: null,
    status: "RETIRED",
    authorActorId: "seed_user_central_officer",
    approvedByActorId: "seed_user_super_admin",
    approvedAt: new Date("2023-11-01"),
    updatedAt: new Date(),
  });
  // libraryGuideMultiVersion — 2 เวอร์ชัน APPROVED (v1 ตุลาคม 2567, v2 แก้ไข/ปรับปรุง
  // มิถุนายน 2568) พิสูจน์ว่าหน้ารายละเอียดห้องสมุดแสดง "ประวัติเวอร์ชัน" ครบทุก
  // APPROVED version เรียงจากใหม่ไปเก่า ไม่ใช่แค่เวอร์ชันล่าสุดเหมือน /exam-bank
  await insertIfAbsent(client, "document_versions", {
    id: DOCUMENT_VERSION.libraryGuideMultiVersionV1,
    documentId: DOCUMENT.libraryGuideMultiVersion,
    versionNo: 1,
    fileKey: null,
    fileName: "library-guide-v1.pdf (placeholder — ยังไม่เชื่อม object storage)",
    mimeType: "application/pdf",
    fileSize: null,
    status: "APPROVED",
    authorActorId: "seed_user_central_officer",
    approvedByActorId: "seed_user_super_admin",
    approvedAt: new Date("2024-10-01"),
    updatedAt: new Date(),
  });
  await insertIfAbsent(client, "document_versions", {
    id: DOCUMENT_VERSION.libraryGuideMultiVersionV2,
    documentId: DOCUMENT.libraryGuideMultiVersion,
    versionNo: 2,
    fileKey: null,
    fileName: "library-guide-v2.pdf (placeholder — ยังไม่เชื่อม object storage)",
    mimeType: "application/pdf",
    fileSize: null,
    status: "APPROVED",
    authorActorId: "seed_user_central_officer",
    approvedByActorId: "seed_user_super_admin",
    approvedAt: new Date("2025-06-01"),
    updatedAt: new Date(),
  });
  // internalCircularPrivate — APPROVED 1 เวอร์ชัน แต่ isPublic=false (Internal) —
  // พิสูจน์ว่า Guest มองไม่เห็นแต่ผู้ใช้ที่ login แล้ว (ทุก role รวมถึง STUDENT ซึ่งมี
  // FILES-module scope จำกัดสุด) มองเห็นได้ปกติ
  await insertIfAbsent(client, "document_versions", {
    id: DOCUMENT_VERSION.internalCircularPrivateV1,
    documentId: DOCUMENT.internalCircularPrivate,
    versionNo: 1,
    fileKey: null,
    fileName: "internal-circular-v1.pdf (placeholder — ยังไม่เชื่อม object storage)",
    mimeType: "application/pdf",
    fileSize: null,
    status: "APPROVED",
    authorActorId: "seed_user_central_officer",
    approvedByActorId: "seed_user_super_admin",
    approvedAt: new Date("2025-01-15"),
    updatedAt: new Date(),
  });

  return { documents: 9, documentVersions: 10 };
}

// ---------------------------------------------------------------------------
// 9. Exam sets — หนึ่งชุดฝึกซ้อม (DRAFT) + หนึ่งชุดสอบสนามหลวงจริง (APPROVED, ผูกปี 2568)
// ---------------------------------------------------------------------------
async function seedExamSets(client: pg.Client) {
  await upsert(client, "exam_sets", {
    id: "seed_examset_ds_tri_vinaya_practice",
    curriculumLevelSubjectId: CLS.dsTriVinaya,
    examSessionId: null,
    name: "ชุดฝึกซ้อมวินัยมุข ธรรมศึกษาตรี (ข้อมูลจำลอง)",
    status: "DRAFT",
    authorActorId: "seed_user_teacher",
    approvedByActorId: null,
    approvedAt: null,
    updatedAt: new Date(),
  });
  await insertIfAbsent(client, "exam_sets", {
    id: "seed_examset_ds_tri_essay_official_2568",
    curriculumLevelSubjectId: CLS.dsTriEssay,
    examSessionId: EXAM_SESSION_DS_2568,
    name: "ชุดข้อสอบสนามหลวงเรียงความ ธรรมศึกษาตรี 2568 (ข้อมูลจำลอง)",
    status: "APPROVED",
    authorActorId: "seed_user_teacher",
    approvedByActorId: "seed_user_examiner",
    approvedAt: new Date(),
    updatedAt: new Date(),
  });

  // exam_sets ตัวแรกยังเป็น DRAFT จึงยัง "แก้ไขได้อิสระ" — upsert ปกติปลอดภัย (id คงที่
  // เดิมทุกครั้งที่รันซ้ำ จึงไม่มีทางชน unique(examSetId, sortOrder) กับตัวเองได้)
  await upsert(client, "exam_set_items", {
    id: "seed_examsetitem_practice_01",
    examSetId: "seed_examset_ds_tri_vinaya_practice",
    questionVersionId: QUESTION_VERSION.vinaya001V1,
    sortOrder: 1,
    score: 2,
  });

  // exam_sets ตัวที่สอง APPROVED แล้ว → ล็อกถาวรทั้งตัวชุดและรายการข้อในชุด (insertIfAbsent)
  await insertIfAbsent(client, "exam_set_items", {
    id: "seed_examsetitem_official_01",
    examSetId: "seed_examset_ds_tri_essay_official_2568",
    questionVersionId: QUESTION_VERSION.essayDs001V1,
    sortOrder: 1,
    score: 100,
  });

  return { examSets: 2, examSetItems: 2 };
}

// ---------------------------------------------------------------------------
// P4 Public Front End — งาน "สร้างหน้า Home + ข่าว/บทความ": ข่าว/ประกาศ (M10)
// ---------------------------------------------------------------------------
// ครบทั้ง 3 สถานะโดยตั้งใจ เพื่อพิสูจน์ deny-by-default ของ F1.2 จริง:
//   - PUBLISHED (6 ข่าว) — ต้องปรากฏใน `/news` และเปิด `/news/[slug]` ได้
//   - DRAFT (1 ข่าว) — ต้องไม่ปรากฏใน `/news` และเปิด `/news/[slug]` ตรงๆ ต้องได้ 404
//   - UNPUBLISHED (1 ข่าว, จำลองข่าวที่เคยเผยแพร่แล้วถูกถอด) — เหมือน DRAFT ทุกประการ
//     ในมุมมอง public (ยังคงแถวไว้ในฐานข้อมูลเพื่อประวัติ ไม่ลบ ตาม data-policy.md ข้อ 7)
// เนื้อหาทั้งหมดเป็นข้อมูลสมมติ — แม้ชื่อหน่วยงาน (เช่น สำนักงานแม่กองธรรมสนามหลวง)
// จะเป็นชื่อที่ใช้จริงในบริบทองค์กร แต่เนื้อหาข่าว/ตัวเลข/วันที่ทั้งหมดเป็นการจำลอง
// ล้วนๆ ตามรูปแบบเดียวกับ organizations mock ด้านบน (ทุกชื่อกำกับ "(ข้อมูลจำลอง)")
async function seedNews(client: pg.Client) {
  const categories: Row[] = [
    { id: "seed_newscat_announcement", slug: "announcement", name: "ข่าวประชาสัมพันธ์" },
    { id: "seed_newscat_exam-notice", slug: "exam-notice", name: "ประกาศเรื่องสอบ" },
    { id: "seed_newscat_activity", slug: "activity", name: "กิจกรรม" },
    { id: "seed_newscat_education", slug: "education", name: "การศึกษา" },
  ];
  for (const c of categories) {
    await upsert(client, "news_categories", { ...c, updatedAt: new Date() });
  }

  const AUTHOR = "seed_user_central_officer";
  const now = Date.now();
  const daysAgo = (n: number) => new Date(now - n * 24 * 60 * 60 * 1000);

  const articles: (Row & { categoryIds: string[] })[] = [
    {
      id: "seed_news_exam-registration-2568",
      slug: "exam-registration-2568",
      title: "เปิดรับสมัครสอบธรรมศึกษา ประจำปี 2568 (ข้อมูลจำลอง)",
      summary: "สำนักงานแม่กองธรรมสนามหลวง (ข้อมูลจำลอง) เปิดรับสมัครสอบธรรมศึกษาชั้นตรี-โท-เอก ประจำปี 2568 ตั้งแต่บัดนี้ถึงสิ้นเดือน",
      coverImageUrl: "https://images.example.invalid/news/exam-registration-2568.jpg",
      content:
        "สำนักงานแม่กองธรรมสนามหลวง (ข้อมูลจำลอง) ประกาศเปิดรับสมัครสอบธรรมศึกษาชั้นตรี โท และเอก ประจำปีการศึกษา 2568 ผู้สมัครสามารถยื่นใบสมัครผ่านสำนักเรียนต้นสังกัดได้ตั้งแต่บัดนี้จนถึงสิ้นเดือน\n\n(เนื้อหาทั้งหมดในข่าวนี้เป็นข้อมูลจำลองสำหรับการพัฒนา/ทดสอบระบบเท่านั้น ไม่ใช่ประกาศจริง)",
      status: "PUBLISHED",
      publishedAt: daysAgo(2),
      authorActorId: AUTHOR,
      categoryIds: ["seed_newscat_exam-notice"],
    },
    {
      id: "seed_news_pali-eligible-list-2568",
      slug: "pali-eligible-list-2568",
      title: "ประกาศรายชื่อผู้มีสิทธิ์สอบบาลีสนามหลวง ประจำปี 2568 (ข้อมูลจำลอง)",
      summary: "ตรวจสอบรายชื่อผู้มีสิทธิ์สอบบาลีสนามหลวงทุกชั้นประโยคได้ที่สำนักเรียนต้นสังกัด",
      coverImageUrl: "https://images.example.invalid/news/pali-eligible-list-2568.jpg",
      content:
        "ประกาศรายชื่อผู้มีสิทธิ์เข้าสอบบาลีสนามหลวงทุกชั้นประโยค ประจำปี 2568 ผู้สมัครสอบสามารถตรวจสอบรายชื่อและสนามสอบของตนเองได้ที่สำนักเรียนต้นสังกัด\n\n(ข้อมูลจำลองสำหรับการพัฒนา/ทดสอบระบบเท่านั้น)",
      status: "PUBLISHED",
      publishedAt: daysAgo(5),
      authorActorId: AUTHOR,
      categoryIds: ["seed_newscat_exam-notice"],
    },
    {
      id: "seed_news_dhamma-envoy-training-12",
      slug: "dhamma-envoy-training-batch-12",
      title: "โครงการอบรมพระธรรมทูตสายต่างประเทศ รุ่นที่ 12 (ข้อมูลจำลอง)",
      summary: "เปิดรับสมัครพระภิกษุเข้าร่วมโครงการอบรมพระธรรมทูตสายต่างประเทศ รุ่นที่ 12",
      coverImageUrl: "https://images.example.invalid/news/dhamma-envoy-training-12.jpg",
      content:
        "โครงการอบรมพระธรรมทูตสายต่างประเทศ รุ่นที่ 12 เปิดรับสมัครพระภิกษุที่มีคุณสมบัติตามที่กำหนด เข้าร่วมการอบรมระยะเวลา 3 เดือน ณ ศูนย์ฝึกอบรมส่วนกลาง\n\n(ข้อมูลจำลองสำหรับการพัฒนา/ทดสอบระบบเท่านั้น)",
      status: "PUBLISHED",
      publishedAt: daysAgo(9),
      authorActorId: AUTHOR,
      categoryIds: ["seed_newscat_activity"],
    },
    {
      id: "seed_news_dhamma-studies-curriculum-revision",
      slug: "dhamma-studies-curriculum-revision",
      title: "แนวทางการปรับปรุงหลักสูตรธรรมศึกษาชั้นตรีฉบับใหม่ (ข้อมูลจำลอง)",
      summary: "สรุปแนวทางการปรับปรุงหลักสูตรธรรมศึกษาชั้นตรี เพื่อรับฟังความเห็นจากสำนักเรียนทั่วประเทศ",
      coverImageUrl: "https://images.example.invalid/news/curriculum-revision.jpg",
      content:
        "คณะทำงานด้านหลักสูตรได้จัดทำร่างแนวทางการปรับปรุงหลักสูตรธรรมศึกษาชั้นตรีฉบับใหม่ เพื่อเปิดรับฟังความคิดเห็นจากสำนักเรียนทั่วประเทศก่อนประกาศใช้จริง\n\n(ข้อมูลจำลองสำหรับการพัฒนา/ทดสอบระบบเท่านั้น)",
      status: "PUBLISHED",
      publishedAt: daysAgo(14),
      authorActorId: AUTHOR,
      categoryIds: ["seed_newscat_education"],
    },
    {
      id: "seed_news_quarterly-summary-report",
      slug: "quarterly-summary-report",
      title: "สรุปผลการดำเนินงานสำนักงานแม่กองธรรมสนามหลวง ประจำไตรมาส (ข้อมูลจำลอง)",
      summary: "เผยแพร่รายงานสรุปผลการดำเนินงานประจำไตรมาสเพื่อความโปร่งใสและตรวจสอบได้",
      coverImageUrl: null,
      content:
        "สำนักงานแม่กองธรรมสนามหลวง (ข้อมูลจำลอง) เผยแพร่รายงานสรุปผลการดำเนินงานประจำไตรมาส ครอบคลุมจำนวนผู้สมัครสอบ อัตราผู้สอบผ่าน และการดำเนินงานด้านทะเบียน เพื่อความโปร่งใสและตรวจสอบย้อนหลังได้\n\n(ตัวเลขทั้งหมดในรายงานนี้เป็นข้อมูลจำลองสำหรับการพัฒนา/ทดสอบระบบเท่านั้น)",
      status: "PUBLISHED",
      publishedAt: daysAgo(20),
      authorActorId: AUTHOR,
      categoryIds: ["seed_newscat_announcement"],
    },
    {
      id: "seed_news_exam-center-guidelines",
      slug: "exam-center-guidelines-2568",
      title: "แนวปฏิบัติสำหรับสนามสอบ ประจำปี 2568 (ข้อมูลจำลอง)",
      summary: "แนวปฏิบัติและกำหนดการสำหรับกรรมการคุมสอบประจำสนามสอบทุกแห่ง",
      coverImageUrl: "https://images.example.invalid/news/exam-center-guidelines.jpg",
      content:
        "แจ้งแนวปฏิบัติสำหรับกรรมการคุมสอบและเจ้าหน้าที่ประจำสนามสอบทุกแห่ง เพื่อให้การดำเนินการจัดสอบเป็นไปด้วยความเรียบร้อยและเป็นมาตรฐานเดียวกันทั่วประเทศ\n\n(ข้อมูลจำลองสำหรับการพัฒนา/ทดสอบระบบเท่านั้น)",
      status: "PUBLISHED",
      publishedAt: daysAgo(25),
      authorActorId: AUTHOR,
      categoryIds: ["seed_newscat_exam-notice", "seed_newscat_announcement"],
    },
    {
      id: "seed_news_registrar-staff-training",
      slug: "registrar-staff-training-2568",
      title: "อบรมเจ้าหน้าที่ทะเบียนสำนักเรียนทั่วประเทศ (ข้อมูลจำลอง)",
      summary: "จัดอบรมการใช้งานระบบทะเบียนออนไลน์สำหรับเจ้าหน้าที่ทะเบียนสำนักเรียนทั่วประเทศ",
      coverImageUrl: null,
      content:
        "จัดอบรมการใช้งานระบบทะเบียนออนไลน์สำหรับเจ้าหน้าที่ทะเบียนของสำนักเรียนทั่วประเทศ เพื่อเตรียมความพร้อมก่อนเปิดใช้งานระบบจริง\n\n(ข้อมูลจำลองสำหรับการพัฒนา/ทดสอบระบบเท่านั้น)",
      status: "PUBLISHED",
      publishedAt: daysAgo(30),
      authorActorId: AUTHOR,
      categoryIds: ["seed_newscat_activity", "seed_newscat_education"],
    },
    {
      id: "seed_news_scholarship-announcement",
      slug: "scholarship-announcement-2568",
      title: "ประกาศทุนการศึกษาพระภิกษุสามเณร ประจำปี 2568 (ข้อมูลจำลอง)",
      summary: "เปิดรับสมัครขอรับทุนการศึกษาสำหรับพระภิกษุสามเณรที่กำลังศึกษาพระปริยัติธรรม",
      coverImageUrl: "https://images.example.invalid/news/scholarship-2568.jpg",
      content:
        "เปิดรับสมัครขอรับทุนการศึกษาสำหรับพระภิกษุสามเณรที่กำลังศึกษาพระปริยัติธรรมทั้ง 3 สาย ยื่นใบสมัครผ่านสำนักเรียนต้นสังกัดภายในกำหนด\n\n(ข้อมูลจำลองสำหรับการพัฒนา/ทดสอบระบบเท่านั้น)",
      status: "PUBLISHED",
      publishedAt: daysAgo(35),
      authorActorId: AUTHOR,
      categoryIds: ["seed_newscat_education"],
    },
    // DRAFT — ต้องไม่ปรากฏใน public listing และเปิด slug ตรงๆ ต้องได้ 404 (F1.2 AC1)
    {
      id: "seed_news_draft-online-exam-system",
      slug: "draft-online-exam-system-proposal",
      title: "ร่างข้อเสนอระบบสอบออนไลน์ (ยังไม่เผยแพร่ — ข้อมูลจำลอง)",
      summary: "ร่างข้อเสนอที่ยังอยู่ระหว่างพิจารณาภายใน ยังไม่เผยแพร่สู่สาธารณะ",
      coverImageUrl: null,
      content: "เนื้อหาร่างข้อเสนอระบบสอบออนไลน์ที่ยังอยู่ระหว่างพิจารณาภายใน (ข้อมูลจำลอง) — ใช้พิสูจน์ว่าข่าวสถานะ DRAFT ต้องไม่เข้าถึงได้จาก public URL ตรงๆ",
      status: "DRAFT",
      publishedAt: null,
      authorActorId: AUTHOR,
      categoryIds: ["seed_newscat_announcement"],
    },
    // UNPUBLISHED — จำลองข่าวที่เคยเผยแพร่แล้วถูกถอด (F1.4) — ต้องไม่ปรากฏใน public
    // listing และเปิด slug ตรงๆ ต้องได้ 404 เหมือน DRAFT แม้เคยมี publishedAt มาก่อน
    {
      id: "seed_news_retracted-exam-postponement",
      slug: "retracted-exam-postponement-notice",
      title: "ประกาศเลื่อนสอบชั่วคราว (ถอดแล้ว — ข้อมูลจำลอง)",
      summary: "ประกาศนี้ถูกถอดออกจากเว็บไซต์แล้วหลังพบข้อมูลคลาดเคลื่อน",
      coverImageUrl: null,
      content: "เนื้อหาประกาศเลื่อนสอบที่ถูกถอดออกไปแล้ว (ข้อมูลจำลอง) — ใช้พิสูจน์ว่าข่าวสถานะ UNPUBLISHED ต้องไม่เข้าถึงได้จาก public URL ตรงๆ เช่นเดียวกับ DRAFT แม้ยังมีประวัติ publishedAt เดิมอยู่ในแถว (ไม่ลบทิ้ง ตาม data-policy.md ข้อ 7)",
      status: "UNPUBLISHED",
      publishedAt: daysAgo(40),
      authorActorId: AUTHOR,
      categoryIds: ["seed_newscat_exam-notice"],
    },
  ];

  for (const { categoryIds, ...article } of articles) {
    await upsert(client, "news_articles", { ...article, updatedAt: new Date() });
    for (const categoryId of categoryIds) {
      await linkIfAbsent(client, "news_article_categories", ["articleId", "categoryId"], {
        articleId: article.id,
        categoryId,
      });
    }
  }

  return {
    categories: categories.length,
    articles: articles.length,
    published: articles.filter((a) => a.status === "PUBLISHED").length,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const client = new pg.Client({ connectionString: loadDatabaseUrl() });
  await client.connect();
  console.log("Connected. Seeding mock data (idempotent — safe to re-run)...\n");

  try {
    await client.query("BEGIN");

    const counts: Record<string, unknown> = {};
    counts.users = await seedUsers(client);
    counts.organizations = await seedOrganizations(client);
    counts.positions = await seedPositions(client);
    counts.persons = await seedPersons(client);
    counts.appointments = await seedAppointments(client);
    counts.rbacScopes = await seedRbacScopes(client);
    counts.educationExtensions = await seedEducationExtensions(client);
    counts.examLogistics = await seedExamLogistics(client);
    counts.categoriesAndTags = await seedCategoriesAndTags(client);
    counts.questions = await seedQuestions(client);
    counts.documents = await seedDocuments(client);
    counts.examSets = await seedExamSets(client);
    counts.news = await seedNews(client);

    await client.query("COMMIT");
    console.log("Seed committed successfully.\n");
    console.log(JSON.stringify(counts, null, 2));
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Seed FAILED — transaction rolled back, no partial data was written.");
    console.error(err);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main();

// ---------------------------------------------------------------------------
// ขอบเขตและสิ่งที่ตั้งใจไม่รวม (Out of Scope)
// ---------------------------------------------------------------------------
// - "สมาชิกจำลอง" ในงานนี้หมายถึงบัญชี User (P1 schema) เท่านั้น — ยังไม่มีโมดูล
//   "ระบบสมาชิก" (M5 ตาม requirements.md, เช่น การสมัครสอบ/ประวัติการสอบของนักเรียน
//   รายบุคคล) ที่ออกแบบไว้ในสคีมาปัจจุบัน จึงยังไม่มีข้อมูลจำลองส่วนนั้นให้ seed
// - Excel Import (M7) และ Object Storage จริง (M8) ไม่เกี่ยวข้องกับงานนี้ —
//   DocumentVersion.fileKey ในข้อมูลจำลองยังเป็น placeholder เหมือนที่ระบุไว้ใน
//   exam-document-schema.md
// - ไม่ได้เขียนแถวลง audit_logs จากสคริปต์นี้ (เหมือน migration seed ทุกไฟล์ก่อนหน้านี้
//   ที่ไม่เขียนเช่นกัน) เพราะการ seed ข้อมูลเริ่มต้นของระบบไม่ใช่ "การกระทำทางธุรกิจจริง"
//   ที่ควรมีร่องรอย audit ปนอยู่กับเหตุการณ์จริงในอนาคต — เมื่อแอปพลิเคชันจริงเขียนข้อมูล
//   เพิ่มเติมทับ/ต่อจากชุดนี้ การเขียนนั้นจึงจะเข้า AuditLog ตามปกติ
// - (เพิ่มจากงาน "ติดตั้ง Auth.js และ Session"): ทุกบัญชีจำลองได้รับ passwordHash
//   ของรหัสผ่านทดสอบเดียวกัน (MOCK_USER_PASSWORD, export ไว้ให้ test script อื่น
//   import ใช้ได้) เพื่อให้ทดสอบ login ได้ครบทุกบทบาท/สถานะจริง — ไม่ seed
//   login_lockouts หรือ login_audit_logs เพราะเป็น operational/audit state ที่
//   ควรเริ่มต้นว่างเสมอ ไม่ใช่ "ข้อมูลอ้างอิงเริ่มต้นของระบบ"
