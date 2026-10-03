import type { Metadata } from "next";
import { requirePermission } from "@/lib/authz";
import { getVisibleAdminNavItems } from "@/lib/admin-nav";
import { AdminSidebar } from "@/components/layout/admin-sidebar";

export const metadata: Metadata = {
  title: {
    default: "ผู้ดูแลระบบ",
    template: "%s | ผู้ดูแลระบบ",
  },
};

/**
 * F6.1 — /admin layout: ประตูเข้า Admin Zone + Sidebar permission-aware (งาน
 * "สร้าง Admin Dashboard Shell", Phase P5 Admin & CMS)
 *
 * Function: ควบคุมการเข้าถึงทั้ง Admin Zone (ทุกหน้าใต้ /admin/*) ในจุดเดียว +
 *           render sidebar ที่แสดงเฉพาะ module ที่ผู้ใช้ปัจจุบันมีสิทธิ์
 * Actor: SUPER_ADMIN, CENTRAL_OFFICER, AUDITOR เท่านั้น (มีเพียง 3 role นี้ที่มี
 *        entry ของ module "ADMIN" ใน PERMISSION_MATRIX — role อื่นทั้งหมด รวมถึง
 *        REGIONAL_ADMIN/REGISTRAR_STAFF/TEACHER/EXAMINER/STUDENT และ Guest ไม่มี
 *        entry เลย = deny-by-default โดยอัตโนมัติ ตรงกับ sitemap.md ข้อ 7 "Zone
 *        Access Summary" ที่ระบุว่ามีเพียง 3 role นี้เข้าถึง Admin Zone ได้)
 * Input: children (React.ReactNode — เนื้อหาของแต่ละหน้าย่อยใต้ /admin)
 * Process:
 *   1. requirePermission("ADMIN", "read") — ครอบคลุมทั้ง Admin Zone ในจุดเดียว:
 *      ไม่มี session → redirect("/login"); มี session แต่ไม่มีสิทธิ์ (ไม่มี ADMIN
 *      entry) → redirect("/dashboard?error=forbidden") — deny-by-default ตาม
 *      dev-rules.md ข้อ 4 (เกิดก่อน render sidebar/เนื้อหาใดๆ ทั้งสิ้น)
 *   2. getVisibleAdminNavItems(user.role) — derive รายการเมนูที่มองเห็นได้จาก
 *      permission matrix จริง (ไม่ hardcode ต่อ role)
 *   3. render AdminSidebar (เมนู) + children (เนื้อหาหน้าปัจจุบัน) เป็น layout
 *      สองคอลัมน์บนเดสก์ท็อป / สลับเป็นแถบบน+Sheet บนมือถือ
 * Output: JSX (sidebar + children) หรือ redirect (ไม่มีสิทธิ์)
 * Permission: requirePermission("ADMIN", "read") — server-side, deny-by-default
 * Validation: n/a (ไม่มี input จาก client ในชั้นนี้)
 * Error State: ไม่มี session → redirect /login; ไม่มีสิทธิ์ → redirect
 *              /dashboard?error=forbidden; database error ใน getCurrentUser()/can()
 *              → throw ขึ้นไป (fail-closed, กลายเป็น error.tsx ของ root)
 * Audit: การเข้าถึงหน้า (page view) ไม่บันทึก audit — เฉพาะการเปลี่ยนแปลงข้อมูลจริง
 *        (เช่น grant/revoke scope ผ่าน /api/admin/organization-scopes) ที่บันทึกอยู่แล้ว
 * Acceptance Criteria:
 *   AC1: ไม่มี session เข้า /admin (หรือ /admin/* ใดๆ) → redirect ไป /login เสมอ
 *   AC2: STUDENT/TEACHER/EXAMINER/REGISTRAR_STAFF/REGIONAL_ADMIN เข้า /admin →
 *        redirect ไป /dashboard?error=forbidden เสมอ (ไม่มี entry ของ module ADMIN)
 *   AC3: SUPER_ADMIN เห็นเมนูครบ 9 รายการ; CENTRAL_OFFICER เห็น 8 รายการ (ไม่มี
 *        RBAC_CONFIG); AUDITOR เห็นครบ 9 รายการ (read-only ทุก module)
 *   AC4: การเข้าถึงหน้าย่อยใต้ /admin/* ที่ยังไม่ถูกสร้างจริง (เช่น /admin/registry)
 *        เจอ not-found.tsx ตามปกติของ Next.js — ไม่ throw/crash (เป็น "shell" ตามชื่อ
 *        งานนี้ หน้าย่อยจริงเป็นงานอนาคต — ดู prisma/admin-dashboard.md §6)
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  const user = await requirePermission("ADMIN", "read");
  const navItems = getVisibleAdminNavItems(user.role);

  return (
    <div className="flex flex-1 flex-col md:flex-row">
      <AdminSidebar navItems={navItems} roleLabel={user.role} />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  );
}
