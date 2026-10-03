import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
  getProgramBySlug,
  listLevelsForProgram,
  getCurrentCurriculumForProgram,
} from "@/lib/curriculum";

export async function generateMetadata({
  params,
}: PageProps<"/curriculum/[program]">): Promise<Metadata> {
  const { program: programSlug } = await params;
  const program = await getProgramBySlug(programSlug);
  if (!program) return { title: "ไม่พบสายการศึกษา" };
  return {
    title: `ระดับชั้น — ${program.name}`,
    description: `ระดับชั้นทั้งหมดของสายการศึกษา${program.name}`,
  };
}

/**
 * F2.1b — ดูรายการระดับชั้นของสายการศึกษา (user-flows.md Flow 2 / F2.1 ขยาย)
 * Actor: Guest (Public — ไม่ตรวจสิทธิ์)
 * Input: URL param program (slug ของ programs.code เช่น "nak-tham")
 * Process: getProgramBySlug() แปลง slug กลับเป็น code แล้วค้นหา (ปฏิเสธถ้าไม่พบ/
 *          ปิดใช้งานแล้ว) → listLevelsForProgram() ดึงระดับชั้นเรียงตาม sortOrder
 *          → getCurrentCurriculumForProgram() หาหลักสูตรที่ใช้งานอยู่ปัจจุบัน (ถ้า
 *          มี) เพื่อแสดงเป็นข้อมูลอ้างอิงประกอบ
 * Output: รายการระดับชั้นของสายการศึกษานั้น พร้อมชื่อ/เวอร์ชันหลักสูตรปัจจุบัน
 * Permission: Public
 * Validation: program slug ต้องแปลงกลับเป็น code ที่มีอยู่จริงและ isActive=true
 * Error State: slug ไม่ตรงสายการศึกษาใดเลย (ไม่มีจริง/ปิดใช้งานแล้ว) → notFound()
 *              (404) — ไม่แยกข้อความระหว่างสองกรณีนี้ (deny-by-default เหมือน
 *              news.getPublishedArticleBySlug); สายการศึกษามีจริงแต่ยังไม่มี
 *              ระดับชั้นเลย → EmptyState (ไม่ error, ไม่ orphan — ยังกลับไปหน้า
 *              รายการสายการศึกษาได้ผ่าน breadcrumb)
 * Audit: ไม่บันทึก (read-only)
 * Acceptance Criteria:
 *   AC1: URL ที่ไม่ตรงสายการศึกษาใดเลยตอบ 404 เสมอ (ทดสอบจริงแล้ว)
 *   AC2: breadcrumbs แสดงเส้นทาง หน้าแรก > หลักสูตร > [ชื่อสายการศึกษา] ถูกต้อง
 *   AC3: ทุกระดับชั้นมีลิงก์ไปหน้ารายวิชาต่อได้เสมอ (ไม่มี orphan)
 */
export default async function ProgramLevelsPage({
  params,
}: PageProps<"/curriculum/[program]">) {
  const { program: programSlug } = await params;
  const program = await getProgramBySlug(programSlug);
  if (!program) {
    notFound();
  }

  const [levels, currentCurriculum] = await Promise.all([
    listLevelsForProgram(program.id),
    getCurrentCurriculumForProgram(program.id),
  ]);

  return (
    <Container className="flex w-full flex-col gap-8 py-8">
      <PageHeader
        title={program.name}
        description={
          currentCurriculum
            ? `หลักสูตรปัจจุบัน: ${currentCurriculum.name} (ใช้ตั้งแต่ปีการศึกษา ${currentCurriculum.effectiveFromYearBE})`
            : program.description ?? undefined
        }
        breadcrumbs={[
          { label: "หลักสูตร", href: "/curriculum" },
          { label: program.name },
        ]}
      />

      {levels.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {levels.map((level) => (
            <Link key={level.slug} href={`/curriculum/${program.slug}/${level.slug}`}>
              <Card className="h-full transition-colors hover:border-foreground/30">
                <CardHeader>
                  <CardTitle>{level.name}</CardTitle>
                  <CardDescription>ดูรายวิชาและตารางสอบ</CardDescription>
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="ยังไม่มีระดับชั้นสำหรับสายการศึกษานี้"
          description="กรุณาตรวจสอบใหม่ภายหลัง"
        />
      )}
    </Container>
  );
}
