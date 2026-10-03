/**
 * แปลง `code` (คอลัมน์ใน programs/education_levels/subjects — เช่น "NAK_THAM",
 * "DS_TRI", "PALI_TRANSLATION") เป็น URL slug อ่านง่าย (เช่น "nak-tham",
 * "ds-tri", "pali-translation") และแปลงกลับ
 *
 * ตัดสินใจไม่เพิ่มคอลัมน์ slug แยกต่างหากใน schema (ซึ่งจะต้องมี migration ใหม่)
 * เพราะ `code` ทุกตัวในทุกตารางที่เกี่ยวข้องเป็น UPPER_SNAKE_CASE ที่ไม่มีอักขระ
 * นอกเหนือ A-Z/0-9/_ อยู่แล้ว (ดู prisma/education-schema.md) — การแปลงคุณสมบัติ
 * (lowercase + แทน "_" ด้วย "-") จึงเป็น bijective 1:1 กับ code เดิมเสมอ ไม่ชนกัน
 * และไม่ต้องแก้ schema/migration ในงานนี้เลย (ตาม dev-rules.md "แก้เฉพาะไฟล์ที่
 * เกี่ยวข้องกับงานนี้")
 */
export function slugifyCode(code: string): string {
  return code.toLowerCase().replace(/_/g, "-");
}

export function codeFromSlug(slug: string): string {
  return slug.toUpperCase().replace(/-/g, "_");
}
