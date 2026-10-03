import "server-only";
import { query } from "@/lib/db";
import { codeFromSlug, slugifyCode } from "@/lib/slug";
import { EXAM_TYPES, type ExamType } from "@/lib/domain-types";

/**
 * Data-access layer สำหรับงาน "สร้างหน้า นักธรรม/ธรรมศึกษา/บาลี" (P4 Public
 * Front End) — Browse ตาม program → level → subject → year พร้อม breadcrumbs
 * และ filter (user-flows.md Flow 2 — F2.1 ขยายให้ลึกถึงระดับวิชา + F2.2 ตาราง
 * สอบ ผูกกับวิชาที่เลือก) อ่านอย่างเดียวทั้งหมด (read-only, ไม่มี write path ใน
 * งานนี้) จากตาราง programs/education_levels/subjects/curricula/
 * curriculum_level_subjects/academic_years/exam_sessions/exam_schedules/
 * exam_session_centers/exam_centers ที่ออกแบบไว้แล้วใน P2 (ดู
 * prisma/education-schema.md) — ไม่มี schema/migration ใหม่ในงานนี้
 *
 * Deny-by-default ของโดเมนนี้ต่างจากข่าว (P4 news, DRAFT/UNPUBLISHED) ตรงที่ไม่มี
 * status เผยแพร่/ร่างของ programs/education_levels/subjects — แต่มี `isActive`
 * (soft-disable ตาม data-policy.md ข้อ 7 — ดู user-flows.md F2.3: "ห้ามลบข้อมูล
 * อ้างอิงที่ถูกใช้งานอยู่ ใช้ soft-disable แทน") และ `deletedAt` (soft delete)
 * ทุก query ในไฟล์นี้จึงกรอง isActive=true AND deletedAt IS NULL เสมอ — รายการที่
 * ปิดใช้งาน/ถูกลบแล้ว ถือว่า "ไม่มีอยู่จริง" ต่อ public เช่นเดียวกับข่าว
 * DRAFT/UNPUBLISHED (getXxxBySlug คืน null เหมือนกันทั้ง "ไม่มีจริง" และ "ปิดใช้
 * งานแล้ว" — ไม่แยกข้อความ)
 */

export interface ProgramSummary {
  slug: string;
  code: string;
  name: string;
  nameEn: string | null;
  description: string | null;
}

export interface LevelSummary {
  slug: string;
  code: string;
  name: string;
  sortOrder: number;
}

export interface AcademicYearOption {
  yearBE: number;
  label: string | null;
}

export interface CurrentCurriculum {
  id: string;
  code: string;
  name: string;
  effectiveFromYearBE: number;
}

export interface SubjectInLevel {
  slug: string;
  code: string;
  name: string;
  maxScore: number;
  passScore: number;
  examType: ExamType;
}

export interface SubjectDetail {
  clsId: string;
  slug: string;
  code: string;
  name: string;
  description: string | null;
  maxScore: number;
  passScore: number;
  examType: ExamType;
}

export interface ExamScheduleEntry {
  examSessionId: string;
  examSessionName: string | null;
  roundNumber: number;
  yearBE: number;
  startAt: Date;
  endAt: Date;
  centerNames: string[];
}

/** รายการสายการศึกษาทั้งหมดที่เปิดใช้งาน (นักธรรม/ธรรมศึกษา/บาลี) */
export async function listPrograms(): Promise<ProgramSummary[]> {
  const { rows } = await query<{
    code: string;
    name: string;
    nameEn: string | null;
    description: string | null;
  }>(
    `SELECT code, name, "nameEn", description
     FROM programs
     WHERE "isActive" = true AND "deletedAt" IS NULL
     ORDER BY name ASC`,
  );
  return rows.map((r) => ({ ...r, slug: slugifyCode(r.code) }));
}

/** ค้นหาสายการศึกษาจาก slug — คืน null ทั้งกรณีไม่มีจริงและถูกปิดใช้งาน/ลบแล้ว */
export async function getProgramBySlug(
  slug: string,
): Promise<(ProgramSummary & { id: string }) | null> {
  const code = codeFromSlug(slug);
  const { rows } = await query<{
    id: string;
    code: string;
    name: string;
    nameEn: string | null;
    description: string | null;
  }>(
    `SELECT id, code, name, "nameEn", description
     FROM programs
     WHERE code = $1 AND "isActive" = true AND "deletedAt" IS NULL`,
    [code],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, slug: slugifyCode(row.code) };
}

/** รายการระดับชั้นของสายการศึกษาหนึ่ง เรียงตาม sortOrder */
export async function listLevelsForProgram(programId: string): Promise<LevelSummary[]> {
  const { rows } = await query<{ code: string; name: string; sortOrder: number }>(
    `SELECT code, name, "sortOrder"
     FROM education_levels
     WHERE "programId" = $1 AND "isActive" = true AND "deletedAt" IS NULL
     ORDER BY "sortOrder" ASC`,
    [programId],
  );
  return rows.map((r) => ({ ...r, slug: slugifyCode(r.code) }));
}

/** ค้นหาระดับชั้นจาก slug ภายในสายการศึกษาที่ระบุ (code ไม่ unique ข้าม program) */
export async function getLevelBySlug(
  programId: string,
  slug: string,
): Promise<(LevelSummary & { id: string }) | null> {
  const code = codeFromSlug(slug);
  const { rows } = await query<{ id: string; code: string; name: string; sortOrder: number }>(
    `SELECT id, code, name, "sortOrder"
     FROM education_levels
     WHERE "programId" = $1 AND code = $2 AND "isActive" = true AND "deletedAt" IS NULL`,
    [programId, code],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, slug: slugifyCode(row.code) };
}

/** ปีการศึกษาทั้งหมดที่เปิดใช้งาน เรียงจากล่าสุด — ใช้สร้างตัวกรองปีในหน้าวิชา */
export async function listAcademicYears(): Promise<AcademicYearOption[]> {
  const { rows } = await query<{ yearBE: number; label: string | null }>(
    `SELECT "yearBE", label FROM academic_years
     WHERE "isActive" = true
     ORDER BY "yearBE" DESC`,
  );
  return rows;
}

/**
 * หลักสูตรที่ "ใช้งานอยู่ในปัจจุบัน" ของสายการศึกษาหนึ่ง — ใช้ pattern เดียวกับที่
 * บันทึกไว้ใน prisma/education-schema.md หัวข้อ "วิธี query หลักสูตรที่ใช้จริง ณ
 * ปีการศึกษา Y" โดยแทนที่ "ปีที่สนใจ" ด้วยปีการศึกษาที่เปิดใช้งานล่าสุดในระบบ
 * (เทียบเท่า "ปัจจุบัน" เพราะ AcademicYear เป็นตารางข้อมูล ไม่ hard-code ปีปัจจุบัน
 * ไว้ในโค้ด) คืน null ถ้าสายการศึกษานี้ยังไม่มีหลักสูตรที่เผยแพร่เลย (เช่น บาลี ณ
 * ตอนที่เขียนงานนี้ — ดู prisma/curriculum-pages.md §6)
 */
export async function getCurrentCurriculumForProgram(
  programId: string,
): Promise<CurrentCurriculum | null> {
  const { rows } = await query<{
    id: string;
    code: string;
    name: string;
    effectiveFromYearBE: number;
  }>(
    `SELECT c.id, c.code, c.name, ay."yearBE" AS "effectiveFromYearBE"
     FROM curricula c
     JOIN academic_years ay ON ay.id = c."effectiveFromYearId"
     WHERE c."programId" = $1
       AND ay."yearBE" <= (SELECT MAX("yearBE") FROM academic_years WHERE "isActive" = true)
     ORDER BY ay."yearBE" DESC
     LIMIT 1`,
    [programId],
  );
  return rows[0] ?? null;
}

/**
 * รายวิชาของระดับชั้นหนึ่งภายในหลักสูตรที่ระบุ เรียงตาม sortOrder พร้อมตัวกรอง
 * examType (optional — allowlist ผ่าน EXAM_TYPES ก่อนเรียกฟังก์ชันนี้เสมอ ที่หน้า
 * page.tsx ไม่ส่งค่าที่ไม่รู้จักเข้ามาที่นี่)
 */
export async function listSubjectsForLevel(
  curriculumId: string,
  levelId: string,
  examType?: ExamType,
): Promise<SubjectInLevel[]> {
  const { rows } = await query<{
    code: string;
    name: string;
    maxScore: number;
    passScore: number;
    examType: ExamType;
  }>(
    `SELECT s.code, s.name, cls."maxScore" AS "maxScore", cls."passScore" AS "passScore",
            cls."examType" AS "examType"
     FROM curriculum_level_subjects cls
     JOIN subjects s ON s.id = cls."subjectId" AND s."isActive" = true AND s."deletedAt" IS NULL
     WHERE cls."curriculumId" = $1 AND cls."levelId" = $2 AND cls."isActive" = true
       AND ($3::text IS NULL OR cls."examType"::text = $3)
     ORDER BY cls."sortOrder" ASC`,
    [curriculumId, levelId, examType ?? null],
  );
  return rows.map((r) => ({ ...r, slug: slugifyCode(r.code) }));
}

/**
 * รายละเอียดวิชาหนึ่งภายในระดับชั้น+หลักสูตรที่ระบุ — คืน null ทั้งกรณี subject
 * ไม่มีอยู่จริง และกรณีมีอยู่จริงแต่ไม่ได้อยู่ในหลักสูตร/ระดับชั้นนี้ (deny-by-
 * default แบบเดียวกับ news.getPublishedArticleBySlug — ไม่แยกข้อความ ป้องกันไม่
 * ให้ URL เดารายวิชาข้ามระดับชั้น/หลักสูตรได้)
 */
export async function getSubjectInLevelBySlug(
  curriculumId: string,
  levelId: string,
  subjectSlug: string,
): Promise<SubjectDetail | null> {
  const code = codeFromSlug(subjectSlug);
  const { rows } = await query<{
    clsId: string;
    code: string;
    name: string;
    description: string | null;
    maxScore: number;
    passScore: number;
    examType: ExamType;
  }>(
    `SELECT cls.id AS "clsId", s.code, s.name, s.description,
            cls."maxScore" AS "maxScore", cls."passScore" AS "passScore",
            cls."examType" AS "examType"
     FROM curriculum_level_subjects cls
     JOIN subjects s ON s.id = cls."subjectId" AND s."isActive" = true AND s."deletedAt" IS NULL
     WHERE cls."curriculumId" = $1 AND cls."levelId" = $2 AND s.code = $3
       AND cls."isActive" = true`,
    [curriculumId, levelId, code],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, slug: slugifyCode(row.code) };
}

/**
 * ตารางสอบของวิชาหนึ่ง (curriculum_level_subjects) ข้ามปีการศึกษา — filter ด้วย
 * yearBE (optional; ไม่ระบุ = ทุกปี) เรียงจากปีล่าสุดก่อน
 *
 * ขอบเขตที่ตั้งใจ (โปร่งใส — ดู prisma/curriculum-pages.md §6): enum
 * `exam_session_status` ปัจจุบันไม่มีสถานะ "ร่าง/ยังไม่เผยแพร่" แยกจาก PLANNED
 * อย่างชัดเจน (ต่างจาก NewsArticleStatus ที่มี DRAFT ชัดเจน) — ตีความว่า PLANNED
 * คือรอบสอบที่ตัดสินใจแล้วและถือเป็นข้อมูลสาธารณะได้แล้ว (สอดคล้องกับพฤติกรรมจริง
 * ที่ตารางสอบสนามหลวงมักประกาศล่วงหน้าก่อนเปิดรับสมัคร) จึงกรองออกเฉพาะ CANCELLED
 * เท่านั้น ไม่กรอง PLANNED — หากอนาคตต้องการสถานะร่างที่แท้จริง ต้องเพิ่ม enum
 * value ใหม่และย้าย filter นี้มาใช้
 */
export async function listExamScheduleForSubject(
  curriculumLevelSubjectId: string,
  yearBE?: number,
): Promise<ExamScheduleEntry[]> {
  const { rows } = await query<{
    examSessionId: string;
    examSessionName: string | null;
    roundNumber: number;
    yearBE: number;
    startAt: Date;
    endAt: Date;
    centerNames: string[];
  }>(
    `SELECT es.id AS "examSessionId", es.name AS "examSessionName",
            es."roundNumber" AS "roundNumber", ay."yearBE" AS "yearBE",
            sch."startAt" AS "startAt", sch."endAt" AS "endAt",
            COALESCE(
              array_agg(DISTINCT ec.name) FILTER (WHERE ec.name IS NOT NULL),
              '{}'
            ) AS "centerNames"
     FROM exam_schedules sch
     JOIN exam_sessions es ON es.id = sch."examSessionId" AND es."deletedAt" IS NULL
     JOIN academic_years ay ON ay.id = es."academicYearId"
     LEFT JOIN exam_session_centers esc ON esc."examSessionId" = es.id
     LEFT JOIN exam_centers ec ON ec.id = esc."examCenterId" AND ec."deletedAt" IS NULL
     WHERE sch."curriculumLevelSubjectId" = $1
       AND sch."deletedAt" IS NULL
       AND es.status != 'CANCELLED'
       AND ($2::int IS NULL OR ay."yearBE" = $2)
     GROUP BY es.id, es.name, es."roundNumber", ay."yearBE", sch."startAt", sch."endAt"
     ORDER BY ay."yearBE" DESC, sch."startAt" ASC`,
    [curriculumLevelSubjectId, yearBE ?? null],
  );
  return rows;
}

/** ตรวจ query param ?examType= กับ allowlist ก่อนนำไปใช้ — ค่าที่ไม่รู้จักถือว่า
 * ไม่ได้ระบุ (ไม่ error, ไม่ throw) เหมือนแนวทาง parsePageParam ของ news.ts */
export function parseExamTypeParam(raw: string | undefined): ExamType | undefined {
  if (!raw) return undefined;
  return (EXAM_TYPES as readonly string[]).includes(raw) ? (raw as ExamType) : undefined;
}

/** ตรวจ query param ?year= — จำนวนเต็มบวกสมเหตุสมผลเท่านั้น ไม่ใช่ก็ถือว่าไม่ระบุ
 * (ไม่ error) เหมือนแนวทาง parsePageParam ของ news.ts */
export function parseYearParam(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 2400 || n > 2700) return undefined;
  return n;
}
