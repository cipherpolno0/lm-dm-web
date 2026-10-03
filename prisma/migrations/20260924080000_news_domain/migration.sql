-- P4 Public Front End: "สร้างหน้า Home + ข่าว/บทความ" — M10 ระบบข่าวสาร/ประกาศ
-- (user-flows.md Flow 1 — ข่าว; sitemap.md `/news`, `/news/[slug]`)
--
-- Hand-authored to match Prisma's real migration conventions — Prisma CLI
-- cannot run in this environment (see prisma/MIGRATIONS.md). Verified for
-- real against local PostgreSQL via prisma/dev-migrate-verify.mjs.
--
-- ขอบเขต: เฉพาะ schema ที่ต้องใช้สำหรับหน้า Public อ่านอย่างเดียว (F1.1/F1.2)
-- ไม่มี trigger ล็อกเนื้อหาแบบ conditional-immutability เหมือน question_versions/
-- document_versions/exam_sets เพราะข่าวไม่ใช่ข้อมูลที่ต้องคงสภาพถาวรเพื่อความ
-- ถูกต้องของประวัติการสอบ — audit การแก้ไข/เปลี่ยนสถานะ (F1.3/F1.4) จะใช้ตาราง
-- audit_logs (polymorphic, มีอยู่แล้ว) เมื่องาน admin news เริ่มพัฒนา (นอกขอบเขต
-- งานนี้ — ดู prisma/news-articles.md หัวข้อ "ขอบเขตที่ตัดออก")

-- CreateEnum
CREATE TYPE "news_article_status" AS ENUM ('DRAFT', 'PUBLISHED', 'UNPUBLISHED');

-- CreateTable
CREATE TABLE "news_categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_categories_slug_key" ON "news_categories"("slug");

-- CreateTable
CREATE TABLE "news_articles" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "coverImageUrl" TEXT,
    "content" TEXT NOT NULL,
    "status" "news_article_status" NOT NULL DEFAULT 'DRAFT',
    "publishedAt" TIMESTAMP(3),
    "authorActorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "news_articles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "news_articles_slug_key" ON "news_articles"("slug");

-- CreateIndex
-- ตอบ query หลักของ public listing โดยตรง: WHERE status='PUBLISHED' ORDER BY
-- publishedAt DESC
CREATE INDEX "news_articles_status_publishedAt_idx" ON "news_articles"("status", "publishedAt");

-- AddForeignKey
ALTER TABLE "news_articles" ADD CONSTRAINT "news_articles_authorActorId_fkey" FOREIGN KEY ("authorActorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "news_article_categories" (
    "articleId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_article_categories_pkey" PRIMARY KEY ("articleId","categoryId")
);

-- CreateIndex
CREATE INDEX "news_article_categories_categoryId_idx" ON "news_article_categories"("categoryId");

-- AddForeignKey
ALTER TABLE "news_article_categories" ADD CONSTRAINT "news_article_categories_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "news_articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_article_categories" ADD CONSTRAINT "news_article_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "news_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
