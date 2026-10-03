#!/usr/bin/env node
/**
 * test-rbac-scope.mjs — real, end-to-end tests for RBAC + Scope-based Permission
 * (Phase: P3 Authentication & RBAC, deliverable: roles-permissions.md).
 *
 * Part 1 drives the actual running `next dev` server (http://localhost:3000) over
 * HTTP, exactly like test-auth-login.mjs does — this proves the real call chain
 * `GET /api/organizations/[id]` -> getCurrentUser() -> canAccessOrganization() ->
 * isOrganizationInScope() (src/lib/authz.ts, src/lib/scope.ts) end-to-end, using
 * the real seed data's organization tree and scope grants (prisma/seed.ts
 * seedRbacScopes()).
 *
 * Part 2 tests the append-only/uniqueness contract of the two new tables
 * (user_organization_scopes, user_program_scopes) directly against real
 * PostgreSQL with raw SQL — the same statements the grant-/revoke-scope
 * functions in src/lib/scope.ts issue. We test at this layer (not by importing
 * src/lib/scope.ts directly) because that module starts with `import
 * "server-only"`, which intentionally throws when loaded outside a Next.js
 * server bundle — Part 1's HTTP tests are what prove the real TypeScript module
 * (including the "server-only" guarded code) behaves correctly, since they run
 * inside the actual `next dev` process.
 *
 * Prerequisites: `npm run dev` running on :3000, database migrated + seeded
 * (`node prisma/dev-migrate-verify.mjs && npm run db:seed`).
 *
 * Usage: node prisma/test-rbac-scope.mjs
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

/** Log in as one of the seeded mock users and return a Jar carrying its session cookie. */
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

async function getOrganization(jar, organizationId) {
  const res = await fetch(`${BASE_URL}/api/organizations/${organizationId}`, {
    headers: { cookie: jar?.header() ?? "" },
  });
  return { status: res.status, body: res.status === 200 || res.status === 404 || res.status === 403 || res.status === 401 ? await res.json().catch(() => null) : null };
}

// Seed ids (prisma/seed.ts) — the organization tree under test:
// mahathera -> zone1 -> region1 -> province1 -> district1 -> subdistrict1 -> temple1/temple2 -> studyInstitute1
// examOffice is a sibling directly under mahathera (unrelated to the province1 branch).
const ORG = {
  mahathera: "seed_org_mahathera",
  region1: "seed_org_region_1",
  province1: "seed_org_province_1",
  district1: "seed_org_district_1",
  temple1: "seed_org_temple_1",
  temple2: "seed_org_temple_2",
  studyInstitute1: "seed_org_study_institute_1",
  examOffice: "seed_org_exam_office",
};

async function main() {
  const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });

  console.log("=== Part 1: HTTP end-to-end — GET /api/organizations/[id] deny-by-default + scope ===\n");

  // -----------------------------------------------------------------------
  // Unauthenticated
  // -----------------------------------------------------------------------
  {
    const { status } = await getOrganization(null, ORG.province1);
    assert(status === 401, "no session at all -> 401 (deny-by-default, regardless of the org requested)");
  }

  // -----------------------------------------------------------------------
  // ALL-scope roles (REGISTRY scope=ALL): Super Admin / Central Officer / Auditor
  // -----------------------------------------------------------------------
  {
    const jar = await loginAs("mock.super.admin@sangha-system.invalid");
    const { status, body } = await getOrganization(jar, ORG.province1);
    assert(status === 200 && body?.id === ORG.province1, "SUPER_ADMIN: 200 for any organization (REGISTRY scope=ALL)");

    const notFound = await getOrganization(jar, "does-not-exist");
    assert(notFound.status === 404, "SUPER_ADMIN: unknown organization id -> 404");
  }
  {
    const jar = await loginAs("mock.central.officer@sangha-system.invalid");
    const { status } = await getOrganization(jar, ORG.examOffice);
    assert(status === 200, "CENTRAL_OFFICER: 200 for examOffice (REGISTRY scope=ALL)");
  }
  {
    const jar = await loginAs("mock.auditor@sangha-system.invalid");
    const { status } = await getOrganization(jar, ORG.mahathera);
    assert(status === 200, "AUDITOR: 200 for the root organization (read-only, REGISTRY scope=ALL)");
  }

  // -----------------------------------------------------------------------
  // Regional Admin — OWN_ORG_SUBTREE scoped at province1 (seedRbacScopes)
  // -----------------------------------------------------------------------
  {
    const jar = await loginAs("mock.regional.admin@sangha-system.invalid");

    const own = await getOrganization(jar, ORG.province1);
    assert(own.status === 200, "REGIONAL_ADMIN: 200 for the exact organization their scope is granted on (province1)");

    const child = await getOrganization(jar, ORG.district1);
    assert(child.status === 200, "REGIONAL_ADMIN: 200 for a direct child (district1 under province1)");

    const grandchild = await getOrganization(jar, ORG.temple1);
    assert(grandchild.status === 200, "REGIONAL_ADMIN: 200 for a deeper descendant (temple1, 3 levels below province1)");

    const ancestor = await getOrganization(jar, ORG.region1);
    assert(
      ancestor.status === 403,
      "REGIONAL_ADMIN: 403 for an ANCESTOR of their scoped org (region1) — scope cascades down only, never up",
    );

    const unrelated = await getOrganization(jar, ORG.examOffice);
    assert(unrelated.status === 403, "REGIONAL_ADMIN: 403 for an unrelated sibling branch (examOffice)");
  }

  // -----------------------------------------------------------------------
  // Registrar Staff — OWN_ORG_SUBTREE scoped at temple1 (a leaf-ish org, seedRbacScopes)
  // -----------------------------------------------------------------------
  {
    // mock.registrar.staff is seeded with status=PENDING_APPROVAL on purpose
    // (F5.4 inactive-account test case in test-auth-login.mjs) and therefore
    // cannot complete a normal login. Temporarily activate it for this scope
    // test only, then restore — the same temporary-mutation-then-restore
    // pattern test-auth-login.mjs already uses for its SUSPENDED-mid-session case.
    const email = "mock.registrar.staff@sangha-system.invalid";
    await pool.query(`UPDATE users SET status = 'ACTIVE', "updatedAt" = now() WHERE email = $1`, [email]);
    try {
      const jar = await loginAs(email);

      const own = await getOrganization(jar, ORG.temple1);
      assert(own.status === 200, "REGISTRAR_STAFF: 200 for their own affiliation (temple1)");

      const child = await getOrganization(jar, ORG.studyInstitute1);
      assert(child.status === 200, "REGISTRAR_STAFF: 200 for studyInstitute1 (a descendant of temple1)");

      const sibling = await getOrganization(jar, ORG.temple2);
      assert(sibling.status === 403, "REGISTRAR_STAFF: 403 for a sibling temple (temple2) outside their affiliation");
    } finally {
      await pool.query(`UPDATE users SET status = 'PENDING_APPROVAL', "updatedAt" = now() WHERE email = $1`, [email]);
    }
  }

  // -----------------------------------------------------------------------
  // Teacher / Examiner — REGISTRY scope=ALL (read-only "R" with no qualifier in
  // requirements.md §6) -> can read any organization even without an explicit
  // UserOrganizationScope row
  // -----------------------------------------------------------------------
  {
    const jar = await loginAs("mock.teacher@sangha-system.invalid");
    const { status } = await getOrganization(jar, ORG.temple2);
    assert(status === 200, "TEACHER: 200 for any organization (REGISTRY = plain 'R', scope=ALL, no UserOrganizationScope needed)");
  }

  // -----------------------------------------------------------------------
  // Student — REGISTRY scope=OWN_RECORD (not org-based at all) -> no
  // UserOrganizationScope row exists for this user -> denied everywhere
  // -----------------------------------------------------------------------
  {
    const jar = await loginAs("mock.student@sangha-system.invalid");
    const { status } = await getOrganization(jar, ORG.temple1);
    assert(
      status === 403,
      "STUDENT: 403 for an organization endpoint — their REGISTRY scope is OWN_RECORD, not organization-based",
    );
  }

  console.log("\n=== Part 2: append-only + uniqueness contract of the scope tables (real PostgreSQL) ===\n");

  const superAdminId = "seed_user_super_admin";
  const registrarStaffId = "seed_user_registrar_staff";
  const teacherId = "seed_user_teacher";

  // Fresh, run-specific ids — the tables are append-only (no DELETE), so a
  // fixed id would collide with a previous run's now-permanent row. Using
  // Date.now()-based ids keeps this script safely re-runnable.
  const runTag = Date.now();
  const orgScopeId = `test_scope_org_${runTag}`;
  const progScopeId = `test_scope_prog_${runTag}`;

  // -----------------------------------------------------------------------
  // Organization scope: grant -> covered -> duplicate rejected -> revoke ->
  // no longer covered -> row still exists (no DELETE) -> mutation rejected
  // -----------------------------------------------------------------------
  {
    // registrar_staff x examOffice is a pair the seed data never grants, so it
    // is guaranteed "not covered" at the start of every run.
    const before = await recursiveCovered(pool, registrarStaffId, ORG.examOffice);
    assert(before === false, "registrar_staff has no scope covering examOffice before this test grants one");

    const insertRes = await pool.query(
      `INSERT INTO user_organization_scopes (id, "userId", "organizationId", "grantedById")
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [orgScopeId, registrarStaffId, ORG.examOffice, superAdminId],
    );
    assert(insertRes.rows[0]?.id === orgScopeId, "grant: INSERT succeeds for a fresh (user, org) pair");

    const afterGrant = await recursiveCovered(pool, registrarStaffId, ORG.examOffice);
    assert(afterGrant === true, "the same recursive-CTE coverage query src/lib/scope.ts uses now returns true");

    let duplicateRejected = false;
    try {
      await pool.query(
        `INSERT INTO user_organization_scopes (id, "userId", "organizationId", "grantedById")
         VALUES ($1, $2, $3, $4)`,
        [`${orgScopeId}_dup`, registrarStaffId, ORG.examOffice, superAdminId],
      );
    } catch {
      duplicateRejected = true;
    }
    assert(duplicateRejected, "a second ACTIVE grant for the same (user, org) pair is rejected by the partial unique index");

    // --- exercise the exact guard pattern scope.ts's revokeOrganizationScope()
    // uses at the application layer (SELECT ... FOR UPDATE, check current
    // revokedAt, only then UPDATE) — proves the pattern is sound against real
    // concurrent-safe row locking, since the DB trigger itself does NOT block
    // re-setting revokedAt to a later timestamp (it only blocks un-revoking).
    async function appLayerRevoke(scopeId, revokedById) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const { rows } = await client.query(
          `SELECT "revokedAt" FROM user_organization_scopes WHERE id = $1 FOR UPDATE`,
          [scopeId],
        );
        if (rows.length === 0) throw new Error("not found");
        if (rows[0].revokedAt !== null) throw new Error("already revoked");
        await client.query(`UPDATE user_organization_scopes SET "revokedAt" = now(), "revokedById" = $2 WHERE id = $1`, [
          scopeId,
          revokedById,
        ]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }

    await appLayerRevoke(orgScopeId, superAdminId);
    const afterRevoke = await recursiveCovered(pool, registrarStaffId, ORG.examOffice);
    assert(afterRevoke === false, "after the application-layer revoke, coverage query returns false again");

    let doubleRevokeRejected = false;
    try {
      await appLayerRevoke(orgScopeId, superAdminId);
    } catch {
      doubleRevokeRejected = true;
    }
    assert(
      doubleRevokeRejected,
      "revoking an already-revoked scope is rejected by the application-layer guard (same pattern as scope.ts revokeOrganizationScope)",
    );

    const stillThere = await pool.query(`SELECT "revokedAt" FROM user_organization_scopes WHERE id = $1`, [orgScopeId]);
    assert(
      stillThere.rows.length === 1 && stillThere.rows[0].revokedAt !== null,
      "revoked row still exists in the table (append-only — not deleted)",
    );

    let deleteRejected = false;
    try {
      await pool.query(`DELETE FROM user_organization_scopes WHERE id = $1`, [orgScopeId]);
    } catch {
      deleteRejected = true;
    }
    assert(deleteRejected, "DELETE on user_organization_scopes is rejected by the append-only trigger");

    let mutateRejected = false;
    try {
      await pool.query(`UPDATE user_organization_scopes SET "organizationId" = $2 WHERE id = $1`, [
        orgScopeId,
        ORG.temple2,
      ]);
    } catch {
      mutateRejected = true;
    }
    assert(mutateRejected, "UPDATE changing organizationId (not just revocation) is rejected by the append-only trigger");
  }

  // -----------------------------------------------------------------------
  // Program scope: grant -> covered -> revoke -> not covered
  // -----------------------------------------------------------------------
  {
    const before = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM user_program_scopes WHERE "userId" = $1 AND "programId" = 'prog_pali' AND "revokedAt" IS NULL) AS covered`,
      [teacherId],
    );
    assert(before.rows[0].covered === false, "teacher has no scope covering prog_pali before this test grants one");

    await pool.query(
      `INSERT INTO user_program_scopes (id, "userId", "programId", "grantedById") VALUES ($1, $2, 'prog_pali', $3)`,
      [progScopeId, teacherId, superAdminId],
    );
    const afterGrant = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM user_program_scopes WHERE "userId" = $1 AND "programId" = 'prog_pali' AND "revokedAt" IS NULL) AS covered`,
      [teacherId],
    );
    assert(afterGrant.rows[0].covered === true, "program scope grant is visible via the same query isProgramInScope() runs");

    await pool.query(`UPDATE user_program_scopes SET "revokedAt" = now(), "revokedById" = $2 WHERE id = $1`, [
      progScopeId,
      superAdminId,
    ]);
    const afterRevoke = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM user_program_scopes WHERE "userId" = $1 AND "programId" = 'prog_pali' AND "revokedAt" IS NULL) AS covered`,
      [teacherId],
    );
    assert(afterRevoke.rows[0].covered === false, "program scope no longer covers prog_pali after revoke");
  }

  // -----------------------------------------------------------------------
  // users.personId -> OWN_RECORD basis: the seeded student is actually linked
  // -----------------------------------------------------------------------
  {
    const { rows } = await pool.query(
      `SELECT u."personId", p."fullName" FROM users u JOIN persons p ON p.id = u."personId" WHERE u.id = 'seed_user_student'`,
    );
    assert(
      rows.length === 1 && rows[0].personId === "seed_person_05",
      "seed_user_student.personId is linked to a real, unused Person row (basis for OWN_RECORD scope)",
    );
  }

  await pool.end();

  console.log();
  console.log(`${passed} passed, ${failed} failed`);
  process.exitCode = failed > 0 ? 1 : 0;
}

/** The exact recursive-CTE coverage query src/lib/scope.ts's isOrganizationInScope() runs. */
async function recursiveCovered(pool, userId, organizationId) {
  const { rows } = await pool.query(
    `
    WITH RECURSIVE ancestors AS (
      SELECT id, "parentId" FROM organizations WHERE id = $2
      UNION ALL
      SELECT o.id, o."parentId"
        FROM organizations o
        JOIN ancestors a ON o.id = a."parentId"
    )
    SELECT EXISTS (
      SELECT 1
        FROM user_organization_scopes s
        JOIN ancestors a ON a.id = s."organizationId"
       WHERE s."userId" = $1
         AND s."revokedAt" IS NULL
    ) AS covered
    `,
    [userId, organizationId],
  );
  return rows[0]?.covered ?? false;
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exitCode = 1;
});
