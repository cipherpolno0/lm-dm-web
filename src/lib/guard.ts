import "server-only";
import { NextResponse } from "next/server";
import { getCurrentUser, can, type CurrentUser, type PermissionContext } from "@/lib/authz";
import type { Action, Module } from "@/lib/permissions";

/**
 * src/lib/guard.ts — Authorization Guard ฝั่ง server สำหรับ Route Handlers/API
 *
 * งาน: "สร้าง Authorization Guard ฝั่ง Server" (Phase P3 Authentication & RBAC)
 * ต่อยอดจาก src/lib/authz.ts (permission-resolution layer, can()/requirePermission())
 * และ src/lib/permissions.ts (permission matrix) ที่ทำไว้ในงาน RBAC ก่อนหน้า — ไฟล์นี้
 * เพิ่ม **จุดเรียกใช้แบบมาตรฐานเดียว** สำหรับทุก Route Handler/API เพื่อลดความเสี่ยงที่
 * endpoint ใดถูกลืมไม่ใส่การตรวจสอบสิทธิ์ (สาเหตุอันดับต้นๆ ของ IDOR/privilege escalation
 * ในทางปฏิบัติ — OWASP API1:2023 Broken Object Level Authorization) โดยรวม pattern
 * "ตรวจ auth → ตรวจ permission → ตอบ 401/403 มาตรฐาน" ไว้ในฟังก์ชันเดียวแทนการเขียนซ้ำใน
 * ทุกไฟล์ route (ก่อนงานนี้ `src/app/api/organizations/[id]/route.ts` เขียน pattern นี้ตรงๆ
 * เอง — งานนี้สกัดออกมาเป็น utility กลางแล้ว refactor endpoint เดิมให้ใช้ร่วมกัน)
 *
 * มี guard สองรูปแบบ ตามลักษณะของ scope (ดู src/lib/permissions.ts::ScopeType):
 *
 * 1. `guardRoute()` — ใช้เมื่อ "บริบทที่ต้องใช้ตรวจสอบรู้ล่วงหน้าได้จาก request เอง"
 *    (เช่น organizationId จาก URL param) ก่อนต้อง query ข้อมูลจริงของ resource —
 *    ตรวจสิทธิ์ก่อน แล้วค่อย query ข้อมูล ใช้ได้กับ scope ALL/PUBLIC/OWN_ORG_SUBTREE/
 *    OWN_PROGRAM
 *
 * 2. `authorizeOwnedRow()` — ใช้เมื่อ "บริบทที่ต้องใช้ตรวจสอบมาจากตัวแถวข้อมูลเอง"
 *    (เช่น QuestionVersion.authorActorId, Person.id เทียบกับ user.personId) —
 *    ต้อง query ข้อมูลมาก่อนเพื่อรู้ว่าใครเป็นเจ้าของ แล้วจึงตรวจสิทธิ์ ใช้ได้กับ scope
 *    OWN_RECORD/RESPONSIBLE_RECORD — **คู่กับ `notFoundOrForbidden()` เสมอ**: ไม่ตอบ 403
 *    แยกจาก 404 สำหรับ resource ประเภทนี้ (ต่างจาก `guardRoute()`) เพื่อไม่ให้ผู้โจมตี
 *    แยกแยะได้ว่า "id นี้มีอยู่จริงแต่ไม่ใช่ของฉัน" กับ "id นี้ไม่มีอยู่จริง" — ป้องกันการไล่เดา
 *    id (IDOR enumeration) ตาม data-policy.md (ข้อมูลระดับ Restricted)
 */

export interface GuardDenied {
  ok: false;
  response: NextResponse;
}
export interface GuardAllowed {
  ok: true;
  user: CurrentUser;
}

/**
 * Function: guardRoute — ตรวจ auth + permission มาตรฐานสำหรับ Route Handler
 * Actor: internal — เรียกที่ต้นทุก Route Handler ก่อน query/เขียนข้อมูลใดๆ
 * Input: moduleName (Module), action (Action), context (PermissionContext ที่รู้ล่วงหน้า
 *        จาก request เอง เช่น organizationId จาก URL param — ห้ามมาจาก client body ที่ไม่
 *        ผ่านการตรวจสอบ)
 * Process:
 *   1. getCurrentUser() — ไม่มี session → คืน { ok:false, response: 401 }
 *   2. can(user, moduleName, action, context) — ไม่ผ่าน → คืน { ok:false, response: 403 }
 *   3. ผ่านทั้งคู่ → คืน { ok:true, user }
 * Output: GuardAllowed | GuardDenied
 * Permission: n/a (เป็นฟังก์ชันตรวจสอบเอง)
 * Validation: n/a (context ต้องถูกสร้างอย่างปลอดภัยโดยผู้เรียกก่อนแล้ว)
 * Error State: can() throw (database error) → throw ขึ้นไป (fail-closed — ผู้เรียกต้องปล่อย
 *              ให้กลายเป็น 500 ไม่ใช่ตีความเป็นอนุญาต)
 * Audit: ไม่บันทึกเอง (endpoint ที่เป็นเจ้าของ resource บันทึก audit ของการกระทำจริง)
 * Acceptance Criteria:
 *   AC1: ไม่มี session → 401 เสมอ ไม่ว่า module/action/context จะเป็นอะไร
 *   AC2: มี session แต่ can() คืน false → 403 (ไม่ query ข้อมูลจริงต่อ)
 *   AC3: ผ่านทั้งคู่ → คืน user ให้ผู้เรียกใช้ query ข้อมูลต่อได้ทันที
 */
export async function guardRoute(
  moduleName: Module,
  action: Action,
  context: PermissionContext = {},
): Promise<GuardAllowed | GuardDenied> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, response: NextResponse.json({ error: "unauthenticated" }, { status: 401 }) };
  }
  const allowed = await can(user, moduleName, action, context);
  if (!allowed) {
    return { ok: false, response: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { ok: true, user };
}

/**
 * Function: authorizeOwnedRow — ตรวจสิทธิ์ต่อแถวข้อมูลที่ query มาแล้ว (OWN_RECORD/RESPONSIBLE_RECORD)
 * Actor: internal — เรียกหลัง query แถวข้อมูลเป้าหมายมาแล้ว (ต้องรู้ authorId/personId ของแถวนั้นก่อน)
 * Input: user (CurrentUser | null), moduleName, action, ownerContext (ownerUserId/ownerPersonId
 *        ที่ "อ่านมาจากแถวข้อมูลจริงในฐานข้อมูล" เท่านั้น — ไม่รับค่าจาก client โดยตรง)
 * Process: getCurrentUser() ต้องถูกเรียกมาก่อนแล้วโดยผู้เรียก (เพราะต้อง query แถวข้อมูลด้วย
 *          user context อยู่แล้วในหลายกรณี) — ฟังก์ชันนี้แค่ส่งต่อเข้า can() พร้อม ownerContext
 * Output: boolean
 * Permission: n/a
 * Validation: ownerContext ต้องมาจากแถวข้อมูลที่ query จริง (ไม่ใช่ query param ที่ยังไม่ตรวจสอบ)
 * Error State: can() throw → throw ขึ้นไป (fail-closed)
 * Audit: ไม่บันทึกเอง
 * Acceptance Criteria:
 *   AC1: ไม่ผ่าน → ผู้เรียกต้องตอบด้วย notFoundOrForbidden() (404) ไม่ใช่ 403 — ดู
 *        คำอธิบายเหตุผลที่หัวไฟล์ (ป้องกัน IDOR enumeration)
 *   AC2: RESPONSIBLE_RECORD ผ่านได้สองทาง (authorship ตรง หรือ program scope ครอบคลุม) —
 *        ทดสอบจริงทั้งสองทางใน prisma/test-authz-guard.mjs
 */
export async function authorizeOwnedRow(
  user: CurrentUser | null,
  moduleName: Module,
  action: Action,
  ownerContext: Pick<PermissionContext, "ownerUserId" | "ownerPersonId" | "programId" | "organizationId">,
): Promise<boolean> {
  return can(user, moduleName, action, ownerContext);
}

/**
 * IDOR-safe response สำหรับ resource ที่ scope เป็น OWN_RECORD/RESPONSIBLE_RECORD — ตอบ 404
 * เสมอไม่ว่า resource จะไม่มีอยู่จริง หรือมีอยู่จริงแต่ผู้เรียกไม่มีสิทธิ์เห็น (ดูเหตุผลที่หัวไฟล์)
 */
export function notFoundOrForbidden(): NextResponse {
  return NextResponse.json({ error: "not_found" }, { status: 404 });
}

export function unauthenticated(): NextResponse {
  return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
}
