import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { Container } from "@/components/layout/container";
import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { getPublishedArticleBySlug } from "@/lib/news";
import { formatThaiDate } from "@/lib/format";

/**
 * F1.2 — ดูรายละเอียดข่าว (user-flows.md Flow 1)
 * Actor: Guest (Public — ไม่ตรวจสิทธิ์)
 * Input: URL param slug (string)
 * Process: getPublishedArticleBySlug(slug) — ค้นหาเฉพาะ status='PUBLISHED'
 *          เท่านั้น (deny-by-default ต่อ DRAFT/UNPUBLISHED)
 * Output: เนื้อหาข่าวฉบับเต็ม พร้อม SEO metadata (title/description/OG)
 * Permission: ทุกคน (Public) เฉพาะข่าวที่เผยแพร่แล้วเท่านั้น
 * Validation: slug ต้องมีอยู่จริงและสถานะ = เผยแพร่แล้ว — ไม่ผ่านเงื่อนไขใดก็ตาม
 *             (ไม่พบ slug เลย, พบแต่เป็น DRAFT, พบแต่เป็น UNPUBLISHED) ได้ผลลัพธ์
 *             เดียวกันคือ notFound() เสมอ — ไม่แยกข้อความ เพื่อไม่เปิดเผยว่ามี
 *             draft/ข่าวที่ถูกถอดอยู่จริงตาม slug นี้ (F1.2 AC1)
 * Error State: ไม่พบ/ยังไม่เผยแพร่/ถูกถอดแล้ว → 404 (next/navigation notFound());
 *              query ล้มเหลว (database ล่ม) → error bubble ไปที่ error.tsx (ทดสอบ
 *              จริงแล้ว — ดู prisma/news-articles.md)
 * Audit: ไม่บันทึก (read-only)
 * Acceptance Criteria:
 *   AC1: เข้าถึงข่าว DRAFT/UNPUBLISHED ผ่าน URL ตรงไม่ได้แม้รู้ slug ที่ถูกต้อง
 *        เป๊ะ (ทดสอบจริงแล้วทั้งสองสถานะ)
 *   AC2: หน้ามี <title>/meta description/Open Graph ตรงกับเนื้อหาข่าวจริง
 *        (ทดสอบจริงแล้ว)
 */
export async function generateMetadata({
  params,
}: PageProps<"/news/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) {
    // ไม่ต้อง set metadata พิเศษ — notFound() ในตัว page component จะทำให้
    // Next.js render หน้า 404 (ซึ่งมี metadata ของตัวเองอยู่แล้ว) แทน metadata นี้
    return { title: "ไม่พบข่าว" };
  }
  const description = article.summary ?? article.content.slice(0, 160);
  return {
    title: article.title,
    description,
    openGraph: {
      title: article.title,
      description,
      type: "article",
      publishedTime: article.publishedAt.toISOString(),
      images: article.coverImageUrl ? [article.coverImageUrl] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description,
      images: article.coverImageUrl ? [article.coverImageUrl] : undefined,
    },
  };
}

export default async function NewsArticleDetailPage({
  params,
}: PageProps<"/news/[slug]">) {
  const { slug } = await params;
  const article = await getPublishedArticleBySlug(slug);
  if (!article) {
    notFound();
  }

  return (
    <Container className="flex w-full flex-col gap-6 py-8">
      <PageHeader
        title={article.title}
        breadcrumbs={[
          { label: "ข่าวและประกาศ", href: "/news" },
          { label: article.title },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <time
          dateTime={article.publishedAt.toISOString()}
          className="text-sm text-muted-foreground"
        >
          เผยแพร่เมื่อ {formatThaiDate(article.publishedAt)}
        </time>
        {article.categories.map((c) => (
          <Badge key={c.slug} variant="secondary">
            {c.name}
          </Badge>
        ))}
      </div>

      {/* URL เป็น mock placeholder (images.example.invalid) ไม่ใช่โดเมนจริงที่
          next/image ต้องอนุญาตไว้ล่วงหน้าใน next.config — ดู
          prisma/news-articles.md หัวข้อ "ขอบเขตที่ตัดออก" */}
      {article.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.coverImageUrl}
          alt=""
          className="w-full rounded-lg border object-cover"
        />
      )}

      {/* ไม่ใช้ @tailwindcss/typography (ยังไม่ได้ติดตั้งในโปรเจกต์นี้) —
          whitespace-pre-line เพียงพอสำหรับ content แบบ plain text/markdown
          ธรรมดาที่ seed ไว้ในงานนี้ (ดู schema.prisma comment บน NewsArticle) */}
      <div className="max-w-2xl whitespace-pre-line text-base leading-7 text-foreground">
        {article.content}
      </div>
    </Container>
  );
}
