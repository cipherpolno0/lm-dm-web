import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getCurrentUser } from "@/lib/authz";
import { getLibraryDocumentById } from "@/lib/library";
import { type DocumentType } from "@/lib/domain-types";
import { formatThaiDate, formatFileSize } from "@/lib/format";

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  EXAM_PAPER_PRINT: "ข้อสอบเก่า (ฉบับพิมพ์)",
  ANSWER_SHEET_TEMPLATE: "แบบฟอร์มกระดาษคำตอบ",
  CIRCULAR: "ระเบียบ/ประกาศ",
  STUDY_MATERIAL: "เอกสารประกอบการสอน",
  OTHER: "อื่นๆ",
};

export async function generateMetadata({
  params,
}: PageProps<"/library/[id]">): Promise<Metadata> {
  const { id } = await params;
  const user = await getCurrentUser();
  const document = await getLibraryDocumentById(id, user !== null);
  if (!document) {
    return { title: "ไม่พบเอกสาร" };
  }
  return {
    title: document.title,
    description: `${DOCUMENT_TYPE_LABELS[document.documentType]} — ห้องสมุด`,
  };
}

/**
 * F8.2 — ดูรายละเอียดเอกสารในห้องสมุด + metadata/preview/ประวัติเวอร์ชัน/ดาวน์โหลด
 * (งาน "สร้างห้องสมุด PDF/Download" — ดู prisma/library-pages.md §1)
 * Actor: Guest (เอกสาร isPublic=true เท่านั้น) หรือผู้ใช้ที่ login แล้วทุกบทบาท
 *        (เอกสารใดก็ได้ที่มีเวอร์ชัน APPROVED)
 * Input: URL param id (Document.id)
 * Process: getCurrentUser() → getLibraryDocumentById(id, isAuthenticated) —
 *          ค้นหาเฉพาะเอกสารที่มีเวอร์ชัน APPROVED อย่างน้อยหนึ่งเวอร์ชัน และผ่าน
 *          เงื่อนไข public/private (deny-by-default)
 * Output: metadata เอกสาร (ชื่อเรื่อง, ประเภท, หมวดหมู่, แท็ก, สถานะ public/private),
 *         preview (placeholder — ยังไม่เชื่อม object storage จริง), ประวัติเวอร์ชัน
 *         ที่ APPROVED ทั้งหมดเรียงจากใหม่ไปเก่าพร้อมลิงก์ดาวน์โหลดแต่ละเวอร์ชัน
 * Permission: Public เฉพาะเอกสาร isPublic=true, เอกสาร isPublic=false ต้อง login
 *             (ทุกบทบาท) — ดู src/lib/library.ts สำหรับเหตุผลเต็ม
 * Validation: id ต้องมีอยู่จริง มีเวอร์ชัน APPROVED อย่างน้อยหนึ่งเวอร์ชัน และผ่าน
 *             เงื่อนไข public/private — ไม่ผ่านเงื่อนไขใดก็ตามได้ผลลัพธ์เดียวกันคือ
 *             notFound() เสมอ (ไม่แยกข้อความ — ป้องกันการเดาว่ามีเอกสาร private/
 *             DRAFT/RETIRED อยู่จริงตาม id นี้)
 * Error State: ไม่พบ/ไม่มีสิทธิ์เห็น → 404 (notFound()); query ล้มเหลว → error
 *              bubble ไปที่ error.tsx ของ segment
 * Audit: ไม่บันทึก (read-only)
 * Acceptance Criteria:
 *   AC1: เอกสาร private (isPublic=false) → Guest ได้ 404, ผู้ใช้ที่ login แล้วเห็น
 *        ปกติ (ทดสอบด้วย STUDENT ซึ่งมี FILES-module scope จำกัดสุด)
 *   AC2: เอกสารที่มีเวอร์ชัน APPROVED มากกว่าหนึ่งเวอร์ชัน แสดงประวัติทุกเวอร์ชัน
 *        เรียงจากใหม่ไปเก่า พร้อมลิงก์ดาวน์โหลดของแต่ละเวอร์ชันแยกกัน
 *   AC3: ปุ่ม/ลิงก์ดาวน์โหลดชี้ไปที่ /api/library/[id]/download (พร้อม ?version=
 *        สำหรับเวอร์ชันที่ไม่ใช่ล่าสุด) ไม่ทำให้ผู้ใช้เข้าใจผิดว่ามีไฟล์จริงพร้อมโหลด
 *        เมื่อ hasFile=false (M8 ยังไม่เชื่อมต่อ — แสดงข้อความอธิบายกำกับ)
 *   AC4: เอกสารที่ไม่มีอยู่จริง/DRAFT/RETIRED → 404 เหมือนกันหมด
 */
export default async function LibraryDetailPage({
  params,
}: PageProps<"/library/[id]">) {
  const { id } = await params;
  const user = await getCurrentUser();
  const document = await getLibraryDocumentById(id, user !== null);
  if (!document) {
    notFound();
  }

  return (
    <Container className="flex w-full max-w-2xl flex-col gap-6 py-8">
      <PageHeader
        title={document.title}
        breadcrumbs={[
          { label: "ห้องสมุด", href: "/library" },
          { label: document.title },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{DOCUMENT_TYPE_LABELS[document.documentType]}</Badge>
        <Badge variant={document.isPublic ? "outline" : "default"}>
          {document.isPublic ? "สาธารณะ" : "ภายใน (ต้องเข้าสู่ระบบ)"}
        </Badge>
        <Badge variant="outline">เวอร์ชันที่อนุมัติล่าสุด #{document.currentVersionNo}</Badge>
      </div>

      {(document.categories.length > 0 || document.tags.length > 0) && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          {document.categories.length > 0 && (
            <span>หมวดหมู่: {document.categories.join(", ")}</span>
          )}
          {document.tags.length > 0 && <span>แท็ก: {document.tags.join(", ")}</span>}
        </div>
      )}

      {/* Preview — placeholder เสมอในเฟสนี้ (ไม่มี fileKey จริงในข้อมูลจำลองชุดใดเลย
          — ดู src/lib/library.ts::resolveFileUrl) แสดงข้อความอธิบายที่ชัดเจนแทน
          กรอบ iframe ว่างเปล่าที่ทำให้ผู้ใช้เข้าใจผิดว่าโหลดไม่สำเร็จ */}
      <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-10 text-center">
        <p className="text-sm font-medium">ยังไม่รองรับการแสดงตัวอย่างไฟล์</p>
        <p className="text-sm text-muted-foreground">
          ระบบยังไม่เชื่อมต่อกับที่จัดเก็บไฟล์จริง (Object Storage) — ใช้ปุ่มดาวน์โหลด
          ด้านล่างเมื่อพร้อมใช้งาน
        </p>
      </div>

      <div className="rounded-lg border">
        <div className="border-b p-4">
          <p className="text-sm font-medium">ประวัติเวอร์ชัน</p>
          <p className="mt-1 text-sm text-muted-foreground">
            แสดงเฉพาะเวอร์ชันที่อนุมัติแล้ว เรียงจากล่าสุดไปเก่าสุด
          </p>
        </div>
        <ul className="divide-y">
          {document.versions.map((v) => (
            <li key={v.versionNo} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium">
                  เวอร์ชัน #{v.versionNo}
                  {v.versionNo === document.currentVersionNo && (
                    <Badge variant="secondary" className="ml-2">
                      ล่าสุด
                    </Badge>
                  )}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {v.approvedAt ? `อนุมัติเมื่อ ${formatThaiDate(v.approvedAt)}` : "ไม่ระบุวันที่อนุมัติ"}
                  {" • "}
                  {v.fileName ?? "ไม่มีชื่อไฟล์ระบุไว้"}
                  {v.mimeType ? ` (${v.mimeType})` : ""}
                  {formatFileSize(v.fileSize) ? ` • ${formatFileSize(v.fileSize)}` : ""}
                </p>
              </div>
              {/* fileKey เป็นเพียงคอลัมน์ placeholder — ยังไม่เชื่อมกับระบบจัดเก็บไฟล์
                  จริง (M8) ในงานนี้ ปุ่มจึงถูก disable ไว้พร้อมข้อความอธิบายที่ชัดเจน
                  แทนที่จะแสดงเป็นลิงก์ที่ใช้งานได้จริงแต่ไม่มีไฟล์ให้โหลด — ดู
                  prisma/library-pages.md §5 (endpoint /api/library/[id]/download
                  ยังคงมีอยู่จริงและตอบ 503 file_unavailable อย่างถูกต้องหากเรียกตรง) */}
              {v.hasFile ? (
                <Button variant="outline" size="sm" asChild>
                  <a href={`/api/library/${document.id}/download?version=${v.versionNo}`}>ดาวน์โหลด</a>
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" disabled>
                  ดาวน์โหลด (ยังไม่เชื่อมต่อระบบจัดเก็บไฟล์)
                </Button>
              )}
            </li>
          ))}
        </ul>
      </div>
    </Container>
  );
}
