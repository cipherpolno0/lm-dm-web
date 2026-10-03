import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Container } from "@/components/layout/container";
import { NewsArticleCard } from "@/components/news/news-article-card";
import { getLatestPublishedArticles, listCategories } from "@/lib/news";

// หน้าแรกจริงตาม sitemap.md ("ภาพรวมระบบ, ข่าวเด่น, ทางลัดสมัครสมาชิก/เข้าสู่ระบบ")
// แทนที่หน้าแรกชั่วคราวจากงาน "สร้าง Design System + Layout" (P4) ที่ใช้ข้อมูล
// สมมติล้วนๆ — งานนี้ ("สร้างหน้า Home + ข่าว/บทความ") ให้ Hero + ข่าวล่าสุด +
// หมวดหมู่ query จากฐานข้อมูลจริง (ผ่าน src/lib/news.ts) เป็นครั้งแรก
//
// ทำไมยังไม่แยก route group (public)/(member)/(admin) ตาม sitemap.md: ยังคง
// เป็นการตัดสินใจเลื่อนงานเดิมจาก prisma/design-system.md ข้อ 6 ข้อ 6 (ไม่ใช่
// ขอบเขตของงานนี้ที่ระบุผลลัพธ์ไว้ชัดเจนว่า "home/news pages" เท่านั้น) — ดู
// prisma/news-articles.md หัวข้อ "ขอบเขตที่ตัดออก"
//
// getLatestPublishedArticles()/listCategories() เป็น async function ธรรมดาที่
// อาจ throw ได้ (เช่น database ล่ม) — Home เป็น Server Component จึงปล่อยให้
// error bubble ขึ้นไปที่ error.tsx ของ segment นี้ตามปกติ (ไม่ try/catch เอง)
// เหมือน pattern เดิมทั้งโปรเจกต์ ทดสอบจริงแล้วว่า error.tsx จับได้ถูกต้อง — ดู
// prisma/news-articles.md หัวข้อ "ผลการทดสอบจริง"

const HERO_LATEST_NEWS_COUNT = 3;

export default async function Home() {
  const [latestArticles, categories] = await Promise.all([
    getLatestPublishedArticles(HERO_LATEST_NEWS_COUNT),
    listCategories(),
  ]);

  return (
    <div className="flex flex-1 flex-col bg-background">
      {/* Hero */}
      <div className="border-b bg-muted/30">
        <Container className="flex flex-col gap-6 py-12 sm:py-16">
          <div className="flex flex-col gap-3">
            <span className="text-sm font-medium text-muted-foreground">
              สำนักงานแม่กองธรรมสนามหลวง (ข้อมูลจำลอง)
            </span>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              ระบบฐานข้อมูลคณะสงฆ์และการศึกษาพระปริยัติธรรม
            </h1>
            <p className="text-muted-foreground max-w-2xl sm:text-lg">
              นักธรรม / ธรรมศึกษา / บาลี — ทะเบียนคณะสงฆ์, คลังข้อสอบ,
              แบบทดสอบ, ระบบสมาชิก และข่าวสารประกาศจากส่วนกลาง
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/news">ดูข่าวทั้งหมด</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/login">เข้าสู่ระบบ</Link>
            </Button>
          </div>
        </Container>
      </div>

      <Container className="flex w-full flex-col gap-12 py-12 sm:py-16">
        {/* ข่าวล่าสุด */}
        <section className="flex flex-col gap-4" aria-labelledby="latest-news-heading">
          <div className="flex items-center justify-between gap-4">
            <h2 id="latest-news-heading" className="text-xl font-semibold tracking-tight text-foreground">
              ข่าวล่าสุด
            </h2>
            <Link
              href="/news"
              className="text-sm font-medium text-primary hover:underline"
            >
              ดูทั้งหมด →
            </Link>
          </div>
          {latestArticles.length > 0 ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {latestArticles.map((article) => (
                <NewsArticleCard key={article.slug} article={article} />
              ))}
            </div>
          ) : (
            <EmptyState
              title="ยังไม่มีประกาศ"
              description="เมื่อมีข่าวเผยแพร่แล้ว รายการจะปรากฏที่นี่"
            />
          )}
        </section>

        {/* หมวดหมู่ข่าว */}
        {categories.length > 0 && (
          <section className="flex flex-col gap-4" aria-labelledby="news-categories-heading">
            <h2 id="news-categories-heading" className="text-xl font-semibold tracking-tight text-foreground">
              หมวดหมู่ข่าว
            </h2>
            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <Link key={category.slug} href={`/news?category=${category.slug}`}>
                  <Badge variant="outline" className="text-sm">
                    {category.name}
                  </Badge>
                </Link>
              ))}
            </div>
          </section>
        )}

        <p className="text-xs text-muted-foreground">
          เนื้อหาข่าว/ตัวเลข/วันที่ทั้งหมดในหน้านี้เป็นข้อมูลจำลองสำหรับการพัฒนา/
          ทดสอบระบบเท่านั้น ไม่ใช่ข้อมูลบุคคล/หน่วยงานจริง — ดู data-policy.md
        </p>
      </Container>
    </div>
  );
}
