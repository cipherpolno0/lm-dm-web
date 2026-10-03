import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getDocumentById } from "@/lib/exam-bank";
import { type DocumentType } from "@/lib/domain-types";
import { formatThaiDate } from "@/lib/format";

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  EXAM_PAPER_PRINT: "ข้อสอบเก่า (ฉบับพิมพ์)",
  ANSWER_SHEET_TEMPLATE: "แบบฟอร์มกระดาษคำตอบ",
  CIRCULAR: "ระเบียบ/ประกาศ",
  STUDY_MATERIAL: "เอกสารประกอบการสอน",
  OTHER: "อื่นๆ",
};

export async function generateMetadata({
  params,
}: PageProps<"/exam-bank/[id]">): Promise<Metadata> {
  const { id } = await params;
  const document = await getDocumentById(id);
  if (!document) {
    return { title: "ไม่พบเอกสาร" };
  }
  return {
    title: document.title,
    description: `${DOCUMENT_TYPE_LABELS[document.documentType]} — คลังข้อสอบ`,
  };
}

/**
 * F4.2 — ดูรายละเอียดเอกสารในคลังข้อสอบ (ใหม่ในงานนี้ — ดู
 * prisma/exam-bank-pages.md §1)
 * Actor: Guest (Public — ไม่ตรวจสิทธิ์)
 * Input: URL param id (Document.id — cuid, ไม่ใช่ slug อ่านง่าย เพราะ Document
 *        ไม่มีคอลัมน์ที่เหมาะเป็น URL slug อยู่แล้ว เช่น code/slug เฉพาะของตัวเอง
 *        เหมือน programs/education_levels/subjects — title ก็ไม่ unique พอ — ดู
 *        prisma/exam-bank-pages.md §2.2 สำหรับเหตุผลเต็ม)
 * Process: getDocumentById(id) — ค้นหาเฉพาะเอกสารที่มีเวอร์ชัน APPROVED อย่างน้อย
 *          หนึ่งเวอร์ชันเท่านั้น (deny-by-default)
 * Output: รายละเอียดเอกสาร (ชื่อเรื่อง, ประเภท, หลักสูตร/ชั้น/วิชา/ปีที่ผูก ถ้ามี,
 *         เลขเวอร์ชันปัจจุบันที่อนุมัติแล้ว, วันที่อนุมัติ, ชื่อไฟล์/ประเภทไฟล์)
 *         พร้อม SEO metadata
 * Permission: Public — เฉพาะเอกสารที่มีเวอร์ชันอนุมัติแล้วเท่านั้น
 * Validation: id ต้องมีอยู่จริงและมีเวอร์ชัน APPROVED อย่างน้อยหนึ่งเวอร์ชัน — ไม่
 *             ผ่านเงื่อนไขใดก็ตาม (ไม่พบ id เลย, พบแต่ทุกเวอร์ชันเป็น DRAFT/
 *             PENDING_REVIEW/REJECTED/RETIRED) ได้ผลลัพธ์เดียวกันคือ notFound()
 *             เสมอ — ไม่แยกข้อความ เพื่อไม่เปิดเผยว่ามีเอกสารที่ยังไม่อนุมัติ/ถูก
 *             ถอดแล้วอยู่จริงตาม id นี้ (สำคัญเป็นพิเศษสำหรับ EXAM_PAPER_PRINT ที่
 *             อาจเป็นข้อสอบที่ยังไม่ถึงกำหนดเผยแพร่)
 * Error State: ไม่พบ/ไม่มีเวอร์ชันอนุมัติ → 404 (next/navigation notFound()); query
 *              ล้มเหลว (database ล่ม) → error bubble ไปที่ error.tsx ของ segment
 * Audit: ไม่บันทึก (read-only)
 * Acceptance Criteria:
 *   AC1: เข้าถึงเอกสาร DRAFT/PENDING_REVIEW/REJECTED/RETIRED ผ่าน URL ตรงไม่ได้
 *        แม้รู้ id ที่ถูกต้องเป๊ะ (ทดสอบจริงแล้วทุกสถานะที่ไม่ใช่ APPROVED)
 *   AC2: หน้ามี <title>/meta description ตรงกับเอกสารจริง
 *   AC3: ปุ่มดาวน์โหลดแสดงเป็น disabled พร้อมข้อความอธิบายที่ชัดเจนว่ายังไม่เชื่อม
 *        ต่อ object storage จริง (M8 — นอกขอบเขตงานนี้) ไม่ทำให้ผู้ใช้เข้าใจผิดว่า
 *        กดแล้วได้ไฟล์จริง
 */
export default async function ExamBankDetailPage({
  params,
}: PageProps<"/exam-bank/[id]">) {
  const { id } = await params;
  const document = await getDocumentById(id);
  if (!document) {
    notFound();
  }

  const metaLine = [document.programName, document.levelName, document.subjectName]
    .filter(Boolean)
    .join(" • ");

  return (
    <Container className="flex w-full max-w-2xl flex-col gap-6 py-8">
      <PageHeader
        title={document.title}
        breadcrumbs={[
          { label: "คลังข้อสอบ", href: "/exam-bank" },
          { label: document.title },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{DOCUMENT_TYPE_LABELS[document.documentType]}</Badge>
        {document.academicYearBE && <Badge variant="outline">พ.ศ. {document.academicYearBE}</Badge>}
        <Badge variant="outline">เวอร์ชันที่อนุมัติ #{document.currentVersionNo}</Badge>
      </div>

      {metaLine && <p className="text-sm text-muted-foreground">{metaLine}</p>}

      {document.approvedAt && (
        <time dateTime={document.approvedAt.toISOString()} className="text-sm text-muted-foreground">
          อนุมัติเผยแพร่เมื่อ {formatThaiDate(document.approvedAt)}
        </time>
      )}

      <div className="rounded-lg border p-4">
        <p className="text-sm font-medium">ไฟล์แนบ</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {document.fileName ?? "ไม่มีชื่อไฟล์ระบุไว้"}
          {document.mimeType ? ` (${document.mimeType})` : ""}
        </p>
        {/* fileKey เป็นเพียงคอลัมน์ placeholder — ยังไม่เชื่อมกับระบบจัดเก็บไฟล์จริง
            (M8) ในงานนี้ ปุ่มจึงถูก disable ไว้พร้อมข้อความอธิบายที่ชัดเจน แทนที่
            จะแสดงเป็นปุ่มดาวน์โหลดที่ใช้งานได้จริงแต่ไม่มีไฟล์ให้โหลด (ป้องกัน
            ผู้ใช้เข้าใจผิด — ดู prisma/exam-bank-pages.md §6) */}
        <Button type="button" variant="outline" size="sm" className="mt-3" disabled>
          ดาวน์โหลด (ยังไม่เชื่อมต่อระบบจัดเก็บไฟล์)
        </Button>
      </div>
    </Container>
  );
}
