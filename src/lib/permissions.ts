import type { UserRole } from "@/lib/domain-types";

/**
 * src/lib/permissions.ts — static permission matrix (role × module → action + scope)
 *
 * นี่คือ "permission matrix ฉบับเต็ม" ที่ requirements.md §6 (โครงร่างสิทธิ์การ
 * เข้าถึง — ระดับร่าง) ระบุไว้ว่าจะทำให้เสร็จ "ใน P2 (Auth & RBAC Foundation)" — ไฟล์
 * นี้คือผลลัพธ์นั้น เขียนเป็น code (ไม่ใช่ config ภายนอก/ policy engine — ตาม
 * ADR-0003 ที่ปฏิเสธ OPA/Casbin ว่าเกินความจำเป็นในสเกลปัจจุบัน) เพื่อให้ TypeScript
 * ตรวจสอบความครบถ้วนได้ตอน compile (`satisfies` ด้านล่างบังคับว่าทุก role ที่มีต้อง
 * ระบุครบทุก module — ลืมโมดูลใดโมดูลหนึ่งจะเป็น type error ทันที)
 *
 * ที่มาของทุกแถว: แปลตรงจาก requirements.md §6 ทีละเซลล์ (ดูตารางต้นฉบับใน
 * roles-permissions.md หัวข้อ "ที่มา") — cell ที่เป็น "-" ในเอกสารต้นฉบับ = ไม่มี
 * entry ในโมดูลนั้นเลย (deny-by-default บังคับโดย getPermission() คืน null)
 *
 * บทบาทที่ใช้จริงในระบบคือ UserRole enum (SUPER_ADMIN..AUDITOR, 8 ค่า) ซึ่งเป็นชื่อ
 * เฉพาะทางโดเมนของ actor 8 รายจาก requirements.md §3 — ดูการเทียบกับชื่อ role แบบ
 * ทั่วไปที่โจทย์งานนี้ระบุ (Guest/Member/Teacher/Data Editor/Reviewer/Admin/Super
 * Admin) ในหัวข้อ "การเทียบชื่อบทบาท (Role Mapping)" ของ roles-permissions.md —
 * "Guest" ไม่อยู่ใน record นี้เพราะไม่ใช่ User row (ดู GUEST_PERMISSIONS ด้านล่าง)
 */

export type Action = "create" | "read" | "update" | "delete" | "execute" | "approve" | "manage";

/** M1–M9 ตาม requirements.md §4 */
export type Module =
  | "REGISTRY" // M1 ทะเบียนคณะสงฆ์
  | "CURRICULUM" // M2 หลักสูตรและระดับการศึกษา
  | "QUESTION_BANK" // M3 คลังข้อสอบ
  | "TESTING" // M4 ระบบแบบทดสอบ/จัดสอบ
  | "MEMBERSHIP" // M5 ระบบสมาชิก
  | "ADMIN" // M6 ผู้ดูแลระบบ
  | "IMPORT" // M7 นำเข้าข้อมูล Excel
  | "FILES" // M8 จัดเก็บไฟล์ PDF/Object Storage
  | "RBAC_CONFIG"; // M9 สิทธิ์การเข้าถึงหลายระดับ

export const MODULES: Module[] = [
  "REGISTRY",
  "CURRICULUM",
  "QUESTION_BANK",
  "TESTING",
  "MEMBERSHIP",
  "ADMIN",
  "IMPORT",
  "FILES",
  "RBAC_CONFIG",
];

/**
 * ประเภทขอบเขต (scope) ที่ permission หนึ่งรายการอาจถูกจำกัดด้วย — การตรวจสอบจริง
 * ของแต่ละประเภททำใน src/lib/scope.ts
 *
 * - ALL: ไม่จำกัดขอบเขต (ทั้งระบบ)
 * - PUBLIC: ไม่ต้อง login — ใช้กับ Guest เท่านั้น
 * - OWN_ORG_SUBTREE: เฉพาะองค์กรที่มี UserOrganizationScope ครอบคลุม + ลูกหลานใต้
 *   สังกัด (ใช้ทั้ง "เฉพาะเขต" ของ Regional Admin และ "เฉพาะสังกัด" ของ Registrar
 *   Staff — กลไกเดียวกัน ต่างกันแค่ระดับองค์กรที่ผูก scope ไว้)
 * - OWN_PROGRAM: เฉพาะสายการศึกษาที่มี UserProgramScope ครอบคลุม
 * - OWN_RECORD: เฉพาะระเบียนของตนเอง (จับคู่ผ่าน User.personId หรือ userId ตรงๆ)
 * - RESPONSIBLE_RECORD: เฉพาะทรัพยากรที่ตนเป็นผู้แต่ง/รับผิดชอบ (authorId/
 *   approverId) หรืออยู่ใน OWN_PROGRAM ของตน
 * - ASSIGNED_SESSION: เฉพาะรอบสอบที่ได้รับมอบหมาย — ยังไม่มีตารางรองรับจริงใน
 *   สคีมาปัจจุบัน (M4 Testing Engine/การมอบหมายกรรมการคุมสอบยังไม่ถูกออกแบบ) จึง
 *   deny เสมอในเฟสนี้ (fail-safe, ดู "ขอบเขตที่ตัดออก" ใน roles-permissions.md)
 * - NONE: ไม่มีสิทธิ์ (เทียบเท่ากับไม่มี entry เลย — เก็บไว้เผื่อกรณีต้องการระบุ
 *   explicit deny แยกจาก "ไม่ได้ระบุ")
 */
export type ScopeType =
  | "ALL"
  | "PUBLIC"
  | "OWN_ORG_SUBTREE"
  | "OWN_PROGRAM"
  | "OWN_RECORD"
  | "RESPONSIBLE_RECORD"
  | "ASSIGNED_SESSION"
  | "NONE";

export interface PermissionEntry {
  actions: Action[];
  scope: ScopeType;
}

type ModulePermissions = Partial<Record<Module, PermissionEntry>>;

const ALL: PermissionEntry["scope"] = "ALL";

/** Super Admin — ทุกโมดูล ทุกเขต (requirements.md §6 แถว "Super Admin") */
const SUPER_ADMIN: ModulePermissions = {
  REGISTRY: { actions: ["create", "read", "update", "delete"], scope: ALL },
  CURRICULUM: { actions: ["create", "read", "update", "delete"], scope: ALL },
  QUESTION_BANK: { actions: ["create", "read", "update", "delete", "approve"], scope: ALL },
  TESTING: { actions: ["create", "read", "update", "delete"], scope: ALL },
  MEMBERSHIP: { actions: ["create", "read", "update", "delete"], scope: ALL },
  ADMIN: { actions: ["create", "read", "update", "delete"], scope: ALL },
  IMPORT: { actions: ["execute"], scope: ALL },
  FILES: { actions: ["create", "read", "update", "delete"], scope: ALL },
  RBAC_CONFIG: { actions: ["create", "read", "update", "delete"], scope: ALL },
};

/** Central Officer — "CRUD ทุกเขต" แต่ไม่มีสิทธิ์ตั้งค่า RBAC (M9 = "-") */
const CENTRAL_OFFICER: ModulePermissions = {
  REGISTRY: { actions: ["create", "read", "update", "delete"], scope: ALL },
  CURRICULUM: { actions: ["create", "read", "update", "delete"], scope: ALL },
  QUESTION_BANK: { actions: ["create", "read", "update", "delete", "approve"], scope: ALL },
  TESTING: { actions: ["read", "manage"], scope: ALL },
  MEMBERSHIP: { actions: ["read"], scope: ALL },
  // "R/บาง config" — ตีความอย่างเคร่งครัดเป็น read-only ในเลเยอร์ RBAC นี้
  // (deny-by-default): ส่วน config ย่อยที่ Central Officer ควรแก้ได้ต้องระบุแยก
  // เป็น permission ใหม่ในอนาคตเมื่อ M6 Admin Console มี sub-resource จริง —
  // ดู roles-permissions.md หัวข้อ "จุดที่ต้องยืนยันกับ Owner"
  ADMIN: { actions: ["read"], scope: ALL },
  IMPORT: { actions: ["execute"], scope: ALL },
  FILES: { actions: ["create", "read", "update", "delete"], scope: ALL },
};

/** Regional Admin — "เฉพาะเขต" ทุกแห่ง = OWN_ORG_SUBTREE */
const REGIONAL_ADMIN: ModulePermissions = {
  REGISTRY: { actions: ["create", "read", "update", "delete"], scope: "OWN_ORG_SUBTREE" },
  CURRICULUM: { actions: ["read"], scope: ALL },
  QUESTION_BANK: { actions: ["read"], scope: ALL },
  TESTING: { actions: ["read", "manage"], scope: "OWN_ORG_SUBTREE" },
  MEMBERSHIP: { actions: ["read"], scope: "OWN_ORG_SUBTREE" },
  IMPORT: { actions: ["execute"], scope: "OWN_ORG_SUBTREE" },
  FILES: { actions: ["create", "read", "update", "delete"], scope: "OWN_ORG_SUBTREE" },
};

/**
 * Registrar Staff — "เฉพาะสังกัด" = OWN_ORG_SUBTREE เช่นกัน (กลไกเดียวกับ Regional
 * Admin ต่างแค่ระดับองค์กรที่ผูก scope ไว้ — ปกติจะเป็นองค์กรใบ (วัด/สำนักเรียน) จึง
 * ไม่มีลูกหลานให้ cascade ในทางปฏิบัติ) หมายเหตุ: M1 ไม่มี "delete" (CRU เท่านั้น)
 * ตรงกับนโยบาย no-overwrite/no-delete ประวัติทะเบียน (data-policy.md ข้อ 7)
 */
const REGISTRAR_STAFF: ModulePermissions = {
  REGISTRY: { actions: ["create", "read", "update"], scope: "OWN_ORG_SUBTREE" },
  CURRICULUM: { actions: ["read"], scope: ALL },
  QUESTION_BANK: { actions: ["read"], scope: ALL },
  MEMBERSHIP: { actions: ["read"], scope: "OWN_ORG_SUBTREE" },
  IMPORT: { actions: ["execute"], scope: "OWN_ORG_SUBTREE" },
  FILES: { actions: ["create", "read", "update"], scope: "OWN_ORG_SUBTREE" },
};

/**
 * Teacher — "เฉพาะที่รับผิดชอบ" = RESPONSIBLE_RECORD (ผูกกับ authorId ที่มีอยู่แล้ว
 * บน QuestionVersion/DocumentVersion/ExamSet หรือ OWN_PROGRAM ของตน)
 */
const TEACHER: ModulePermissions = {
  REGISTRY: { actions: ["read"], scope: ALL },
  CURRICULUM: { actions: ["read"], scope: ALL },
  QUESTION_BANK: { actions: ["create", "read"], scope: "RESPONSIBLE_RECORD" },
  TESTING: { actions: ["read"], scope: "RESPONSIBLE_RECORD" },
  FILES: { actions: ["read"], scope: ALL },
};

/** Examiner — "เฉพาะรอบที่มอบหมาย" = ASSIGNED_SESSION (deny เสมอในเฟสนี้ — ดูหมายเหตุที่ ScopeType) */
const EXAMINER: ModulePermissions = {
  REGISTRY: { actions: ["read"], scope: ALL },
  CURRICULUM: { actions: ["read"], scope: ALL },
  QUESTION_BANK: { actions: ["read"], scope: ALL },
  TESTING: { actions: ["read", "update"], scope: "ASSIGNED_SESSION" },
  FILES: { actions: ["read"], scope: ALL },
};

/** Student — "เฉพาะของตน" = OWN_RECORD ทุกจุด */
const STUDENT: ModulePermissions = {
  REGISTRY: { actions: ["read"], scope: "OWN_RECORD" },
  CURRICULUM: { actions: ["read"], scope: ALL },
  TESTING: { actions: ["create", "read"], scope: "OWN_RECORD" },
  MEMBERSHIP: { actions: ["read", "update"], scope: "OWN_RECORD" },
  FILES: { actions: ["read"], scope: "OWN_RECORD" },
};

/** Auditor — read-only ทั้งระบบทุกโมดูล รวม M9 config (แต่ไม่มีสิทธิ์แก้ไขใดๆ) */
const AUDITOR: ModulePermissions = {
  REGISTRY: { actions: ["read"], scope: ALL },
  CURRICULUM: { actions: ["read"], scope: ALL },
  QUESTION_BANK: { actions: ["read"], scope: ALL },
  TESTING: { actions: ["read"], scope: ALL },
  MEMBERSHIP: { actions: ["read"], scope: ALL },
  ADMIN: { actions: ["read"], scope: ALL },
  IMPORT: { actions: ["read"], scope: ALL },
  FILES: { actions: ["read"], scope: ALL },
  RBAC_CONFIG: { actions: ["read"], scope: ALL },
};

/**
 * PERMISSION_MATRIX — key คือ UserRole enum จริง (ไม่ใช่ role ทั่วไปจากโจทย์ ดู
 * หมายเหตุหัวไฟล์) `satisfies` บังคับว่าต้องระบุครบทุก role ที่มีในระบบ
 */
export const PERMISSION_MATRIX = {
  SUPER_ADMIN,
  CENTRAL_OFFICER,
  REGIONAL_ADMIN,
  REGISTRAR_STAFF,
  TEACHER,
  EXAMINER,
  STUDENT,
  AUDITOR,
} satisfies Record<UserRole, ModulePermissions>;

/**
 * Guest — ไม่ใช่ User row (ไม่มี role ใน UserRole enum) จึงแยกออกจาก
 * PERMISSION_MATRIX โดยตั้งใจ ใช้เฉพาะตอน getCurrentUser() คืน null เท่านั้น
 */
export const GUEST_PERMISSIONS: ModulePermissions = {
  REGISTRY: { actions: ["read"], scope: "PUBLIC" },
  TESTING: { actions: ["read"], scope: "PUBLIC" },
};

/** คืน permission entry ของ role+module คู่หนึ่ง — null = deny-by-default (ไม่มี entry) */
export function getPermission(role: UserRole | "GUEST", moduleName: Module): PermissionEntry | null {
  const table = role === "GUEST" ? GUEST_PERMISSIONS : PERMISSION_MATRIX[role];
  return table[moduleName] ?? null;
}
