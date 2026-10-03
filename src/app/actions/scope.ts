"use server";

import { requirePermission } from "@/lib/authz";
import {
  grantOrganizationScope,
  revokeOrganizationScope,
  grantProgramScope,
  revokeProgramScope,
} from "@/lib/scope";

/**
 * src/app/actions/scope.ts — Server Actions สำหรับจัดการ scope (M9 RBAC config)
 *
 * ตาม permission matrix (roles-permissions.md / src/lib/permissions.ts) มีเพียง
 * Super Admin เท่านั้นที่มี entry สำหรับโมดูล RBAC_CONFIG (CRUD) — บทบาทอื่นทั้งหมด
 * ไม่มี entry เลย จึงถูก deny-by-default โดย requirePermission() โดยอัตโนมัติ ไม่ต้อง
 * เขียนเงื่อนไข role ซ้ำในไฟล์นี้
 */

export interface ScopeActionState {
  error: string | null;
  success?: boolean;
}

/**
 * Function: ให้สิทธิ์ organization scope แก่ผู้ใช้
 * Actor: Super Admin เท่านั้น (M9 = "CRUD" เฉพาะ Super Admin ตาม permission matrix)
 * Input: targetUserId (string), organizationId (string)
 * Process:
 *   1. requirePermission("RBAC_CONFIG", "create") — deny-by-default ถ้าไม่ใช่ Super Admin
 *   2. grantOrganizationScope() — INSERT แถวใหม่ + AuditLog ใน transaction เดียว
 * Output: { error: null, success: true } หรือ { error: <ข้อความ> }
 * Permission: Super Admin เท่านั้น
 * Validation: targetUserId/organizationId ต้องไม่ว่าง; ต้องมีอยู่จริงในฐานข้อมูล
 *             (บังคับโดย FK constraint — error จาก DB ถูกจับและแปลเป็นข้อความทั่วไป)
 * Error State: ไม่มีสิทธิ์ → requirePermission redirect (ไม่ throw); targetUserId/
 *              organizationId ไม่มีจริง → FK violation → error ทั่วไป; grant ซ้ำ
 *              ขณะที่ยัง active อยู่ → unique violation → error "มี scope นี้อยู่แล้ว"
 * Audit: บันทึกใน audit_logs (entityType=UserOrganizationScope, action=CREATE,
 *        actorId=ผู้ให้สิทธิ์) ภายใน grantOrganizationScope()
 * Acceptance Criteria:
 *   AC1: Super Admin grant สำเร็จ → มีแถวใหม่ใน user_organization_scopes ที่ revokedAt IS NULL
 *   AC2: บทบาทอื่นที่ไม่ใช่ Super Admin เรียกฟังก์ชันนี้ → ถูก redirect ทันที ไม่มีการ INSERT ใดๆ
 *   AC3: grant องค์กร/ผู้ใช้คู่เดิมซ้ำขณะยัง active → ปฏิเสธด้วยข้อความที่ไม่รั่ว SQL error ดิบ
 */
export async function grantOrganizationScopeAction(
  targetUserId: string,
  organizationId: string,
): Promise<ScopeActionState> {
  const actor = await requirePermission("RBAC_CONFIG", "create");
  try {
    await grantOrganizationScope({ userId: targetUserId, organizationId, grantedById: actor.id });
    return { error: null, success: true };
  } catch {
    return { error: "ไม่สามารถให้สิทธิ์นี้ได้ — อาจมี scope นี้อยู่แล้ว หรือข้อมูลไม่ถูกต้อง" };
  }
}

/**
 * Function: ถอนสิทธิ์ organization scope
 * Actor: Super Admin เท่านั้น
 * Input: scopeId (string)
 * Process: requirePermission("RBAC_CONFIG", "update") → revokeOrganizationScope()
 *          (UPDATE ตั้ง revokedAt เท่านั้น ไม่ลบแถว)
 * Output: { error: null, success: true } หรือ { error }
 * Permission: Super Admin เท่านั้น
 * Validation: scopeId ต้องมีอยู่จริงและยังไม่เคยถูกถอน
 * Error State: ไม่มีสิทธิ์ → redirect; scopeId ไม่พบ/ถูกถอนไปแล้ว → error ทั่วไป
 * Audit: บันทึกใน audit_logs (action=UPDATE, before/after ระบุ revokedAt)
 * Acceptance Criteria:
 *   AC1: ถอนสำเร็จ → แถวเดิมยังอยู่ (ไม่ถูกลบ) แต่ revokedAt ไม่เป็น null อีกต่อไป
 *   AC2: ถอนซ้ำ (scope ที่ revoke ไปแล้ว) → ปฏิเสธ ไม่ throw ข้อความ SQL ดิบออกไป
 */
export async function revokeOrganizationScopeAction(scopeId: string): Promise<ScopeActionState> {
  const actor = await requirePermission("RBAC_CONFIG", "update");
  try {
    await revokeOrganizationScope({ scopeId, revokedById: actor.id });
    return { error: null, success: true };
  } catch {
    return { error: "ไม่สามารถถอนสิทธิ์นี้ได้ — อาจไม่พบ scope นี้ หรือถูกถอนไปแล้ว" };
  }
}

/** เหมือน grantOrganizationScopeAction แต่สำหรับ program scope — spec เดียวกัน ต่างแค่มิติ (program แทน organization) */
export async function grantProgramScopeAction(
  targetUserId: string,
  programId: string,
): Promise<ScopeActionState> {
  const actor = await requirePermission("RBAC_CONFIG", "create");
  try {
    await grantProgramScope({ userId: targetUserId, programId, grantedById: actor.id });
    return { error: null, success: true };
  } catch {
    return { error: "ไม่สามารถให้สิทธิ์นี้ได้ — อาจมี scope นี้อยู่แล้ว หรือข้อมูลไม่ถูกต้อง" };
  }
}

/** เหมือน revokeOrganizationScopeAction แต่สำหรับ program scope */
export async function revokeProgramScopeAction(scopeId: string): Promise<ScopeActionState> {
  const actor = await requirePermission("RBAC_CONFIG", "update");
  try {
    await revokeProgramScope({ scopeId, revokedById: actor.id });
    return { error: null, success: true };
  } catch {
    return { error: "ไม่สามารถถอนสิทธิ์นี้ได้ — อาจไม่พบ scope นี้ หรือถูกถอนไปแล้ว" };
  }
}
