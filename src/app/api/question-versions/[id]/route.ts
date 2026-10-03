import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { authorizeOwnedRow, notFoundOrForbidden, unauthenticated } from "@/lib/guard";
import { query } from "@/lib/db";

/**
 * GET /api/question-versions/[id] — endpoint ที่สาม (ใหม่จากงาน "สร้าง Authorization
 * Guard ฝั่ง Server") ที่พิสูจน์ scope **RESPONSIBLE_RECORD** ("เฉพาะที่รับผิดชอบ" ของ
 * Teacher บน M3 คลังข้อสอบ) — ผ่านได้สองทาง: (ก) เป็นผู้แต่งเอง (authorActorId ตรงกับ
 * user.id) หรือ (ข) อยู่ในสายการศึกษา (program) ที่ตนมี program scope ครอบคลุม แม้จะ
 * ไม่ได้เป็นผู้แต่งเองก็ตาม (ตีความ "รับผิดชอบ" ว่ารวมถึงสายที่ได้รับมอบหมายทั้งสาย
 * ไม่ใช่แค่ผลงานของตนเอง — ดู roles-permissions.md ข้อ 3 คอลัมน์ M3 ของ Teacher)
 *
 * Function: ดูรายละเอียด QuestionVersion ตาม id
 * Actor: ผู้ใช้ที่ login แล้วทุกบทบาท (ขอบเขตต่างกันตาม scope ของ QUESTION_BANK module —
 *        STUDENT ไม่มี entry เลยจึง deny-by-default เสมอ)
 * Input: URL param id (string — QuestionVersion.id)
 * Process:
 *   1. getCurrentUser() — ไม่มี session → 401
 *   2. query QuestionVersion + join Question -> Level เพื่อดึง programId ของสาย
 *      การศึกษาที่ข้อสอบนี้สังกัด (ต้องรู้ก่อนตรวจสิทธิ์ RESPONSIBLE_RECORD) — ไม่พบ → 404
 *   3. authorizeOwnedRow(user, "QUESTION_BANK", "read", { ownerUserId: authorActorId,
 *      programId }) — ครอบคลุมทั้ง ALL (Super Admin/Central Officer/Regional Admin/
 *      Registrar Staff/Examiner/Auditor) และ RESPONSIBLE_RECORD (Teacher — authorship
 *      หรือ program scope) — ไม่ผ่าน → 404 (ไม่ใช่ 403 — เหตุผลเดียวกับ /api/persons/[id]:
 *      สถานะ/เนื้อหาข้อสอบที่ยังไม่อนุมัติเป็นข้อมูล Restricted)
 * Output: 200 { id, questionId, versionNo, status, authorActorId } | 401 | 404
 * Permission: authorizeOwnedRow() ผ่าน can() เดียวกับทั้งระบบ
 * Validation: id เป็น URL segment เสมอ
 * Error State: 401, 404 (ไม่พบ หรือพบแต่ไม่มีสิทธิ์ — แยกไม่ออกโดยตั้งใจ), 500
 * Audit: อ่านอย่างเดียว ไม่บันทึก
 * Acceptance Criteria (ทดสอบจริงใน prisma/test-authz-guard.mjs):
 *   AC1: ไม่มี session → 401 เสมอ
 *   AC2: Teacher เปิดดู QuestionVersion ที่ตนแต่งเอง → 200
 *   AC3: Teacher เปิดดู QuestionVersion สายนักธรรม (program scope ของตน) ที่คนอื่นแต่ง → 200
 *   AC4: Teacher คนเดียวกันเปิดดู QuestionVersion สายธรรมศึกษา (คนละ program, คนอื่นแต่ง) → 404 (IDOR-safe)
 *   AC5: Central Officer/Examiner (QUESTION_BANK scope=ALL) เปิดดูได้ทุกรายการ → 200
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/question-versions/[id]">) {
  const { id } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return unauthenticated();

  const { rows } = await query<{
    id: string;
    questionId: string;
    versionNo: number;
    status: string;
    authorActorId: string | null;
    programId: string | null;
  }>(
    `SELECT qv.id, qv."questionId", qv."versionNo", qv.status, qv."authorActorId",
            l."programId"
       FROM question_versions qv
       JOIN questions q ON q.id = qv."questionId" AND q."deletedAt" IS NULL
       JOIN education_levels l ON l.id = q."levelId"
      WHERE qv.id = $1`,
    [id],
  );
  const qv = rows[0];
  if (!qv) return notFoundOrForbidden();

  const allowed = await authorizeOwnedRow(user, "QUESTION_BANK", "read", {
    ownerUserId: qv.authorActorId ?? undefined,
    programId: qv.programId ?? undefined,
  });
  if (!allowed) return notFoundOrForbidden();

  return NextResponse.json({
    id: qv.id,
    questionId: qv.questionId,
    versionNo: qv.versionNo,
    status: qv.status,
    authorActorId: qv.authorActorId,
  });
}
