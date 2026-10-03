import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getProgramBySlug,
  getLevelBySlug,
  getCurrentCurriculumForProgram,
  getSubjectInLevelBySlug,
  listExamScheduleForSubject,
  listAcademicYears,
  parseYearParam,
} from "@/lib/curriculum";
import { formatThaiDateTime } from "@/lib/format";
import type { ExamType } from "@/lib/domain-types";

const EXAM_TYPE_LABELS: Record<ExamType, string> = {
  MULTIPLE_CHOICE: "ปรนัย",
  ESSAY: "อัตนัย/เรียงความ",
  MIXED: "ผสม",
};

export async function generateMetadata({
  params,
}: PageProps<"/curriculum/[program]/[level]/[subject]">): Promise<Metadata> {
  const { program: programSlug, level: levelSlug, subject: subjectSlug } = await params;
  const program = await getProgramBySlug(programSlug);
  if (!program) return { title: "ไม่พบสายการศึกษา" };
  const level = await getLevelBySlug(program.id, levelSlug);
  if (!level) return { title: "ไม่พบระดับชั้น" };
  const currentCurriculum = await getCurrentCurriculumForProgram(program.id);
  const subject = currentCurriculum
    ? await getSubjectInLevelBySlug(currentCurriculum.id, level.id, subjectSlug)
    : null;
  if (!subject) return { title: "ไม่พบรายวิชา" };
  return {
    title: `${subject.name} — ${level.name} (${program.name})`,
    description: `รายละเอียดวิชา${subject.name} ของ${level.name} สายการศึกษา${program.name} พร้อมตารางสอบ`,
  };
}

/**
 * F2.1d + F2.2 (ขอบเขต) — ดูรายละเอียดวิชา และตารางสอบของวิชานั้น (user-flows.md
 * Flow 2) — เป็นขั้นสุดท้ายของการ browse program → level → subject → year โดย
 * "year" ในที่นี้ตีความเป็นตัวกรอง (?year=) บนส่วนตารางสอบของหน้านี้ ไม่ใช่ URL
 * segment แยก — เหตุผล: คะแนนเต็ม/คะแนนผ่าน/ประเภทข้อสอบเป็นคุณสมบัติของหลักสูตร
 * (คงที่ไม่ผูกปี) ส่วนที่เปลี่ยนแปลงตามปีจริงคือ "มีรอบสอบปีไหนบ้างที่สอบวิชานี้"
 * เท่านั้น — แยก URL segment ต่อปีจะสร้างหน้าเนื้อหาบางๆซ้ำซ้อนจำนวนมาก (ปี×วิชา)
 * ที่ส่วนใหญ่ไม่มีรอบสอบเลย ขัดกับ "ไม่มี orphan page" ในวิธีตรวจสอบของงานนี้ — ดู
 * prisma/curriculum-pages.md §3 สำหรับรายละเอียดการตัดสินใจนี้
 *
 * Actor: Guest (Public — ไม่ตรวจสิทธิ์)
 * Input: URL params program/level/subject (slug), query param year (optional —
 *        พ.ศ. เช่น 2568)
 * Process: resolve program → level → getCurrentCurriculumForProgram() →
 *          getSubjectInLevelBySlug() ยืนยันว่าวิชานี้อยู่ในหลักสูตร+ระดับชั้นนี้
 *          จริง (404 ถ้าไม่ใช่) → parseYearParam() ตรวจรูปแบบปี (ไม่ error ถ้าผิด
 *          รูปแบบ ถือว่าไม่ได้ระบุ) → listExamScheduleForSubject() ดึงตารางสอบ
 *          ของวิชานี้ กรองตามปีถ้าระบุ
 * Output: รายละเอียดวิชา (คะแนนเต็ม/คะแนนผ่าน/ประเภทข้อสอบ) + รายการรอบสอบที่มี
 *         วิชานี้ (ปีการศึกษา, วันเวลาสอบ, สนามสอบ)
 * Permission: Public
 * Validation: program/level/subject slug ต้องมีอยู่จริงและวิชานั้นต้องอยู่ใน
 *             หลักสูตร+ระดับชั้นที่ระบุจริง; year query param ต้องเป็นจำนวนเต็มใน
 *             ช่วง พ.ศ. 2400-2700 ไม่เช่นนั้นถือว่าไม่ได้ระบุ (ไม่ error)
 * Error State: program/level ไม่ตรง หรือวิชาไม่มีอยู่จริง หรือวิชามีอยู่จริงแต่ไม่
 *              ได้อยู่ในหลักสูตร/ระดับชั้นนี้ (เช่น วิชาข้ามระดับชั้น) → notFound()
 *              (404) เหมือนกันทุกกรณี ไม่แยกข้อความ (deny-by-default); ไม่มีรอบสอบ
 *              ตรงปีที่กรอง → EmptyState เฉพาะส่วนตารางสอบ ไม่กระทบส่วนรายละเอียด
 *              วิชาด้านบน
 * Audit: ไม่บันทึก (read-only)
 * Acceptance Criteria:
 *   AC1: program/level/subject slug ที่ไม่ตรงกัน (รวมถึงวิชาที่มีจริงแต่อยู่คนละ
 *        ระดับชั้น) ตอบ 404 เสมอ (ทดสอบจริงแล้ว)
 *   AC2: ตัวกรองปีการศึกษาทำงานถูกต้อง แสดงเฉพาะรอบสอบปีที่เลือก (ทดสอบจริงแล้ว)
 *   AC3: query param ปีที่ผิดรูปแบบ (ไม่ใช่ตัวเลข) ไม่ error — ถือว่าไม่กรอง แสดง
 *        ทุกปี (ทดสอบจริงแล้ว)
 */
export default async function SubjectDetailPage({
  params,
  searchParams,
}: PageProps<"/curriculum/[program]/[level]/[subject]">) {
  const { program: programSlug, level: levelSlug, subject: subjectSlug } = await params;
  const sp = await searchParams;
  const rawYear = Array.isArray(sp.year) ? sp.year[0] : sp.year;
  const year = parseYearParam(rawYear);

  const program = await getProgramBySlug(programSlug);
  if (!program) {
    notFound();
  }
  const level = await getLevelBySlug(program.id, levelSlug);
  if (!level) {
    notFound();
  }
  const currentCurriculum = await getCurrentCurriculumForProgram(program.id);
  const subject = currentCurriculum
    ? await getSubjectInLevelBySlug(currentCurriculum.id, level.id, subjectSlug)
    : null;
  if (!subject) {
    notFound();
  }

  const [schedule, academicYears] = await Promise.all([
    listExamScheduleForSubject(subject.clsId, year),
    listAcademicYears(),
  ]);

  const levelPath = `/curriculum/${program.slug}/${level.slug}`;
  const subjectPath = `${levelPath}/${subject.slug}`;

  return (
    <Container className="flex w-full flex-col gap-8 py-8">
      <PageHeader
        title={subject.name}
        description={subject.description ?? undefined}
        breadcrumbs={[
          { label: "หลักสูตร", href: "/curriculum" },
          { label: program.name, href: `/curriculum/${program.slug}` },
          { label: level.name, href: levelPath },
          { label: subject.name },
        ]}
      />

      <Card>
        <CardHeader>
          <CardTitle>เกณฑ์การสอบ</CardTitle>
          <CardDescription>
            หลักสูตร: {currentCurriculum?.name} (ใช้ตั้งแต่ปีการศึกษา{" "}
            {currentCurriculum?.effectiveFromYearBE})
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          <span>
            คะแนนเต็ม: <strong className="text-foreground">{subject.maxScore}</strong>
          </span>
          <span>
            คะแนนผ่าน: <strong className="text-foreground">{subject.passScore}</strong>
          </span>
          <span className="flex items-center gap-2">
            ประเภทข้อสอบ: <Badge variant="secondary">{EXAM_TYPE_LABELS[subject.examType]}</Badge>
          </span>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-foreground">ตารางสอบ</h2>
          {academicYears.length > 0 && (
            <div className="flex flex-wrap gap-2" aria-label="กรองตามปีการศึกษา">
              <Link href={subjectPath}>
                <Badge variant={!year ? "default" : "outline"}>ทุกปี</Badge>
              </Link>
              {academicYears.map((ay) => (
                <Link key={ay.yearBE} href={`${subjectPath}?year=${ay.yearBE}`}>
                  <Badge variant={year === ay.yearBE ? "default" : "outline"}>
                    ปีการศึกษา {ay.yearBE}
                  </Badge>
                </Link>
              ))}
            </div>
          )}
        </div>

        {schedule.length > 0 ? (
          <div className="flex flex-col gap-3">
            {schedule.map((entry) => (
              <Card key={`${entry.examSessionId}-${entry.startAt.toISOString()}`}>
                <CardHeader>
                  <CardTitle className="text-base">
                    {entry.examSessionName ?? `รอบสอบที่ ${entry.roundNumber}`} — ปีการศึกษา{" "}
                    {entry.yearBE}
                  </CardTitle>
                  <CardDescription>
                    {formatThaiDateTime(entry.startAt)} — {formatThaiDateTime(entry.endAt)}
                  </CardDescription>
                </CardHeader>
                {entry.centerNames.length > 0 && (
                  <CardContent className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    สนามสอบ: {entry.centerNames.join(", ")}
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        ) : (
          <EmptyState
            title="ไม่มีรอบสอบตรงเงื่อนไข"
            description={
              year
                ? `ยังไม่มีการประกาศสอบวิชานี้ในปีการศึกษา ${year}`
                : "ยังไม่มีการประกาศตารางสอบสำหรับวิชานี้"
            }
          />
        )}
      </div>
    </Container>
  );
}
