#!/usr/bin/env node
/**
 * test-admin-dashboard.mjs — real, end-to-end tests for the "สร้าง Admin
 * Dashboard Shell" task (Phase P5 Admin & CMS).
 *
 * Drives the actual running `next dev` server (http://localhost:3000) over HTTP,
 * exactly like test-authz-guard.mjs / test-rbac-scope.mjs, covering:
 *   - F6.1: /admin layout deny-by-default entry gate (requirePermission("ADMIN","read"))
 *   - F6.1: permission-aware sidebar navigation (ผู้ใช้เห็นเฉพาะ module ที่มีสิทธิ์)
 *   - F6.3: KPI mock cards render (labeled "ข้อมูลตัวอย่าง", not real data)
 *   - F6.4: recent activity widget — REAL audit_logs data (not mock), including
 *     the empty-state before any audit_logs row exists
 *
 * IMPORTANT — run order: this suite MUST run right after `dev-migrate-verify.mjs
 * --reset` + `npm run db:seed`, and BEFORE test-rbac-scope.mjs / test-authz-guard.mjs
 * in the regression sequence — Part 4 below asserts the "ยังไม่มีกิจกรรม" EmptyState,
 * which is only true while audit_logs is still empty (seed.ts intentionally does not
 * write to audit_logs — see prisma/seed.ts's closing comment — and test-rbac-scope.mjs/
 * test-authz-guard.mjs both grant/revoke scopes, which DOES write real audit_logs rows).
 * See README.md/prisma/MIGRATIONS.md for the exact documented run order.
 *
 * Prerequisites: `npm run dev` running on :3000, database freshly migrated + seeded.
 *
 * Usage: node prisma/test-admin-dashboard.mjs
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

async function getAdminRaw(jar) {
  const res = await fetch(`${BASE_URL}/admin`, { headers: { cookie: jar?.header() ?? "" }, redirect: "manual" });
  return { status: res.status, location: res.headers.get("location") };
}

async function getAdminHtml(jar) {
  const res = await fetch(`${BASE_URL}/admin`, { headers: { cookie: jar?.header() ?? "" } });
  return { status: res.status, html: await res.text() };
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

const MODULE_LABELS = {
  REGISTRY: "ทะเบียนคณะสงฆ์",
  CURRICULUM: "หลักสูตรและระดับการศึกษา",
  QUESTION_BANK: "คลังข้อสอบ",
  TESTING: "แบบทดสอบ/จัดสอบ",
  MEMBERSHIP: "ระบบสมาชิก",
  ADMIN: "ผู้ดูแลระบบ",
  IMPORT: "นำเข้าข้อมูล Excel",
  FILES: "จัดเก็บไฟล์ (PDF/Object Storage)",
  RBAC_CONFIG: "สิทธิ์การเข้าถึงหลายระดับ",
};
const ALL_MODULE_KEYS = Object.keys(MODULE_LABELS);

function assertVisibleModules(html, expectedModules, label) {
  for (const key of ALL_MODULE_KEYS) {
    const shouldBeVisible = expectedModules.includes(key);
    const isVisible = html.includes(MODULE_LABELS[key]);
    assert(isVisible === shouldBeVisible, `${label}: module ${key} ${shouldBeVisible ? "แสดง" : "ไม่แสดง"} ตามที่คาด`);
  }
}

async function main() {
  const pool = new pg.Pool({ connectionString: loadDatabaseUrl() });

  console.log("=== Part 1: /admin — deny-by-default entry gate (F6.1) ===\n");
  {
    const { status, location } = await getAdminRaw(null);
    assert(status === 307 && location === "/login", "no session -> 307 redirect to /login");
  }
  for (const email of [
    "mock.regional.admin@sangha-system.invalid",
    "mock.teacher@sangha-system.invalid",
    "mock.examiner@sangha-system.invalid",
    "mock.student@sangha-system.invalid",
  ]) {
    const jar = await loginAs(email);
    const { status, location } = await getAdminRaw(jar);
    assert(
      status === 307 && location === "/dashboard?error=forbidden",
      `${email}: ไม่มี entry ของ module ADMIN -> 307 redirect ไป /dashboard?error=forbidden (deny-by-default)`,
    );
  }
  {
    // mock.registrar.staff is PENDING_APPROVAL by seed design — activate temporarily
    // to log in, same pattern used in test-authz-guard.mjs/test-rbac-scope.mjs.
    const email = "mock.registrar.staff@sangha-system.invalid";
    await pool.query(`UPDATE users SET status = 'ACTIVE', "updatedAt" = now() WHERE email = $1`, [email]);
    try {
      const jar = await loginAs(email);
      const { status, location } = await getAdminRaw(jar);
      assert(
        status === 307 && location === "/dashboard?error=forbidden",
        "mock.registrar.staff: ไม่มี entry ของ module ADMIN -> 307 redirect ไป /dashboard?error=forbidden",
      );
    } finally {
      await pool.query(`UPDATE users SET status = 'PENDING_APPROVAL', "updatedAt" = now() WHERE email = $1`, [email]);
    }
  }
  for (const email of [
    "mock.super.admin@sangha-system.invalid",
    "mock.central.officer@sangha-system.invalid",
    "mock.auditor@sangha-system.invalid",
  ]) {
    const jar = await loginAs(email);
    const { status } = await getAdminRaw(jar);
    assert(status === 200, `${email}: มี ADMIN:read -> 200 เข้า /admin ได้`);
  }

  console.log("\n=== Part 2: permission-aware sidebar navigation (F6.1) ===\n");
  {
    const jar = await loginAs("mock.super.admin@sangha-system.invalid");
    const { html } = await getAdminHtml(jar);
    assertVisibleModules(html, ALL_MODULE_KEYS, "SUPER_ADMIN");
  }
  {
    const jar = await loginAs("mock.central.officer@sangha-system.invalid");
    const { html } = await getAdminHtml(jar);
    assertVisibleModules(html, ALL_MODULE_KEYS.filter((k) => k !== "RBAC_CONFIG"), "CENTRAL_OFFICER");
  }
  {
    const jar = await loginAs("mock.auditor@sangha-system.invalid");
    const { html } = await getAdminHtml(jar);
    assertVisibleModules(html, ALL_MODULE_KEYS, "AUDITOR (read-only ทุก module แต่ยังนับว่า 'มีสิทธิ์เห็น')");
  }

  console.log("\n=== Part 3: KPI mock cards (F6.3) — ข้อมูลสมมติ ไม่ query จริง ===\n");
  {
    const jar = await loginAs("mock.super.admin@sangha-system.invalid");
    const { html } = await getAdminHtml(jar);
    for (const label of [
      "จำนวนองค์กร/หน่วยงานทั้งหมด",
      "ข้อสอบที่รออนุมัติ",
      "รอบสอบที่กำลังจะมาถึง",
      "สมาชิกที่รออนุมัติบัญชี",
      "งานนำเข้าที่สำเร็จล่าสุด",
    ]) {
      assert(html.includes(label), `SUPER_ADMIN: เห็นการ์ด KPI "${label}"`);
    }
    assert(html.includes("ข้อมูลตัวอย่าง"), 'ทุกการ์ด KPI มี badge "ข้อมูลตัวอย่าง" กำกับไว้ชัดเจน (ไม่ปลอมเป็นข้อมูลจริง)');
  }

  console.log("\n=== Part 4: recent activity (F6.4) — ข้อมูลจริงจาก audit_logs ===\n");
  const { rows: countBefore } = await pool.query(`SELECT count(*)::int AS n FROM audit_logs`);
  if (countBefore[0].n === 0) {
    for (const email of [
      "mock.super.admin@sangha-system.invalid",
      "mock.central.officer@sangha-system.invalid",
      "mock.auditor@sangha-system.invalid",
    ]) {
      const jar = await loginAs(email);
      const { html } = await getAdminHtml(jar);
      assert(
        html.includes("ยังไม่มีกิจกรรม"),
        `${email}: audit_logs ยังว่างเปล่า (หลัง seed สด) -> แสดง EmptyState "ยังไม่มีกิจกรรม"`,
      );
    }
  } else {
    console.log(
      `  [SKIP] audit_logs มี ${countBefore[0].n} แถวอยู่แล้ว (suite นี้ไม่ได้รันเป็นลำดับแรกสุดหลัง seed) — ` +
        "ข้าม assertion EmptyState แต่ยังทดสอบ Part 4 ส่วนที่เหลือได้ตามปกติ",
    );
  }

  const TARGET_USER = "seed_user_auditor";
  const TARGET_ORG = "seed_org_temple_2";
  const superAdminJar = await loginAs("mock.super.admin@sangha-system.invalid");

  const grant = await post(superAdminJar, "/api/admin/organization-scopes", {
    targetUserId: TARGET_USER,
    organizationId: TARGET_ORG,
  });
  assert(grant.status === 201 && typeof grant.json?.id === "string", "grant scope จริงผ่าน HTTP สำเร็จ (สร้างแถว audit_logs ใหม่จริง)");
  const scopeId = grant.json?.id;

  {
    const { html } = await getAdminHtml(superAdminJar);
    assert(html.includes("UserOrganizationScope"), "แดชบอร์ดแสดง entityType 'UserOrganizationScope' จริงจาก audit_logs (ไม่ใช่ mock)");
    assert(html.includes(">สร้าง<"), 'แดชบอร์ดแปล action CREATE เป็นภาษาไทย "สร้าง" ถูกต้อง');
    assert(!html.includes("ยังไม่มีกิจกรรม"), "หลังมีกิจกรรมจริงแล้ว ไม่แสดง EmptyState อีกต่อไป");
  }

  const revoke = await del(superAdminJar, `/api/admin/organization-scopes/${scopeId}`);
  assert(revoke.status === 204, "revoke scope จริงผ่าน HTTP สำเร็จ (สร้างแถว audit_logs UPDATE ใหม่จริง)");

  {
    // CENTRAL_OFFICER ก็มี ADMIN:read scope=ALL เหมือนกัน -> ต้องเห็น feed เดียวกัน
    // (ไม่ filter ต่างกันตาม role เพราะ scope ของ ADMIN module เป็น ALL ทั้ง 3 role)
    const centralOfficerJar = await loginAs("mock.central.officer@sangha-system.invalid");
    const { html } = await getAdminHtml(centralOfficerJar);
    assert(html.includes("UserOrganizationScope"), "CENTRAL_OFFICER เห็น audit log เดียวกับ SUPER_ADMIN (ADMIN module scope=ALL ทั้งคู่)");

    const updateIdx = html.indexOf(">แก้ไข<");
    const createIdx = html.indexOf(">สร้าง<");
    assert(
      updateIdx !== -1 && createIdx !== -1 && updateIdx < createIdx,
      'เรียงลำดับใหม่สุดก่อน (createdAt DESC): revoke ("แก้ไข", เกิดทีหลัง) ปรากฏก่อน grant ("สร้าง", เกิดก่อน) ในหน้า HTML',
    );
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
