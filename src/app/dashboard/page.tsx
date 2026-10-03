import type { Metadata } from "next";
import { requireUser } from "@/lib/authz";
import { LogoutButton } from "./logout-button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "แดชบอร์ด",
};

/**
 * /dashboard — protected route ขั้นต่ำสำหรับพิสูจน์ว่า session/authorization
 * ทำงานจริง (สอดคล้องกับ sitemap.md ที่ระบุ /dashboard เป็นปลายทางหลังล็อกอิน)
 * หน้าจริงตามบทบาท (Admin Console ฯลฯ) เป็นงานในอนาคต (M6) — นอกขอบเขตงานนี้
 *
 * requireUser() คือจุดตรวจสอบสิทธิ์จริง (secure check, deny-by-default) —
 * proxy.ts เป็นเพียง optimistic UX redirect ชั้นแรกเท่านั้น (Next.js
 * authentication guide: "Proxy ... should not be your only line of defense")
 */
export default async function DashboardPage() {
  const user = await requireUser();

  return (
    // <div> แทน <main> — RootLayout เป็นเจ้าของ <main> เดียวของหน้าแล้ว (P4 Design
    // System + Layout)
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="text-xl">แดชบอร์ด</CardTitle>
          <CardDescription>เข้าสู่ระบบสำเร็จ</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">ชื่อ</dt>
            <dd>{user.name}</dd>
            <dt className="text-muted-foreground">อีเมล</dt>
            <dd>{user.email}</dd>
            <dt className="text-muted-foreground">บทบาท</dt>
            <dd>{user.role}</dd>
          </dl>
          <LogoutButton />
        </CardContent>
      </Card>
    </div>
  );
}
