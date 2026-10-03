import * as React from "react";
import { ChevronDown } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Select — ตัดสินใจเชิงออกแบบ (บันทึกไว้ใน prisma/design-system.md หัวข้อ
 * "ขอบเขตที่ตัดออก"): ใช้ native <select> ห่อด้วยสไตล์ที่ตรงกับ Input/Textarea
 * แทน Radix Select (custom listbox) เพื่อลด dependency ใหม่ในงานนี้ — ยังไม่มี
 * requirement ที่ต้องการ custom option (icon/multi-column) ในหน้าจอปัจจุบัน
 * native <select> ยังคง accessible ครบ (คีย์บอร์ด, screen reader) โดยไม่ต้องเขียน
 * ARIA listbox เอง — หากอนาคตต้องการ custom listbox ให้ติดตั้ง
 * @radix-ui/react-select แล้วแทนที่ไฟล์นี้
 */
function Select({
  className,
  children,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <div className="relative">
      <select
        data-slot="select"
        className={cn(
          "border-input text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 aria-invalid:ring-destructive/20 aria-invalid:border-destructive dark:bg-input/30 flex h-9 w-full appearance-none rounded-md border bg-transparent px-3 py-1 pr-8 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        aria-hidden="true"
        className="text-muted-foreground pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2"
      />
    </div>
  );
}

export { Select };
