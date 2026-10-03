import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/authz";
import { notFoundOrForbidden } from "@/lib/guard";
import { query } from "@/lib/db";
import { resolveFileUrl } from "@/lib/library";

/**
 * F8.3 — GET /api/library/[id]/download — ดาวน์โหลดไฟล์เอกสารในห้องสมุด (งาน
 * "สร้างห้องสมุด PDF/Download") รองรับ query param ?version=N (ทางเลือก) เพื่อ
 * ดาวน์โหลดเวอร์ชันเก่าที่ APPROVED แล้วโดยเฉพาะ (feature "version" ตามบรีฟ) —
 * ไม่ระบุ = ใช้เวอร์ชัน APPROVED ล่าสุดโดยอัตโนมัติ
 *
 * Function: ดาวน์โหลดไฟล์แนบของเอกสาร (เวอร์ชันที่ระบุ หรือเวอร์ชันล่าสุดที่อนุมัติแล้ว)
 * Actor: Guest (เอกสาร isPublic=true) หรือผู้ใช้ที่ login แล้วทุกบทบาท (เอกสารใดก็ได้
 *        ที่มีเวอร์ชัน APPROVED — ดู src/lib/library.ts หัวข้อ "public/private access"
 *        สำหรับเหตุผลที่ไม่ตรวจ role/scope เพิ่มเติมนอกเหนือจาก isAuthenticated)
 * Input: URL param id (Document.id), query param version (เลขเวอร์ชัน, ทางเลือก)
 * Process:
 *   1. getCurrentUser() → ทราบว่า isAuthenticated หรือไม่ (ไม่ redirect ไป /login —
 *      endpoint นี้ต้องใช้ได้จาก Guest ด้วยสำหรับเอกสาร public)
 *   2. version ที่ระบุมาแต่ parse เป็นจำนวนเต็มบวกไม่ได้ → ถือว่าไม่ได้ระบุ (ไม่ error)
 *   3. Query เอกสาร+เวอร์ชันเป้าหมายพร้อมกันในครั้งเดียว (ไม่ query สองรอบ — ป้องกัน
 *      TOCTOU ระหว่างตรวจสิทธิ์กับดึงไฟล์): ถ้าระบุ version มาให้ตรง versionNo นั้น
 *      เป๊ะ, ถ้าไม่ระบุให้ใช้ APPROVED ล่าสุดตาม versionNo (เหมือน BASE_FROM_JOIN ของ
 *      library.ts)
 *   4. ไม่พบแถวผลลัพธ์ (id ไม่มีอยู่จริง, เวอร์ชันที่ระบุไม่มีอยู่จริง, เวอร์ชันที่ระบุ
 *      ไม่ใช่ APPROVED, หรือเอกสาร isPublic=false ขณะที่ไม่ได้ login) → 404 ผ่าน
 *      notFoundOrForbidden() (ไม่แยกข้อความทั้งสี่กรณี — ป้องกัน IDOR enumeration
 *      เดียวกับ src/lib/guard.ts)
 *   5. พบแถวแล้วแต่ resolveFileUrl(fileKey) คืน null (fileKey เป็น null/ยังไม่เชื่อม
 *      object storage จริง — M8) → 503 file_unavailable (ต่างจาก 404 โดยตั้งใจ:
 *      ผู้เรียกผ่านการตรวจสิทธิ์แล้ว การบอกว่า "ไฟล์ยังไม่พร้อม" ไม่รั่วไหลข้อมูลใดๆ
 *      เพิ่มเติมเกี่ยวกับสิทธิ์การเข้าถึง — ดู prisma/library-pages.md §5)
 *   6. resolveFileUrl() คืน URL จริง → 307 redirect ไปที่ URL นั้น (ยังไม่เกิดขึ้นจริง
 *      ในเฟสนี้เพราะ resolveFileUrl() เป็น placeholder เสมอ — เขียนไว้ล่วงหน้าสำหรับ
 *      เมื่อเชื่อมต่อ M8 จริงในอนาคต)
 * Output: 307 redirect (มีไฟล์จริง, ยังไม่เกิดในเฟสนี้) | 404 not_found | 503
 *         file_unavailable | 500 (database error)
 * Permission: ตรงกับ src/lib/library.ts (isAuthenticated OR isPublic) — ไม่ใช้
 *             guardRoute()/FILES-module scope เพราะเหตุผลเดียวกับ library.ts
 * Validation: id เป็น string จาก URL segment เสมอ; version (ถ้ามี) ต้องเป็นจำนวน
 *             เต็มบวก มิฉะนั้นถือว่าไม่ได้ระบุ
 * Error State: 404 (ไม่มีอยู่จริง/ไม่มีสิทธิ์เห็น/เวอร์ชันที่ระบุไม่ใช่ APPROVED),
 *              503 (มีสิทธิ์เห็นแต่ไฟล์จริงยังไม่พร้อมใช้งาน — M8 ยังไม่เชื่อมต่อ),
 *              500 (database error)
 * Audit: ไม่บันทึก (read-only, ไม่มีการเปลี่ยนแปลงข้อมูล)
 * Acceptance Criteria:
 *   AC1: เอกสาร private (isPublic=false) → Guest ได้ 404, ผู้ใช้ที่ login แล้ว
 *        (ทุกบทบาท) ได้ผลลัพธ์ปกติ (503 ในเฟสนี้ เพราะยังไม่มีไฟล์จริง)
 *   AC2: เอกสาร/เวอร์ชันที่ไม่มีอยู่จริง หรือเวอร์ชันที่ไม่ใช่ APPROVED (DRAFT/RETIRED)
 *        → 404 เสมอ ไม่ว่าจะ login หรือไม่
 *   AC3: เอกสารที่มีสิทธิ์เห็นจริงแต่ fileKey เป็น null → 503 file_unavailable
 *        ไม่ใช่ 404/500 (permission ผ่านแล้ว แค่ไฟล์ยังไม่พร้อม)
 *   AC4: version query param ที่ไม่ใช่ตัวเลข/ติดลบ/ศูนย์ → ถือว่าไม่ได้ระบุ ใช้เวอร์ชัน
 *        ล่าสุดที่ APPROVED แทน ไม่ error
 */
export async function GET(
  req: NextRequest,
  ctx: RouteContext<"/api/library/[id]/download">,
) {
  const { id } = await ctx.params;
  const user = await getCurrentUser();
  const isAuthenticated = user !== null;

  const rawVersion = req.nextUrl.searchParams.get("version");
  const requestedVersion = rawVersion ? Number.parseInt(rawVersion, 10) : undefined;
  const hasValidRequestedVersion =
    requestedVersion !== undefined && Number.isInteger(requestedVersion) && requestedVersion > 0;

  const visibilitySql = isAuthenticated ? "" : `AND d."isPublic" = true`;

  const { rows } = await query<{ fileKey: string | null }>(
    hasValidRequestedVersion
      ? `SELECT dv."fileKey" AS "fileKey"
           FROM documents d
           JOIN document_versions dv ON dv."documentId" = d.id
          WHERE d.id = $1 AND d."deletedAt" IS NULL ${visibilitySql}
            AND dv."versionNo" = $2 AND dv.status = 'APPROVED'`
      : `SELECT dv."fileKey" AS "fileKey"
           FROM documents d
           JOIN document_versions dv ON dv."documentId" = d.id
          WHERE d.id = $1 AND d."deletedAt" IS NULL ${visibilitySql}
            AND dv.status = 'APPROVED'
          ORDER BY dv."versionNo" DESC
          LIMIT 1`,
    hasValidRequestedVersion ? [id, requestedVersion] : [id],
  );

  const row = rows[0];
  if (!row) {
    return notFoundOrForbidden();
  }

  const fileUrl = resolveFileUrl(row.fileKey);
  if (!fileUrl) {
    return NextResponse.json({ error: "file_unavailable" }, { status: 503 });
  }

  return NextResponse.redirect(fileUrl);
}
