"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, LayoutDashboard } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Container } from "@/components/layout/container";
import { PUBLIC_NAV_ITEMS } from "@/components/layout/nav-config";

/**
 * SiteHeader — Client Component เพราะต้องใช้ usePathname() (ไฮไลต์ลิงก์ที่ active)
 * และ useState (เปิด/ปิดเมนูมือถือผ่าน Sheet) ข้อมูลผู้ใช้ (`user`) รับมาจาก
 * Server Component ชั้นบน (RootLayout เรียก getCurrentUser() แล้วส่งเป็น prop) —
 * component นี้ **ไม่ตรวจสิทธิ์เอง** เป็นเพียง UX (แสดง/ซ่อนปุ่ม) เท่านั้น การตรวจ
 * สิทธิ์จริงยังคงอยู่ที่ server ทุกจุดตามเดิม (requireUser/requirePermission/
 * guardRoute ใน src/lib/authz.ts, src/lib/guard.ts) — deny-by-default ไม่ได้ขึ้นกับ
 * component นี้เลย แม้ผู้ใช้จะแก้ prop ฝั่ง client ก็ไม่เปลี่ยนสิทธิ์จริง
 */
export interface SiteHeaderUser {
  name: string;
  email: string;
  role: string;
}

function NavLink({
  href,
  label,
  isActive,
  onNavigate,
  className,
}: {
  href: string;
  label: string;
  isActive: boolean;
  onNavigate?: () => void;
  className?: string;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "text-sm font-medium transition-colors hover:text-foreground",
        isActive ? "text-foreground" : "text-muted-foreground",
        className,
      )}
    >
      {label}
    </Link>
  );
}

export function SiteHeader({ user }: { user: SiteHeaderUser | null }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <header className="border-border bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky top-0 z-40 w-full border-b backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 text-sm font-semibold text-foreground sm:text-base"
        >
          <span className="bg-primary text-primary-foreground flex size-8 shrink-0 items-center justify-center rounded-md text-sm font-bold">
            ส
          </span>
          <span className="truncate">ระบบฐานข้อมูลคณะสงฆ์</span>
        </Link>

        <nav
          aria-label="เมนูหลัก"
          className="hidden items-center gap-6 md:flex"
        >
          {PUBLIC_NAV_ITEMS.map((item) => (
            <NavLink
              key={item.href}
              href={item.href}
              label={item.label}
              isActive={pathname === item.href}
            />
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {user ? (
            <Button asChild size="sm" variant="outline">
              <Link href="/dashboard">
                <LayoutDashboard className="size-4" />
                แดชบอร์ด
              </Link>
            </Button>
          ) : (
            <Button asChild size="sm">
              <Link href="/login">เข้าสู่ระบบ</Link>
            </Button>
          )}
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="เปิดเมนู"
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-3/4 max-w-xs">
            <SheetHeader>
              <SheetTitle>เมนู</SheetTitle>
            </SheetHeader>
            <nav
              aria-label="เมนูหลัก (มือถือ)"
              className="flex flex-col gap-4 px-4"
            >
              {PUBLIC_NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.href}
                  href={item.href}
                  label={item.label}
                  isActive={pathname === item.href}
                  onNavigate={() => setMobileOpen(false)}
                  className="text-base"
                />
              ))}
              <div className="border-border mt-2 border-t pt-4">
                {user ? (
                  <Button asChild size="sm" className="w-full" variant="outline">
                    <Link href="/dashboard" onClick={() => setMobileOpen(false)}>
                      <LayoutDashboard className="size-4" />
                      แดชบอร์ด ({user.role})
                    </Link>
                  </Button>
                ) : (
                  <Button asChild size="sm" className="w-full">
                    <Link href="/login" onClick={() => setMobileOpen(false)}>
                      เข้าสู่ระบบ
                    </Link>
                  </Button>
                )}
              </div>
            </nav>
          </SheetContent>
        </Sheet>
      </Container>
    </header>
  );
}
