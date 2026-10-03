import * as React from "react";
import { useId } from "react";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

/**
 * FormField — โครง label + control + description/error ที่ใช้ร่วมกันได้กับ
 * Input/Textarea/Select/Checkbox ใดๆ ผ่าน render-prop `children(fieldProps)`
 * เพื่อให้ผูก `id`/`aria-describedby`/`aria-invalid` ให้ control อัตโนมัติ
 *
 * ตัดสินใจเชิงออกแบบ (ดู prisma/design-system.md หัวข้อ "ขอบเขตที่ตัดออก"):
 * งานนี้ยังไม่ผูก react-hook-form/zod เพราะยังไม่มีฟอร์มจริงที่ submit ข้อมูล
 * (สมัครสมาชิก/แก้ไขทะเบียน ฯลฯ เป็นงานเฟสถัดไปตาม user-flows.md F5.1) —
 * component นี้เป็นโครง presentation ล้วนๆ ที่ฟอร์มจริงในอนาคตจะห่อด้วย
 * react-hook-form's <Controller>/register() ได้โดยไม่ต้องเปลี่ยนโครงสร้าง UI
 */
export interface FormFieldProps {
  label: string;
  htmlFor?: string;
  description?: string;
  error?: string;
  required?: boolean;
  className?: string;
  children: (fieldProps: {
    id: string;
    "aria-describedby"?: string;
    "aria-invalid"?: boolean;
  }) => React.ReactNode;
}

function FormField({
  label,
  htmlFor,
  description,
  error,
  required,
  className,
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const id = htmlFor ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className={cn("grid gap-1.5", className)}>
      <Label htmlFor={id}>
        {label}
        {required ? (
          <span aria-hidden="true" className="text-destructive">
            *
          </span>
        ) : null}
      </Label>
      {children({
        id,
        "aria-describedby": describedBy,
        "aria-invalid": !!error,
      })}
      {description ? (
        <p id={descriptionId} className="text-muted-foreground text-sm">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { FormField };
