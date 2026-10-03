import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/authz";
import { LoginForm } from "./login-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const metadata: Metadata = {
  title: "เข้าสู่ระบบ",
};

/**
 * /login — F5.4 "เข้าสู่ระบบครั้งแรก" / Login มาตรฐาน (requirements.md §8)
 * Server Component: ตรวจสอบก่อนว่ามี session ที่ใช้งานได้อยู่แล้วหรือไม่
 * (secure check ผ่าน getCurrentUser — ไม่ใช่แค่ optimistic cookie check) ถ้ามี
 * ให้ redirect ออกทันที ไม่ต้องรอ proxy.ts (ซึ่งเป็นเพียง UX เสริม)
 */
export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) redirect("/dashboard");

  return (
    // ใช้ <div> ไม่ใช่ <main> ที่นี่ — RootLayout (src/app/layout.tsx) เป็นเจ้าของ
    // <main id="main-content"> เดียวของทั้งหน้าแล้ว (ต้องมี <main> แค่จุดเดียวต่อ
    // หน้าตาม HTML landmark) เพิ่มเข้าใน P4 Design System + Layout
    <div className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">เข้าสู่ระบบ</CardTitle>
          <CardDescription>
            ระบบฐานข้อมูลคณะสงฆ์และการศึกษาพระปริยัติธรรม
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </div>
  );
}
