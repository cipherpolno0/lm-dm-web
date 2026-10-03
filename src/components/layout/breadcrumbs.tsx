import * as React from "react";
import Link from "next/link";
import { ChevronRight, Home } from "lucide-react";

import { cn } from "@/lib/utils";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/**
 * Breadcrumbs — <nav aria-label="breadcrumb"> ตาม WAI-ARIA breadcrumb pattern
 * รายการสุดท้ายไม่ใช่ลิงก์และมี aria-current="page" เสมอ
 *
 * ป้องกัน horizontal overflow ที่ 375px เมื่อ trail ยาว (เช่น หน้าแรก > หลักสูตร
 * > นักธรรม > ชั้นตรี) ด้วย overflow-x-auto + whitespace-nowrap ภายในตัวเอง แทน
 * การดันความกว้างทั้งหน้า
 */
function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  return (
    <nav
      aria-label="breadcrumb"
      className={cn("overflow-x-auto", className)}
    >
      <ol className="flex w-max items-center gap-1.5 text-sm whitespace-nowrap text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <Link
            href="/"
            className="flex items-center gap-1 hover:text-foreground"
          >
            <Home className="size-3.5" aria-hidden="true" />
            <span className="sr-only">หน้าแรก</span>
          </Link>
          {items.length > 0 && (
            <ChevronRight className="size-3.5" aria-hidden="true" />
          )}
        </li>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1.5">
              {item.href && !isLast ? (
                <Link href={item.href} className="hover:text-foreground">
                  {item.label}
                </Link>
              ) : (
                <span
                  className="text-foreground font-medium"
                  aria-current={isLast ? "page" : undefined}
                >
                  {item.label}
                </span>
              )}
              {!isLast && <ChevronRight className="size-3.5" aria-hidden="true" />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { Breadcrumbs };
