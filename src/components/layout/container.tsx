import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * Container — max-width + horizontal padding มาตรฐานของทั้งเว็บ จุดเดียวที่
 * ควบคุมกว้างสุดของเนื้อหา (max-w-6xl) และ padding ข้าง (px-4 มือถือ → px-8
 * เดสก์ท็อป) เป็นกลไกหลักที่ทำให้ผ่านเกณฑ์ตรวจสอบ "375/768/1024/1440 ไม่มี
 * horizontal overflow" — ทุก section เต็มความกว้างของหน้า (header/footer
 * background) ให้ห่อเนื้อหาไว้ใน <Container> เสมอ ไม่กำหนด max-width/padding
 * เองซ้ำในแต่ละหน้า
 */
function Container({
  className,
  as: Comp = "div",
  ...props
}: React.ComponentProps<"div"> & { as?: React.ElementType }) {
  return (
    <Comp
      data-slot="container"
      className={cn("mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8", className)}
      {...props}
    />
  );
}

export { Container };
