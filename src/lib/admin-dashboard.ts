import "server-only";
import { query } from "@/lib/db";
import { MODULES, getPermission, type Module } from "@/lib/permissions";
import type { UserRole } from "@/lib/domain-types";

/**
 * src/lib/admin-dashboard.ts — งาน "สร้าง Admin Dashboard Shell" (Phase P5 Admin & CMS)
 *
 * ไฟล์นี้แยกข้อมูลสองประเภทที่บรีฟระบุแยกกันชัดเจน ("KPI mock" กับ "recent
 * activity" — คำว่า "mock" แนบมากับ KPI เท่านั้น):
 *   - getAdminKpiCards()   → ข้อมูลสมมติล้วน (ไม่ query ฐานข้อมูลจริง)
 *   - listRecentActivity() → ข้อมูลจริงจากตาราง audit_logs (P1, append-only,
 *     บังคับด้วย DB trigger ห้าม UPDATE/DELETE — ดู prisma/schema.prisma)
 */

export interface AdminKpiCard {
  module: Module;
  label: string;
  value: string;
}

/**
 * ค่า KPI เป็น "ข้อมูลสมมติ" ล้วนตามที่บรีฟระบุ "KPI mock" ชัดเจน — ยังไม่ query
 * จริงจากฐานข้อมูล เพราะ endpoint/ตารางที่จะผลิตตัวเลขจริงของแต่ละ module (เช่น
 * จำนวนข้อสอบที่รออนุมัติจริงของ M3, จำนวนรอบสอบจริงของ M4) ยังไม่ถูกสร้าง — นอก
 * ขอบเขตของงาน "Admin Dashboard Shell" นี้ (ดู prisma/admin-dashboard.md §6
 * ขอบเขตที่ตัดออก) เลือกให้ KPI เฉพาะ 5 module ที่มีความหมายเป็น "จำนวนนับ" ได้
 * ตามธรรมชาติ (ADMIN/FILES/RBAC_CONFIG ไม่มี KPI ในเฟสนี้ — ไม่ใช่ตัวเลขที่มี
 * ความหมายชัดเจนพอจะ mock อย่างมีเหตุผล)
 */
const KPI_MOCK_DEFINITIONS: Partial<Record<Module, { label: string; value: string }>> = {
  REGISTRY: { label: "จำนวนองค์กร/หน่วยงานทั้งหมด", value: "128" },
  QUESTION_BANK: { label: "ข้อสอบที่รออนุมัติ", value: "12" },
  TESTING: { label: "รอบสอบที่กำลังจะมาถึง", value: "4" },
  MEMBERSHIP: { label: "สมาชิกที่รออนุมัติบัญชี", value: "7" },
  IMPORT: { label: "งานนำเข้าที่สำเร็จล่าสุด", value: "3" },
};

/**
 * F6.3 — getAdminKpiCards
 * Actor: internal — เรียกจาก src/app/admin/page.tsx เท่านั้น
 * Input: role (UserRole ของผู้ใช้ปัจจุบัน — ผ่าน requirePermission("ADMIN","read") มาแล้ว)
 * Process: กรอง MODULES ด้วย getPermission(role, module) !== null (เหมือน
 *          getVisibleAdminNavItems — "เห็นเฉพาะ module ที่มีสิทธิ์" ใช้กติกาเดียวกัน
 *          ทั้ง sidebar และ KPI) แล้วกรองต่อด้วยว่า module นั้นมี KPI mock กำหนดไว้หรือไม่
 * Output: AdminKpiCard[] (0–5 รายการ ตาม role — ค่าทั้งหมดเป็นข้อมูลสมมติ)
 * Permission: n/a (derive จาก permission matrix ที่ตรวจสอบมาแล้วที่ layout)
 * Validation: n/a
 * Error State: n/a (pure function, ไม่มี I/O, ไม่มีทาง throw)
 * Audit: ไม่บันทึก (ข้อมูลสมมติ ไม่ใช่ query ข้อมูลจริง)
 * Acceptance Criteria:
 *   AC1: role ที่ไม่มีสิทธิ์เห็น module ใดเลยในกลุ่ม KPI (เช่น สมมติมี role ใหม่ที่
 *        เห็นเฉพาะ ADMIN/FILES/RBAC_CONFIG) → คืน array ว่าง ไม่ error
 *   AC2: ทุกค่าที่คืนมาเป็นข้อมูลสมมติที่ hardcode ไว้ล่วงหน้าเท่านั้น ไม่มีการ query
 *        ฐานข้อมูลใดๆ เกิดขึ้นในฟังก์ชันนี้ (พิสูจน์ได้จากการไม่ import src/lib/db)
 */
export function getAdminKpiCards(role: UserRole): AdminKpiCard[] {
  return MODULES.filter((moduleName) => getPermission(role, moduleName) !== null)
    .filter((moduleName): moduleName is keyof typeof KPI_MOCK_DEFINITIONS => moduleName in KPI_MOCK_DEFINITIONS)
    .map((moduleName) => {
      const def = KPI_MOCK_DEFINITIONS[moduleName];
      return { module: moduleName, label: def!.label, value: def!.value };
    });
}

export interface RecentActivityItem {
  id: string;
  entityType: string;
  entityId: string;
  action: "CREATE" | "UPDATE" | "DELETE";
  actorName: string | null;
  createdAt: Date;
}

const RECENT_ACTIVITY_LIMIT = 10;

/**
 * F6.4 — listRecentActivity
 * Actor: internal — เรียกจาก src/app/admin/page.tsx เท่านั้น (หลังผ่าน
 *        requirePermission("ADMIN","read") ของ layout แล้วเท่านั้น)
 * Input: ไม่มี (ไม่รับ parameter จาก client)
 * Process: SELECT จาก audit_logs (LEFT JOIN users เพื่อชื่อผู้กระทำ — actorId เป็น
 *          null ได้สำหรับ system job ในอนาคต) เรียง createdAt ล่าสุดก่อน จำกัด 10
 *          แถว ไม่มีเงื่อนไข WHERE ตาม scope เพิ่มเติม เพราะ ADMIN module (จุดตรวจ
 *          สิทธิ์เดียวของ /admin) มี scope=ALL เหมือนกันหมดสำหรับทั้ง 3 role ที่เข้าถึง
 *          ได้ (SUPER_ADMIN/CENTRAL_OFFICER/AUDITOR — ดู PERMISSION_MATRIX) จึงไม่มี
 *          role ใดที่ผ่าน guard เข้ามาแล้วควรเห็น audit log แคบกว่ากัน
 * Output: RecentActivityItem[] (0–10 รายการ, เรียงใหม่สุดก่อน) — ว่างได้ตามปกติ
 *         (audit_logs ว่างเปล่าหลัง seed สด เพราะ prisma/seed.ts ไม่เขียนแถวลง
 *         audit_logs โดยตั้งใจ — ดู prisma/seed.ts ท้ายไฟล์ "ไม่ได้เขียนแถวลง
 *         audit_logs จากสคริปต์นี้" — หน้าเรียกต้องแสดง EmptyState ไม่ใช่ error)
 * Permission: n/a (ไม่ตรวจสิทธิ์เอง — ผู้เรียกต้องผ่าน requirePermission("ADMIN","read")
 *             มาก่อนเสมอ ไฟล์นี้ไม่ import authz.ts เพื่อไม่ให้ดูเหมือนตรวจสิทธิ์ซ้ำ)
 * Validation: n/a
 * Error State: database error → throw ขึ้นไป (fail-closed — ผู้เรียกต้องปล่อยให้
 *              กลายเป็น error.tsx ไม่ใช่ตีความว่า "ไม่มีกิจกรรม" อย่างเงียบๆ)
 * Audit: ไม่บันทึกเอง (read-only)
 * Acceptance Criteria:
 *   AC1: audit_logs ว่างเปล่า → คืน array ว่าง ไม่ throw
 *   AC2: มีมากกว่า 10 แถว → คืนเฉพาะ 10 แถวล่าสุดตาม createdAt DESC
 *   AC3: actorId เป็น null (ไม่มี user ผูกอยู่) → actorName เป็น null ไม่ throw
 *        (LEFT JOIN ไม่ใช่ INNER JOIN)
 */
export async function listRecentActivity(): Promise<RecentActivityItem[]> {
  const { rows } = await query<RecentActivityItem>(
    `SELECT al.id, al."entityType", al."entityId", al.action, u.name AS "actorName", al."createdAt"
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al."actorId"
      ORDER BY al."createdAt" DESC
      LIMIT $1`,
    [RECENT_ACTIVITY_LIMIT],
  );
  return rows;
}
