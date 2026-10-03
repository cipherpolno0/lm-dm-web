import type { Metadata } from "next";
import { requirePermission } from "@/lib/authz";
import { getAdminKpiCards, listRecentActivity } from "@/lib/admin-dashboard";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatThaiDateTime } from "@/lib/format";

export const metadata: Metadata = {
  title: "แดชบอร์ด",
};

const ACTION_LABELS: Record<string, string> = {
  CREATE: "สร้าง",
  UPDATE: "แก้ไข",
  DELETE: "ลบ",
};

/**
 * F6.3/F6.4 — /admin (Admin Dashboard) (งาน "สร้าง Admin Dashboard Shell",
 * Phase P5 Admin & CMS) — สอง widget ตามบรีฟ: "KPI mock" (F6.3, ข้อมูลสมมติ) และ
 * "recent activity" (F6.4, ข้อมูลจริงจาก audit_logs) — ดูสเปกเต็มที่
 * src/lib/admin-dashboard.ts
 *
 * Function: แสดงภาพรวมระบบสำหรับผู้ดูแล — KPI card ตาม module ที่มีสิทธิ์เห็น +
 *           รายการกิจกรรมล่าสุดจริง 10 รายการ
 * Actor: ตรงกับ /admin layout (SUPER_ADMIN, CENTRAL_OFFICER, AUDITOR)
 * Input: ไม่มี (ไม่รับ query param ในเฟสนี้)
 * Process:
 *   1. requirePermission("ADMIN","read") — ซ้ำอีกครั้งที่ตัวหน้าเอง (ไม่พึ่ง layout
 *      อย่างเดียว ตาม dev-rules.md ข้อ 4 "ต้องตรวจฝั่ง server" ในทุกจุดที่เข้าถึงข้อมูล
 *      — แม้ layout จะ guard ไว้แล้ว หน้านี้ก็ต้องพิสูจน์ได้ว่าตัวเองปลอดภัยแม้ถูกเรียก
 *      ทางอื่นในอนาคต)
 *   2. getAdminKpiCards(user.role) — ข้อมูลสมมติ กรองตามสิทธิ์
 *   3. listRecentActivity() — query audit_logs จริง 10 แถวล่าสุด
 * Output: JSX — grid การ์ด KPI (ถ้ามี) + รายการกิจกรรมล่าสุด หรือ EmptyState ถ้ายังไม่มี
 * Permission: requirePermission("ADMIN","read")
 * Validation: n/a
 * Error State: ไม่มีสิทธิ์/ไม่มี session → redirect (ตาม requirePermission); database
 *              error จาก listRecentActivity() → throw ขึ้นไป กลายเป็น error.tsx
 *              (ไม่ catch แล้วแสดงเป็น "ไม่มีกิจกรรม" อย่างเงียบๆ — ต่างจาก EmptyState
 *              ที่ใช้เมื่อ query สำเร็จแต่ไม่มีแถว)
 * Audit: read-only ไม่บันทึก
 * Acceptance Criteria:
 *   AC1: SUPER_ADMIN/CENTRAL_OFFICER/AUDITOR เห็นการ์ด KPI เฉพาะ module ที่ตนมีสิทธิ์
 *        (ตรงกับ getAdminKpiCards — ดู AC ที่นั่น)
 *   AC2: audit_logs ว่างเปล่า (เช่น หลัง seed สด) → แสดง EmptyState "ยังไม่มีกิจกรรม"
 *        ไม่ error
 *   AC3: audit_logs มีข้อมูลจริง (เช่น หลังทดสอบ grant/revoke scope) → แสดงรายการ
 *        จริงเรียงใหม่สุดก่อน พร้อมชื่อผู้กระทำ/เวลาที่แปลงเป็นรูปแบบไทยแล้ว
 */
export default async function AdminDashboardPage() {
  const user = await requirePermission("ADMIN", "read");
  const kpiCards = getAdminKpiCards(user.role);
  const activity = await listRecentActivity();

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-semibold">แดชบอร์ด</h1>
        <p className="text-muted-foreground text-sm">
          ภาพรวมระบบสำหรับบทบาท {user.role}
        </p>
      </div>

      {kpiCards.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {kpiCards.map((kpi) => (
            <Card key={kpi.module}>
              <CardHeader className="gap-2 pb-0">
                <CardDescription className="flex items-center justify-between gap-2">
                  <span>{kpi.label}</span>
                  <Badge variant="outline" className="text-[10px]">
                    ข้อมูลตัวอย่าง
                  </Badge>
                </CardDescription>
                <CardTitle className="text-3xl">{kpi.value}</CardTitle>
              </CardHeader>
            </Card>
          ))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">กิจกรรมล่าสุด</CardTitle>
          <CardDescription>
            {RECENT_ACTIVITY_DESCRIPTION}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {activity.length === 0 ? (
            <EmptyState
              title="ยังไม่มีกิจกรรม"
              description="เมื่อมีการเปลี่ยนแปลงข้อมูลสำคัญในระบบ (เช่น การให้/ถอนสิทธิ์) รายการจะปรากฏที่นี่"
            />
          ) : (
            <ul className="divide-border flex flex-col divide-y">
              {activity.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-col gap-0.5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    <span className="font-medium">
                      {ACTION_LABELS[item.action] ?? item.action}
                    </span>{" "}
                    {item.entityType}{" "}
                    <span className="text-muted-foreground">
                      ({item.entityId})
                    </span>
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {item.actorName ?? "ไม่ทราบผู้กระทำ"} ·{" "}
                    {formatThaiDateTime(item.createdAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

const RECENT_ACTIVITY_DESCRIPTION = "10 รายการล่าสุดจาก audit log จริง (ไม่ใช่ข้อมูลสมมติ)";
