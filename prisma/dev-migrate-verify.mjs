#!/usr/bin/env node
/**
 * dev-migrate-verify.mjs — TEMPORARY verification harness, NOT a replacement for
 * the Prisma CLI.
 *
 * ทำไมมีสคริปต์นี้: `npx prisma migrate dev/deploy/reset` ไม่สามารถรันได้จริงใน
 * สภาพแวดล้อมที่ใช้พัฒนางานนี้ เพราะ Prisma CLI ต้องดาวน์โหลด schema-engine binary
 * จาก binaries.prisma.sh ซึ่งถูกบล็อกโดยนโยบายเครือข่ายของสภาพแวดล้อมนั้น (ดู
 * prisma/MIGRATIONS.md หัวข้อ "ข้อจำกัดของเครื่องมือ" สำหรับรายละเอียดการตรวจสอบเต็ม)
 * สคริปต์นี้จึงถูกเขียนขึ้นเพื่อ "ทดสอบ SQL ของ migration ทุกไฟล์จริงกับ PostgreSQL
 * จริง" แทน ไม่ใช่เพื่อใช้แทน Prisma Migrate ถาวร
 *
 * เมื่อ `prisma` CLI ใช้งานได้จริง (เช่น deploy ใน environment ที่มีเครือข่ายปกติ):
 * ให้รัน `npx prisma migrate resolve --applied <migration_name>` สำหรับแต่ละ
 * migration ที่สคริปต์นี้ apply ไปแล้ว (baseline ฐานข้อมูลที่มีอยู่) จากนั้นลบตาราง
 * `_migration_verification_log` และไฟล์สคริปต์นี้ทิ้งได้ — ตาราง `_prisma_migrations`
 * ที่แท้จริงจะกลายเป็นแหล่งความจริงแทน
 *
 * Usage:
 *   node prisma/dev-migrate-verify.mjs            # apply pending migrations
 *   node prisma/dev-migrate-verify.mjs --reset     # drop public schema + replay ALL migrations
 *   node prisma/dev-migrate-verify.mjs --status    # list applied vs pending
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, "migrations");

function loadDatabaseUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envLocalPath = path.join(__dirname, "..", ".env.local");
  try {
    const content = readFileSync(envLocalPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?\s*$/);
      if (m) return m[1];
    }
  } catch {
    // ignore — fall through to error below
  }
  throw new Error(
    "DATABASE_URL not set and not found in .env.local — see .env.example",
  );
}

function listMigrationFolders() {
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort(); // timestamp-prefixed names sort chronologically
}

async function ensureLogTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS "_migration_verification_log" (
      id SERIAL PRIMARY KEY,
      migration_name TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function getApplied(client) {
  const res = await client.query(
    `SELECT migration_name FROM "_migration_verification_log" ORDER BY id;`,
  );
  return new Set(res.rows.map((r) => r.migration_name));
}

async function applyMigration(client, name) {
  const sql = readFileSync(
    path.join(migrationsDir, name, "migration.sql"),
    "utf8",
  );
  await client.query("BEGIN");
  try {
    await client.query(sql);
    await client.query(
      `INSERT INTO "_migration_verification_log" (migration_name) VALUES ($1);`,
      [name],
    );
    await client.query("COMMIT");
    console.log(`  [PASSED] applied ${name}`);
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(`  [FAILED] ${name}: ${err.message}`);
    throw err;
  }
}

async function resetDatabase(client) {
  console.log("--reset: dropping and recreating public schema...");
  await client.query(`DROP SCHEMA public CASCADE;`);
  await client.query(`CREATE SCHEMA public;`);
  console.log("  [PASSED] schema reset");
}

async function main() {
  const mode = process.argv[2];
  const client = new pg.Client({ connectionString: loadDatabaseUrl() });
  await client.connect();

  try {
    if (mode === "--reset") {
      await resetDatabase(client);
      await ensureLogTable(client);
      const all = listMigrationFolders();
      console.log(`Replaying ${all.length} migration(s) from scratch:`);
      for (const name of all) await applyMigration(client, name);
      console.log("Reset + full replay: PASSED");
      return;
    }

    await ensureLogTable(client);
    const applied = await getApplied(client);
    const all = listMigrationFolders();
    const pending = all.filter((n) => !applied.has(n));

    if (mode === "--status") {
      console.log("Applied:", [...applied]);
      console.log("Pending:", pending);
      return;
    }

    if (pending.length === 0) {
      console.log("No pending migrations. Database is up to date.");
      return;
    }
    console.log(`Applying ${pending.length} pending migration(s):`);
    for (const name of pending) await applyMigration(client, name);
    console.log("All pending migrations: PASSED");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error("Migration verification FAILED:", err.message);
  process.exit(1);
});
