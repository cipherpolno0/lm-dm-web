#!/usr/bin/env node
/**
 * test-auth-session-expiry.mjs — real JWT-expiry test.
 *
 * Requires the dev server to be started with a very short
 * AUTH_SESSION_MAX_AGE_SECONDS (e.g. `AUTH_SESSION_MAX_AGE_SECONDS=3 npm run dev`)
 * so the test can wait past the real expiry without an artificially long test
 * run. This is a separate script from test-auth-login.mjs because it needs a
 * non-default server configuration and includes a real `setTimeout` wait.
 */
import { MOCK_USER_PASSWORD } from "./seed-constants.mjs";

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

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

/**
 * A cookie jar that — unlike a naive "just remember name=value" map — respects
 * the `Expires`/`Max-Age` attribute the way a real browser (or curl's `-c`
 * jar) does. This matters a great deal for this specific test: Auth.js v5
 * re-issues (rotates) the session cookie with a fresh `Expires` on every
 * `/api/auth/session` read, so a jar that ignores expiry would keep resending
 * an actually-stale cookie forever and never observe real expiration — the
 * expiry is enforced client-side (the browser simply stops sending an
 * expired cookie), not by the server rejecting a presented-but-expired token.
 */
class Jar {
  constructor() {
    this.cookies = new Map(); // name -> { value, expiresAt: number|null }
  }
  capture(res) {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const parts = raw.split(";").map((p) => p.trim());
      const [nameValue, ...attrs] = parts;
      const idx = nameValue.indexOf("=");
      const name = nameValue.slice(0, idx);
      const value = nameValue.slice(idx + 1);
      let expiresAt = null;
      for (const attr of attrs) {
        const [attrName, attrValue] = attr.split("=");
        if (attrName.toLowerCase() === "expires" && attrValue) {
          expiresAt = new Date(attrValue).getTime();
        }
        if (attrName.toLowerCase() === "max-age" && attrValue) {
          expiresAt = Date.now() + Number(attrValue) * 1000;
        }
      }
      this.cookies.set(name, { value, expiresAt });
    }
  }
  header() {
    const now = Date.now();
    return [...this.cookies.entries()]
      .filter(([, c]) => c.expiresAt === null || c.expiresAt > now)
      .map(([k, c]) => `${k}=${c.value}`)
      .join("; ");
  }
}

async function getCsrfToken(jar) {
  const res = await fetch(`${BASE_URL}/api/auth/csrf`, { headers: { cookie: jar.header() } });
  jar.capture(res);
  return (await res.json()).csrfToken;
}

async function login(jar, email, password) {
  const csrfToken = await getCsrfToken(jar);
  const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header() },
    body: new URLSearchParams({ email, password, csrfToken, json: "true" }),
  });
  jar.capture(res);
}

async function getSession(jar) {
  const res = await fetch(`${BASE_URL}/api/auth/session`, { headers: { cookie: jar.header() } });
  return res.json();
}

async function main() {
  console.log("Running real JWT-expiry test (server must run with AUTH_SESSION_MAX_AGE_SECONDS=3)");
  console.log();

  const jar = new Jar();
  console.log("  t=", new Date().toISOString(), "logging in");
  await login(jar, "mock.central.officer@sangha-system.invalid", MOCK_USER_PASSWORD);

  const immediately = await getSession(jar);
  console.log("  t=", new Date().toISOString(), "immediately:", JSON.stringify(immediately));
  assert(!!immediately?.user, "session is valid immediately after login");

  console.log("  ... waiting 8s for the 3s session to actually expire ...");
  await new Promise((resolve) => setTimeout(resolve, 8000));

  const afterExpiry = await getSession(jar);
  console.log("  t=", new Date().toISOString(), "afterExpiry:", JSON.stringify(afterExpiry));
  assert(
    afterExpiry === null || !afterExpiry?.user,
    `session() returns no user once the JWT's real maxAge has elapsed (got: ${JSON.stringify(afterExpiry)})`,
  );

  console.log();
  console.log(`${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exitCode = 1;
});
