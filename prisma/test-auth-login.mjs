#!/usr/bin/env node
/**
 * test-auth-login.mjs — real, end-to-end tests against a RUNNING `next dev`
 * server (http://localhost:3000) and the real local PostgreSQL database.
 *
 * This is NOT a unit test with mocks: it drives the actual Auth.js
 * Credentials flow over HTTP (CSRF token -> callback -> session cookie),
 * exactly like a browser would, and inspects real database state (lockout
 * counters, login_audit_logs rows) to verify server-side behavior.
 *
 * Prerequisites: `npm run dev` running on :3000, database migrated + seeded
 * (`node prisma/dev-migrate-verify.mjs && npm run db:seed`).
 *
 * Usage: node prisma/test-auth-login.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import pg from "pg";
import { MOCK_USER_PASSWORD } from "./seed-constants.mjs";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const content = readFileSync(path.join(process.cwd(), ".env.local"), "utf8");
  for (const line of content.split("\n")) {
    const m = line.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?\s*$/);
    if (m) return m[1];
  }
  throw new Error("DATABASE_URL not found");
}

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) {
    passed++;
    console.log(`  [PASSED] ${label}`);
  } else {
    failed++;
    console.log(`  [FAILED] ${label}`);
  }
}

// --- tiny cookie jar -------------------------------------------------------
class Jar {
  constructor() {
    this.cookies = new Map();
  }
  capture(res) {
    const setCookies = res.headers.getSetCookie?.() ?? [];
    for (const raw of setCookies) {
      const [pair] = raw.split(";");
      const idx = pair.indexOf("=");
      const name = pair.slice(0, idx);
      const value = pair.slice(idx + 1);
      this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function getCsrfToken(jar) {
  const res = await fetch(`${BASE_URL}/api/auth/csrf`, { headers: { cookie: jar.header() } });
  jar.capture(res);
  const body = await res.json();
  return body.csrfToken;
}

/**
 * Attempt a credentials sign-in exactly like the Auth.js client would.
 *
 * Auth.js v5's /api/auth/callback/credentials endpoint always responds with a
 * real HTTP redirect (never a JSON body, regardless of the legacy `json=true`
 * param) — on success, `Location` is the callbackUrl; on failure, it is
 * `/login?error=CredentialsSignin&code=<our custom code>`. We captured this
 * with `curl -i` against the real running dev server before writing this
 * assertion, so the shape below reflects actually-observed behavior, not a
 * guess from documentation.
 */
async function attemptLogin(jar, email, password) {
  const csrfToken = await getCsrfToken(jar);
  const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: jar.header(),
    },
    body: new URLSearchParams({ email, password, csrfToken, json: "true" }),
  });
  jar.capture(res);
  const location = res.headers.get("location") ?? "";
  return { status: res.status, location };
}

async function getSession(jar) {
  const res = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { cookie: jar.header() },
  });
  jar.capture(res);
  return res.json();
}

async function getDashboard(jar) {
  const res = await fetch(`${BASE_URL}/dashboard`, {
    headers: { cookie: jar.header() },
    redirect: "manual",
  });
  return res;
}

async function main() {
  const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });

  console.log("Running Auth.js login/logout/session tests against", BASE_URL);
  console.log();

  // -------------------------------------------------------------------
  // 1. Successful login (ACTIVE account, correct password)
  // -------------------------------------------------------------------
  {
    const jar = new Jar();
    const email = "mock.super.admin@sangha-system.invalid";
    const { location } = await attemptLogin(jar, email, MOCK_USER_PASSWORD);
    assert(location && !location.includes("error="), "correct credentials: no error in the redirect location");

    const session = await getSession(jar);
    assert(session?.user?.email === email, "session() returns the logged-in user's email");
    assert(session?.user?.role === "SUPER_ADMIN", "session() carries the correct role");
    assert(jar.cookies.has("authjs.session-token") || [...jar.cookies.keys()].some((k) => k.includes("session-token")), "a session-token cookie was set");

    const dash = await getDashboard(jar);
    assert(dash.status === 200, "GET /dashboard with valid session returns 200 (not a redirect)");

    const { rows } = await pool.query(
      `SELECT success, "failureReason" FROM login_audit_logs WHERE "emailAttempted" = $1 ORDER BY "createdAt" DESC LIMIT 1`,
      [email],
    );
    assert(rows[0]?.success === true, "successful login recorded in login_audit_logs (success=true)");
  }

  // -------------------------------------------------------------------
  // 2. Wrong password -> generic error, no enumeration hint
  // -------------------------------------------------------------------
  {
    const jar = new Jar();
    const email = "mock.teacher@sangha-system.invalid";
    const { location } = await attemptLogin(jar, email, "definitely-wrong-password");
    assert(location.includes("error=CredentialsSignin"), "wrong password: CredentialsSignin error surfaced");
    assert(location.includes("code=invalid_credentials"), "wrong password: error code is the generic invalid_credentials (no field-specific hint)");

    const session = await getSession(jar);
    assert(!session?.user, "no session created after failed login");
  }

  // -------------------------------------------------------------------
  // 2b. Unknown email -> same generic error (no enumeration)
  // -------------------------------------------------------------------
  {
    const jar = new Jar();
    const { location } = await attemptLogin(jar, "no.such.user@sangha-system.invalid", "whatever12345");
    assert(location.includes("code=invalid_credentials"), "unknown email: same generic invalid_credentials code as wrong-password case");
  }

  // -------------------------------------------------------------------
  // 3. Account lockout after 5 consecutive failures (requirements.md AC2)
  // -------------------------------------------------------------------
  {
    const email = "mock.examiner@sangha-system.invalid";
    // ensure a clean slate for this account's lockout counter
    await pool.query(
      `DELETE FROM login_lockouts WHERE "userId" = (SELECT id FROM users WHERE email = $1)`,
      [email],
    );

    let lastLocation = "";
    for (let i = 0; i < 5; i++) {
      const jar = new Jar();
      const { location } = await attemptLogin(jar, email, "wrong-password-" + i);
      lastLocation = location;
    }
    assert(
      lastLocation.includes("code=account_locked"),
      "5th consecutive wrong password locks the account (code=account_locked:<minutes>)",
    );

    // Even the CORRECT password is now rejected while locked
    const jar2 = new Jar();
    const { location: locationWithCorrectPw } = await attemptLogin(jar2, email, MOCK_USER_PASSWORD);
    assert(
      locationWithCorrectPw.includes("code=account_locked"),
      "correct password is still rejected while account is locked",
    );

    const { rows } = await pool.query(
      `SELECT "failedAttempts", "lockedUntil" FROM login_lockouts WHERE "userId" = (SELECT id FROM users WHERE email = $1)`,
      [email],
    );
    assert(rows[0]?.lockedUntil !== null, "login_lockouts row has a non-null lockedUntil");
    assert(rows[0]?.failedAttempts === 0, "failedAttempts counter reset to 0 once locked (fresh window after expiry)");

    // Manually expire the lock (simulate time passing) and confirm correct
    // password now works again — proves the lock is time-bounded, not permanent
    await pool.query(
      `UPDATE login_lockouts SET "lockedUntil" = now() - interval '1 minute' WHERE "userId" = (SELECT id FROM users WHERE email = $1)`,
      [email],
    );
    const jar3 = new Jar();
    const { location: afterExpiry } = await attemptLogin(jar3, email, MOCK_USER_PASSWORD);
    assert(
      afterExpiry && !afterExpiry.includes("error="),
      "after the lock's expiry timestamp passes, correct password logs in successfully again",
    );
  }

  // -------------------------------------------------------------------
  // 4. Inactive-status account (PENDING_APPROVAL) — F5.4
  // -------------------------------------------------------------------
  {
    const jar = new Jar();
    const email = "mock.registrar.staff@sangha-system.invalid";
    const { location } = await attemptLogin(jar, email, MOCK_USER_PASSWORD);
    assert(
      location.includes("code=account_inactive%3APENDING_APPROVAL") ||
        location.includes("code=account_inactive:PENDING_APPROVAL"),
      "correct password but PENDING_APPROVAL status -> account_inactive:PENDING_APPROVAL (distinct from invalid_credentials)",
    );
    const session = await getSession(jar);
    assert(!session?.user, "no session created for a correctly-authenticated-but-inactive account");
  }

  // -------------------------------------------------------------------
  // 5. Unauthenticated access to a protected route redirects to /login
  // -------------------------------------------------------------------
  {
    const jar = new Jar();
    const res = await getDashboard(jar);
    assert(
      res.status === 307 || res.status === 302,
      "GET /dashboard with no session cookie at all returns a redirect",
    );
    assert(
      (res.headers.get("location") ?? "").includes("/login"),
      "the redirect target is /login (proxy.ts optimistic check)",
    );
  }

  // -------------------------------------------------------------------
  // 6. Logout clears the session
  // -------------------------------------------------------------------
  {
    const jar = new Jar();
    await attemptLogin(jar, "mock.student@sangha-system.invalid", MOCK_USER_PASSWORD);
    let session = await getSession(jar);
    assert(!!session?.user, "logged in before testing logout");

    const csrfToken = await getCsrfToken(jar);
    const res = await fetch(`${BASE_URL}/api/auth/signout`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header() },
      body: new URLSearchParams({ csrfToken }),
    });
    jar.capture(res);

    session = await getSession(jar);
    assert(!session?.user, "session cleared after /api/auth/signout");

    const dash = await getDashboard(jar);
    assert(dash.status === 307 || dash.status === 302, "protected route no longer reachable after logout");
  }

  // -------------------------------------------------------------------
  // 7. Secure (DB-backed) authorization check: a session for a user whose
  //    status changes to SUSPENDED mid-session is rejected immediately —
  //    even though the JWT itself has not expired. This is the "expired/
  //    invalid session" behavior required by this task's verification
  //    criteria (requireUser()/getCurrentUser() in src/lib/authz.ts).
  // -------------------------------------------------------------------
  {
    const jar = new Jar();
    const email = "mock.auditor@sangha-system.invalid";
    await attemptLogin(jar, email, MOCK_USER_PASSWORD);
    let dash = await getDashboard(jar);
    assert(dash.status === 200, "auditor session works normally before suspension");

    await pool.query(`UPDATE users SET status = 'SUSPENDED', "updatedAt" = now() WHERE email = $1`, [email]);

    dash = await getDashboard(jar);
    assert(
      dash.status === 307 || dash.status === 302,
      "same still-valid JWT is rejected by /dashboard once the account is SUSPENDED in the database (secure check, not just cookie presence)",
    );

    // restore for cleanliness / re-runnability
    await pool.query(`UPDATE users SET status = 'ACTIVE', "updatedAt" = now() WHERE email = $1`, [email]);
  }

  await pool.end();

  console.log();
  console.log(`${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exitCode = 1;
});
