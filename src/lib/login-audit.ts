import "server-only";
import { query } from "@/lib/db";

export type LoginFailureReason =
  | "INVALID_CREDENTIALS"
  | "ACCOUNT_LOCKED"
  | "ACCOUNT_INACTIVE";

export interface RecordLoginAttemptInput {
  emailAttempted: string;
  userId: string | null;
  success: boolean;
  failureReason: LoginFailureReason | null;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Function: บันทึกทุกครั้งที่มีการพยายาม login (สำเร็จ/ล้มเหลว)
 * Actor: เรียกจากภายใน authorize() ของ Auth.js Credentials provider เท่านั้น
 * Input: ดู RecordLoginAttemptInput
 * Process: INSERT ลง login_audit_logs (append-only — บังคับด้วย DB trigger)
 * Output: none (fire-and-forget จากมุมมองของผู้เรียก แต่ await เพื่อรับประกันว่า
 *         เขียนสำเร็จก่อนตอบ response — ไม่ยอมให้ audit หายแม้ request จะเร็ว)
 * Permission: internal only — ไม่มี endpoint สาธารณะเรียกฟังก์ชันนี้ตรงๆ
 * Validation: emailAttempted required; failureReason ต้องเป็น null เมื่อ success=true
 * Error State: หากเขียน audit ไม่สำเร็จ throw ขึ้นไป — authorize() จะปฏิเสธการ
 *              login แบบ fail-closed (ไม่ยอมให้ login ผ่านโดยไม่มี audit trail
 *              ตาม dev-rules.md ข้อ 6 "เก็บ history/audit สำหรับข้อมูลสำคัญ")
 * Audit: ฟังก์ชันนี้ *คือ* กลไก audit
 * Acceptance Criteria:
 *   AC1: ทุกการ login (สำเร็จ/ล้มเหลว) มี row ใน login_audit_logs พร้อม
 *        timestamp, IP, user-agent ตาม requirements.md §8
 *   AC2: failureReason ไม่เคยถูกส่งกลับไปแสดงที่ client (ใช้ diagnostics ฝั่ง
 *        server เท่านั้น — ดู data-policy.md)
 */
export async function recordLoginAttempt(
  input: RecordLoginAttemptInput,
): Promise<void> {
  await query(
    `INSERT INTO login_audit_logs
       ("emailAttempted", "userId", success, "failureReason", "ipAddress", "userAgent")
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.emailAttempted,
      input.userId,
      input.success,
      input.failureReason,
      input.ipAddress,
      input.userAgent,
    ],
  );
}
