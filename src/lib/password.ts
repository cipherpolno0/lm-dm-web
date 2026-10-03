import "server-only";
import bcrypt from "bcryptjs";

/**
 * Password hashing — bcryptjs (pure JS implementation).
 *
 * เหตุผลที่เลือก bcryptjs แทน `bcrypt` (native binding) หรือ `argon2`: ทั้งสอง
 * ต้อง compile native addon ซึ่งมีความเสี่ยงในสภาพแวดล้อม sandbox นี้ (เช่นเดียว
 * กับที่ Prisma engine ถูกบล็อกเพราะต้องดาวน์โหลด/รัน native binary) bcryptjs
 * ช้ากว่า native bcrypt เล็กน้อยแต่ทำงานได้แน่นอนข้าม platform — เป็นการตัดสินใจ
 * เชิงวิศวกรรมที่บันทึกไว้อย่างโปร่งใส (ดู prisma/AUTH.md หัวข้อ "การตัดสินใจ")
 */

const SALT_ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, SALT_ROUNDS);
}

export async function verifyPassword(
  plain: string,
  hash: string,
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * A fixed, valid bcrypt hash of a value nobody will ever type as a real
 * password, used to run a "dummy" compare when no user/password_hash row
 * exists. This keeps authorize()'s response time close to constant whether
 * the email exists or not, so response-time is not a side channel that helps
 * an attacker enumerate valid accounts (data-policy.md: ห้าม leak ข้อมูลที่ช่วย
 * account enumeration).
 */
const DUMMY_HASH =
  "$2a$12$C6UzMDM.H6dfI/f/IKcEeOgxlAWJcQhpddYIkK0Jw6qKZULhLBpp2";

export async function timingSafeRejection(): Promise<false> {
  await bcrypt.compare("__no_such_password__", DUMMY_HASH);
  return false;
}
