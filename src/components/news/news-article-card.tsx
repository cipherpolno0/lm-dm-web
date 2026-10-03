import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatThaiDate } from "@/lib/format";
import type { NewsArticleSummary } from "@/lib/news";

/**
 * การ์ดสรุปข่าวหนึ่งชิ้น — ใช้ร่วมกันทั้งหน้าแรก ("ข่าวล่าสุด") และหน้ารายการข่าว
 * `/news` เป็น Server Component ล้วนๆ (ไม่มี state/event handler) เพื่อให้ทั้งสอง
 * หน้าคง SEO-friendly server-rendered markup เหมือนกัน
 */
export function NewsArticleCard({ article }: { article: NewsArticleSummary }) {
  return (
    <Card>
      <CardHeader>
        {article.categories.length > 0 && (
          <div className="mb-1 flex flex-wrap gap-1.5">
            {article.categories.map((c) => (
              <Badge key={c.slug} variant="secondary">
                {c.name}
              </Badge>
            ))}
          </div>
        )}
        <CardTitle>
          <Link
            href={`/news/${article.slug}`}
            className="hover:underline focus-visible:underline"
          >
            {article.title}
          </Link>
        </CardTitle>
        <CardDescription>{formatThaiDate(article.publishedAt)}</CardDescription>
      </CardHeader>
      {article.summary && (
        <CardContent>
          <p className="text-muted-foreground text-sm">{article.summary}</p>
        </CardContent>
      )}
    </Card>
  );
}
