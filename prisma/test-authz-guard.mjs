#!/usr/bin/env node
/**
 * test-authz-guard.mjs — real, end-to-end IDOR + privilege-escalation tests for
 * the "สร้าง Authorization Guard ฝั่ง Server" task (Phase P3 Authentication & RBAC).
 *
 * Drives the actual running `next dev` server (http://localhost:3000) over HTTP,
 * exactly like test-auth-login.mjs / test-rbac-scope.mjs — this exercises the real
 * src/lib/guard.ts (guardRoute/authorizeOwnedRow) through three new protected
 * endpoints:
 *   - GET /api/persons/[id]            — OWN_RECORD scope, classic IDOR target
 *   - GET /api/question-versions/[id]  — RESPONSIBLE_RECORD scope (authorship OR program)
 *   - POST/DELETE /api/admin/organization-scopes[/id] — privilege-escalation target
 *     (Super-Admin-only M9 RBAC config, now reachable over plain HTTP)
 *
 * Prerequisites: `npm run dev` running on :3000, database migrated + seeded
 * (`node prisma/dev-migrate-verify.mjs && npm run db:seed`).
 *
 * Usage: node prisma/test-authz-guard.mjs
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

class Jar {
  constructor() {
    this.cookies = new Map();
  }
  capture(res) {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const idx = pair.indexOf("=");
      this.cookies.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function getCsrfToken(jar) {
  const res = await fetch(`${BASE_URL}/api/auth/csrf`, { headers: { cookie: jar.header() } });
  jar.capture(res);
  return (await res.json()).csrfToken;
}

async function loginAs(email) {
  const jar = new Jar();
  const csrfToken = await getCsrfToken(jar);
  const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header() },
    body: new URLSearchParams({ email, password: MOCK_USER_PASSWORD, csrfToken, json: "true" }),
  });
  jar.capture(res);
  const location = res.headers.get("location") ?? "";
  if (location.includes("error=")) {
    throw new Error(`loginAs(${email}) failed: redirected to ${location}`);
  }
  return jar;
}

async function get(jar, path) {
  const res = await fetch(`${BASE_URL}${path}`, { headers: { cookie: jar?.header() ?? "" } });
  return { status: res.status };
}
async function post(jar, path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: jar?.header() ?? "" },
    body: JSON.stringify(body),
  });
  const json = res.status !== 204 ? await res.json().catch(() => null) : null;
  return { status: res.status, json };
}
async function del(jar, path) {
  const res = await fetch(`${BASE_URL}${path}`, { method: "DELETE", headers: { cookie: jar?.header() ?? "" } });
  return { status: res.status };
}

const ORG = { province1: "seed_org_province_1", region1: "seed_org_region_1", district1: "seed_org_district_1" };
const PERSON = { student: "seed_person_05", temple1Abbot: "seed_person_01", regionChief: "seed_person_10" };
const QV = {
  ownAuthored: "seed_qv_vinaya_001_v1",
  nakthamOther: "seed_qv_naktham_other_author_v1",
  dhammastudiesOther: "seed_qv_ds_other_author_v1",
};

async function main() {
  const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });

  console.log("=== Part 1: IDOR — GET /api/persons/[id] (OWN_RECORD + OWN_ORG_SUBTREE) ===\n");
  {
    const { status } = await get(null, `/api/persons/${PERSON.student}`);
    assert(status === 401, "no session -> 401");
  }
  {
    const jar = await loginAs("mock.student@sangha-system.invalid");
    const own = await get(jar, `/api/persons/${PERSON.student}`);
    assert(own.status === 200, "STUDENT: 200 for their own linked Person record");

    const other = await get(jar, `/api/persons/${PERSON.temple1Abbot}`);
    assert(other.status === 404, "STUDENT: 404 (IDOR-safe) for a DIFFERENT person's record, guessed by id");

    const unknown = await get(jar, `/api/persons/does-not-exist`);
    assert(unknown.status === 404, "STUDENT: 404 for a genuinely nonexistent id — identical response to 'not yours'");
  }
  {
    const jar = await loginAs("mock.super.admin@sangha-system.invalid");
    const { status } = await get(jar, `/api/persons/${PERSON.temple1Abbot}`);
    assert(status === 200, "SUPER_ADMIN: 200 for any Person record (REGISTRY scope=ALL)");
  }
  {
    const jar = await loginAs("mock.teacher@sangha-system.invalid");
    const { status } = await get(jar, `/api/persons/${PERSON.temple1Abbot}`);
    assert(status === 200, "TEACHER: 200 for any Person record (REGISTRY scope=ALL, plain 'R')");
  }
  {
    // Regional Admin's org scope covers province1's descendants (district1/subdistrict1/temple1/temple2/studyInstitute1).
    // seed_person_01 currently holds an ACTIVE appointment at temple1 -> covered.
    // seed_person_10 currently holds an ACTIVE appointment at region1 -> an ANCESTOR of province1, not covered.
    const jar = await loginAs("mock.regional.admin@sangha-system.invalid");
    const covered = await get(jar, `/api/persons/${PERSON.temple1Abbot}`);
    assert(covered.status === 200, "REGIONAL_ADMIN: 200 for a person whose current affiliation (temple1) is under their scoped province");

    const notCovered = await get(jar, `/api/persons/${PERSON.regionChief}`);
    assert(
      notCovered.status === 404,
      "REGIONAL_ADMIN: 404 for a person whose current affiliation (region1) is an ANCESTOR of their scope, not a descendant",
    );
  }

  console.log("\n=== Part 2: IDOR — GET /api/question-versions/[id] (RESPONSIBLE_RECORD) ===\n");
  {
    const { status } = await get(null, `/api/question-versions/${QV.ownAuthored}`);
    assert(status === 401, "no session -> 401");
  }
  {
    const jar = await loginAs("mock.teacher@sangha-system.invalid");

    const ownAuthored = await get(jar, `/api/question-versions/${QV.ownAuthored}`);
    assert(ownAuthored.status === 200, "TEACHER: 200 for a QuestionVersion they authored themselves");

    const nakthamOther = await get(jar, `/api/question-versions/${QV.nakthamOther}`);
    assert(
      nakthamOther.status === 200,
      "TEACHER: 200 for a QuestionVersion in their program scope (Nak Tham) even though authored by someone else",
    );

    const dhammastudiesOther = await get(jar, `/api/question-versions/${QV.dhammastudiesOther}`);
    assert(
      dhammastudiesOther.status === 404,
      "TEACHER: 404 (IDOR-safe) for a QuestionVersion in a DIFFERENT program (Dhamma Studies), authored by someone else",
    );
  }
  {
    const jar = await loginAs("mock.central.officer@sangha-system.invalid");
    const { status } = await get(jar, `/api/question-versions/${QV.dhammastudiesOther}`);
    assert(status === 200, "CENTRAL_OFFICER: 200 for any QuestionVersion (QUESTION_BANK scope=ALL)");
  }
  {
    const jar = await loginAs("mock.student@sangha-system.invalid");
    const { status } = await get(jar, `/api/question-versions/${QV.ownAuthored}`);
    assert(status === 404, "STUDENT: 404 always — no QUESTION_BANK entry at all for this role (deny-by-default)");
  }

  console.log("\n=== Part 3: Privilege escalation — POST/DELETE /api/admin/organization-scopes ===\n");
  const registrarEmail = "mock.registrar.staff@sangha-system.invalid";
  // mock.registrar.staff is PENDING_APPROVAL by seed design (F5.4 test case) — activate
  // temporarily to log in, same pattern used in test-rbac-scope.mjs.
  await pool.query(`UPDATE users SET status = 'ACTIVE', "updatedAt" = now() WHERE email = $1`, [registrarEmail]);
  try {
    const before = await pool.query(
      `SELECT count(*)::int AS n FROM user_organization_scopes WHERE "userId" = 'seed_user_registrar_staff' AND "organizationId" = $1 AND "revokedAt" IS NULL`,
      [ORG.region1],
    );

    {
      const { status } = await post(null, "/api/admin/organization-scopes", {
        targetUserId: "seed_user_registrar_staff",
        organizationId: ORG.region1,
      });
      assert(status === 401, "no session -> 401 (privilege escalation attempt without even a session)");
    }

    {
      const jar = await loginAs(registrarEmail);
      const { status } = await post(jar, "/api/admin/organization-scopes", {
        targetUserId: "seed_user_registrar_staff",
        organizationId: ORG.region1,
      });
      assert(status === 403, "REGISTRAR_STAFF (not Super Admin) attempting to grant themselves broader scope -> 403");

      const after = await pool.query(
        `SELECT count(*)::int AS n FROM user_organization_scopes WHERE "userId" = 'seed_user_registrar_staff' AND "organizationId" = $1 AND "revokedAt" IS NULL`,
        [ORG.region1],
      );
      assert(
        after.rows[0].n === before.rows[0].n,
        "the 403 above created NO new row in the database — denial happened before any write (not merely hidden in the response)",
      );
    }

    let grantedScopeId = null;
    {
      const jar = await loginAs("mock.super.admin@sangha-system.invalid");
      const { status, json } = await post(jar, "/api/admin/organization-scopes", {
        targetUserId: "seed_user_examiner",
        organizationId: ORG.district1,
      });
      assert(status === 201 && typeof json?.id === "string", "SUPER_ADMIN: 201 granting a fresh scope via the real HTTP endpoint");
      grantedScopeId = json?.id ?? null;

      const row = await pool.query(`SELECT "revokedAt" FROM user_organization_scopes WHERE id = $1`, [grantedScopeId]);
      assert(row.rows[0]?.revokedAt === null, "the newly granted row is active (revokedAt IS NULL) in the real database");
    }

    {
      const jar = await loginAs(registrarEmail);
      const { status } = await del(jar, `/api/admin/organization-scopes/${grantedScopeId}`);
      assert(status === 403, "REGISTRAR_STAFF (not Super Admin) attempting to revoke ANOTHER user's scope -> 403");

      const row = await pool.query(`SELECT "revokedAt" FROM user_organization_scopes WHERE id = $1`, [grantedScopeId]);
      assert(row.rows[0]?.revokedAt === null, "the 403 above left the row untouched — still active, not revoked by an unauthorized caller");
    }

    {
      const jar = await loginAs("mock.super.admin@sangha-system.invalid");
      const { status } = await del(jar, `/api/admin/organization-scopes/${grantedScopeId}`);
      assert(status === 204, "SUPER_ADMIN: 204 revoking the scope via the real HTTP endpoint");

      const row = await pool.query(`SELECT "revokedAt" FROM user_organization_scopes WHERE id = $1`, [grantedScopeId]);
      assert(row.rows[0]?.revokedAt !== null, "the row is now revoked (revokedAt set) — and still exists (append-only, not deleted)");
    }
  } finally {
    await pool.query(`UPDATE users SET status = 'PENDING_APPROVAL', "updatedAt" = now() WHERE email = $1`, [registrarEmail]);
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
