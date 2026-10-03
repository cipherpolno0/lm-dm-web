import * as React from "react";
import { Inbox } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * EmptyState — ใช้เมื่อ query สำเร็จแต่ไม่มีข้อมูล (เช่น F1.1 "ยังไม่มีประกาศ",
 * F2.2 "ไม่มีรอบสอบตรงเงื่อนไข") — ต่างจาก ErrorState ที่ใช้เมื่อ query ล้มเหลว
 */
export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-dashed px-6 py-12 text-center",
        className,
      )}
    >
      <div className="text-muted-foreground" aria-hidden="true">
        {icon ?? <Inbox className="size-10" />}
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-foreground text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground text-sm">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

export { EmptyState };
