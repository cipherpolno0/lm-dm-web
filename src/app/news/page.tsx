import Link from "next/link";
import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { NewsArticleCard } from "@/components/news/news-article-card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { listPublishedArticles, listCategories, parsePageParam } from "@/lib/news";

export const metadata: Metadata = {
  title: "ข่าวและประกาศ",
  description:
    "ข่าวสารและประกาศจากสำนักงานแม่กองธรรมสนามหลวง — ตารางสอบ กำหนดการ และความเคลื่อนไหวด้านการศึกษาพระปริยัติธรรม",
};

/**
 * F1.1 — ดูรายการข่าว (user-flows.md Flow 1)
 * Actor: Guest (และทุกบทบาทที่ login แล้ว — หน้านี้ไม่ตรวจสิทธิ์ เป็น Public)
 * Input: searchParams — page (เลขหน้า), category (slug ของหมวดหมู่, optional),
 *        q (คำค้นหา, optional — "search preview" เพิ่มเติมนอกเหนือสเปกเดิมตาม
 *        รายละเอียดงานนี้)
 * Process: parsePageParam() ป้องกัน page ที่ parse ไม่ได้/ติดลบ (ใช้ค่าเริ่มต้น
 *          1 เสมอ ไม่ throw) แล้ว listPublishedArticles() query เฉพาะ
 *          status='PUBLISHED' เรียงจากล่าสุด แบ่งหน้า
 * Output: รายการข่าว (หัวข้อ, สรุปย่อ, วันที่, หมวดหมู่) พร้อม pagination
 * Permission: Public — ไม่มีข้อมูล Restricted/Secret ปนอยู่
 * Validation: page ที่ parse ไม่ได้ใช้ค่าเริ่มต้น; page เกินหน้าสุดท้ายถูก clamp
 *             กลับมาที่หน้าสุดท้ายใน listPublishedArticles() (ไม่ error)
 * Error State: query ล้มเหลว (เช่น database ล่ม) → error bubble ไปที่ error.tsx
 *              ของ segment (ทดสอบจริงแล้ว); ไม่มีผลลัพธ์ตรงเงื่อนไข → EmptyState
 * Audit: ไม่บันทึก (read-only, ไม่ใช่ข้อมูลสำคัญ — ตรงตามสเปกเดิมใน user-flows.md)
 * Acceptance Criteria:
 *   AC1: เห็นเฉพาะข่าวที่เผยแพร่แล้วเท่านั้น (ทดสอบจริงแล้ว)
 *   AC2: การแบ่งหน้าทำงานถูกต้องเมื่อข่าวเกิน 1 หน้า (ทดสอบจริงแล้ว)
 *   AC3: filter ตามหมวดหมู่และค้นหาด้วยคำค้นทำงานถูกต้อง ไม่มีการต่อ SQL string
 *        จาก input ตรงๆ (parameterized query เสมอ — ป้องกัน SQL injection)
 */
export default async function NewsListPage({
  searchParams,
}: PageProps<"/news">) {
  const params = await searchParams;
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const rawCategory = Array.isArray(params.category) ? params.category[0] : params.category;
  const rawQ = Array.isArray(params.q) ? params.q[0] : params.q;

  const page = parsePageParam(rawPage);
  const categorySlug = rawCategory || undefined;
  const q = rawQ || undefined;

  const [{ articles, totalPages, page: currentPage }, categories] = await Promise.all([
    listPublishedArticles({ page, categorySlug, q }),
    listCategories(),
  ]);

  // เก็บ category/q เดิมไว้เวลาสร้างลิงก์เปลี่ยนหน้า (pagination) ให้ filter ไม่หาย
  const buildPageHref = (targetPage: number) => {
    const sp = new URLSearchParams();
    if (categorySlug) sp.set("category", categorySlug);
    if (q) sp.set("q", q);
    sp.set("page", String(targetPage));
    return `/news?${sp.toString()}`;
  };

  return (
    <Container className="flex w-full flex-col gap-8 py-8">
      <PageHeader
        title="ข่าวและประกาศ"
        description="ข่าวสารและประกาศจากส่วนกลาง — เรียงจากล่าสุด"
        breadcrumbs={[{ label: "ข่าวและประกาศ" }]}
      />

      {/* Search preview — ค้นหาแบบ server-rendered (GET form ธรรมดา ไม่ต้องพึ่ง
          JavaScript ฝั่ง client) แสดงผลลัพธ์ที่ตรงคำค้นในหน้าเดียวกันทันทีหลัง
          submit — เป็นการตีความ "search preview" ของงานนี้ที่เลือกความเรียบง่าย/
          ทำงานได้แม้ปิด JS มากกว่า type-ahead dropdown ฝั่ง client (ซึ่งจะเป็น
          หน้าแรกในโปรเจกต์นี้ที่ทำ client-side data fetching) — ดู
          prisma/news-articles.md หัวข้อ "ขอบเขตที่ตัดออก" สำหรับแนวทางอนาคต */}
      <form action="/news" method="get" className="flex flex-wrap gap-2" role="search">
        {categorySlug && <input type="hidden" name="category" value={categorySlug} />}
        <Input
          type="search"
          name="q"
          defaultValue={q ?? ""}
          placeholder="ค้นหาข่าว..."
          aria-label="ค้นหาข่าว"
          className="max-w-sm"
        />
        <Button type="submit" variant="outline">
          ค้นหา
        </Button>
        {(q || categorySlug) && (
          <Button type="button" variant="ghost" asChild>
            <Link href="/news">ล้างตัวกรอง</Link>
          </Button>
        )}
      </form>

      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="กรองตามหมวดหมู่">
          {categories.map((category) => {
            const isActive = category.slug === categorySlug;
            const sp = new URLSearchParams();
            if (!isActive) sp.set("category", category.slug);
            if (q) sp.set("q", q);
            const href = `/news${sp.toString() ? `?${sp.toString()}` : ""}`;
            return (
              <Link key={category.slug} href={href}>
                <Badge variant={isActive ? "default" : "outline"}>{category.name}</Badge>
              </Link>
            );
          })}
        </div>
      )}

      {articles.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {articles.map((article) => (
            <NewsArticleCard key={article.slug} article={article} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="ไม่พบข่าวที่ค้นหา"
          description={
            q || categorySlug
              ? "ลองเปลี่ยนคำค้นหรือหมวดหมู่ดูอีกครั้ง"
              : "ยังไม่มีประกาศในขณะนี้"
          }
        />
      )}

      {totalPages > 1 && (
        <nav
          aria-label="เปลี่ยนหน้า"
          className="flex items-center justify-center gap-2"
        >
          {currentPage > 1 ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildPageHref(currentPage - 1)}>ก่อนหน้า</Link>
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
            หน้า {currentPage} จาก {totalPages}
          </span>
          {currentPage < totalPages ? (
            <Button variant="outline" size="sm" asChild>
              <Link href={buildPageHref(currentPage + 1)}>ถัดไป</Link>
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
