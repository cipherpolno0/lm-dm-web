import type { Metadata } from "next";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Container } from "@/components/layout/container";

export const metadata: Metadata = {
  title: "ไม่พบหน้า",
};

/**
 * not-found.tsx (root) — Next.js file convention: แสดงเมื่อเรียก notFound() หรือ
 * URL ไม่ตรงกับ route ใดเลย ตรงกับ sitemap.md ข้อ 6 (`/404`) เป็น Server
 * Component ปกติ (ต่างจาก error.tsx ที่ต้องเป็น Client Component)
 */
export default function NotFound() {
  return (
    <Container className="flex w-full flex-1 flex-col items-center justify-center gap-4 py-24 text-center">
      <span className="text-muted-foreground text-sm font-medium">404</span>
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">
        ไม่พบหน้าที่คุณต้องการ
      </h1>
      <p className="text-muted-foreground max-w-md text-sm">
        หน้านี้อาจถูกย้าย ลบ หรือยังไม่เปิดให้บริการ (หลายหน้าตาม sitemap.md
        ยังอยู่ระหว่างพัฒนาในเฟสถัดไป)
      </p>
      <Button asChild>
        <Link href="/">กลับหน้าแรก</Link>
      </Button>
    </Container>
  );
}
