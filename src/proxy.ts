import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Proxy (เดิมชื่อ middleware — Next.js 16 เปลี่ยนชื่อไฟล์นี้เป็น proxy.ts,
 * ฟังก์ชันเหมือนเดิมทุกอย่าง ดู node_modules/next/dist/docs/.../proxy.md)
 *
 * ทำหน้าที่เป็น "optimistic check" เท่านั้น (อ่าน/ถอดรหัส JWT จาก cookie โดยไม่
 * แตะฐานข้อมูล) เพื่อ redirect ผู้ใช้ก่อนหน้าจะ render — ไม่ใช่จุดตรวจสอบสิทธิ์
 * ที่เชื่อถือได้จริง (ตาม Next.js authentication guide: "Proxy should not be
 * your only line of defense"; ADR-0003 + dev-rules.md ข้อ 4 ก็กำหนดตรงกันว่า
 * authorization ต้องตรวจฝั่ง server ที่ resource จริง) จุดตรวจสอบที่เชื่อถือได้
 * (secure/deny-by-default check ที่ query ฐานข้อมูลสดทุกครั้ง) อยู่ที่
 * src/lib/authz.ts (getCurrentUser/requireUser/requireRole) ซึ่งทุก Server
 * Action, Route Handler และหน้า protected page เรียกเองอีกชั้นเสมอ
 */

const PROTECTED_PREFIXES = ["/dashboard"];
const GUEST_ONLY_PATHS = ["/login"];

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth?.user;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isGuestOnly = GUEST_ONLY_PATHS.includes(pathname);

  if (isProtected && !isLoggedIn) {
    return NextResponse.redirect(new URL("/login", req.nextUrl));
  }

  if (isGuestOnly && isLoggedIn) {
    return NextResponse.redirect(new URL("/dashboard", req.nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
