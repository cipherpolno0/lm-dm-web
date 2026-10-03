/**
 * Formatting helpers ที่ใช้ร่วมกันหลายหน้า (Server + Client Component ได้ทั้งคู่
 * — ไม่มี "server-only" เพราะไม่แตะฐานข้อมูล/secret ใดๆ)
 */

/** วันที่แบบไทย พ.ศ. (เช่น "24 กันยายน 2569") — ใช้แสดงวันที่เผยแพร่ข่าวและที่อื่นๆ
 * ที่ต้องการรูปแบบเดียวกัน ทำให้ทั้งเว็บแสดงวันที่สอดคล้องกัน (ไม่ผูกกับ locale ของ
 * ผู้ใช้ — ระบบนี้เป็นภาษาไทยล้วนตามขอบเขตงานปัจจุบัน) */
export function formatThaiDate(date: Date): string {
  return new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** วันที่ + เวลาแบบไทย พ.ศ. (เช่น "1 ธันวาคม 2569 09:00 น.") — ใช้แสดงเวลาเริ่ม/
 * สิ้นสุดของตารางสอบ (ต่างจาก formatThaiDate ที่ไม่มีเวลา เพราะข่าวไม่จำเป็นต้อง
 * ระบุเวลา แต่ตารางสอบต้องระบุ) */
export function formatThaiDateTime(date: Date): string {
  const formatted = new Intl.DateTimeFormat("th-TH-u-ca-buddhist", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${formatted} น.`;
}

/** ขนาดไฟล์แบบอ่านง่าย (เช่น "1.2 MB") — ใช้ในหน้าห้องสมุด (งาน "สร้างห้องสมุด
 * PDF/Download") คืน null เมื่อไม่ทราบขนาด (fileSize เป็น placeholder — ยังไม่
 * เชื่อมต่อ object storage จริง M8 — ดู src/lib/library.ts) ให้ผู้เรียกตัดสินใจเอง
 * ว่าจะแสดงข้อความแทนที่อย่างไร */
export function formatFileSize(bytes: number | null): string | null {
  if (bytes === null || bytes < 0) return null;
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${exponent === 0 ? value : value.toFixed(1)} ${units[exponent]}`;
}
