import "server-only";
import { query, withTransaction } from "@/lib/db";

/**
 * src/lib/scope.ts — scope resolution สำหรับ ScopeType แต่ละแบบใน
 * src/lib/permissions.ts (ดูคำอธิบายความหมายของแต่ละ scope ที่นั่น)
 *
 * ทุกฟังก์ชันในไฟล์นี้ต้อง "ตรวจสอบฝั่ง server เท่านั้น" (dev-rules.md ข้อ 4) — ไม่มี
 * ฟังก์ชันใดเชื่อค่าที่ client ส่งมาว่าเป็นความจริง (เช่น organizationId ที่ตรวจสอบ
 * ต้อง match กับ scope ที่ผูกไว้ในฐานข้อมูลจริงของ user เท่านั้น)
 */

/**
 * ตรวจว่า user มี active UserOrganizationScope ที่ "ครอบคลุม" organizationId ที่
 * ระบุหรือไม่ — ครอบคลุม หมายถึง organizationId เป็นองค์กรเดียวกัน หรือเป็นลูกหลาน
 * (เขตย่อยใต้บังคับบัญชา) ขององค์กรที่ user มี scope อยู่
 *
 * วิธีตรวจ: recursive CTE เดิน "ขึ้น" จาก organizationId เป้าหมายผ่าน parentId
 * ไปเรื่อยๆ จนถึงราก แล้วเช็คว่าเส้นทางนั้นผ่านองค์กรใดองค์กรหนึ่งที่ user มี active
 * scope อยู่หรือไม่ — เลือกวิธีนี้ (ไม่ denormalize เป็น closure table) เพราะ
 * โครงสร้างองค์กรเปลี่ยนแปลงได้ (ย้าย/ยุบ/รวมหน่วยงาน ดู Organization model) การ
 * เดินขึ้นสดทุกครั้งจึงถูกต้องเสมอโดยไม่ต้องคอย sync closure table
 */
export async function isOrganizationInScope(userId: string, organizationId: string): Promise<boolean> {
  const { rows } = await query<{ covered: boolean }>(
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

/** ตรวจว่า user มี active UserProgramScope สำหรับ programId ที่ระบุหรือไม่ */
export async function isProgramInScope(userId: string, programId: string): Promise<boolean> {
  const { rows } = await query<{ covered: boolean }>(
    `SELECT EXISTS (
       SELECT 1 FROM user_program_scopes
        WHERE "userId" = $1 AND "programId" = $2 AND "revokedAt" IS NULL
     ) AS covered`,
    [userId, programId],
  );
  return rows[0]?.covered ?? false;
}

/** รายการองค์กร (id) ที่ user มี active scope โดยตรง (ไม่รวมลูกหลาน) — ใช้แสดงผล/ตรวจสอบ */
export async function listOrganizationScopeIds(userId: string): Promise<string[]> {
  const { rows } = await query<{ organizationId: string }>(
    `SELECT "organizationId" FROM user_organization_scopes WHERE "userId" = $1 AND "revokedAt" IS NULL`,
    [userId],
  );
  return rows.map((r) => r.organizationId);
}

export async function listProgramScopeIds(userId: string): Promise<string[]> {
  const { rows } = await query<{ programId: string }>(
    `SELECT "programId" FROM user_program_scopes WHERE "userId" = $1 AND "revokedAt" IS NULL`,
    [userId],
  );
  return rows.map((r) => r.programId);
}

/**
 * ให้สิทธิ์ (grant) organization scope แก่ user หนึ่งคน — atomic (INSERT +
 * AuditLog ใน transaction เดียว ตาม dev-rules.md ข้อ 5) idempotent ในทางปฏิบัติ:
 * ถ้ามี active scope ขององค์กรนี้อยู่แล้ว จะโยน error แทนการสร้างซ้ำ (unique
 * partial index ในฐานข้อมูลบังคับอยู่แล้วเป็นชั้นป้องกันสุดท้าย)
 */
export async function grantOrganizationScope(params: {
  userId: string;
  organizationId: string;
  grantedById: string;
}): Promise<{ id: string }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO user_organization_scopes (id, "userId", "organizationId", "grantedById")
       VALUES ('scope_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), $1, $2, $3)
       RETURNING id`,
      [params.userId, params.organizationId, params.grantedById],
    );
    const row = rows[0];
    await client.query(
      `INSERT INTO audit_logs (id, "entityType", "entityId", action, "actorId", after)
       VALUES ('audit_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), 'UserOrganizationScope', $1, 'CREATE', $2, $3::jsonb)`,
      [row.id, params.grantedById, JSON.stringify({ userId: params.userId, organizationId: params.organizationId })],
    );
    return row;
  });
}

/** ถอนสิทธิ์ (revoke) — UPDATE ตั้ง revokedAt เท่านั้น (แถวเดิมห้ามลบ ดู migration trigger) */
export async function revokeOrganizationScope(params: {
  scopeId: string;
  revokedById: string;
}): Promise<void> {
  await withTransaction(async (client) => {
    const before = await client.query(
      `SELECT "userId", "organizationId", "revokedAt" FROM user_organization_scopes WHERE id = $1 FOR UPDATE`,
      [params.scopeId],
    );
    if (before.rows.length === 0) {
      throw new Error(`UserOrganizationScope ${params.scopeId} not found`);
    }
    if (before.rows[0].revokedAt !== null) {
      throw new Error(`UserOrganizationScope ${params.scopeId} is already revoked`);
    }
    await client.query(
      `UPDATE user_organization_scopes SET "revokedAt" = now(), "revokedById" = $2 WHERE id = $1`,
      [params.scopeId, params.revokedById],
    );
    await client.query(
      `INSERT INTO audit_logs (id, "entityType", "entityId", action, "actorId", before, after)
       VALUES ('audit_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), 'UserOrganizationScope', $1, 'UPDATE', $2, $3::jsonb, $4::jsonb)`,
      [
        params.scopeId,
        params.revokedById,
        JSON.stringify({ revokedAt: null }),
        JSON.stringify({ revokedAt: new Date().toISOString() }),
      ],
    );
  });
}

/** เหมือน grantOrganizationScope แต่สำหรับ program scope */
export async function grantProgramScope(params: {
  userId: string;
  programId: string;
  grantedById: string;
}): Promise<{ id: string }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `INSERT INTO user_program_scopes (id, "userId", "programId", "grantedById")
       VALUES ('pscope_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), $1, $2, $3)
       RETURNING id`,
      [params.userId, params.programId, params.grantedById],
    );
    const row = rows[0];
    await client.query(
      `INSERT INTO audit_logs (id, "entityType", "entityId", action, "actorId", after)
       VALUES ('audit_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), 'UserProgramScope', $1, 'CREATE', $2, $3::jsonb)`,
      [row.id, params.grantedById, JSON.stringify({ userId: params.userId, programId: params.programId })],
    );
    return row;
  });
}

export async function revokeProgramScope(params: { scopeId: string; revokedById: string }): Promise<void> {
  await withTransaction(async (client) => {
    const before = await client.query(
      `SELECT "revokedAt" FROM user_program_scopes WHERE id = $1 FOR UPDATE`,
      [params.scopeId],
    );
    if (before.rows.length === 0) {
      throw new Error(`UserProgramScope ${params.scopeId} not found`);
    }
    if (before.rows[0].revokedAt !== null) {
      throw new Error(`UserProgramScope ${params.scopeId} is already revoked`);
    }
    await client.query(
      `UPDATE user_program_scopes SET "revokedAt" = now(), "revokedById" = $2 WHERE id = $1`,
      [params.scopeId, params.revokedById],
    );
    await client.query(
      `INSERT INTO audit_logs (id, "entityType", "entityId", action, "actorId", before, after)
       VALUES ('audit_' || substr(md5(random()::text || clock_timestamp()::text), 1, 20), 'UserProgramScope', $1, 'UPDATE', $2, $3::jsonb, $4::jsonb)`,
      [
        params.scopeId,
        params.revokedById,
        JSON.stringify({ revokedAt: null }),
        JSON.stringify({ revokedAt: new Date().toISOString() }),
      ],
    );
  });
}
