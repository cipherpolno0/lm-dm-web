import "server-only";
import { MODULES, getPermission, type Module } from "@/lib/permissions";
import type { UserRole } from "@/lib/domain-types";

/**
 * src/lib/admin-nav.ts — งาน "สร้าง Admin Dashboard Shell" (Phase P5 Admin & CMS)
 *
 * ที่มาของแนวคิด: "วิธีตรวจสอบ" ของงานนี้ระบุตรงๆ ว่า "ผู้ใช้เห็นเฉพาะ module
 * ที่มีสิทธิ์" — ไม่ใช่ "ผู้ใช้เห็นเฉพาะเมนูตาม role ที่กำหนดไว้ตายตัว" จึงออกแบบให้
 * sidebar ของ Admin Zone **ได้มาจาก permission matrix จริง** (src/lib/permissions.ts)
 * โดยตรง ไม่ hardcode รายการเมนูต่อ role เอง — วนทุก module ใน `MODULES` (M1–M9)
 * แล้วถาม `getPermission(role, module)` ว่ามี entry หรือไม่ (entry ใดๆ ก็พอ ไม่ต้อง
 * แยกตาม action) มี entry = แสดงเมนู, ไม่มี entry (deny-by-default) = ซ่อนเมนูนั้น
 * ทันที ไม่ต้องเขียน logic การซ่อน/แสดงใหม่ซ้ำอีกชุดหนึ่ง
 *
 * เหตุผลที่ path เป็น `/admin/<module-slug>` (path เดียวต่อ module) แทน path ที่
 * sitemap.md เสนอไว้ (เช่น `/admin/reference-data` ที่รวมหลาย module, `/admin/users`
 * ที่ไม่ตรงกับ module ใดใน M1–M9 โดยตรง): sitemap.md เองยังเป็น "ร่างสำหรับ Owner
 * Review" (ดูหัวข้อ 9/10 ของเอกสารนั้น — ยังไม่ยืนยันชื่อ path/การจัดกลุ่มเมนู) ในขณะที่
 * permission matrix (roles-permissions.md) implement + ทดสอบจริงแล้ว จึงยึด module
 * เป็นหน่วยเดียวของการกำหนด path — ง่ายต่อการ derive จาก MODULES โดยตรง ไม่ต้องเก็บ
 * mapping แยกต่างหาก และเมื่อ Owner ยืนยัน sitemap.md ภายหลัง ปรับ ADMIN_NAV_DEFINITIONS
 * ที่นี่จุดเดียวได้โดยไม่กระทบ permission logic เลย (ดู prisma/admin-dashboard.md §2)
 *
 * หน้าเป้าหมายส่วนใหญ่ด้านล่างยังไม่ถูกสร้างจริง (เป็น "shell" ตามชื่องาน) — คลิกแล้ว
 * จะเจอ not-found.tsx ชั่วคราว เหมือน pattern เดิมที่ยอมรับแล้วใน
 * src/components/layout/nav-config.ts (PUBLIC_NAV_ITEMS) ไม่ใช่ลิงก์เสีย/บั๊ก
 */
export interface AdminNavItem {
  module: Module;
  href: string;
  label: string;
}

const ADMIN_NAV_DEFINITIONS: Record<Module, { href: string; label: string }> = {
  REGISTRY: { href: "/admin/registry", label: "ทะเบียนคณะสงฆ์" },
  CURRICULUM: { href: "/admin/curriculum", label: "หลักสูตรและระดับการศึกษา" },
  QUESTION_BANK: { href: "/admin/question-bank", label: "คลังข้อสอบ" },
  TESTING: { href: "/admin/testing", label: "แบบทดสอบ/จัดสอบ" },
  MEMBERSHIP: { href: "/admin/membership", label: "ระบบสมาชิก" },
  ADMIN: { href: "/admin/settings", label: "ผู้ดูแลระบบ" },
  IMPORT: { href: "/admin/import", label: "นำเข้าข้อมูล Excel" },
  FILES: { href: "/admin/files", label: "จัดเก็บไฟล์ (PDF/Object Storage)" },
  RBAC_CONFIG: { href: "/admin/rbac-config", label: "สิทธิ์การเข้าถึงหลายระดับ" },
};

/**
 * F6.1 (ส่วน sidebar) — getVisibleAdminNavItems
 * Actor: internal — เรียกจาก src/app/admin/layout.tsx เท่านั้น
 * Input: role (UserRole ของผู้ใช้ปัจจุบัน — ต้องผ่าน requirePermission("ADMIN","read")
 *        จาก layout มาก่อนแล้วเสมอ ไม่มีทางเป็น Guest ที่นี่)
 * Process: กรอง MODULES (9 รายการ M1–M9) ด้วย getPermission(role, module) !== null
 *          แล้ว map เข้ากับ ADMIN_NAV_DEFINITIONS ตามลำดับเดิมของ MODULES
 * Output: AdminNavItem[] (0–9 รายการ ตาม role — ในทางปฏิบัติจะไม่มีทาง 0 รายการ เพราะ
 *         การเข้าถึง /admin เองต้องผ่าน ADMIN:read มาก่อน ซึ่งหมายความว่าอย่างน้อยจะมี
 *         entry ของ module "ADMIN" เองเสมอ)
 * Permission: n/a (เป็นฟังก์ชัน derive ข้อมูลแสดงผลจาก permission matrix ที่ตรวจสอบ
 *             มาแล้ว ไม่ใช่จุดตรวจสิทธิ์เอง — การตรวจสิทธิ์จริงอยู่ที่ requirePermission()
 *             ใน layout และจะตรวจซ้ำอีกครั้งที่ตัวหน้าเป้าหมายเองเมื่อสร้างขึ้นจริงในอนาคต)
 * Validation: n/a
 * Error State: n/a (pure function, ไม่มี I/O)
 * Audit: ไม่บันทึก (การแสดง/ซ่อนเมนูไม่ใช่การเข้าถึงข้อมูล)
 * Acceptance Criteria:
 *   AC1: SUPER_ADMIN ได้ทั้ง 9 รายการ (มี entry ทุก module ตาม PERMISSION_MATRIX)
 *   AC2: CENTRAL_OFFICER ได้ 8 รายการ (ไม่มี RBAC_CONFIG)
 *   AC3: AUDITOR ได้ทั้ง 9 รายการ (read-only ทุก module แต่ยังนับเป็น "มีสิทธิ์เห็น")
 *   AC4: role ที่ไม่มี entry ของ module ใดเลย เช่น STUDENT ต่อ QUESTION_BANK/ADMIN/
 *        IMPORT/RBAC_CONFIG → module เหล่านั้นไม่ปรากฏในผลลัพธ์
 */
export function getVisibleAdminNavItems(role: UserRole): AdminNavItem[] {
  return MODULES.filter((moduleName) => getPermission(role, moduleName) !== null).map((moduleName) => ({
    module: moduleName,
    ...ADMIN_NAV_DEFINITIONS[moduleName],
  }));
}
