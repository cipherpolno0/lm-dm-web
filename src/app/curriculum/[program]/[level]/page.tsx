import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getProgramBySlug,
  getLevelBySlug,
  getCurrentCurriculumForProgram,
  listSubjectsForLevel,
  parseExamTypeParam,
} from "@/lib/curriculum";
import { EXAM_TYPES, type ExamType } from "@/lib/domain-types";

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  MULTIPLE_CHOICE: "ปรนัย",
  ESSAY: "อัตนัย/เรียงความ",
  MIXED: "ผสม",
};

export async function generateMetadata({
  params,
}: PageProps<"/curriculum/[program]/[level]">): Promise<Metadata> {
  const { program: programSlug, level: levelSlug } = await params;
  const program = await getProgramBySlug(programSlug);
  if (!program) return { title: "ไม่พบสายการศึกษา" };
  const level = await getLevelBySlug(program.id, levelSlug);
  if (!level) return { title: "ไม่พบระดับชั้น" };
  return {
    title: `${level.name} — ${program.name}`,
    description: `รายวิชาของ${level.name} สายการศึกษา${program.name}`,
  };
}

/**
 * F2.1c — ดูรายวิชาของระดับชั้น (user-flows.md Flow 2 / F2.1 ขยาย) พร้อมตัวกรอง
 * ประเภทข้อสอบ (?examType=) ตามรายละเอียดงานนี้ ("...พร้อม breadcrumbs และ
 * filter")
 * Actor: Guest (Public — ไม่ตรวจสิทธิ์)
 * Input: URL params program/level (slug), query param examType (optional —
 *        MULTIPLE_CHOICE | ESSAY | MIXED)
 * Process: resolve program → resolve level ภายใน program นั้น (404 ถ้าไม่ตรง) →
 *          getCurrentCurriculumForProgram() หาหลักสูตรที่ใช้งานอยู่ปัจจุบัน →
 *          parseExamTypeParam() ตรวจค่า query กับ allowlist (ค่าที่ไม่รู้จักถือ
 *          เป็นไม่ได้ระบุ ไม่ error) → listSubjectsForLevel() ดึงวิชาตาม
 *          curriculum+level+examType ที่กรอง
 * Output: รายวิชาของระดับชั้นนี้ในหลักสูตรปัจจุบัน (คะแนนเต็ม/คะแนนผ่าน/ประเภท
 *         ข้อสอบ) พร้อมลิงก์ไปหน้ารายละเอียดวิชา
 * Permission: Public
 * Validation: program/level slug ต้องมีอยู่จริงและ isActive=true; examType ต้อง
 *             อยู่ใน allowlist ไม่เช่นนั้นถือว่าไม่ได้ระบุ (ไม่ error)
 * Error State: program หรือ level ไม่ตรง (ไม่มีจริง/ปิดใช้งานแล้ว) → notFound()
 *              (404, ทดสอบจริงแล้วทั้งสองกรณี); สายการศึกษายังไม่มีหลักสูตรเผยแพร่
 *              เลย (เช่น บาลี) หรือระดับชั้นนี้ยังไม่มีวิชาในหลักสูตรปัจจุบัน (เช่น
 *              นักธรรมชั้นโท/เอก) → EmptyState ไม่ error; examType filter ไม่ตรง
 *              วิชาใดเลย → EmptyState เช่นกัน
 * Audit: ไม่บันทึก (read-only)
 * Acceptance Criteria:
 *   AC1: program/level slug ที่ไม่ตรงกันตอบ 404 เสมอ (ทดสอบจริงแล้ว)
 *   AC2: ตัวกรอง examType ทำงานถูกต้อง ไม่ต่อ SQL string จาก input ตรงๆ
 *        (parameterized + allowlist สองชั้น — ทดสอบจริงแล้ว)
 *   AC3: ระดับชั้นที่ยังไม่มีวิชาในหลักสูตรปัจจุบันแสดง EmptyState ไม่ error/ไม่
 *        orphan (ยังกลับไปหน้าก่อนหน้าได้ผ่าน breadcrumb)
 */
export default async function LevelSubjectsPage({
  params,
  searchParams,
}: PageProps<"/curriculum/[program]/[level]">) {
  const { program: programSlug, level: levelSlug } = await params;
  const sp = await searchParams;
  const rawExamType = Array.isArray(sp.examType) ? sp.examType[0] : sp.examType;
  const examType = parseExamTypeParam(rawExamType);

  const program = await getProgramBySlug(programSlug);
  if (!program) {
    notFound();
  }
  const level = await getLevelBySlug(program.id, levelSlug);
  if (!level) {
    notFound();
  }

  const currentCurriculum = await getCurrentCurriculumForProgram(program.id);
  const subjects = currentCurriculum
    ? await listSubjectsForLevel(currentCurriculum.id, level.id, examType)
    : [];

  const basePath = `/curriculum/${program.slug}/${level.slug}`;

  return (
    <Container className="flex w-full flex-col gap-8 py-8">
      <PageHeader
        title={level.name}
        description={
          currentCurriculum
            ? `หลักสูตร: ${currentCurriculum.name} (ใช้ตั้งแต่ปีการศึกษา ${currentCurriculum.effectiveFromYearBE})`
            : `สายการศึกษา${program.name} ยังไม่มีหลักสูตรที่เผยแพร่`
        }
        breadcrumbs={[
          { label: "หลักสูตร", href: "/curriculum" },
          { label: program.name, href: `/curriculum/${program.slug}` },
          { label: level.name },
        ]}
      />

      {currentCurriculum && (
        <div className="flex flex-wrap gap-2" aria-label="กรองตามประเภทข้อสอบ">
          {EXAM_TYPES.map((type) => {
            const isActive = type === examType;
            const href = isActive ? basePath : `${basePath}?examType=${type}`;
            return (
              <Link key={type} href={href}>
                <Badge variant={isActive ? "default" : "outline"}>
                  {EXAM_TYPE_LABELS[type]}
                </Badge>
              </Link>
            );
          })}
          {examType && (
            <Link href={basePath} className="text-sm text-muted-foreground hover:text-foreground">
              ล้างตัวกรอง
            </Link>
          )}
        </div>
      )}

      {subjects.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((subject) => (
            <Link key={subject.slug} href={`${basePath}/${subject.slug}`}>
              <Card className="h-full transition-colors hover:border-foreground/30">
                <CardHeader>
                  <CardTitle>{subject.name}</CardTitle>
                  <CardDescription>
                    คะแนนเต็ม {subject.maxScore} (ผ่าน {subject.passScore}) —{" "}
                    {EXAM_TYPE_LABELS[subject.examType]}
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="ยังไม่มีรายวิชาที่ตรงเงื่อนไข"
          description={
            !currentCurriculum
              ? `สายการศึกษา${program.name} ยังไม่มีหลักสูตรที่เผยแพร่ในระบบ`
              : examType
                ? "ลองเปลี่ยนตัวกรองประเภทข้อสอบดูอีกครั้ง"
                : `ระดับชั้น${level.name} ยังไม่มีรายวิชาในหลักสูตรปัจจุบัน`
          }
        />
      )}
    </Container>
  );
}
