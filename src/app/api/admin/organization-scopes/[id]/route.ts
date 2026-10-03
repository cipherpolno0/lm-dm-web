import { NextResponse, type NextRequest } from "next/server";
import { guardRoute } from "@/lib/guard";
import { revokeOrganizationScope } from "@/lib/scope";

/**
 * DELETE /api/admin/organization-scopes/[id] — ถอนสิทธิ์ organization scope (คู่กับ
 * POST /api/admin/organization-scopes) แม้ใช้ HTTP method DELETE ตามธรรมเนียม REST
 * ("ถอนสิทธิ์" = ยกเลิกการเข้าถึง) แต่เบื้องหลังเป็น UPDATE เท่านั้น (ตั้ง revokedAt) ไม่มี
 * การ DELETE แถวจริงเกิดขึ้น (บังคับด้วย DB trigger — ดู migration.sql) ตาม data-policy.md
 * ข้อ 7 (ห้าม overwrite/ลบประวัติ)
 *
 * Function: ถอนสิทธิ์ organization scope
 * Actor: Super Admin เท่านั้น
 * Input: URL param id (UserOrganizationScope.id)
 * Process:
 *   1. guardRoute("RBAC_CONFIG", "update") — ไม่มี session → 401; ไม่ใช่ Super Admin → 403
 *      (ก่อนแตะฐานข้อมูลใดๆ — ป้องกัน privilege escalation เช่นเดียวกับ POST)
 *   2. revokeOrganizationScope() — SELECT...FOR UPDATE ตรวจว่ายัง active → UPDATE
 *      ตั้ง revokedAt + AuditLog ใน transaction เดียว
 * Output: 204 (สำเร็จ) | 401 | 403 | 409 (ไม่พบ/ถูกถอนไปแล้ว)
 * Permission: guardRoute("RBAC_CONFIG", "update") — Super Admin เท่านั้น
 * Validation: id ต้องมีอยู่จริงและยังไม่เคยถูกถอน (ตรวจใน revokeOrganizationScope())
 * Error State: 401/403 ตาม guard; 409 ไม่พบ/revoke ซ้ำ — ไม่รั่ว SQL ดิบ
 * Audit: audit_logs (entityType=UserOrganizationScope, action=UPDATE) ภายใน revokeOrganizationScope()
 * Acceptance Criteria (ทดสอบจริงใน prisma/test-authz-guard.mjs):
 *   AC1: ไม่มี session → 401
 *   AC2: บทบาทอื่นที่ไม่ใช่ Super Admin → 403 และแถวเดิมยังคง active อยู่ (ไม่ถูกแตะต้อง)
 *   AC3: Super Admin ถอนสำเร็จ → 204 และแถวเดิมมี revokedAt ไม่เป็น null แล้วจริง (ไม่ถูกลบ)
 */
export async function DELETE(_req: NextRequest, ctx: RouteContext<"/api/admin/organization-scopes/[id]">) {
  const guard = await guardRoute("RBAC_CONFIG", "update");
  if (!guard.ok) return guard.response;

  const { id } = await ctx.params;
  try {
    await revokeOrganizationScope({ scopeId: id, revokedById: guard.user.id });
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "revoke_failed" }, { status: 409 });
  }
}
