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
  listExamBankDocuments,
  listAllSubjects,
  getSubjectBySlug,
  parseDocumentTypeParam,
  type ExamBankDocumentSummary,
} from "@/lib/exam-bank";
import {
  listPrograms,
  getProgramBySlug,
  listLevelsForProgram,
  getLevelBySlug,
  listAcademicYears,
  parseYearParam,
} from "@/lib/curriculum";
import { parsePageParam } from "@/lib/news";
import { slugifyCode } from "@/lib/slug";
import { DOCUMENT_TYPES, type DocumentType } from "@/lib/domain-types";
import { formatThaiDate } from "@/lib/format";

export const metadata: Metadata = {
  title: "คลังข้อสอบ",
  description:
    "ค้นหาข้อสอบเก่า แบบฟอร์มกระดาษคำตอบ ระเบียบ/ประกาศ และเอกสารประกอบการสอน กรองตามหลักสูตร ชั้น ปี วิชา และประเภทเอกสาร",
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
 * F4.1 — ค้นหา/รายการเอกสารในคลังข้อสอบ (ใหม่ในงานนี้ — ไม่มีใน user-flows.md
 * เดิม เพราะ user-flows.md เขียนก่อนที่จะระบุงาน "สร้างคลังข้อสอบ + Search" —
 * ดู prisma/exam-bank-pages.md §1 สำหรับรายละเอียดขอบเขตเต็ม)
 * Actor: Guest (Public — ทุกบทบาทที่ login แล้วก็เข้าถึงหน้านี้ได้เหมือนกัน หน้านี้
 *        ไม่ตรวจสิทธิ์)
 * Input: searchParams — program/level/subject (slug, optional), year
 *        (พ.ศ., optional), documentType (allowlist, optional), q (คำค้นหา,
 *        optional), page (เลขหน้า, optional)
 * Process: resolve program → resolve level (เฉพาะเมื่อ resolve program ได้แล้ว
 *          เท่านั้น — ดู Validation) → resolve subject (global) → parseYearParam
 *          → parseDocumentTypeParam (allowlist) → parsePageParam →
 *          listExamBankDocuments() query เฉพาะเอกสารที่มีเวอร์ชัน APPROVED อย่าง
 *          น้อยหนึ่งเวอร์ชัน (deny-by-default) พร้อมแบ่งหน้า
 * Output: รายการเอกสาร (ชื่อเรื่อง, ประเภท, ชั้น/วิชา/ปีที่ผูก, วันที่อนุมัติ) พร้อม
 *         ตัวกรองและ pagination
 * Permission: Public — เฉพาะเอกสารที่มีเวอร์ชันอนุมัติแล้วเท่านั้น (ไม่มีเนื้อหา
 *             ข้อสอบจริง/เฉลยปนอยู่ — ดู comment หัวไฟล์ src/lib/exam-bank.ts)
 * Validation: program/subject slug ที่ resolve ไม่ได้ถือว่าไม่ได้ระบุตัวกรองนั้น
 *             (ไม่ error, ไม่ 404 — เป็นตัวกรอง ไม่ใช่ URL segment ที่ต้องมีจริง);
 *             level slug ที่ให้มาโดยไม่มี program ที่ resolve ได้จะถูกละเว้น (ไม่
 *             สามารถ resolve education_levels.code ได้โดยไม่ทราบ programId เพราะ
 *             code ไม่ unique ข้าม program — ดู prisma/schema.prisma); year/
 *             documentType ที่ parse ไม่ได้/ไม่อยู่ใน allowlist ถือว่าไม่ได้ระบุ
 * Error State: query ล้มเหลว → error bubble ไปที่ error.tsx ของ segment; ไม่มี
 *              ผลลัพธ์ตรงเงื่อนไข (รวมกรณี q เป็นคำที่ไม่มีในชื่อเรื่องใดเลย) →
 *              EmptyState ไม่ error
 * Audit: ไม่บันทึก (read-only, ไม่ใช่ข้อมูลสำคัญ)
 * Acceptance Criteria:
 *   AC1: query คำค้นภาษาไทยทำงานถูกต้อง (ILIKE, parameterized เสมอ — ป้องกัน SQL
 *        injection)
 *   AC2: ทุก combination ของตัวกรอง (หลักสูตร/ชั้น/ปี/วิชา/ประเภทเอกสาร) ทำงาน
 *        ถูกต้องร่วมกัน (AND ทุกเงื่อนไข)
 *   AC3: เอกสารที่ยังไม่อนุมัติ (DRAFT/PENDING_REVIEW) หรือถูกถอดแล้ว (RETIRED/
 *        REJECTED) ไม่ปรากฏในรายการไม่ว่าจะกรองด้วยเงื่อนไขใด
 *   AC4: ไม่มีผลลัพธ์ตรงเงื่อนไข → EmptyState (empty state ผ่าน test cases)
 */
export default async function ExamBankListPage({
  searchParams,
}: PageProps<"/exam-bank">) {
  const sp = await searchParams;
  const rawProgram = first(sp.program);
  const rawLevel = first(sp.level);
  const rawSubject = first(sp.subject);
  const rawYear = first(sp.year);
  const rawDocumentType = first(sp.documentType);
  const rawQ = first(sp.q);
  const rawPage = first(sp.page);

  const page = parsePageParam(rawPage);
  const q = rawQ?.trim() || undefined;
  const yearBE = parseYearParam(rawYear);
  const documentType = parseDocumentTypeParam(rawDocumentType);

  const [program, subject, programs, subjects, academicYears] = await Promise.all([
    rawProgram ? getProgramBySlug(rawProgram) : Promise.resolve(null),
    rawSubject ? getSubjectBySlug(rawSubject) : Promise.resolve(null),
    listPrograms(),
    listAllSubjects(),
    listAcademicYears(),
  ]);

  // level slug ต้อง resolve ภายใต้ program ที่ resolve ได้แล้วเท่านั้น (ดู
  // Validation ด้านบน) — ไม่มี program ที่ใช้ได้ = ไม่มีทางรู้ levelId ที่ถูกต้อง
  const [level, levelsForProgram] = await Promise.all([
    program && rawLevel ? getLevelBySlug(program.id, rawLevel) : Promise.resolve(null),
    program ? listLevelsForProgram(program.id) : Promise.resolve([]),
  ]);

  const result = await listExamBankDocuments({
    page,
    programId: program?.id,
    levelId: level?.id,
    subjectId: subject?.id,
    yearBE,
    documentType,
    q,
  });

  const subjectSlug = subject ? slugifyCode(subject.code) : undefined;
  const hasAnyFilter = Boolean(
    program || level || subject || yearBE || documentType || q,
  );

  const buildPageHref = (targetPage: number) => {
    const params = new URLSearchParams();
    if (program) params.set("program", program.slug);
    if (level) params.set("level", level.slug);
    if (subjectSlug) params.set("subject", subjectSlug);
    if (yearBE) params.set("year", String(yearBE));
    if (documentType) params.set("documentType", documentType);
    if (q) params.set("q", q);
    params.set("page", String(targetPage));
    return `/exam-bank?${params.toString()}`;
  };

  return (
    <Container className="flex w-full flex-col gap-8 py-8">
      <PageHeader
        title="คลังข้อสอบ"
        description="ข้อสอบเก่า แบบฟอร์มกระดาษคำตอบ ระเบียบ/ประกาศ และเอกสารประกอบการสอน"
        breadcrumbs={[{ label: "คลังข้อสอบ" }]}
      />

      <form
        action="/exam-bank"
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
              <Link href="/exam-bank">ล้างตัวกรองทั้งหมด</Link>
            </Button>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Select name="program" defaultValue={program?.slug ?? ""} aria-label="กรองตามหลักสูตร">
            <option value="">ทุกหลักสูตร</option>
            {programs.map((p) => (
              <option key={p.slug} value={p.slug}>
                {p.name}
              </option>
            ))}
          </Select>

          {/* Progressive disclosure: ตัวเลือกชั้นจะปรากฏก็ต่อเมื่อเลือกหลักสูตรและ
              submit ฟอร์มไปแล้วเท่านั้น (ต้อง reload หน้าเต็ม — ไม่มี JS ฝั่ง
              client มาทำ cascading dropdown สด — สอดคล้องกับ pattern เดิมของ
              /news และ /curriculum) — disabled เมื่อไม่มีหลักสูตรที่ resolve ได้
              เพื่อไม่ให้ browser ส่งค่า level ที่ไม่มีบริบทมาด้วย */}
          <Select
            name="level"
            defaultValue={level?.slug ?? ""}
            aria-label="กรองตามชั้น"
            disabled={!program}
          >
            <option value="">
              {program ? "ทุกระดับชั้น" : "เลือกหลักสูตรก่อน"}
            </option>
            {levelsForProgram.map((lvl) => (
              <option key={lvl.slug} value={lvl.slug}>
                {lvl.name}
              </option>
            ))}
          </Select>

          <Select name="subject" defaultValue={subjectSlug ?? ""} aria-label="กรองตามวิชา">
            <option value="">ทุกวิชา</option>
            {subjects.map((subj) => (
              <option key={subj.slug} value={subj.slug}>
                {subj.name}
              </option>
            ))}
          </Select>

          <Select name="year" defaultValue={yearBE ? String(yearBE) : ""} aria-label="กรองตามปีการศึกษา">
            <option value="">ทุกปีการศึกษา</option>
            {academicYears.map((y) => (
              <option key={y.yearBE} value={y.yearBE}>
                พ.ศ. {y.yearBE}
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
          {result.documents.map((doc: ExamBankDocumentSummary) => (
            <Link key={doc.id} href={`/exam-bank/${doc.id}`}>
              <Card className="h-full transition-colors hover:border-foreground/30">
                <CardHeader>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{DOCUMENT_TYPE_LABELS[doc.documentType]}</Badge>
                    {doc.academicYearBE && (
                      <Badge variant="outline">พ.ศ. {doc.academicYearBE}</Badge>
                    )}
                  </div>
                  <CardTitle>{doc.title}</CardTitle>
                  <CardDescription>
                    {[doc.levelName, doc.subjectName].filter(Boolean).join(" • ") ||
                      "ไม่ระบุชั้น/วิชา"}
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
              : "ยังไม่มีเอกสารที่เผยแพร่ในคลังข้อสอบขณะนี้"
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
