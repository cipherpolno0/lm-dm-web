import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "@/lib/authz";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

// NOTE: no next/font/google here on purpose — see globals.css for why
// (this sandboxed build environment cannot reach fonts.googleapis.com).
// Font stack is defined via CSS variables (--font-sans/--font-mono) in globals.css.

export const metadata: Metadata = {
  title: {
    default: "ระบบฐานข้อมูลคณะสงฆ์และการศึกษาพระปริยัติธรรม",
    template: "%s | ระบบฐานข้อมูลคณะสงฆ์และการศึกษาพระปริยัติธรรม",
  },
  description:
    "ฐานข้อมูลคณะสงฆ์ นักธรรม/ธรรมศึกษา/บาลี คลังข้อสอบ แบบทดสอบ และระบบสมาชิก (P4 — Design System + Layout)",
};

/**
 * RootLayout เพิ่ม Header/Footer ของ Design System (งาน "สร้าง Design System +
 * Layout" — P4 Public Front End) ครอบคลุมทุกหน้า (ยังไม่แยก route group
 * (public)/(member)/(admin) ตาม sitemap.md เพราะยังไม่ใช่ขอบเขตงานนี้ — ดู
 * prisma/design-system.md หัวข้อ "ขอบเขตที่ตัดออก")
 *
 * getCurrentUser() ที่นี่เป็นเพียงการอ่านเพื่อ "แสดงผล" (ปุ่มเข้าสู่ระบบ/แดชบอร์ด
 * ใน Header) เท่านั้น — **ไม่ใช่จุดตรวจสิทธิ์** แต่ละหน้า/action ยังคงต้องเรียก
 * requireUser()/requirePermission()/guardRoute() ของตัวเองเสมอตาม deny-by-default
 * (dev-rules.md ข้อ 4) การอ่านค่าที่นี่ผิดพลาด/ไม่มี session ไม่ทำให้หน้าใด "หลุด"
 * การตรวจสิทธิ์จริงที่จุดใช้งาน
 */
export default async function RootLayout({ children }: LayoutProps<"/">) {
  const user = await getCurrentUser();

  return (
    <html lang="th" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-sans">
        <a href="#main-content" className="skip-link">
          ข้ามไปยังเนื้อหาหลัก
        </a>
        <SiteHeader
          user={
            user ? { name: user.name, email: user.email, role: user.role } : null
          }
        />
        <main id="main-content" className="flex flex-1 flex-col">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
