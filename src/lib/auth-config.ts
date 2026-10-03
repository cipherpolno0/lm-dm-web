import "server-only";

/**
 * Auth/session tunables — read from env at request time (not baked in at
 * build time) so they can be overridden per-environment and by tests without
 * a rebuild.
 *
 * ค่าเหล่านี้ตาม user-flows.md F6.5 ควรเป็น Super-Admin-configurable ผ่านหน้า
 * "ตั้งค่าระบบ" ในอนาคต (นอกขอบเขตงานนี้ — ผลลัพธ์ที่ต้องส่งของงานนี้คือ
 * "auth config, login/logout" เท่านั้น ไม่รวม admin settings UI) ตอนนี้จึงเป็น
 * ค่าคงที่ที่อ่านจาก environment variable พร้อม default ที่สมเหตุสมผล เพื่อให้
 * เปลี่ยนได้โดยไม่ต้องแก้โค้ด และเป็นจุดเชื่อมต่อที่ชัดเจนสำหรับงาน F6.5 ในอนาคต
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/**
 * dev-rules.md §10: session timeout ถูกเลื่อนการตัดสินใจมาที่เฟสนี้โดยตั้งใจ
 * ("ตั้งค่า session timeout ตามนโยบายความปลอดภัยที่จะกำหนดใน P2") — เลือก 8
 * ชั่วโมง (1 วันทำการของเจ้าหน้าที่สำนักงาน) เป็นค่าเริ่มต้น, บันทึกเป็นการ
 * ตัดสินใจเชิงวิศวกรรมที่ชัดเจนใน prisma/AUTH.md
 */
export const SESSION_MAX_AGE_SECONDS = envInt(
  "AUTH_SESSION_MAX_AGE_SECONDS",
  8 * 60 * 60,
);

/**
 * requirements.md §8 (Login spec) AC2: "ผู้ใช้ที่กรอกรหัสผ่านผิด 5 ครั้งติดต่อกัน
 * ถูกล็อกบัญชีชั่วคราวตามนโยบาย" — จำนวนครั้งกำหนดไว้ชัดเจนแล้ว (5)
 */
export const LOGIN_LOCKOUT_THRESHOLD = envInt(
  "AUTH_LOGIN_LOCKOUT_THRESHOLD",
  5,
);

/**
 * ระยะเวลาการล็อกไม่ได้ถูกกำหนดไว้ในเอกสารโครงการ (architecture.md §3.4,
 * ADR-0004 และ user-flows.md F5.1/F6.5 ระบุเพียงกลไก ไม่ได้ระบุตัวเลข) — เลือก
 * 15 นาทีเป็นค่าเริ่มต้นที่สมเหตุสมผล บันทึกเป็นการตัดสินใจเชิงวิศวกรรมที่ชัดเจน
 */
export const LOGIN_LOCKOUT_MINUTES = envInt("AUTH_LOGIN_LOCKOUT_MINUTES", 15);
