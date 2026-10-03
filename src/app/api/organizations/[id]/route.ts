import { NextResponse, type NextRequest } from "next/server";
import { guardRoute } from "@/lib/guard";
import { query } from "@/lib/db";

/**
 * GET /api/organizations/[id] — endpoint จริงตัวแรกที่พิสูจน์ deny-by-default +
 * server-side organization-scope enforcement แบบ end-to-end (ตาม "วิธีตรวจสอบ"
 * ของงาน RBAC ก่อนหน้า) — ดู spec เต็มใน roles-permissions.md หัวข้อ "Function
 * Specifications" ปรับให้ใช้ `guardRoute()` กลาง (งาน "สร้าง Authorization Guard
 * ฝั่ง Server") แทนการเรียก getCurrentUser()/canAccessOrganization() แยกสองบรรทัด
 * ตรงๆ — พฤติกรรม/สถานะ HTTP เดิมทุกประการ (ทดสอบ regression แล้วใน
 * prisma/test-rbac-scope.mjs)
 *
 * Function: ดูรายละเอียดองค์กรตาม id
 * Actor: ผู้ใช้ที่ login แล้วทุกบทบาท (ขอบเขตข้อมูลต่างกันตาม scope)
 * Input: URL param id (string)
 * Process:
 *   1. guardRoute("REGISTRY", "read", { organizationId: id }) — ไม่มี session → 401;
 *      ไม่ผ่าน scope (role ที่มี REGISTRY scope=ALL ผ่านทันที บทบาทอื่นต้องมี
 *      UserOrganizationScope ที่ครอบคลุม id นี้จริง รวมถึงกรณี id เป็นลูกหลานของ
 *      องค์กรที่ตนมี scope) → 403 (ไม่ใช่ 404 — องค์กรเป็นข้อมูลอ้างอิงกึ่งสาธารณะที่
 *      หลายบทบาทอ่านได้อยู่แล้วตาม matrix ไม่ใช่ resource ส่วนบุคคลแบบ Restricted
 *      จึงไม่จำเป็นต้องซ่อนการมีอยู่ของ id ต่างจาก endpoint OWN_RECORD/
 *      RESPONSIBLE_RECORD อื่นที่ใช้ notFoundOrForbidden() แทน — ดู src/lib/guard.ts)
 *   2. ผ่านแล้วจึง query ข้อมูลองค์กรจริง — ไม่พบ (ถูกลบ/ไม่มีอยู่) → 404
 * Output: 200 { id, code, type, name, nameEn, status, parentId } | 401 | 403 | 404
 * Permission: guardRoute("REGISTRY", "read", ...) — ตรวจ scope จริงฝั่ง server เสมอ
 *             ไม่เชื่อค่าใดๆ จาก request
 * Validation: id ต้องเป็น string ที่ไม่ว่าง (มาจาก URL segment เสมอ)
 * Error State: 401 (ไม่ได้ login), 403 (login แล้วแต่ไม่มีสิทธิ์เห็นองค์กรนี้),
 *              404 (ไม่พบองค์กรที่มี id นี้ หรือถูก soft-delete แล้ว), 500 (database error)
 * Audit: อ่านอย่างเดียว (read-only) — ไม่บันทึก audit log ตามแนวทางเดียวกับ
 *        GET /api/health (read-only ไม่มี PII เพิ่มเติมนอกจากที่ RBAC คุมอยู่แล้ว)
 * Acceptance Criteria:
 *   AC1: ไม่มี session → 401 เสมอ ไม่ว่า id จะเป็นองค์กรอะไร
 *   AC2: Regional Admin ที่มี scope เฉพาะจังหวัด A เข้าถึงจังหวัด B (คนละสาย) → 403
 *   AC3: Regional Admin คนเดียวกันเข้าถึงอำเภอ/ตำบล/วัดที่อยู่ใต้จังหวัด A ของตน → 200
 *   AC4: Super Admin/Central Officer/Auditor (REGISTRY scope=ALL) เข้าถึงองค์กรใดก็ได้ → 200
 */
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/organizations/[id]">) {
  const { id } = await ctx.params;

  const guard = await guardRoute("REGISTRY", "read", { organizationId: id });
  if (!guard.ok) return guard.response;

  const { rows } = await query<{
    id: string;
    code: string | null;
    type: string;
    name: string;
    nameEn: string | null;
    status: string;
    parentId: string | null;
  }>(
    `SELECT id, code, type, name, "nameEn", status, "parentId"
       FROM organizations
      WHERE id = $1 AND "deletedAt" IS NULL`,
    [id],
  );
  const org = rows[0];
  if (!org) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json(org);
}
