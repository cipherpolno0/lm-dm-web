import { CredentialsSignin } from "next-auth";

/**
 * Custom Credentials-provider errors thrown from `authorize()` in `src/auth.ts`.
 *
 * Auth.js v5 `CredentialsSignin.code` is explicitly documented as safe-to-expose
 * (it is designed to reach the client, e.g. via a redirect URL query param) —
 * so `code` must never hint at which of "email" vs "password" was wrong
 * (requirements.md §8 Login spec: generic "อีเมลหรือรหัสผ่านไม่ถูกต้อง" message,
 * no account-enumeration hint). It MAY safely carry a non-identifying detail
 * such as a lockout duration or an account status, since both F5.4 and the
 * Login "Account locked" error state explicitly call for telling the user how
 * long to wait / what their account status is.
 */

export class InvalidCredentialsError extends CredentialsSignin {
  code = "invalid_credentials";
}

export class AccountLockedError extends CredentialsSignin {
  code: string;
  constructor(retryAfterMinutes: number) {
    super();
    this.code = `account_locked:${retryAfterMinutes}`;
  }
}

export class AccountInactiveError extends CredentialsSignin {
  code: string;
  constructor(status: string) {
    super();
    this.code = `account_inactive:${status}`;
  }
}
