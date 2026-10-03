"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Menu,
  LayoutDashboard,
  Landmark,
  BookOpen,
  FileQuestion,
  ClipboardList,
  Users,
  Settings,
  Upload,
  FolderArchive,
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import type { AdminNavItem } from "@/lib/admin-nav";
import type { Module } from "@/lib/permissions";

/**
 * AdminSidebar — Client Component (usePathname สำหรับไฮไลต์ลิงก์ active + useState
 * เปิด/ปิด Sheet บนมือถือ) เหมือน pattern เดียวกับ SiteHeader (P4 Design System)
 * ทุกประการ — **ไม่ตรวจสิทธิ์เอง** รับ `navItems` ที่กรองมาแล้วจาก
 * src/lib/admin-nav.ts::getVisibleAdminNavItems() (server-side, ใช้ permission
 * matrix จริง) เป็น prop เท่านั้น การตรวจสิทธิ์จริงทั้งหมดอยู่ที่ server (layout.tsx
 * เรียก requirePermission() ก่อนแล้วเสมอ) — แก้ prop นี้ฝั่ง client ไม่มีผลต่อสิทธิ์จริง
 * แต่อย่างใด เพราะหน้าเป้าหมายแต่ละหน้า (เมื่อถูกสร้างขึ้นจริงในอนาคต) ต้องตรวจสิทธิ์
 * ซ้ำที่ server ของตัวเองเสมอตาม deny-by-default (dev-rules.md ข้อ 4)
 */
const MODULE_ICONS: Record<Module, React.ComponentType<{ className?: string }>> = {
  REGISTRY: Landmark,
  CURRICULUM: BookOpen,
  QUESTION_BANK: FileQuestion,
  TESTING: ClipboardList,
  MEMBERSHIP: Users,
  ADMIN: Settings,
  IMPORT: Upload,
  FILES: FolderArchive,
  RBAC_CONFIG: ShieldCheck,
};

function SidebarLink({
  href,
  label,
  icon: Icon,
  isActive,
  onNavigate,
}: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  isActive: boolean;
  onNavigate?: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      aria-current={isActive ? "page" : undefined}
      className={cn(
        "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
        isActive
          ? "bg-primary/10 text-primary"
          : "text-muted-foreground hover:bg-muted hover:text-foreground",
      )}
    >
      <Icon className="size-4 shrink-0" />
      <span className="truncate">{label}</span>
    </Link>
  );
}

function SidebarNav({
  navItems,
  pathname,
  onNavigate,
}: {
  navItems: AdminNavItem[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="เมนูผู้ดูแลระบบ" className="flex flex-col gap-1">
      <SidebarLink
        href="/admin"
        label="แดชบอร์ด"
        icon={LayoutDashboard}
        isActive={pathname === "/admin"}
        onNavigate={onNavigate}
      />
      {navItems.map((item) => (
        <SidebarLink
          key={item.module}
          href={item.href}
          label={item.label}
          icon={MODULE_ICONS[item.module]}
          isActive={pathname === item.href}
          onNavigate={onNavigate}
        />
      ))}
    </nav>
  );
}

export function AdminSidebar({
  navItems,
  roleLabel,
}: {
  navItems: AdminNavItem[];
  /** บทบาทของผู้ใช้ปัจจุบัน (แสดงผลเท่านั้น เช่น "SUPER_ADMIN") */
  roleLabel: string;
}) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <>
      {/* Desktop: sidebar คงที่ด้านซ้าย */}
      <aside className="border-border bg-muted/20 hidden w-64 shrink-0 flex-col gap-4 border-r p-4 md:flex">
        <div className="text-muted-foreground px-3 text-xs font-semibold tracking-wide uppercase">
          Admin Console ({roleLabel})
        </div>
        <SidebarNav navItems={navItems} pathname={pathname} />
      </aside>

      {/* มือถือ/แท็บเล็ต: แถบบนสุด + Sheet drawer (pattern เดียวกับ SiteHeader) */}
      <div className="border-border bg-background sticky top-16 z-30 flex items-center justify-between border-b px-4 py-2 md:hidden">
        <span className="text-sm font-semibold">Admin Console</span>
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="เปิดเมนูผู้ดูแลระบบ">
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-3/4 max-w-xs">
            <SheetHeader>
              <SheetTitle>Admin Console ({roleLabel})</SheetTitle>
            </SheetHeader>
            <div className="px-4">
              <SidebarNav
                navItems={navItems}
                pathname={pathname}
                onNavigate={() => setMobileOpen(false)}
              />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}
