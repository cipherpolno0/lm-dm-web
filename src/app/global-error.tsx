"use client";

/**
 * global-error.tsx — Next.js file convention: จับ error ที่เกิดใน root
 * layout.tsx เอง (เช่น getCurrentUser() ใน layout.tsx throw) — error.tsx ปกติ
 * "ไม่ครอบ" root layout (ตาม node_modules/next/dist/docs/.../error.md: "It does
 * not wrap the layout.js ... above it") จึงต้องมีไฟล์นี้แยกต่างหาก
 *
 * ข้อกำหนดพิเศษจากเอกสาร Next.js 16 (สำคัญเพราะต่างจาก error.tsx ทั่วไป):
 * ต้องมี <html>/<body> ของตัวเอง และ **ไม่ได้รับ global CSS ของแอป** (globals.css
 * ไม่ import ที่นี่) จึงใช้ inline style ล้วนแทน Tailwind class — เกิดขึ้นได้ยากมาก
 * ในทางปฏิบัติ (root layout นี้เรียกแค่ getCurrentUser() ซึ่งมี try/catch โดยนัย
 * ผ่าน Next.js error boundary อยู่แล้ว) แต่ต้องมีไว้ตามหลัก failure mode/recovery
 * (dev-rules.md ข้อ 8 — ทุกจุดที่กระทบผู้ใช้ต้องมี fallback ที่ชัดเจน ไม่ปล่อยเป็น
 * หน้าขาว)
 */
export default function GlobalError({
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="th">
      <body
        style={{
          display: "flex",
          minHeight: "100vh",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: "1rem",
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
          padding: "1.5rem",
          textAlign: "center",
        }}
      >
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600 }}>
          ระบบขัดข้องชั่วคราว
        </h1>
        <p style={{ color: "#666", maxWidth: "28rem" }}>
          กรุณาลองใหม่อีกครั้ง หากยังพบปัญหาซ้ำ กรุณาแจ้งผู้ดูแลระบบ
        </p>
        <button
          type="button"
          onClick={retry}
          style={{
            border: "1px solid #ccc",
            borderRadius: "0.375rem",
            padding: "0.5rem 1rem",
            background: "white",
            cursor: "pointer",
          }}
        >
          ลองใหม่อีกครั้ง
        </button>
      </body>
    </html>
  );
}
