import "server-only";
import { query, withTransaction } from "@/lib/db";
import { LOGIN_LOCKOUT_MINUTES, LOGIN_LOCKOUT_THRESHOLD } from "@/lib/auth-config";

/**
 * Login rate-limiting / temporary account lockout.
 *
 * เก็บสถานะใน Postgres table `login_lockouts` (counter + expiry) ตาม
 * architecture.md §3.4 และ ADR-0004 ข้อ 2 (ตัดสินใจไม่ใช้ Redis เพราะไม่มี cache
 * layer ในสถาปัตยกรรมนี้) แถวนี้เป็น operational state ที่ reset ได้ตามปกติ — ไม่ใช่
 * ข้อมูล audit/history ที่ห้าม overwrite (ประวัติจริงเก็บแยกที่ login_audit_logs)
 *
 * Function: ตรวจสอบ/บันทึกความล้มเหลวของการ login เพื่อล็อกบัญชีชั่วคราว
 * Actor: เรียกจากภายใน authorize() ของ Auth.js Credentials provider เท่านั้น
 *        (ไม่ใช่ endpoint สาธารณะ)
 * Process: ดู isLockedOut() / recordFailedAttempt() / resetLockout() ต่อฟังก์ชัน
 * Validation: userId ต้องมีอยู่จริงในตาราง users (FK constraint บังคับที่ DB)
 * Error State: ข้อผิดพลาดจากฐานข้อมูล throw ขึ้นไปให้ authorize() จับและปฏิเสธ
 *              การ login แบบ generic (fail-closed — ไม่ปล่อยให้ login ผ่านเมื่อ
 *              ตรวจสอบ lockout ไม่ได้)
 * Audit: การเปลี่ยนแปลงตัวนับเองไม่ต้อง audit (เป็น operational state) แต่ทุก
 *        ครั้งที่ authorize() เรียกฟังก์ชันเหล่านี้จะตามด้วยการบันทึก
 *        login_audit_logs เสมอ (ดู login-audit.ts)
 * Acceptance Criteria:
 *   AC1: พยายาม login ผิด 5 ครั้งติดต่อกัน (ค่าเริ่มต้นตาม requirements.md §8 AC2)
 *        ทำให้บัญชีถูกล็อกจนกว่าจะครบ LOGIN_LOCKOUT_MINUTES นาที
 *   AC2: login สำเร็จ (รหัสผ่านถูกต้อง) รีเซ็ตตัวนับความล้มเหลวเสมอ แม้บัญชีจะยัง
 *        ไม่ ACTIVE ก็ตาม (พิสูจน์ตัวตนได้แล้ว จึงไม่ใช่การพยายาม brute-force)
 *   AC3: การเพิ่มตัวนับเป็น atomic — สอง request พร้อมกันไม่ทำให้ตัวนับตกหล่น
 */

export interface LockoutState {
  isLocked: boolean;
  lockedUntil: Date | null;
}

export async function getLockoutState(userId: string): Promise<LockoutState> {
  const { rows } = await query<{ lockedUntil: Date | null }>(
    `SELECT "lockedUntil" FROM login_lockouts WHERE "userId" = $1`,
    [userId],
  );
  const lockedUntil = rows[0]?.lockedUntil ?? null;
  const isLocked = lockedUntil !== null && lockedUntil.getTime() > Date.now();
  return { isLocked, lockedUntil: isLocked ? lockedUntil : null };
}

/**
 * Atomically increments the failed-attempt counter for `userId`. If the
 * counter reaches LOGIN_LOCKOUT_THRESHOLD, sets `lockedUntil` LOGIN_LOCKOUT_MINUTES
 * minutes in the future and resets the counter to 0 (a fresh window starts
 * after the lock expires). Runs inside a transaction so the row lock acquired
 * by the initial UPSERT serializes concurrent attempts for the same user.
 */
export async function recordFailedAttempt(userId: string): Promise<LockoutState> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{
      failedAttempts: number;
      lockedUntil: Date | null;
    }>(
      `INSERT INTO login_lockouts ("userId", "failedAttempts", "updatedAt")
       VALUES ($1, 1, now())
       ON CONFLICT ("userId") DO UPDATE
         SET "failedAttempts" = login_lockouts."failedAttempts" + 1,
             "updatedAt" = now()
       RETURNING "failedAttempts", "lockedUntil"`,
      [userId],
    );

    let { failedAttempts, lockedUntil } = rows[0];

    if (failedAttempts >= LOGIN_LOCKOUT_THRESHOLD) {
      lockedUntil = new Date(Date.now() + LOGIN_LOCKOUT_MINUTES * 60_000);
      await client.query(
        `UPDATE login_lockouts
           SET "failedAttempts" = 0, "lockedUntil" = $2, "updatedAt" = now()
         WHERE "userId" = $1`,
        [userId, lockedUntil],
      );
      failedAttempts = 0;
    }

    const isLocked = lockedUntil !== null && lockedUntil.getTime() > Date.now();
    return { isLocked, lockedUntil: isLocked ? lockedUntil : null };
  });
}

export async function resetLockout(userId: string): Promise<void> {
  await query(
    `UPDATE login_lockouts
       SET "failedAttempts" = 0, "lockedUntil" = NULL, "updatedAt" = now()
     WHERE "userId" = $1`,
    [userId],
  );
}
