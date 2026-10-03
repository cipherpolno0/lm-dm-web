import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { query } from "@/lib/db";
import { verifyPassword, timingSafeRejection } from "@/lib/password";
import {
  getLockoutState,
  recordFailedAttempt,
  resetLockout,
} from "@/lib/login-security";
import { recordLoginAttempt } from "@/lib/login-audit";
import {
  AccountInactiveError,
  AccountLockedError,
  InvalidCredentialsError,
} from "@/lib/auth-errors";
import { SESSION_MAX_AGE_SECONDS } from "@/lib/auth-config";
import type { UserRole, UserStatus } from "@/lib/domain-types";

/**
 * ============================================================================
 * Function: เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน (Auth.js Credentials provider)
 * ดู prisma/AUTH.md สำหรับ spec ฉบับเต็ม (Actor/Input/Process/Output/Permission/
 * Validation/Error State/Audit/Acceptance Criteria) — คอมเมนต์นี้สรุปเฉพาะจุดที่
 * จำเป็นต่อการอ่านโค้ด
 * ============================================================================
 *
 * สถาปัตยกรรม (ตาม adr/0003-authjs-server-side-authorization.md):
 * - Auth.js รับผิดชอบ "authentication" (พิสูจน์ตัวตน) + session/JWT เท่านั้น
 * - "authorization" (role/scope ต่อ resource) เป็นเลเยอร์แยกต่างหากที่
 *   src/lib/authz.ts ซึ่งทุก Server Action/Route Handler ต้องเรียกเอง — session
 *   ที่นี่เป็นเพียงแหล่งความจริงของ "identity + role ตอน sign-in" ไม่ใช่จุดตรวจ
 *   สิทธิ์สุดท้าย
 * - Session strategy = "jwt" (ไม่มี "database" strategy เพราะไม่มี Prisma
 *   Adapter ให้ใช้ในสภาพแวดล้อมนี้ — ดู src/lib/db.ts)
 */

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email: string;
      name: string;
      role: UserRole;
      status: UserStatus;
    };
  }
  interface User {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    status: UserStatus;
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    role?: UserRole;
    status?: UserStatus;
  }
}

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  passwordHash: string | null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // trustHost: จำเป็นสำหรับรันใน dev/self-hosted ที่ไม่ได้อยู่หลัง Vercel — Next.js
  // จะ validate ค่านี้กับ AUTH_URL/request Host header เอง (data-policy.md ข้อ 8:
  // secret/URL แยกตาม environment)
  trustHost: true,
  session: {
    strategy: "jwt",
    maxAge: SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "อีเมล", type: "email" },
        password: { label: "รหัสผ่าน", type: "password" },
      },
      async authorize(credentials, request) {
        const email =
          typeof credentials?.email === "string"
            ? credentials.email.trim().toLowerCase()
            : "";
        const password =
          typeof credentials?.password === "string" ? credentials.password : "";

        const ipAddress =
          request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          null;
        const userAgent = request.headers.get("user-agent");

        // Validation (requirements.md §8): รูปแบบ input พื้นฐาน — ปฏิเสธแบบ
        // generic ทันทีโดยไม่แตะฐานข้อมูลถ้าข้อมูลไม่ครบ
        if (!email || !password || !email.includes("@")) {
          await recordLoginAttempt({
            emailAttempted: email || "(empty)",
            userId: null,
            success: false,
            failureReason: "INVALID_CREDENTIALS",
            ipAddress,
            userAgent,
          });
          throw new InvalidCredentialsError();
        }

        const { rows } = await query<UserRow>(
          `SELECT id, email, name, role, status, "passwordHash"
             FROM users
            WHERE email = $1 AND "deletedAt" IS NULL`,
          [email],
        );
        const user = rows[0] ?? null;

        // บัญชีไม่มีอยู่จริง หรือยังไม่เคยตั้งรหัสผ่าน (passwordHash เป็น NULL —
        // เช่น รอผูก OAuth ในอนาคต) → ปฏิเสธแบบ generic เหมือนกันทุกกรณี พร้อมรัน
        // bcrypt compare กับ dummy hash เพื่อไม่ให้เวลาตอบสนองบอกใบ้ว่ามีบัญชีจริง
        if (!user || !user.passwordHash) {
          await timingSafeRejection();
          await recordLoginAttempt({
            emailAttempted: email,
            userId: user?.id ?? null,
            success: false,
            failureReason: "INVALID_CREDENTIALS",
            ipAddress,
            userAgent,
          });
          throw new InvalidCredentialsError();
        }

        // ตรวจ lockout ก่อนเทียบรหัสผ่าน — บัญชีที่ถูกล็อกอยู่ไม่ควรได้ลอง
        // รหัสผ่านต่อแม้จะถูกก็ตาม (ป้องกัน brute force ระหว่างช่วงล็อก)
        const lockout = await getLockoutState(user.id);
        if (lockout.isLocked && lockout.lockedUntil) {
          await recordLoginAttempt({
            emailAttempted: email,
            userId: user.id,
            success: false,
            failureReason: "ACCOUNT_LOCKED",
            ipAddress,
            userAgent,
          });
          const minutesLeft = Math.max(
            1,
            Math.ceil((lockout.lockedUntil.getTime() - Date.now()) / 60_000),
          );
          throw new AccountLockedError(minutesLeft);
        }

        const passwordOk = await verifyPassword(password, user.passwordHash);
        if (!passwordOk) {
          const newState = await recordFailedAttempt(user.id);
          await recordLoginAttempt({
            emailAttempted: email,
            userId: user.id,
            success: false,
            failureReason: newState.isLocked
              ? "ACCOUNT_LOCKED"
              : "INVALID_CREDENTIALS",
            ipAddress,
            userAgent,
          });
          if (newState.isLocked && newState.lockedUntil) {
            const minutesLeft = Math.max(
              1,
              Math.ceil((newState.lockedUntil.getTime() - Date.now()) / 60_000),
            );
            throw new AccountLockedError(minutesLeft);
          }
          throw new InvalidCredentialsError();
        }

        // รหัสผ่านถูกต้อง — พิสูจน์ตัวตนได้แล้ว จึงรีเซ็ตตัวนับความล้มเหลวเสมอ
        // ไม่ว่าบัญชีจะ ACTIVE หรือไม่ก็ตาม (ไม่ใช่การพยายาม brute-force อีกต่อไป)
        await resetLockout(user.id);

        // F5.4: บัญชีที่ยังไม่ผ่านทุกขั้นตอน (ยืนยันอีเมล/อนุมัติ) หรือถูกระงับ/
        // ปฏิเสธ ต้องแจ้งสถานะที่ชัดเจน — ต่างจาก "invalid credentials" เพราะ
        // ผู้ใช้พิสูจน์ตัวตนถูกต้องแล้ว ไม่ใช่ความเสี่ยง enumeration
        if (user.status !== "ACTIVE") {
          await recordLoginAttempt({
            emailAttempted: email,
            userId: user.id,
            success: false,
            failureReason: "ACCOUNT_INACTIVE",
            ipAddress,
            userAgent,
          });
          throw new AccountInactiveError(user.status);
        }

        await recordLoginAttempt({
          emailAttempted: email,
          userId: user.id,
          success: true,
          failureReason: null,
          ipAddress,
          userAgent,
        });

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.status = user.status;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.sub) session.user.id = token.sub;
      if (token.role) session.user.role = token.role;
      if (token.status) session.user.status = token.status;
      return session;
    },
  },
});
