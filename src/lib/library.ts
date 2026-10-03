import "server-only";
import { query } from "@/lib/db";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain-types";

/**
 * Data-access layer สำหรับงาน "สร้างห้องสมุด PDF/Download" (P4 Public Front End)
 * — metadata, preview, version (ประวัติเวอร์ชัน), download, public/private access
 * (ดู prisma/library-pages.md สำหรับเหตุผลออกแบบทั้งหมด) อ่านอย่างเดียวทั้งหมด
 * (read-only) ยกเว้น resolveFileUrl() ที่เป็นเพียง placeholder สำหรับ M8 ในอนาคต
 *
 * ความสัมพันธ์กับ src/lib/exam-bank.ts (งาน "สร้างคลังข้อสอบ + Search" ก่อนหน้า):
 * ทั้งสองไฟล์ query ตาราง documents/document_versions เดียวกัน (ไม่ได้แยกตาราง
 * กันคนละชุด) — "คลังข้อสอบ" กรองตามบริบทหลักสูตร/ชั้น/ปี/วิชา ส่วน "ห้องสมุด" ในไฟล์
 * นี้กรองตามหมวดหมู่/แท็ก (Category/Tag — มีอยู่ในสคีมาตั้งแต่ P2 แต่ไม่เคยถูกใช้จริง
 * โดยหน้าใดมาก่อนงานนี้) เอกสารที่เข้าเงื่อนไขทั้งสองมุมมอง (เช่น เอกสารที่ผูกทั้งชั้น/
 * วิชา และมีหมวดหมู่) จะปรากฏได้ในทั้งสองหน้า — เป็นการออกแบบที่ตั้งใจ ไม่ใช่บั๊ก
 * (เอกสารสาธารณะชุดเดียวกัน มีสองมุมมอง/ตัวกรองที่ต่างกันสำหรับผู้ใช้ต่างบริบท)
 *
 * ข้อแตกต่างสำคัญจาก exam-bank.ts — "public/private access":
 * documents ได้คอลัมน์ "isPublic" เพิ่มใหม่ในงานนี้ (migration
 * 20260924110000_document_visibility) — เอกสาร isPublic=true มองเห็นได้แม้เป็น
 * Guest (ไม่ login) เอกสาร isPublic=false ("Internal" ตาม data-policy.md ข้อ 2)
 * ต้อง login ก่อนจึงมองเห็น **ไม่ว่าบทบาทใดก็ตาม** (ดูเหตุผลเต็มเรื่องทำไมไม่ใช้
 * FILES-module scope (OWN_ORG_SUBTREE/OWN_RECORD) จาก src/lib/permissions.ts ใน
 * prisma/library-pages.md §2 — สรุปสั้นๆ: Document ไม่มีคอลัมน์ ownership/
 * org-linkage ให้ resolve scope เหล่านั้นได้อย่างถูกต้อง การบังคับใช้ scope นั้นจะ
 * deny ผิดกลุ่ม (เช่น STUDENT/REGISTRAR_STAFF) ทั้งที่ควรเห็นได้ตามเจตนาโจทย์
 * "public/private access" ในบรีฟนี้ — จึงใช้กฎง่ายที่สุดที่ตรงตามคำที่โจทย์ระบุ:
 * "private" = ต้อง login (isAuthenticated) เท่านั้น ไม่ตรวจ role/scope เพิ่มเติม
 * เป็น scope simplification ที่บันทึกไว้อย่างโปร่งใส ตาม pattern เดียวกับ
 * ASSIGNED_SESSION-always-deny/M6-read-only-interpretation ก่อนหน้า)
 *
 * Deny-by-default เดิม (เหมือน exam-bank.ts) ยังคงอยู่ครบ: เอกสารต้องมี
 * DocumentVersion อย่างน้อยหนึ่งเวอร์ชันที่ status='APPROVED' เท่านั้นจึงจะ "มีอยู่จริง"
 * ต่อผู้อ่านทุกคน (ทั้ง Guest และผู้ที่ login แล้ว) — isPublic เป็นเงื่อนไข "เพิ่มเติม"
 * ที่ต้องผ่านคู่กับเงื่อนไขนี้เสมอ ไม่ใช่แทนที่กัน
 *
 * "version" (ประวัติเวอร์ชัน) — ต่างจาก exam-bank.ts ที่แสดงเฉพาะเวอร์ชัน APPROVED
 * ล่าสุด (currentVersionNo) หน้าห้องสมุดตามบรีฟนี้ระบุ "version" เป็น feature
 * เฉพาะ จึงแสดง**ทุกเวอร์ชันที่ APPROVED** เรียงจากใหม่ไปเก่า (เอกสารเดียวกันอาจมี
 * มากกว่าหนึ่งเวอร์ชันที่เคยผ่านการอนุมัติ แต่ละเวอร์ชันเป็นแถวที่ immutable แยกกัน —
 * ดู prisma/library-pages.md §3)
 */

export const LIBRARY_PAGE_SIZE = 9;

const DOCUMENT_TYPE_ENUM_SQL = `d."documentType"::text`;

export interface LibraryDocumentSummary {
  id: string;
  title: string;
  documentType: DocumentType;
  isPublic: boolean;
  currentVersionNo: number;
  approvedAt: Date | null;
}

export interface LibraryDocumentVersion {
  versionNo: number;
  approvedAt: Date | null;
  fileName: string | null;
  mimeType: string | null;
  fileSize: number | null;
  /** true เมื่อมี fileKey จริง (ยังไม่มีในข้อมูลจำลองชุดใดเลย — placeholder รอ M8) */
  hasFile: boolean;
}

export interface LibraryDocumentDetail extends LibraryDocumentSummary {
  categories: string[];
  tags: string[];
  /** ทุกเวอร์ชันที่ APPROVED เรียงจากใหม่ไปเก่า (รวมเวอร์ชันปัจจุบันด้วย) */
  versions: LibraryDocumentVersion[];
}

export interface LibraryFilters {
  page: number;
  categoryId?: string;
  tagName?: string;
  documentType?: DocumentType;
  q?: string;
}

export interface LibraryListResult {
  documents: LibraryDocumentSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** ส่วน FROM/JOIN ที่ใช้ร่วมกันทั้ง COUNT และ LIST query — INNER JOIN LATERAL คือ
 * กลไก deny-by-default หลัก (เหมือน exam-bank.ts) */
const BASE_FROM_JOIN = `
  FROM documents d
  JOIN LATERAL (
    SELECT dv."versionNo", dv."approvedAt"
    FROM document_versions dv
    WHERE dv."documentId" = d.id AND dv.status = 'APPROVED'
    ORDER BY dv."versionNo" DESC
    LIMIT 1
  ) cv ON true
`;

function buildConditions(
  filters: {
    categoryId?: string;
    tagName?: string;
    documentType?: DocumentType;
    q?: string;
  },
  isAuthenticated: boolean,
): { whereSql: string; values: unknown[] } {
  // WHERE clause ประกอบแบบ parameterized เสมอ — ไม่ interpolate ค่าจาก
  // searchParams ลงใน SQL string โดยตรง (ป้องกัน SQL injection)
  const conditions: string[] = [`d."deletedAt" IS NULL`];
  const values: unknown[] = [];

  // public/private access — deny-by-default: ไม่ login เห็นเฉพาะ isPublic=true
  if (!isAuthenticated) {
    conditions.push(`d."isPublic" = true`);
  }

  if (filters.categoryId) {
    values.push(filters.categoryId);
    conditions.push(
      `EXISTS (SELECT 1 FROM document_categories dc WHERE dc."documentId" = d.id AND dc."categoryId" = $${values.length})`,
    );
  }
  if (filters.tagName) {
    values.push(filters.tagName);
    conditions.push(
      `EXISTS (SELECT 1 FROM document_tags dt JOIN tags t ON t.id = dt."tagId" WHERE dt."documentId" = d.id AND t.name = $${values.length})`,
    );
  }
  if (filters.documentType) {
    values.push(filters.documentType);
    // enum vs $N::text ตรงๆ พัง — cast คอลัมน์ enum เป็น ::text ก่อนเทียบเสมอ (ดู
    // src/lib/exam-bank.ts สำหรับที่มาของ pattern นี้)
    conditions.push(`${DOCUMENT_TYPE_ENUM_SQL} = $${values.length}`);
  }
  if (filters.q) {
    values.push(`%${filters.q.trim()}%`);
    conditions.push(`d.title ILIKE $${values.length}`);
  }

  return { whereSql: conditions.join(" AND "), values };
}

/** F8.1 — ค้นหา/รายการเอกสารในห้องสมุด: filter หมวดหมู่/แท็ก/ประเภทเอกสาร + ค้นหาคำ
 * ในชื่อเรื่อง + pagination เฉพาะเอกสารที่มีเวอร์ชัน APPROVED อย่างน้อยหนึ่งเวอร์ชัน
 * (deny-by-default) และผ่านเงื่อนไข public/private ตาม isAuthenticated */
export async function listLibraryDocuments(
  filters: LibraryFilters,
  isAuthenticated: boolean,
): Promise<LibraryListResult> {
  const page = filters.page < 1 ? 1 : filters.page;
  const pageSize = LIBRARY_PAGE_SIZE;
  const { whereSql, values } = buildConditions(filters, isAuthenticated);

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
    isPublic: boolean;
    currentVersionNo: number;
    approvedAt: Date | null;
  }>(
    `SELECT d.id, d.title, d."documentType" AS "documentType", d."isPublic" AS "isPublic",
            cv."versionNo" AS "currentVersionNo", cv."approvedAt" AS "approvedAt"
     ${BASE_FROM_JOIN}
     WHERE ${whereSql}
     ORDER BY cv."approvedAt" DESC NULLS LAST, d.title ASC
     LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues,
  );

  return { documents: rows, page: safePage, pageSize, total, totalPages };
}

/** F8.2 — ดูรายละเอียดเอกสาร + ประวัติเวอร์ชัน: คืน null ทั้งกรณี id ไม่มีอยู่จริง,
 * กรณีมีอยู่จริงแต่ไม่มีเวอร์ชัน APPROVED เลย, และกรณี isPublic=false ขณะที่
 * isAuthenticated=false (ไม่แยกข้อความทั้งสามกรณี — deny-by-default แบบเดียวกับ
 * exam-bank.getDocumentById/news.getPublishedArticleBySlug — ป้องกันไม่ให้ทราบว่ามี
 * เอกสาร private/DRAFT/RETIRED อยู่จริงตาม id นี้) */
export async function getLibraryDocumentById(
  id: string,
  isAuthenticated: boolean,
): Promise<LibraryDocumentDetail | null> {
  const visibilitySql = isAuthenticated ? "" : `AND d."isPublic" = true`;

  const { rows } = await query<{
    id: string;
    title: string;
    documentType: DocumentType;
    isPublic: boolean;
    currentVersionNo: number;
    approvedAt: Date | null;
  }>(
    `SELECT d.id, d.title, d."documentType" AS "documentType", d."isPublic" AS "isPublic",
            cv."versionNo" AS "currentVersionNo", cv."approvedAt" AS "approvedAt"
     ${BASE_FROM_JOIN}
     WHERE d.id = $1 AND d."deletedAt" IS NULL ${visibilitySql}`,
    [id],
  );
  const row = rows[0];
  if (!row) return null;

  const [{ rows: versionRows }, { rows: categoryRows }, { rows: tagRows }] = await Promise.all([
    query<{
      versionNo: number;
      approvedAt: Date | null;
      fileName: string | null;
      mimeType: string | null;
      fileSize: number | null;
      fileKey: string | null;
    }>(
      `SELECT "versionNo", "approvedAt", "fileName", "mimeType", "fileSize", "fileKey"
         FROM document_versions
        WHERE "documentId" = $1 AND status = 'APPROVED'
        ORDER BY "versionNo" DESC`,
      [id],
    ),
    query<{ name: string }>(
      `SELECT c.name
         FROM document_categories dc
         JOIN categories c ON c.id = dc."categoryId"
        WHERE dc."documentId" = $1
        ORDER BY c.name`,
      [id],
    ),
    query<{ name: string }>(
      `SELECT t.name
         FROM document_tags dt
         JOIN tags t ON t.id = dt."tagId"
        WHERE dt."documentId" = $1
        ORDER BY t.name`,
      [id],
    ),
  ]);

  return {
    ...row,
    categories: categoryRows.map((r) => r.name),
    tags: tagRows.map((r) => r.name),
    versions: versionRows.map((v) => ({
      versionNo: v.versionNo,
      approvedAt: v.approvedAt,
      fileName: v.fileName,
      mimeType: v.mimeType,
      fileSize: v.fileSize,
      hasFile: v.fileKey !== null,
    })),
  };
}

export interface LibraryCategoryOption {
  id: string;
  name: string;
}

/** รายชื่อหมวดหมู่ที่เปิดใช้งานทั้งหมด — สำหรับตัวกรอง "หมวดหมู่" ในหน้าค้นหา (global,
 * ไม่กรองว่ามีเอกสารสาธารณะผูกอยู่จริงหรือไม่ — เหมือน pattern listAllSubjects() ของ
 * exam-bank.ts) กรองด้วย id ตรงๆ (ไม่ใช่ slug) เพราะ Category.code เป็น nullable
 * ตามสคีมา (ไม่รับประกันว่ามีค่าเสมอ ต่างจาก Program/Level/Subject.code) */
export async function listCategories(): Promise<LibraryCategoryOption[]> {
  const { rows } = await query<LibraryCategoryOption>(
    `SELECT id, name FROM categories WHERE "isActive" = true AND "deletedAt" IS NULL ORDER BY name ASC`,
  );
  return rows;
}

/** รายชื่อแท็กทั้งหมด — สำหรับตัวกรอง "แท็ก" (global) กรองด้วยชื่อตรงๆ (Tag ไม่มี
 * isActive/soft-delete ตามสคีมา — ดู comment หัวโมเดลใน prisma/schema.prisma) */
export async function listTags(): Promise<string[]> {
  const { rows } = await query<{ name: string }>(`SELECT name FROM tags ORDER BY name ASC`);
  return rows.map((r) => r.name);
}

/** ตรวจ query param ?documentType= กับ allowlist ก่อนนำไปใช้ — ค่าที่ไม่รู้จักถือว่า
 * ไม่ได้ระบุ (ไม่ error, ไม่ throw) — เหมือน parseDocumentTypeParam ของ
 * exam-bank.ts ทุกประการ (คัดลอกไว้ในไฟล์นี้แทนการ import ข้ามไฟล์ เพื่อให้
 * src/lib/library.ts ไม่ผูกกับ exam-bank.ts โดยไม่จำเป็น — ทั้งสองเป็นหน้า public
 * ที่ควรแก้ไขอิสระจากกันได้) */
export function parseDocumentTypeParam(raw: string | undefined): DocumentType | undefined {
  if (!raw) return undefined;
  return (DOCUMENT_TYPES as readonly string[]).includes(raw) ? (raw as DocumentType) : undefined;
}

/**
 * Resolve URL ไฟล์จริงจาก fileKey — placeholder เสมอในเฟสนี้ (คืน null ทุกกรณี)
 * เพราะยังไม่เชื่อมต่อ object storage จริง (M8 — ดู adr/0005-object-storage-s3-compatible.md)
 * แยกเป็นฟังก์ชันเดียวเพื่อให้มีจุดแก้ไขจุดเดียวเมื่อเชื่อมต่อ M8 จริงในอนาคต (ไม่ต้อง
 * ไล่แก้ทุกจุดที่เรียกใช้ fileKey)
 */
export function resolveFileUrl(fileKey: string | null): string | null {
  void fileKey; // ยังไม่ใช้งานจริงในเฟสนี้ (M8 ยังไม่เชื่อมต่อ) — คง parameter ไว้เพื่อ
  // ให้ signature ตรงกับที่ผู้เรียกใช้จริงในอนาคตต้องการ
  return null;
}
