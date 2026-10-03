import { NextResponse, type NextRequest } from "next/server";
import { guardRoute } from "@/lib/guard";
import { grantOrganizationScope } from "@/lib/scope";

/**
 * POST /api/admin/organization-scopes — endpoint HTTP จริงตัวแรกสำหรับพิสูจน์
 * "privilege escalation" แบบ end-to-end (ตาม "วิธีตรวจสอบ" ของงาน "สร้าง
 * Authorization Guard ฝั่ง Server") — งาน RBAC ก่อนหน้าให้ไว้เฉพาะ Server Action
 * (`grantOrganizationScopeAction` ใน src/app/actions/scope.ts) ซึ่งทดสอบผ่าน HTTP
 * ตรงๆ ไม่ได้ง่าย (ต้องเลียนแบบ encoding เฉพาะของ Server Action) endpoint นี้ห่อ
 * ฟังก์ชันเดียวกัน (`grantOrganizationScope` จาก src/lib/scope.ts) ไว้เบื้องหลัง
 * Route Handler ธรรมดา เพื่อให้ทดสอบ "ผู้ใช้ที่ไม่ใช่ Super Admin พยายามให้สิทธิ์ตัวเอง"
 * ได้จริงด้วย HTTP request ตรงๆ
 *
 * Function: ให้สิทธิ์ organization scope แก่ผู้ใช้ (M9 RBAC config)
 * Actor: Super Admin เท่านั้น (RBAC_CONFIG module มี entry เฉพาะ SUPER_ADMIN ใน
 *        permission matrix — บทบาทอื่นทั้งหมดถูก deny-by-default โดย guardRoute()
 *        โดยอัตโนมัติ ไม่ต้องเขียนเงื่อนไข role ซ้ำในไฟล์นี้)
 * Input: JSON body { targetUserId: string, organizationId: string }
 * Process:
 *   1. guardRoute("RBAC_CONFIG", "create") — ไม่มี session → 401; ไม่ใช่ Super Admin
 *      (ไม่มี entry ใน matrix เลย) → 403 ทันที **ก่อน**อ่าน/ประมวลผล body ใดๆ (ป้องกัน
 *      privilege escalation: ผู้ใช้ที่ไม่มีสิทธิ์ต้องถูกปฏิเสธไม่ว่า body จะพยายามส่งอะไรมา)
 *   2. parse + ตรวจรูปแบบ body ขั้นต่ำ (ต้องมี targetUserId/organizationId เป็น string ไม่ว่าง)
 *   3. grantOrganizationScope() — INSERT + AuditLog ใน transaction เดียว (src/lib/scope.ts)
 * Output: 201 { id } | 400 (body ผิดรูปแบบ) | 401 | 403 | 409 (grant ซ้ำขณะ active/targetUserId ไม่มีจริง)
 * Permission: guardRoute("RBAC_CONFIG", "create") — Super Admin เท่านั้น
 * Validation: targetUserId/organizationId ต้องเป็น string ไม่ว่าง; ต้องมีอยู่จริง (FK
 *             constraint คอยดักอีกชั้นถ้าไม่มี — แปลงเป็น 409 ไม่ใช่ 500)
 * Error State: 401/403 ตาม guard; 400 body ผิดรูปแบบ (ไม่ใช่ JSON หรือขาดฟิลด์); 409
 *              FK/unique violation (targetUserId ไม่มีจริง หรือ grant ซ้ำขณะ active) — ไม่รั่ว SQL ดิบ
 * Audit: audit_logs (entityType=UserOrganizationScope, action=CREATE) ภายใน grantOrganizationScope()
 * Acceptance Criteria (ทดสอบจริงใน prisma/test-authz-guard.mjs):
 *   AC1: ไม่มี session → 401
 *   AC2: Registrar Staff (ไม่ใช่ Super Admin) พยายามให้สิทธิ์ตัวเองที่จังหวัดอื่น → 403
 *        และไม่มีแถวใหม่ถูกสร้างขึ้นจริงในฐานข้อมูล (พิสูจน์ deny เกิดก่อนแตะ DB)
 *   AC3: Super Admin เรียกสำเร็จ → 201 พร้อม id ของแถวใหม่ที่ revokedAt เป็น null จริง
 */
export async function POST(req: NextRequest) {
  const guard = await guardRoute("RBAC_CONFIG", "create");
  if (!guard.ok) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }
  const { targetUserId, organizationId } = (body ?? {}) as Record<string, unknown>;
  if (typeof targetUserId !== "string" || !targetUserId || typeof organizationId !== "string" || !organizationId) {
    return NextResponse.json({ error: "invalid_body" }, { status: 400 });
  }

  try {
    const { id } = await grantOrganizationScope({ userId: targetUserId, organizationId, grantedById: guard.user.id });
    return NextResponse.json({ id }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "grant_failed" }, { status: 409 });
  }
}
