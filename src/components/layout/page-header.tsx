import * as React from "react";

import { cn } from "@/lib/utils";
import { Breadcrumbs, type BreadcrumbItem } from "@/components/layout/breadcrumbs";

/**
 * PageHeader — บล็อกหัวหน้าเพจมาตรฐาน (breadcrumbs + title + description +
 * actions) ให้ทุกหน้า list/detail ในอนาคตเรียกใช้ร่วมกันแทนการเขียน heading เอง
 * ทุกครั้ง — ไม่รวม <Container> ในตัวเอง (ผู้เรียกห่อด้วย Container เอง เพื่อให้
 * ใช้ในบริบทที่ไม่ต้องการ container เต็มความกว้างได้ด้วย)
 */
export interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
  className?: string;
}

function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-4 py-6 sm:py-8", className)}>
      {breadcrumbs ? <Breadcrumbs items={breadcrumbs} /> : null}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          {description ? (
            <p className="text-muted-foreground max-w-2xl text-sm sm:text-base">
              {description}
            </p>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}

export { PageHeader };
