"use server";

import { AuthError } from "next-auth";
import { signIn, signOut } from "@/auth";

/**
 * ============================================================================
 * Function: Server Action สำหรับฟอร์ม login/logout (ดู prisma/AUTH.md สำหรับ
 * spec ฉบับเต็มของฟังก์ชัน "เข้าสู่ระบบ"/"ออกจากระบบ")
 * ============================================================================
 * ตรรกะการพิสูจน์ตัวตนจริงทั้งหมดอยู่ใน authorize() (src/auth.ts) — ไฟล์นี้ทำ
 * หน้าที่เพียงเรียก signIn()/signOut() ของ Auth.js แล้วแปล error ที่เกิดขึ้นเป็น
 * ข้อความภาษาไทยที่ปลอดภัยสำหรับแสดงต่อผู้ใช้ (ไม่รั่วไหลรายละเอียดที่ช่วย
 * account enumeration ตาม data-policy.md)
 */

export interface LoginFormState {
  error: string | null;
}

const GENERIC_INVALID_CREDENTIALS = "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
const GENERIC_SERVER_ERROR = "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง";

const INACTIVE_STATUS_MESSAGES: Record<string, string> = {
  PENDING_VERIFICATION: "บัญชีนี้ยังไม่ได้ยืนยันอีเมล กรุณาตรวจสอบกล่องอีเมลของท่าน",
  PENDING_APPROVAL: "บัญชีนี้อยู่ระหว่างรอการอนุมัติจากผู้ดูแลระบบ",
  SUSPENDED: "บัญชีนี้ถูกระงับการใช้งาน กรุณาติดต่อผู้ดูแลระบบ",
  REJECTED: "คำขอสมัครสมาชิกของบัญชีนี้ถูกปฏิเสธ กรุณาติดต่อผู้ดูแลระบบ",
};

function messageForAuthErrorCode(code: string): string {
  if (code === "invalid_credentials" || code === "credentials") {
    return GENERIC_INVALID_CREDENTIALS;
  }
  if (code.startsWith("account_locked:")) {
    const minutes = code.split(":")[1] ?? "";
    return `บัญชีนี้ถูกล็อกชั่วคราวเนื่องจากพยายามเข้าสู่ระบบผิดพลาดหลายครั้ง กรุณาลองใหม่อีกครั้งใน ${minutes} นาที`;
  }
  if (code.startsWith("account_inactive:")) {
    const status = code.split(":")[1] ?? "";
    return INACTIVE_STATUS_MESSAGES[status] ?? GENERIC_SERVER_ERROR;
  }
  return GENERIC_INVALID_CREDENTIALS;
}

/**
 * Function: เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน
 * Actor: Guest (ผู้ใช้ที่ยังไม่ login)
 * Input: FormData { email, password }
 * Process: ดู authorize() ใน src/auth.ts — เรียกผ่าน Auth.js signIn()
 * Output: redirect ไป /dashboard เมื่อสำเร็จ (throw ผ่าน Next.js redirect
 *         mechanism ภายใน signIn()); คืน { error } เมื่อไม่สำเร็จ
 * Permission: Guest เท่านั้น (ผู้ที่ login อยู่แล้วถูก proxy.ts redirect ออกจาก
 *             /login ก่อนเห็นฟอร์มนี้ด้วยซ้ำ)
 * Validation: ทำใน authorize() (email/password ต้องไม่ว่าง)
 * Error State: ดู messageForAuthErrorCode — invalid credentials / account
 *              locked / account inactive / server error ล้วนแสดงข้อความ
 *              ภาษาไทยที่ปลอดภัย ไม่รั่วไหลรายละเอียดฝั่ง server
 * Audit: บันทึกใน login_audit_logs จาก authorize() ทุกครั้ง (ไม่ใช่จากไฟล์นี้)
 * Acceptance Criteria:
 *   AC1: กรอกถูกต้อง → redirect ไป /dashboard พร้อม session cookie httpOnly
 *   AC2: กรอกรหัสผ่านผิด → ข้อความ "อีเมลหรือรหัสผ่านไม่ถูกต้อง" เท่านั้น
 *   AC3: ผิดครบ 5 ครั้งติดต่อกัน → ข้อความแจ้งเวลาที่ต้องรอ
 *   AC4: exception อื่นที่ไม่ใช่ AuthError (เช่น database ล่ม) ไม่ทำให้ error
 *        message หลุดรายละเอียด stack trace ออกไปยัง client
 */
export async function loginAction(
  _prevState: LoginFormState,
  formData: FormData,
): Promise<LoginFormState> {
  const email = formData.get("email");
  const password = formData.get("password");

  try {
    await signIn("credentials", {
      email,
      password,
      redirectTo: "/dashboard",
    });
    // ไม่ควรมาถึงจุดนี้ — signIn() สำเร็จจะ throw NEXT_REDIRECT เสมอ
    return { error: null };
  } catch (error) {
    if (error instanceof AuthError) {
      const code = (error as { code?: string }).code ?? error.type;
      return { error: messageForAuthErrorCode(code) };
    }
    // Server error ที่ไม่ใช่ AuthError (เช่น database connection ล้มเหลว) —
    // log รายละเอียดฝั่ง server เท่านั้น ตาม requirements.md §8 Login "Error
    // State" และ dev-rules.md ข้อ 7 (ห้าม leak stack trace ให้ client)
    // ต้อง re-throw ค่าที่เป็น Next.js redirect/notFound digest เสมอ มิฉะนั้น
    // จะทำลาย navigation ปกติของ framework
    if (
      error &&
      typeof error === "object" &&
      "digest" in error &&
      typeof (error as { digest?: unknown }).digest === "string" &&
      (error as { digest: string }).digest.startsWith("NEXT_REDIRECT")
    ) {
      throw error;
    }
    console.error("[loginAction] unexpected error", error);
    return { error: GENERIC_SERVER_ERROR };
  }
}

/**
 * Function: ออกจากระบบ
 * Actor: Member ที่ login อยู่
 * Input: none
 * Process: signOut() ของ Auth.js — ลบ session cookie (JWT strategy: ไม่มี
 *          database session ให้ลบเพิ่ม)
 * Output: redirect ไป /login
 * Permission: ผู้ที่ login อยู่แล้วเท่านั้น (เรียกจากปุ่มใน UI ที่แสดงเฉพาะตอน
 *             login อยู่ — แต่ signOut() เองปลอดภัยแม้เรียกตอนไม่มี session)
 * Validation: none
 * Error State: ไม่มีกรณีที่คาดไว้ — signOut() ล้มเหลวจะ throw ให้ Next.js
 *              จัดการเป็น 500 ตามปกติ
 * Audit: ไม่ได้บันทึก logout ลง login_audit_logs ในงานนี้ (ตาราง/สเปกของ
 *        requirements.md §8 ครอบคลุมเฉพาะเหตุการณ์ login — บันทึกไว้เป็น
 *        ขอบเขตที่ตัดออกอย่างโปร่งใสใน prisma/AUTH.md)
 * Acceptance Criteria:
 *   AC1: หลัง logout, session cookie ถูกลบ และเข้าหน้า protected route ใดๆ
 *        ถูก redirect กลับไป /login
 */
export async function logoutAction(): Promise<void> {
  await signOut({ redirectTo: "/login" });
}
