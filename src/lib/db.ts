import "server-only";
import { Pool, type QueryResultRow } from "pg";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Raw `pg` database access layer.
 *
 * ทำไมไม่ใช้ `@prisma/client`: Prisma CLI/Client ใช้งานไม่ได้จริงในสภาพแวดล้อมนี้
 * (schema-engine binary จาก binaries.prisma.sh ถูกบล็อกโดยนโยบายเครือข่าย — ดู
 * prisma/MIGRATIONS.md หัวข้อ "ข้อจำกัดของเครื่องมือ") ทุกโค้ด application ที่คุย
 * กับฐานข้อมูลในโปรเจกต์นี้จึงใช้ raw `pg` แทน (เช่นเดียวกับ prisma/seed.ts และ
 * prisma/dev-migrate-verify.mjs) `prisma/schema.prisma` ยังคงเป็นแหล่งความจริงของ
 * schema แต่ไม่ได้ generate client จริง
 */

function loadDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const envLocalPath = path.join(process.cwd(), ".env.local");
  try {
    const content = readFileSync(envLocalPath, "utf8");
    for (const line of content.split("\n")) {
      const m = line.match(/^DATABASE_URL\s*=\s*"?([^"\n]+)"?\s*$/);
      if (m) return m[1];
    }
  } catch {
    // fall through to error below
  }
  throw new Error(
    "DATABASE_URL is not set and not found in .env.local — see .env.example",
  );
}

// A single pooled connection shared across the process (Node.js runtime —
// see next.config.ts / proxy.ts notes: Route Handlers, Server Actions, and
// proxy.ts on Next.js 16 all run on the Node.js runtime, so a long-lived pg
// Pool is safe to keep as a module-level singleton).
declare global {
  var __sanghaPgPool: Pool | undefined;
}

export function getPool(): Pool {
  if (!globalThis.__sanghaPgPool) {
    globalThis.__sanghaPgPool = new Pool({ connectionString: loadDatabaseUrl() });
  }
  return globalThis.__sanghaPgPool;
}

/** Run a single parameterized query. */
export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
) {
  return getPool().query<T>(text, params);
}

/**
 * Run `fn` inside a single transaction (BEGIN ... COMMIT / ROLLBACK on error).
 * Constraint (dev-rules.md ข้อ 5): ใช้ transaction สำหรับ operation ที่ต้อง atomic.
 */
export async function withTransaction<T>(
  fn: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
