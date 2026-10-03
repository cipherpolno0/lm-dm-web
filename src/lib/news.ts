import "server-only";
import { query } from "@/lib/db";

/**
 * ข่าว/บทความ (M10) — data-access layer สำหรับหน้า Public เท่านั้น (F1.1 ดู
 * รายการข่าว, F1.2 ดูรายละเอียดข่าว — ดู prisma/news-articles.md) ทุกฟังก์ชันใน
 * ไฟล์นี้ query เฉพาะ status = 'PUBLISHED' เสมอ (deny-by-default ต่อเนื้อหาที่ยัง
 * ไม่เผยแพร่/ถูกถอดแล้ว — dev-rules.md ข้อ 4) ไม่มีฟังก์ชันเขียนข้อมูล (create/
 * update/publish) ในไฟล์นี้ — เป็นขอบเขตของงาน admin news ในอนาคต (นอกขอบเขต
 * งานนี้ ดู prisma/news-articles.md หัวข้อ "ขอบเขตที่ตัดออก")
 */

export const NEWS_PAGE_SIZE = 6;

export interface NewsCategorySummary {
  slug: string;
  name: string;
}

export interface NewsArticleSummary {
  slug: string;
  title: string;
  summary: string | null;
  coverImageUrl: string | null;
  publishedAt: Date;
  categories: NewsCategorySummary[];
}

export interface NewsArticleDetail extends NewsArticleSummary {
  content: string;
}

/** แปลง page number ที่รับจาก searchParams (string ที่มาจาก URL เสมอ) ให้ปลอดภัย
 * — ค่าที่ parse ไม่ได้/ต่ำกว่า 1 ใช้ค่าเริ่มต้น 1 เสมอ (F1.1: "query ผิดรูปแบบ →
 * ใช้ค่าเริ่มต้น") ไม่ throw */
export function parsePageParam(raw: string | undefined): number {
  const n = Number.parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

async function attachCategories(
  articles: Array<{ id: string } & Omit<NewsArticleSummary, "categories">>,
): Promise<NewsArticleSummary[]> {
  if (articles.length === 0) return [];
  const ids = articles.map((a) => a.id);
  const { rows } = await query<{ articleId: string; slug: string; name: string }>(
    `SELECT nac."articleId" AS "articleId", nc.slug, nc.name
       FROM news_article_categories nac
       JOIN news_categories nc ON nc.id = nac."categoryId"
      WHERE nac."articleId" = ANY($1::text[])
      ORDER BY nc.name`,
    [ids],
  );
  const byArticle = new Map<string, NewsCategorySummary[]>();
  for (const r of rows) {
    const list = byArticle.get(r.articleId) ?? [];
    list.push({ slug: r.slug, name: r.name });
    byArticle.set(r.articleId, list);
  }
  return articles.map(({ id, ...rest }) => ({
    ...rest,
    categories: byArticle.get(id) ?? [],
  }));
}

/** ข่าวล่าสุด (Hero/หน้าแรก) — ไม่แบ่งหน้า ใช้ limit ตรงๆ */
export async function getLatestPublishedArticles(
  limit: number,
): Promise<NewsArticleSummary[]> {
  const { rows } = await query<{
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    coverImageUrl: string | null;
    publishedAt: Date;
  }>(
    `SELECT id, slug, title, summary, "coverImageUrl", "publishedAt"
       FROM news_articles
      WHERE status = 'PUBLISHED' AND "deletedAt" IS NULL
      ORDER BY "publishedAt" DESC
      LIMIT $1`,
    [limit],
  );
  return attachCategories(rows);
}

export async function listCategories(): Promise<NewsCategorySummary[]> {
  const { rows } = await query<NewsCategorySummary>(
    `SELECT slug, name FROM news_categories ORDER BY name`,
  );
  return rows;
}

export interface ListPublishedArticlesParams {
  page: number;
  categorySlug?: string;
  q?: string;
}

export interface ListPublishedArticlesResult {
  articles: NewsArticleSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

/** F1.1 — ดูรายการข่าว: แบ่งหน้า + filter หมวดหมู่ (optional) + ค้นหาคำ (search
 * preview, เพิ่มเติมนอกเหนือสเปกเดิมของ user-flows.md ตามที่ระบุใน task brief
 * นี้) เฉพาะข่าวสถานะ PUBLISHED เท่านั้นเสมอ */
export async function listPublishedArticles(
  params: ListPublishedArticlesParams,
): Promise<ListPublishedArticlesResult> {
  const page = params.page < 1 ? 1 : params.page;
  const pageSize = NEWS_PAGE_SIZE;
  const q = params.q?.trim();

  // WHERE clause ประกอบแบบ parameterized เสมอ — ไม่ interpolate ค่าจาก
  // searchParams ลงใน SQL string โดยตรง (ป้องกัน SQL injection)
  const conditions: string[] = [`na.status = 'PUBLISHED'`, `na."deletedAt" IS NULL`];
  const values: unknown[] = [];

  if (params.categorySlug) {
    values.push(params.categorySlug);
    conditions.push(
      `EXISTS (SELECT 1 FROM news_article_categories nac2
                JOIN news_categories nc2 ON nc2.id = nac2."categoryId"
               WHERE nac2."articleId" = na.id AND nc2.slug = $${values.length})`,
    );
  }
  if (q) {
    values.push(`%${q}%`);
    conditions.push(`(na.title ILIKE $${values.length} OR na.summary ILIKE $${values.length})`);
  }
  const whereSql = conditions.join(" AND ");

  const countResult = await query<{ count: string }>(
    `SELECT count(*)::text AS count FROM news_articles na WHERE ${whereSql}`,
    values,
  );
  const total = Number.parseInt(countResult.rows[0]?.count ?? "0", 10);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;

  const listValues = [...values, pageSize, offset];
  const { rows } = await query<{
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    coverImageUrl: string | null;
    publishedAt: Date;
  }>(
    `SELECT na.id, na.slug, na.title, na.summary, na."coverImageUrl", na."publishedAt"
       FROM news_articles na
      WHERE ${whereSql}
      ORDER BY na."publishedAt" DESC
      LIMIT $${listValues.length - 1} OFFSET $${listValues.length}`,
    listValues,
  );

  return {
    articles: await attachCategories(rows),
    page: safePage,
    pageSize,
    total,
    totalPages,
  };
}

/** F1.2 — ดูรายละเอียดข่าว: เฉพาะ slug ที่มีอยู่จริงและสถานะ PUBLISHED เท่านั้น
 * — คืนค่า null สำหรับทั้ง "ไม่พบ" และ "พบแต่ยังไม่เผยแพร่/ถูกถอดแล้ว" (ไม่แยก
 * ผลลัพธ์ทั้งสองกรณี เพื่อไม่เปิดเผยว่ามี draft อยู่จริงตาม slug นี้ — F1.2 AC1) */
export async function getPublishedArticleBySlug(
  slug: string,
): Promise<NewsArticleDetail | null> {
  const { rows } = await query<{
    id: string;
    slug: string;
    title: string;
    summary: string | null;
    coverImageUrl: string | null;
    content: string;
    publishedAt: Date;
  }>(
    `SELECT id, slug, title, summary, "coverImageUrl", content, "publishedAt"
       FROM news_articles
      WHERE slug = $1 AND status = 'PUBLISHED' AND "deletedAt" IS NULL`,
    [slug],
  );
  const row = rows[0];
  if (!row) return null;
  const [withCategories] = await attachCategories([row]);
  return { ...withCategories, content: row.content };
}
