import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Separator — hand-rolled แทน @radix-ui/react-separator (ตัดสินใจลด dependency
 * ใหม่ที่ไม่จำเป็น: เส้นแบ่งไม่มี interactive behavior ใดๆ role="separator" ธรรมดา
 * เพียงพอสำหรับ screen reader แล้ว)
 */
function Separator({
  className,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<"div"> & {
  orientation?: "horizontal" | "vertical";
  decorative?: boolean;
}) {
  return (
    <div
      data-slot="separator"
      role={decorative ? "none" : "separator"}
      aria-orientation={decorative ? undefined : orientation}
      className={cn(
        "bg-border shrink-0",
        orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
        className,
      )}
      {...props}
    />
  );
}

export { Separator };
