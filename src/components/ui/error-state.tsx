import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * ErrorState — UI ส่วนกลางสำหรับ "query/operation ล้มเหลว" ใช้ทั้งใน
 * app/error.tsx (route-level error boundary) และใน section ย่อยที่โหลดข้อมูล
 * ล้มเหลว (เช่น การ์ดในหน้า dashboard) — ตาม dev-rules.md ข้อ 7:
 * "ห้ามอ้างว่าทดสอบผ่านหากยังไม่ได้รันจริง" ไม่เกี่ยวกับ UI นี้โดยตรง แต่ข้อ
 * เดียวกันของ data-policy.md ("ไม่แสดง stack trace/รายละเอียดภายในต่อผู้ใช้")
 * บังคับให้ props `description` ต้องเป็นข้อความทั่วไปเสมอ — ห้ามส่ง
 * error.message ของ server error ตรงๆ เข้ามาแสดง
 */
export interface ErrorStateProps {
  title?: string;
  description?: string;
  digest?: string;
  retryLabel?: string;
  onRetry?: () => void;
  className?: string;
}

function ErrorState({
  title = "เกิดข้อผิดพลาด",
  description = "ไม่สามารถโหลดข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้ง",
  digest,
  retryLabel = "ลองใหม่อีกครั้ง",
  onRetry,
  className,
}: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-12 text-center",
        className,
      )}
    >
      <AlertTriangle className="text-destructive size-10" aria-hidden="true" />
      <div className="flex flex-col gap-1">
        <p className="text-foreground text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-sm">{description}</p>
        {digest ? (
          <p className="text-muted-foreground/70 text-xs">
            รหัสอ้างอิง: {digest}
          </p>
        ) : null}
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="border-input hover:bg-accent hover:text-accent-foreground inline-flex h-9 items-center justify-center rounded-md border bg-background px-4 text-sm font-medium shadow-xs transition-colors"
        >
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export { ErrorState };
