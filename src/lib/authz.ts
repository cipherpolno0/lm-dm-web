import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { auth } from "@/auth";
import { query } from "@/lib/db";
import type { UserRole } from "@/lib/domain-types";
import { getPermission, type Action, type Module } from "@/lib/permissions";
import { isOrganizationInScope, isProgramInScope } from "@/lib/scope";

/**
 * Permission-resolution layer — ตาม adr/0003-authjs-server-side-authorization.md
 *
 * "Authorization ต้องตรวจฝั่ง server และใช้ deny-by-default" (dev-rules.md ข้อ 4):
 * ทุก Server Action / Route Handler / protected Server Component ที่เข้าถึงข้อมูล
 * ต้องเรียก getCurrentUser()/requireUser()/requireRole()/can()/requirePermission()
 * จากไฟล์นี้ — ไม่เชื่อ role/scope ที่ client ส่งมาผ่าน request body/query โดยเด็ดขาด
 *
 * ทำไมไม่เชื่อ JWT.role เฉยๆ: JWT strategy (ไม่มี database session) ทำให้ role ใน
 * token อาจ "ค้าง" ได้จนกว่า token จะหมดอายุ/ refresh หากมีคนถอดสิทธิ์/ระงับบัญชี
 * ระหว่างที่ session ยังไม่หมดอายุ getCurrentUser() จึงตรวจสถานะบัญชีปัจจุบันจาก
 * ฐานข้อมูลจริงทุกครั้งที่ถูกเรียก (ไม่ใช่แค่ optimistic cookie check แบบใน
 * proxy.ts) — นี่คือจุดตรวจสอบที่เชื่อถือได้จริง ("Secure" check ตาม Next.js
 * authentication guide, ต่างจาก "Optimistic" check ใน proxy.ts)
 *
 * งาน "ติดตั้ง Auth.js และ Session" (เสร็จก่อนหน้านี้) ให้เฉพาะ requireUser()/
 * requireRole() (role-level เท่านั้น) — งาน "ออกแบบ RBAC + Scope-based
 * Permission" (P3, ปัจจุบัน) เพิ่ม can()/requirePermission()/
 * canAccessOrganization()/requireOrganizationScope() ที่ตรวจ "scope" จริงตาม
 * permission matrix ใน src/lib/permissions.ts — รายละเอียดเต็มอยู่ใน
 * roles-permissions.md
 */

export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: "PENDING_VERIFICATION" | "PENDING_APPROVAL" | "ACTIVE" | "SUSPENDED" | "REJECTED";
  /** เชื่อมกับ Person (M1 registry) ถ้ามี — ใช้เป็นฐานของ scope OWN_RECORD (ดู roles-permissions.md) */
  personId: string | null;
}

/**
 * Function: อ่าน session ปัจจุบันแล้วตรวจสถานะบัญชีสดจากฐานข้อมูล (secure check)
 * Actor: internal — เรียกจาก Server Action/Route Handler/Server Component อื่น
 * Input: none (อ่าน cookie ผ่าน auth() ของ Auth.js)
 * Process:
 *   1. auth() ถอดรหัส JWT จาก cookie — ถ้าไม่มี session คืน null ทันที
 *   2. query ฐานข้อมูลด้วย id จาก token เพื่อดึงสถานะบัญชี "ปัจจุบัน" (ไม่ใช้ค่า
 *      cache จาก JWT) — ถ้าบัญชีถูกลบ (soft delete) หรือ status ไม่ใช่ ACTIVE
 *      ถือว่า session นี้ใช้งานไม่ได้อีกต่อไป แม้ JWT จะยังไม่หมดอายุ
 * Output: CurrentUser หรือ null
 * Permission: n/a (เป็นฟังก์ชันตรวจสอบเอง)
 * Validation: n/a
 * Error State: database error → throw ขึ้นไป (fail-closed — ผู้เรียกต้องปฏิบัติ
 *              เสมือนไม่มีสิทธิ์เมื่อตรวจสอบไม่ได้ ไม่ใช่ปล่อยผ่าน)
 * Audit: การเข้าถึงแต่ละ resource บันทึกโดยผู้เรียก (Server Action ของ resource
 *        นั้น) ไม่ใช่หน้าที่ของเลเยอร์นี้
 * Acceptance Criteria:
 *   AC1: session ของบัญชีที่ถูกเปลี่ยนสถานะเป็น SUSPENDED ระหว่างที่ JWT ยังไม่
 *        หมดอายุ ถูกปฏิเสธในการเรียกครั้งถัดไป (ทดสอบจริงใน prisma/AUTH.md)
 *   AC2: React `cache()` ทำให้เรียกซ้ำได้หลายจุดใน request เดียวกันโดย query
 *        ฐานข้อมูลครั้งเดียว
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return null;

  const { rows } = await query<{
    id: string;
    email: string;
    name: string;
    role: UserRole;
    status: CurrentUser["status"];
    deletedAt: Date | null;
    personId: string | null;
  }>(
    `SELECT id, email, name, role, status, "deletedAt", "personId"
       FROM users
      WHERE id = $1`,
    [userId],
  );
  const row = rows[0];
  if (!row || row.deletedAt || row.status !== "ACTIVE") return null;

  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    personId: row.personId,
  };
});

/** Deny-by-default: ไม่มี session ที่ใช้งานได้ → redirect ไปหน้า login ทันที */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** Deny-by-default: role ไม่อยู่ใน allowlist → redirect (ไม่เปิดเผยเหตุผลละเอียด) */
export async function requireRole(allowed: UserRole[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!allowed.includes(user.role)) {
    redirect("/dashboard?error=forbidden");
  }
  return user;
}

/**
 * บริบทเพิ่มเติมที่ scope บางประเภทต้องใช้ตรวจสอบ — ผู้เรียก can()/
 * requirePermission() ต้องส่งค่าที่ "ดึงจากฐานข้อมูลจริงของ resource เป้าหมาย"
 * เท่านั้น (เช่น QuestionVersion.authorId ที่ query มาแล้ว) ห้ามส่งค่าที่รับมาจาก
 * client ตรงๆ โดยไม่ผ่านการตรวจสอบ — มิฉะนั้น scope check นี้จะไร้ความหมาย
 */
export interface PermissionContext {
  /** องค์กรเป้าหมาย — ใช้กับ scope OWN_ORG_SUBTREE */
  organizationId?: string;
  /** สายการศึกษาเป้าหมาย — ใช้กับ scope OWN_PROGRAM และเป็นทางเลือกสำรองของ RESPONSIBLE_RECORD */
  programId?: string;
  /** เจ้าของ resource (เช่น authorId/approverId) — ใช้กับ OWN_RECORD/RESPONSIBLE_RECORD */
  ownerUserId?: string;
  /** เจ้าของ resource ผ่าน Person (เช่น ทะเบียนของนักเรียนที่ผูกกับ User.personId) — ใช้กับ OWN_RECORD */
  ownerPersonId?: string;
}

/**
 * Function: can — ตรวจสิทธิ์ตาม permission matrix (role → module/action/scope)
 * Actor: internal — เรียกจากทุก Server Action/Route Handler ที่ต้องตรวจสิทธิ์
 * Input: user (CurrentUser | null — null แทน Guest), module, action, context ทางเลือก
 * Process:
 *   1. หา entry จาก PERMISSION_MATRIX (หรือ GUEST_PERMISSIONS ถ้า user เป็น null)
 *   2. ไม่มี entry หรือ action ไม่อยู่ใน entry.actions → deny ทันที (deny-by-default)
 *   3. ตาม scope ของ entry: ALL/PUBLIC ผ่านทันที, ส่วน scope อื่นต้องมีทั้ง user
 *      และ context ที่เกี่ยวข้องครบ มิฉะนั้น deny (ไม่เดา/ไม่ผ่านโดย default)
 * Output: boolean
 * Permission: n/a (เป็นฟังก์ชันตรวจสอบเอง ไม่ใช่ resource)
 * Validation: context ที่ขาดฟิลด์ที่ scope นั้นต้องใช้ = deny (fail-closed)
 * Error State: query ฐานข้อมูลล้มเหลว (isOrganizationInScope/isProgramInScope) → throw ขึ้นไป
 * Audit: ไม่บันทึกเอง (ผู้เรียกที่เป็นเจ้าของ resource เป็นผู้บันทึก audit ของการกระทำจริง)
 * Acceptance Criteria:
 *   AC1: role/module ที่ไม่มี entry เลย (เช่น STUDENT ต่อ QUESTION_BANK) → deny เสมอ
 *   AC2: scope ASSIGNED_SESSION deny เสมอในเฟสนี้ (ยังไม่มีตารางมอบหมายรอบสอบ)
 *   AC3: scope OWN_ORG_SUBTREE คืนค่าตาม isOrganizationInScope() จริง ไม่ใช่ mock
 */
export async function can(
  user: CurrentUser | null,
  moduleName: Module,
  action: Action,
  context: PermissionContext = {},
): Promise<boolean> {
  const role: UserRole | "GUEST" = user?.role ?? "GUEST";
  const entry = getPermission(role, moduleName);
  if (!entry || !entry.actions.includes(action)) return false;

  switch (entry.scope) {
    case "ALL":
    case "PUBLIC":
      return true;
    case "OWN_ORG_SUBTREE":
      if (!user || !context.organizationId) return false;
      return isOrganizationInScope(user.id, context.organizationId);
    case "OWN_PROGRAM":
      if (!user || !context.programId) return false;
      return isProgramInScope(user.id, context.programId);
    case "OWN_RECORD":
      if (!user) return false;
      if (context.ownerUserId) return context.ownerUserId === user.id;
      if (context.ownerPersonId) return !!user.personId && context.ownerPersonId === user.personId;
      return false;
    case "RESPONSIBLE_RECORD":
      if (!user) return false;
      if (context.ownerUserId && context.ownerUserId === user.id) return true;
      if (context.programId && (await isProgramInScope(user.id, context.programId))) return true;
      return false;
    case "ASSIGNED_SESSION":
      // ยังไม่มีตาราง exam-session-assignment ในสคีมาปัจจุบัน (M4 ยังไม่ถูกออกแบบ) —
      // deny เสมอ (fail-safe) แทนการอนุมัติโดยไม่มีข้อมูลจริงมาตรวจสอบ ดู
      // roles-permissions.md หัวข้อ "ขอบเขตที่ตัดออก"
      return false;
    case "NONE":
    default:
      return false;
  }
}

/** Deny-by-default: ไม่ผ่าน can() → redirect (ไม่เปิดเผยเหตุผลละเอียด) */
export async function requirePermission(
  moduleName: Module,
  action: Action,
  context: PermissionContext = {},
): Promise<CurrentUser> {
  const user = await requireUser();
  const allowed = await can(user, moduleName, action, context);
  if (!allowed) redirect("/dashboard?error=forbidden");
  return user;
}

/**
 * ทางลัดสำหรับตรวจสอบ "มองเห็นองค์กรนี้ได้ไหม" (module REGISTRY, action "read")
 * — เทียบเท่า `can(user, "REGISTRY", "read", { organizationId })` ทุกประการ เก็บไว้
 * เป็นชื่อเฉพาะเพราะอ่านง่ายกว่าที่จุดเรียกใช้ (เช่น GET /api/organizations/[id] เดิม
 * ก่อน refactor ไปใช้ guardRoute() โดยตรงในงาน "สร้าง Authorization Guard ฝั่ง Server")
 */
export async function canAccessOrganization(user: CurrentUser | null, organizationId: string): Promise<boolean> {
  return can(user, "REGISTRY", "read", { organizationId });
}

/** Deny-by-default: ไม่ผ่าน canAccessOrganization() → redirect */
export async function requireOrganizationScope(organizationId: string): Promise<CurrentUser> {
  const user = await requireUser();
  const allowed = await canAccessOrganization(user, organizationId);
  if (!allowed) redirect("/dashboard?error=forbidden");
  return user;
}
