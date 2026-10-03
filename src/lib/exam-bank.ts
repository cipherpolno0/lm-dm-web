import "server-only";
import { query } from "@/lib/db";
import { slugifyCode, codeFromSlug } from "@/lib/slug";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain-types";

/**
 * Data-access layer สำหรับงาน "สร้างคลังข้อสอบ + Search" (P4 Public Front End)
 * — filter หลักสูตร/ชั้น/ปี/วิชา/ประเภทเอกสาร + pagination + full-text/search
 * (ดู prisma/exam-bank-pages.md สำหรับเหตุผลออกแบบทั้งหมด) อ่านอย่างเดียวทั้งหมด
 * (read-only, ไม่มี write path ในงานนี้)
 *
 * ขอบเขตความปลอดภัยที่สำคัญที่สุดของไฟล์นี้ (ดู prisma/exam-bank-pages.md §2):
 * "คลังข้อสอบ" สาธารณะในที่นี้หมายถึง **เอกสารแนบ** (Document/DocumentVersion —
 * ข้อสอบเก่าที่พิมพ์แล้ว/กระดาษคำตอบเปล่า/ระเบียบ/เอกสารประกอบการสอน) เท่านั้น —
 * ไฟล์นี้**ไม่มีฟังก์ชันใดที่ query Question/QuestionVersion/AnswerKey/ExamSet**
 * เพราะการเผยแพร่เนื้อหาข้อสอบจริง/เฉลยต่อสาธารณะจะเป็นการรั่วไหลข้อสอบ/เฉลยก่อน
 * วันสอบจริง ขัดกับสิทธิ์ที่ออกแบบไว้ใน prisma/roles-permissions.md (เฉพาะ
 * Examiner/Central Officer เท่านั้นที่เข้าถึงเนื้อหาข้อสอบจริงได้)
 *
 * Deny-by-default: เอกสารจะปรากฏต่อ public ก็ต่อเมื่อมี DocumentVersion อย่าง
 * น้อยหนึ่งเวอร์ชันที่ status='APPROVED' เท่านั้น (เวอร์ชัน "ปัจจุบัน" ที่แสดง =
 * APPROVED ล่าสุดตาม versionNo) — เอกสารที่มีแต่เวอร์ชัน DRAFT/PENDING_REVIEW/
 * REJECTED/RETIRED (ไม่มี APPROVED เลยแม้แต่เวอร์ชันเดียว) ถือว่า "ไม่มีอยู่จริง"
 * ต่อ public เช่นเดียวกับ pattern deny-by-default ที่ใช้ทั้งระบบ (ข่าว
 * DRAFT/UNPUBLISHED, หลักสูตร isActive=false/deletedAt) — ใช้ INNER JOIN LATERAL
 * แทนการกรองด้วย WHERE แยก เพื่อให้การ exclude เกิดขึ้นจาก join เอง (ไม่มีทาง
 * ลืมเงื่อนไขนี้ในบาง query)
 *
 * เพิ่มจากงาน "สร้างห้องสมุด PDF/Download" (P4): documents ได้คอลัมน์ "isPublic"
 * เพิ่มเข้ามา (ดู prisma/library-pages.md §2) เพื่อแยกเอกสาร Public ออกจาก
 * Internal (ต้อง login) — คลังข้อสอบหน้านี้ตั้งใจให้เป็น **หน้า Guest ล้วน**
 * (ไม่มีการ login) มาตั้งแต่งาน "สร้างคลังข้อสอบ + Search" จึงต้องกรอง
 * d."isPublic" = true เพิ่มเติมทุก query สาธารณะในไฟล์นี้ (ทั้ง list และ detail)
 * เพื่อไม่ให้เอกสาร Internal ที่เพิ่งเพิ่มมารั่วไหลผ่านหน้าคลังข้อสอบ — เอกสารเดิม
 * ทั้ง 7 รายการก่อนงานนี้ถูก seed ใหม่ให้ isPublic=true ครบทุกรายการแล้ว (ดู
 * prisma/seed.ts) จึงพฤติกรรมเดิมไม่เปลี่ยน (ยืนยันด้วย regression 44/44 เดิม)
 *
 * เหตุผลที่เลือก ILIKE แทน PostgreSQL full-text search (tsvector) สำหรับการค้นหา
 * ภาษาไทย (ดู prisma/exam-bank-pages.md §2.3 สำหรับรายละเอียดเต็ม): PostgreSQL
 * ไม่มี text search configuration/dictionary สำหรับตัดคำภาษาไทยในตัว (ไม่เหมือน
 * ภาษาอังกฤษที่มี 'english' config พร้อมใช้) การใช้ to_tsvector('simple', ...) กับ
 * ข้อความไทยที่มักไม่มีช่องว่างคั่นคำ จะ tokenize ทั้งประโยคเป็น token เดียว ทำให้
 * ค้นหาแบบ substring ไม่ได้เลย (แย่กว่า ILIKE) จึงเลือก ILIKE ต่อจาก title สอดคล้อง
 * กับ pattern เดิมที่ใช้ใน src/lib/news.ts
 */

export const EXAM_BANK_PAGE_SIZE = 9;

const DOCUMENT_TYPE_ENUM_SQL = `d."documentType"::text`;

export interface ExamBankDocumentSummary {
  id: string;
  title: string;
  documentType: DocumentType;
  levelName: string | null;
  subjectName: string | null;
  academicYearBE: number | null;
  currentVersionNo: number;
  approvedAt: Date | null;
}

export interface ExamBankDocumentDetail extends ExamBankDocumentSummary {
  programName: string | null;
  fileName: string | null;
  mimeType: string | null;
}

export interface ExamBankFilters {
  page: number;
  programId?: string;
  levelId?: string;
  subjectId?: string;
  yearBE?: number;
  documentType?: DocumentType;
  q?: string;
}

export interface ExamBankListResult {
  documents: ExamBankDocumentSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** ส่วน FROM/JOIN ที่ใช้ร่วมกันทั้ง COUNT และ LIST query — INNER JOIN LATERAL
 * คือกลไก deny-by-default หลักของไฟล์นี้ (ดู comment หัวไฟล์) */
const BASE_FROM_JOIN = `
  FROM documents d
  JOIN LATERAL (
    SELECT dv."versionNo", dv."approvedAt"
    FROM document_versions dv
    WHERE dv."documentId" = d.id AND dv.status = 'APPROVED'
    ORDER BY dv."versionNo" DESC
    LIMIT 1
  ) cv ON true
  LEFT JOIN education_levels el ON el.id = d."levelId" AND el."deletedAt" IS NULL
  LEFT JOIN subjects s ON s.id = d."subjectId" AND s."deletedAt" IS NULL
  LEFT JOIN academic_years ay ON ay.id = d."academicYearId"
`;

function buildConditions(filters: {
  programId?: string;
  levelId?: string;
  subjectId?: string;
  yearBE?: number;
  documentType?: DocumentType;
  q?: string;
}): { whereSql: string; values: unknown[] } {
  // WHERE clause ประกอบแบบ parameterized เสมอ — ไม่ interpolate ค่าจาก
  // searchParams ลงใน SQL string โดยตรง (ป้องกัน SQL injection)
  const conditions: string[] = [`d."deletedAt" IS NULL`, `d."isPublic" = true`];
  const values: unknown[] = [];

  if (filters.programId) {
    values.push(filters.programId);
    conditions.push(`el."programId" = $${values.length}`);
  }
  if (filters.levelId) {
    values.push(filters.levelId);
    conditions.push(`d."levelId" = $${values.length}`);
  }
  if (filters.subjectId) {
    values.push(filters.subjectId);
    conditions.push(`d."subjectId" = $${values.length}`);
  }
  if (filters.yearBE) {
    values.push(filters.yearBE);
    conditions.push(`ay."yearBE" = $${values.length}`);
  }
  if (filters.documentType) {
    values.push(filters.documentType);
    // enum vs $N::text ตรงๆ พัง (operator does not exist: document_type = text) —
    // cast คอลัมน์ enum เป็น ::text ก่อนเทียบเสมอ (เจอบั๊กนี้แล้วครั้งหนึ่งในงาน
    // ก่อนหน้า ดู prisma/curriculum-pages.md)
    conditions.push(`${DOCUMENT_TYPE_ENUM_SQL} = $${values.length}`);
  }
  if (filters.q) {
    values.push(`%${filters.q.trim()}%`);
    conditions.push(`d.title ILIKE $${values.length}`);
  }

  return { whereSql: conditions.join(" AND "), values };
}

/** F4.1 — ค้นหา/รายการเอกสารในคลังข้อสอบ: filter หลักสูตร/ชั้น/ปี/วิชา/ประเภท
 * เอกสาร + ค้นหาคำในชื่อเรื่อง + pagination เฉพาะเอกสารที่มีเวอร์ชัน APPROVED
 * อย่างน้อยหนึ่งเวอร์ชันเท่านั้น (deny-by-default) */
export async function listExamBankDocuments(
  filters: ExamBankFilters,
): Promise<ExamBankListResult> {
  const page = filters.page < 1 ? 1 : filters.page;
  const pageSize = EXAM_BANK_PAGE_SIZE;
  const { whereSql, values } = buildConditions(filters);

  const countResult = await query<{ count: string }>(
    `SELECT count(*)::text AS count ${BASE_FROM_JOIN} WHERE ${whereSql}`,
    values,
  );
  const total = Number.parseInt(countResult.rows[0]?.count ?? "0", 10);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const listValues = [...values, pageSize, offset];
  const { rows } = await query<{
    id: string;
    title: string;
    documentType: DocumentType;
    levelName: string | null;
    subjectName: string | null;
    academicYearBE: number | null;
    currentVersionNo: number;
    approvedAt: Date | null;
  }>(
    `SELECT d.id, d.title, d."documentType" AS "documentType",
            el.name AS "levelName", s.name AS "subjectName",
            ay."yearBE" AS "academicYearBE",
            cv."versionNo" AS "currentVersionNo", cv."approvedAt" AS "approvedAt"
     ${BASE_FROM_JOIN}
     WHERE ${whereSql}
     ORDER BY cv."approvedAt" DESC NULLS LAST, d.title ASC
     LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues,
  );

  return { documents: rows, page: safePage, pageSize, total, totalPages };
}

/** F4.2 — ดูรายละเอียดเอกสาร: คืน null ทั้งกรณี id ไม่มีอยู่จริงและกรณีมีอยู่จริง
 * แต่ไม่มีเวอร์ชัน APPROVED เลย (deny-by-default แบบเดียวกับ
 * news.getPublishedArticleBySlug — ไม่แยกข้อความ ป้องกันไม่ให้ทราบว่ามีเอกสาร
 * DRAFT/RETIRED อยู่จริงตาม id นี้) */
export async function getDocumentById(id: string): Promise<ExamBankDocumentDetail | null> {
  const { rows } = await query<{
    id: string;
    title: string;
    documentType: DocumentType;
    levelName: string | null;
    subjectName: string | null;
    programName: string | null;
    academicYearBE: number | null;
    currentVersionNo: number;
    approvedAt: Date | null;
    fileName: string | null;
    mimeType: string | null;
  }>(
    `SELECT d.id, d.title, d."documentType" AS "documentType",
            el.name AS "levelName", s.name AS "subjectName", p.name AS "programName",
            ay."yearBE" AS "academicYearBE",
            cv."versionNo" AS "currentVersionNo", cv."approvedAt" AS "approvedAt",
            cvFile."fileName" AS "fileName", cvFile."mimeType" AS "mimeType"
     FROM documents d
     JOIN LATERAL (
       SELECT dv."versionNo", dv."approvedAt"
       FROM document_versions dv
       WHERE dv."documentId" = d.id AND dv.status = 'APPROVED'
       ORDER BY dv."versionNo" DESC
       LIMIT 1
     ) cv ON true
     JOIN document_versions cvFile
       ON cvFile."documentId" = d.id AND cvFile."versionNo" = cv."versionNo"
     LEFT JOIN education_levels el ON el.id = d."levelId" AND el."deletedAt" IS NULL
     LEFT JOIN programs p ON p.id = el."programId" AND p."deletedAt" IS NULL
     LEFT JOIN subjects s ON s.id = d."subjectId" AND s."deletedAt" IS NULL
     LEFT JOIN academic_years ay ON ay.id = d."academicYearId"
     WHERE d.id = $1 AND d."deletedAt" IS NULL AND d."isPublic" = true`,
    [id],
  );
  return rows[0] ?? null;
}

export interface ExamBankSubjectOption {
  slug: string;
  code: string;
  name: string;
}

/** รายชื่อวิชาทั้งหมดที่เปิดใช้งาน — สำหรับตัวกรอง "วิชา" ในหน้าค้นหา (global,
 * ไม่ผูกกับระดับชั้น/หลักสูตรที่เลือก เพราะ subjects.code unique ทั้งระบบ ต่างจาก
 * education_levels.code ที่ unique เฉพาะภายใน program — ดู prisma/schema.prisma) */
export async function listAllSubjects(): Promise<ExamBankSubjectOption[]> {
  const { rows } = await query<{ code: string; name: string }>(
    `SELECT code, name FROM subjects WHERE "isActive" = true AND "deletedAt" IS NULL ORDER BY name ASC`,
  );
  return rows.map((r) => ({ ...r, slug: slugifyCode(r.code) }));
}

/** ค้นหาวิชาจาก slug แบบ global (คืน null ถ้าไม่มีจริง/ปิดใช้งาน/ถูกลบแล้ว) —
 * ใช้ resolve ค่า ?subject= จากหน้าค้นหาก่อนนำ id ไปกรอง */
export async function getSubjectBySlug(
  slug: string,
): Promise<{ id: string; code: string; name: string } | null> {
  const code = codeFromSlug(slug);
  const { rows } = await query<{ id: string; code: string; name: string }>(
    `SELECT id, code, name FROM subjects WHERE code = $1 AND "isActive" = true AND "deletedAt" IS NULL`,
    [code],
  );
  return rows[0] ?? null;
}

/** ตรวจ query param ?documentType= กับ allowlist ก่อนนำไปใช้ — ค่าที่ไม่รู้จักถือ
 * ว่าไม่ได้ระบุ (ไม่ error, ไม่ throw) เหมือนแนวทาง parseExamTypeParam ของ
 * src/lib/curriculum.ts */
export function parseDocumentTypeParam(raw: string | undefined): DocumentType | undefined {
  if (!raw) return undefined;
  return (DOCUMENT_TYPES as readonly string[]).includes(raw) ? (raw as DocumentType) : undefined;
}
