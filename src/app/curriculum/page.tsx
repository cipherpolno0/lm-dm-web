import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listPrograms } from "@/lib/curriculum";

export const metadata: Metadata = {
  title: "หลักสูตร: นักธรรม / ธรรมศึกษา / บาลี",
  description:
    "เรียกดูโครงสร้างหลักสูตรและระดับชั้นของสายการศึกษานักธรรม ธรรมศึกษา และบาลี",
};

/**
 * F2.1a — ดูรายการสายการศึกษา (user-flows.md Flow 2, จุดเริ่มต้นของการ browse
 * program → level → subject → year ตามรายละเอียดงานนี้)
 * Actor: Guest (Public — ไม่ตรวจสิทธิ์)
 * Input: ไม่มี (ไม่มี query param ในหน้านี้)
 * Process: listPrograms() ดึงเฉพาะสายการศึกษาที่ isActive=true และยังไม่ถูกลบ
 *          เรียงตามชื่อ
 * Output: รายการสายการศึกษา (นักธรรม/ธรรมศึกษา/บาลี) พร้อมลิงก์ไปหน้าระดับชั้น
 * Permission: Public — ข้อมูลอ้างอิงหลักสูตรเปิดเผยได้ทั้งหมด ไม่มีข้อมูล
 *             Restricted/Secret ปน
 * Validation: ไม่มี input จากผู้ใช้ในหน้านี้
 * Error State: query ล้มเหลว (database ล่ม) → error bubble ไปที่ error.tsx ของ
 *              root segment (ใช้ตัวเดียวกับหน้าอื่นทั้งหมดในโปรเจกต์); ไม่มีสาย
 *              การศึกษาที่ isActive เลย (ไม่ควรเกิดขึ้นจริงตาม seed แต่ป้องกันไว้)
 *              → EmptyState แทนหน้าว่างเปล่า
 * Audit: ไม่บันทึก (read-only, ไม่ใช่ข้อมูลสำคัญ — เหมือน F1.1/F2.1 เดิม)
 * Acceptance Criteria:
 *   AC1: เห็นเฉพาะสายการศึกษาที่ isActive=true เท่านั้น
 *   AC2: ทุกรายการมีลิงก์ไปหน้าระดับชั้นของสายนั้น (ไม่มี orphan — ไปต่อได้เสมอ)
 */
export default async function CurriculumProgramsPage() {
  const programs = await listPrograms();

  return (
    <Container className="flex w-full flex-col gap-8 py-8">
      <PageHeader
        title="หลักสูตรการศึกษาพระปริยัติธรรม"
        description="เลือกสายการศึกษาเพื่อดูระดับชั้น รายวิชา และตารางสอบ"
        breadcrumbs={[{ label: "หลักสูตร" }]}
      />

      {programs.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {programs.map((program) => (
            <Link key={program.slug} href={`/curriculum/${program.slug}`}>
              <Card className="h-full transition-colors hover:border-foreground/30">
                <CardHeader>
                  <CardTitle>{program.name}</CardTitle>
                  {program.description ? (
                    <CardDescription>{program.description}</CardDescription>
                  ) : program.nameEn ? (
                    <CardDescription>{program.nameEn}</CardDescription>
                  ) : null}
                </CardHeader>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          title="ยังไม่มีสายการศึกษาที่เปิดใช้งาน"
          description="กรุณาตรวจสอบใหม่ภายหลัง"
        />
      )}
    </Container>
  );
}
