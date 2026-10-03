import * as React from "react";
import Link from "next/link";

import { Container } from "@/components/layout/container";
import { Separator } from "@/components/ui/separator";
import { FOOTER_LINK_GROUPS } from "@/components/layout/nav-config";

/**
 * SiteFooter — Server Component ล้วนๆ (ไม่มี interactivity) เนื้อหาเป็นข้อความ
 * สมมติ/placeholder เท่านั้น (dev-rules.md ข้อ 1-2: ห้ามข้อมูลบุคคล/หน่วยงานจริง
 * ในเฟสนี้) — ที่อยู่/เบอร์ติดต่อจริงต้องรอ Owner ยืนยันก่อนใส่ (ดู sitemap.md ข้อ 3
 * แถว /contact)
 */
export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-border bg-muted/30 border-t">
      <Container className="flex flex-col gap-8 py-10">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <span className="text-foreground text-sm font-semibold">
              ระบบฐานข้อมูลคณะสงฆ์และการศึกษาพระปริยัติธรรม
            </span>
            <p className="text-muted-foreground text-sm">
              นักธรรม / ธรรมศึกษา / บาลี — คลังข้อสอบ, แบบทดสอบ, ระบบสมาชิก
            </p>
          </div>
          {FOOTER_LINK_GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-2">
              <span className="text-foreground text-sm font-semibold">
                {group.title}
              </span>
              <ul className="flex flex-col gap-1.5">
                {group.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="text-muted-foreground hover:text-foreground text-sm"
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <Separator />
        <p className="text-muted-foreground text-xs">
          © {year} ระบบฐานข้อมูลคณะสงฆ์และการศึกษาพระปริยัติธรรม — เนื้อหาในเว็บไซต์นี้เป็นข้อมูลสมมติในระหว่างพัฒนา (P4)
        </p>
      </Container>
    </footer>
  );
}
