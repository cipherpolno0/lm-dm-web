import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { authorizeOwnedRow, notFoundOrForbidden, unauthenticated } from "@/lib/guard";
import { query } from "@/lib/db";

/**
 * GET /api/persons/[id] — endpoint ที่สอง (ใหม่จากงาน "สร้าง Authorization Guard
 * ฝั่ง Server") ที่พิสูจน์ scope นอกเหนือจาก OWN_ORG_SUBTREE: **OWN_RECORD** ("เฉพาะ
 * ของตน") บน M1 ทะเบียน — ตัวอย่าง IDOR classic: ผู้ใช้เดา/ไล่เลข id ของระเบียน Person
 * คนอื่นแล้วพยายามเปิดดู ต้องถูกปฏิเสธเสมอถ้าไม่ใช่ระเบียนของตนเอง (ยกเว้นบทบาทที่มี
 * REGISTRY scope=ALL หรือ OWN_ORG_SUBTREE ที่ครอบคลุมสังกัดปัจจุบันของบุคคลนั้นจริง)
 *
 * Function: ดูระเบียนทะเบียนบุคคล (M1) ตาม id
 * Actor: ผู้ใช้ที่ login แล้วทุกบทบาท (ขอบเขตต่างกันตาม scope ของ REGISTRY module)
 * Input: URL param id (string — Person.id)
 * Process:
 *   1. getCurrentUser() — ไม่มี session → 401
 *   2. query ระเบียน Person + สังกัดปัจจุบัน (Appointment ที่ status='ACTIVE' ล่าสุด
 *      ถ้ามี — ใช้เป็น organizationId context สำหรับ OWN_ORG_SUBTREE) ในคำสั่งเดียว —
 *      ไม่พบ Person (ไม่มีอยู่จริง/ถูกลบ) → 404 ทันที (ยังไม่เปิดเผยผลการตรวจสิทธิ์)
 *   3. authorizeOwnedRow(user, "REGISTRY", "read", { organizationId: สังกัดปัจจุบัน
 *      (ถ้ามี), ownerPersonId: person.id }) — ครอบคลุมทั้ง ALL (Super Admin/Central
 *      Officer/Auditor/Teacher/Examiner), OWN_ORG_SUBTREE (Regional Admin/Registrar
 *      Staff — ต้องมีสังกัดปัจจุบันและอยู่ใน scope) และ OWN_RECORD (Student — ต้อง
 *      user.personId ตรงกับ person.id) ในฟังก์ชันเดียว — ไม่ผ่าน → 404 (ไม่ใช่ 403 —
 *      ระเบียนบุคคลเป็นข้อมูล Restricted ตาม data-policy.md จึงไม่เปิดเผยแม้แต่การ
 *      มีอยู่ของ id ให้ผู้ไม่มีสิทธิ์ ต่างจาก /api/organizations/[id])
 * Output: 200 { id, referenceCode, prefix, fullName } | 401 | 404
 * Permission: authorizeOwnedRow() ผ่าน can() เดียวกับทั้งระบบ (src/lib/authz.ts)
 * Validation: id เป็น URL segment เสมอ
 * Error State: 401 (ไม่ได้ login), 404 (ไม่พบ หรือพบแต่ไม่มีสิทธิ์ — แยกไม่ออกโดยตั้งใจ),
 *              500 (database error)
 * Audit: อ่านอย่างเดียว ไม่บันทึก (เหมือน GET /api/organizations/[id])
 * Acceptance Criteria (ทดสอบจริงใน prisma/test-authz-guard.mjs):
 *   AC1: ไม่มี session → 401 เสมอ
 *   AC2: Student (mock.student, personId=seed_person_05) เปิดดูระเบียนของตนเอง → 200
 *   AC3: Student คนเดียวกันเปิดดูระเบียนคนอื่น (เช่น seed_person_01) → 404 (IDOR-safe)
 *   AC4: Super Admin/Teacher (REGISTRY scope=ALL) เปิดดูระเบียนใดก็ได้ → 200
 *   AC5: id ที่ไม่มีอยู่จริงเลย (แม้ Super Admin) → 404 เหมือนกรณี AC3 ทุกประการ (ตอบเหมือนกัน)
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/persons/[id]">) {
  const { id } = await ctx.params;

  const user = await getCurrentUser();
  if (!user) return unauthenticated();

  const { rows } = await query<{
    id: string;
    referenceCode: string | null;
    prefix: string | null;
    fullName: string;
    currentOrganizationId: string | null;
  }>(
    `SELECT p.id, p."referenceCode", p.prefix, p."fullName",
            (
              SELECT a."organizationId"
                FROM appointments a
               WHERE a."personId" = p.id AND a.status = 'ACTIVE'
               ORDER BY a."startDate" DESC
               LIMIT 1
            ) AS "currentOrganizationId"
       FROM persons p
      WHERE p.id = $1 AND p."deletedAt" IS NULL`,
    [id],
  );
  const person = rows[0];
  if (!person) return notFoundOrForbidden();

  const allowed = await authorizeOwnedRow(user, "REGISTRY", "read", {
    organizationId: person.currentOrganizationId ?? undefined,
    ownerPersonId: person.id,
  });
  if (!allowed) return notFoundOrForbidden();

  return NextResponse.json({
    id: person.id,
    referenceCode: person.referenceCode,
    prefix: person.prefix,
    fullName: person.fullName,
  });
}
