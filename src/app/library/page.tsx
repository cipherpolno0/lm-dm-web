import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import {
  listLibraryDocuments,
  listCategories,
  listTags,
  parseDocumentTypeParam,
  type LibraryDocumentSummary,
} from "@/lib/library";
import { getCurrentUser } from "@/lib/authz";
import { parsePageParam } from "@/lib/news";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain-types";
import { formatThaiDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "ห้องสมุด",
  description:
    "ค้นหาเอกสาร PDF ทั้งหมด กรองตามหมวดหมู่ แท็ก และประเภทเอกสาร — เอกสารบางรายการต้องเข้าสู่ระบบก่อนจึงเข้าถึงได้",
};

const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  EXAM_PAPER_PRINT: "ข้อสอบเก่า (ฉบับพิมพ์)",
  ANSWER_SHEET_TEMPLATE: "แบบฟอร์มกระดาษคำตอบ",
  CIRCULAR: "ระเบียบ/ประกาศ",
  STUDY_MATERIAL: "เอกสารประกอบการสอน",
  OTHER: "อื่นๆ",
};

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * F8.1 — ค้นหา/รายการเอกสารในห้องสมุด (งาน "สร้างห้องสมุด PDF/Download" — ดู
 * prisma/library-pages.md §1)
 * Actor: Guest (เห็นเฉพาะเอกสาร isPublic=true) หรือผู้ใช้ที่ login แล้วทุกบทบาท
 *        (เห็นทั้ง public และ private — หน้านี้ไม่ redirect/ไม่บังคับ login)
 * Input: searchParams — category (Category.id, optional), tag (Tag.name ตรงๆ,
 *        optional — เหมือนแนวทาง q ของ exam-bank ที่ใช้ภาษาไทยใน query param ได้
 *        ตรงๆ), documentType (allowlist, optional), q (คำค้นหาในชื่อเรื่อง,
 *        optional), page (เลขหน้า, optional)
 * Process: getCurrentUser() → ทราบ isAuthenticated → parseDocumentTypeParam →
 *          parsePageParam → listLibraryDocuments() query เฉพาะเอกสารที่มีเวอร์ชัน
 *          APPROVED อย่างน้อยหนึ่งเวอร์ชัน (deny-by-default) และผ่านเงื่อนไข
 *          public/private ตาม isAuthenticated พร้อมแบ่งหน้า
 * Output: รายการเอกสาร (ชื่อเรื่อง, ประเภท, สถานะ public/private, วันที่อนุมัติ
 *         เวอร์ชันล่าสุด) พร้อมตัวกรองและ pagination
 * Permission: Guest เห็นเฉพาะ isPublic=true, ผู้ใช้ที่ login แล้วเห็นทั้งหมด (ดู
 *             src/lib/library.ts สำหรับเหตุผลเต็มที่ไม่ตรวจ role/scope เพิ่มเติม)
 * Validation: category ที่ไม่มีอยู่จริง/tag ที่ไม่มีอยู่จริง/documentType ที่ไม่อยู่
 *             ใน allowlist ถือว่าไม่ได้ระบุตัวกรองนั้น (ไม่ error, ไม่ 404)
 * Error State: query ล้มเหลว → error bubble ไปที่ error.tsx ของ segment; ไม่มี
 *              ผลลัพธ์ตรงเงื่อนไข → EmptyState ไม่ error
 * Audit: ไม่บันทึก (read-only)
 * Acceptance Criteria:
 *   AC1: Guest ไม่เห็นเอกสาร isPublic=false ไม่ว่าจะกรองด้วยเงื่อนไขใด
 *   AC2: ผู้ใช้ที่ login แล้ว (ทดสอบด้วย STUDENT ซึ่งมี FILES-module scope จำกัดสุด)
 *        เห็นทั้งเอกสาร public และ private
 *   AC3: filter หมวดหมู่/แท็ก/ประเภทเอกสาร/คำค้นหา ทำงานถูกต้องทั้งแยกและรวมกัน
 *        (AND ทุกเงื่อนไข)
 *   AC4: ไม่มีผลลัพธ์ตรงเงื่อนไข → EmptyState
 */
export default async function LibraryListPage({
  searchParams,
}: PageProps<"/library">) {
  const sp = await searchParams;
  const rawCategory = first(sp.category);
  const rawTag = first(sp.tag);
  const rawDocumentType = first(sp.documentType);
  const rawQ = first(sp.q);
  const rawPage = first(sp.page);

  const page = parsePageParam(rawPage);
  const q = rawQ?.trim() || undefined;
  const documentType = parseDocumentTypeParam(rawDocumentType);
  const tag = rawTag?.trim() || undefined;

  const [user, categories, tags] = await Promise.all([
    getCurrentUser(),
    listCategories(),
    listTags(),
  ]);
  const isAuthenticated = user !== null;

  // category ที่ไม่มีอยู่จริงใน allowlist ที่ query มาแล้วถือว่าไม่ได้ระบุ (เหมือน
  // documentType) — ไม่ trust ค่าจาก searchParams ตรงๆ ไปใช้ filter โดยไม่ตรวจสอบ
  const categoryId = rawCategory && categories.some((c) => c.id === rawCategory) ? rawCategory : undefined;
  const tagName = tag && tags.includes(tag) ? tag : undefined;

  const result = await listLibraryDocuments(
    { page, categoryId, tagName, documentType, q },
    isAuthenticated,
  );

  const hasAnyFilter = Boolean(categoryId || tagName || documentType || q);

  const buildPageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (categoryId) params.set("category", categoryId);
    if (tagName) params.set("tag", tagName);
    if (documentType) params.set("documentType", documentType);
    if (q) params.set("q", q);
    params.set("page", String(targetPage));
    return `/library?${params.toString()}`;
  };

  return (
    <Container className="flex w-full flex-col gap-8 py-8">
      <PageHeader
        title="ห้องสมุด"
        description="เอกสาร PDF ทั้งหมดของระบบ — บางรายการเป็นเอกสารภายในที่ต้องเข้าสู่ระบบก่อนจึงเข้าถึงได้"
        breadcrumbs={[{ label: "ห้องสมุด" }]}
      />

      {!isAuthenticated && (
        <p className="text-sm text-muted-foreground">
          กำลังดูในฐานะผู้เยี่ยมชม เห็นเฉพาะเอกสารสาธารณะ —{" "}
          <Link href="/login" className="underline underline-offset-2">
            เข้าสู่ระบบ
          </Link>{" "}
          เพื่อดูเอกสารภายในเพิ่มเติม
        </p>
      )}

      <form
        action="/library"
        method="get"
        role="search"
        className="flex flex-col gap-3 rounded-lg border p-4"
      >
        <div className="flex flex-wrap gap-2">
          <Input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="ค้นหาชื่อเอกสาร..."
            aria-label="ค้นหาชื่อเอกสาร"
            className="max-w-sm"
          />
          <Button type="submit" variant="outline">
            ค้นหา/กรอง
          </Button>
          {hasAnyFilter && (
            <Button type="button" variant="ghost" asChild>
              <Link href="/library">ล้างตัวกรองทั้งหมด</Link>
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Select name="category" defaultValue={categoryId ?? ""} aria-label="กรองตามหมวดหมู่">
            <option value="">ทุกหมวดหมู่</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>

          <Select name="tag" defaultValue={tagName ?? ""} aria-label="กรองตามแท็ก">
            <option value="">ทุกแท็ก</option>
            {tags.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </Select>

          <Select
            name="documentType"
            defaultValue={documentType ?? ""}
            aria-label="กรองตามประเภทเอกสาร"
          >
            <option value="">ทุกประเภทเอกสาร</option>
            {DOCUMENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {DOCUMENT_TYPE_LABELS[type]}
              </option>
            ))}
          </Select>
        </div>
      </form>

      {result.documents.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {result.documents.map((doc: LibraryDocumentSummary) => (
            <Link key={doc.id} href={`/library/${doc.id}`}>
              <Card className="h-full transition-colors hover:border-foreground/30">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{DOCUMENT_TYPE_LABELS[doc.documentType]}</Badge>
                    <Badge variant={doc.isPublic ? "outline" : "default"}>
                      {doc.isPublic ? "สาธารณะ" : "ภายใน"}
                    </Badge>
                  </div>
                  <CardTitle>{doc.title}</CardTitle>
                  <CardDescription>
                    เวอร์ชันล่าสุด #{doc.currentVersionNo}
                    {doc.approvedAt && (
                      <>
                        <br />
                        อนุมัติเมื่อ {formatThaiDate(doc.approvedAt)}
                      </>
                    )}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="ไม่พบเอกสารที่ตรงเงื่อนไข"
          description={
            hasAnyFilter
              ? "ลองเปลี่ยนคำค้นหรือตัวกรองดูอีกครั้ง"
              : isAuthenticated
                ? "ยังไม่มีเอกสารในห้องสมุดขณะนี้"
                : "ยังไม่มีเอกสารสาธารณะในห้องสมุดขณะนี้ — เข้าสู่ระบบเพื่อดูเอกสารภายใน (ถ้ามี)"
          }
        />
      )}

      {result.totalPages > 1 && (
        <nav aria-label="เปลี่ยนหน้า" className="flex items-center justify-center gap-2">
          {result.page > 1 ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildPageHref(result.page - 1)}>ก่อนหน้า</Link>
            </Button>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground opacity-50"
            >
              ก่อนหน้า
            </span>
          )}
          <span className="text-sm text-muted-foreground">
            หน้า {result.page} จาก {result.totalPages}
          </span>
          {result.page < result.totalPages ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildPageHref(result.page + 1)}>ถัดไป</Link>
            </Button>
          ) : (
            <span
              aria-disabled="true"
              className="inline-flex h-8 items-center rounded-md px-3 text-sm text-muted-foreground opacity-50"
            >
              ถัดไป
            </span>
          )}
        </nav>
      )}
    </Container>
  );
}
