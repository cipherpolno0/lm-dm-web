"use client";

import { useEffect } from "react";

import { ErrorState } from "@/components/ui/error-state";
import { Container } from "@/components/layout/container";

/**
 * error.tsx (root) — Next.js file convention: React Error Boundary รอบทุก
 * segment ที่ไม่มี error.tsx ของตัวเอง ต้องเป็น Client Component (บังคับโดย
 * Next.js) ใช้ `retry` prop (stable ตั้งแต่ Next.js 16.3.0 — โปรเจกต์นี้ใช้
 * 16.3.5 อ่านจาก node_modules/next/dist/docs/.../error.md ก่อนเขียนโค้ดนี้ตามที่
 * AGENTS.md ของ Next.js กำชับ เพราะเป็น API ที่เพิ่งเสถียรและอาจต่างจาก training
 * data)
 *
 * ตาม dev-rules.md ข้อ 7 (ไม่แสดงรายละเอียดภายในต่อผู้ใช้): แสดงเฉพาะข้อความทั่วไป
 * + error.digest (hash อ้างอิง log ฝั่ง server) — ไม่แสดง error.message ดิบ แม้ใน
 * dev mode Next.js จะส่ง message จริงมาก็ตาม (ตั้งใจไม่ใช้ error.message เพื่อไม่ให้
 * พฤติกรรม dev/prod ต่างกันโดยไม่ได้ตั้งใจ)
 */
export default function GlobalErrorBoundary({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <Container className="flex w-full flex-1 items-center justify-center py-16">
      <ErrorState
        title="เกิดข้อผิดพลาดบางอย่าง"
        description="ระบบไม่สามารถแสดงหน้านี้ได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาซ้ำ กรุณาแจ้งผู้ดูแลระบบพร้อมรหัสอ้างอิงด้านล่าง"
        digest={error.digest}
        onRetry={retry}
        className="max-w-md border-none bg-transparent"
      />
    </Container>
  );
}
