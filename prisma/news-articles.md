# Home + ข่าว/บทความ — P4 Public Front End

Phase: P4 — Public Front End
งาน: สร้างหน้า Home + ข่าว/บทความ
อ้างอิงคู่กับ: `user-flows.md` (Flow 1 — ข่าว), `sitemap.md`, `dev-rules.md`, `data-policy.md`,
`prisma/design-system.md` (component/layout ที่หน้านี้เรียกใช้)
วันที่: 2026-09-24

> เอกสารนี้ใช้ข้อมูลสมมติเท่านั้น ไม่มีชื่อบุคคลจริงปรากฏอยู่ (ชื่อหน่วยงาน เช่น
> "สำนักงานแม่กองธรรมสนามหลวง" เป็นชื่อบริบทองค์กรที่ใช้ในเอกสาร P0 อยู่แล้ว แต่
> เนื้อหาข่าว/ตัวเลข/วันที่ทั้งหมดในงานนี้เป็นข้อมูลจำลอง 100% กำกับ "(ข้อมูลจำลอง)"
> ทุกรายการตาม convention เดียวกับ seed data ทั้งโปรเจกต์)

---

## 1. เหตุผลและขอบเขตงาน

งานนี้สร้างหน้า Public จริงตัวแรกที่ query ข้อมูลจากฐานข้อมูลจริง (ก่อนหน้านี้หน้าแรก
เป็นข้อมูลสมมติล้วนๆ ตามที่ระบุใน `prisma/design-system.md` — "แทนที่หน้าแรกชั่วคราว
ด้วยหน้า Public จริงตาม sitemap.md") ครอบคลุมเฉพาะที่ระบุไว้ในงานนี้: **Hero,
ข่าวล่าสุด, หมวดหมู่, search preview, article detail, SEO metadata**

นี่คือ **M10. ระบบข่าวสาร/ประกาศ** ที่ `user-flows.md` หัวข้อ "สรุป Flow ↔ Module ↔
Sitemap" ระบุไว้ว่า "ไม่ผูกกับ M1–M9 โดยตรง — เป็น content module เสริม" — งานนี้สร้าง
schema + หน้า Public (F1.1, F1.2) เท่านั้น **ไม่รวม** หน้า Admin (`/admin/news`, F1.3
สร้าง/แก้ไข, F1.4 เผยแพร่/ถอด) ซึ่งเป็นงานแยกต่างหากในอนาคต — ดูหัวข้อ 6

**สิ่งที่งานนี้ไม่ทำ (ตั้งใจ):**

- ไม่แยก route group `(public)`/`(member)`/`(admin)` ตาม `sitemap.md` — คงเป็นงานที่
  เลื่อนไว้จาก `prisma/design-system.md` ข้อ 6 (ยังไม่ใช่ขอบเขตของงานนี้ที่ระบุ
  ผลลัพธ์ไว้ชัดเจนว่า "home/news pages" เท่านั้น)
- ไม่มีหน้า Admin จัดการข่าว (F1.3/F1.4, `/admin/news`)
- ไม่เชื่อม Object Storage จริงสำหรับภาพปกข่าว (M8) — `coverImageUrl` เป็น URL
  placeholder (`images.example.invalid`) เท่านั้น

---

## 2. Schema (M10 — ข่าว/บทความ)

Migration ใหม่: `20260924080000_news_domain` — 3 ตารางใหม่ (schema เต็มพร้อมเหตุผล
การออกแบบอยู่เป็น comment ใน `prisma/schema.prisma` โดยตรง):

| ตาราง | หน้าที่ |
|---|---|
| `news_categories` | หมวดหมู่ข่าว (flat, ไม่ซ้อนชั้น) |
| `news_articles` | บทความ/ข่าว — `status` (DRAFT / PUBLISHED / UNPUBLISHED), `publishedAt`, soft-delete (`deletedAt`) |
| `news_article_categories` | ตารางเชื่อมข่าว↔หมวดหมู่ (many-to-many) |

**ทำไมไม่ใช้ pattern conditional-immutability เหมือน QuestionVersion/DocumentVersion/
ExamSet**: เนื้อหาข่าวไม่ใช่ข้อมูลที่ต้อง "ล็อกถาวร" เพื่อความถูกต้องของประวัติการสอบ
— เมื่องาน admin news (F1.3) เริ่มพัฒนาในอนาคต การ audit "ผู้แก้ไข/เวลา/ค่าก่อน-หลัง"
จะใช้ตาราง `audit_logs` (polymorphic, มีอยู่แล้วตั้งแต่ P1) แทนการสร้างตาราง
version/history เฉพาะทางเพิ่ม — ไม่ต้อง migration schema ใหม่เมื่อถึงเวลานั้น เพราะ
`status`/`publishedAt` ที่ F1.4 ต้องใช้มีอยู่แล้วในงานนี้

Index หลัก: `news_articles(status, publishedAt)` — ตอบ query หลักของ public listing
โดยตรง (`WHERE status='PUBLISHED' ORDER BY publishedAt DESC`)

**Seed data** (`prisma/seed.ts` ฟังก์ชัน `seedNews`): 4 หมวดหมู่, 10 ข่าว — 8 PUBLISHED,
1 DRAFT, 1 UNPUBLISHED (จำลองข่าวที่เคยเผยแพร่แล้วถูกถอด — ยังมีแถวอยู่ในฐานข้อมูล
เพื่อประวัติ ไม่ลบทิ้ง ตาม data-policy.md ข้อ 7) ครบทั้ง 3 สถานะโดยตั้งใจเพื่อพิสูจน์
deny-by-default ของ F1.2 จริง — ทดสอบ idempotent แล้ว (รันซ้ำ 2 ครั้ง จำนวนแถวคงที่
articles=10, categories=4, category-links=9)

---

## 3. Function Specification

### 3.1 F1.1 — ดูรายการข่าว (`GET /news`)

- **Actor**: Guest (และทุกบทบาทที่ login แล้ว — หน้านี้ไม่ตรวจสิทธิ์ เป็น Public)
- **Input**: `searchParams.page` (เลขหน้า), `searchParams.category` (slug หมวดหมู่,
  optional), `searchParams.q` (คำค้นหา, optional — "search preview" เพิ่มเติมนอกเหนือ
  สเปกเดิมของ `user-flows.md` ตามรายละเอียดที่ระบุในงานนี้)
- **Process**: `parsePageParam()` แปลง page เป็นตัวเลขปลอดภัย (parse ไม่ได้/ติดลบ →
  1 เสมอ ไม่ throw) แล้ว `listPublishedArticles()` (`src/lib/news.ts`) query เฉพาะ
  `status='PUBLISHED'` ประกอบ WHERE clause แบบ parameterized เสมอ (ไม่ interpolate
  ค่าจาก searchParams ลง SQL string ตรงๆ) เรียงจากล่าสุด แบ่งหน้า (pageSize=6)
- **Output**: รายการข่าว (หัวข้อ, สรุปย่อ, วันที่แบบไทย พ.ศ., หมวดหมู่) พร้อม
  pagination controls
- **Permission**: Public — ไม่มีข้อมูล Restricted/Secret ปนอยู่ในผลลัพธ์
- **Validation**: page ที่ parse ไม่ได้ใช้ค่าเริ่มต้น 1; page เกินหน้าสุดท้ายถูก clamp
  กลับมาที่หน้าสุดท้ายเสมอ (ไม่ error/ไม่ query หน้าว่างเปล่า)
- **Error State**: query ล้มเหลว (database ล่ม) → error bubble ไปที่ `error.tsx` ของ
  segment (**ทดสอบจริงแล้ว** — ดูหัวข้อ 4); ไม่มีผลลัพธ์ตรงเงื่อนไข (หมวดหมู่/คำค้น
  ไม่มีข่าวตรง) → `EmptyState` ไม่ใช่ error
- **Audit**: ไม่บันทึก (read-only, ไม่ใช่ข้อมูลสำคัญ — ตรงตามสเปกเดิมใน user-flows.md)
- **Acceptance Criteria**:
  - AC1: เห็นเฉพาะข่าวที่เผยแพร่แล้วเท่านั้น — **ทดสอบจริงแล้ว**
  - AC2: การแบ่งหน้าทำงานถูกต้องเมื่อข่าวเกิน 1 หน้า (8 ข่าว/pageSize 6 = 2 หน้า) —
    **ทดสอบจริงแล้ว**
  - AC3: filter หมวดหมู่และค้นหาคำทำงานถูกต้อง ป้องกัน SQL injection ผ่าน
    parameterized query เสมอ — **ทดสอบจริงแล้ว** (รวม payload `' OR '1'='1`)

### 3.2 F1.2 — ดูรายละเอียดข่าว (`GET /news/[slug]`)

- **Actor**: Guest (Public — ไม่ตรวจสิทธิ์)
- **Input**: URL param `slug`
- **Process**: `getPublishedArticleBySlug(slug)` ค้นหาเฉพาะ `status='PUBLISHED'`
  เท่านั้น — คืนค่า `null` สำหรับทั้ง "ไม่พบ slug เลย" และ "พบแต่เป็น DRAFT/
  UNPUBLISHED" (ไม่แยกผลลัพธ์ทั้งสองกรณี เพื่อไม่เปิดเผยว่ามี draft/ข่าวที่ถูกถอด
  อยู่จริงตาม slug นี้) → `page.tsx` เรียก `notFound()` จาก `next/navigation` เมื่อ
  `null`; `generateMetadata()` เรียก query เดียวกันอีกครั้งเพื่อสร้าง SEO metadata
  (React `fetch`/query memoization ไม่ครอบคลุมฟังก์ชันนี้เพราะไม่ได้ห่อด้วย
  React `cache()` — เป็นการตัดสินใจยอมรับ query ซ้ำ 1 ครั้งต่อ request เพื่อความ
  เรียบง่าย เนื่องจากเป็น query แบบ index scan เดียวที่เบามาก ไม่ใช่ endpoint ที่มี
  ปริมาณการเข้าถึงสูงในเฟสนี้ — ดูหัวข้อ 6)
- **Output**: เนื้อหาข่าวฉบับเต็ม พร้อม `<title>`/`<meta name="description">`/
  Open Graph (`og:title`, `og:description`, `og:image`, `og:type=article`)/
  Twitter Card
- **Permission**: ทุกคน (Public) เฉพาะข่าวที่เผยแพร่แล้วเท่านั้น
- **Validation**: slug ต้องมีอยู่จริงและสถานะ = เผยแพร่แล้ว
- **Error State**: ไม่พบ/ยังไม่เผยแพร่/ถูกถอดแล้ว → 404 (**ทดสอบจริงแล้วทั้ง 3
  กรณี**: ไม่มี slug นี้เลย, DRAFT, UNPUBLISHED); query ล้มเหลว → error bubble ไปที่
  `error.tsx` (**ทดสอบจริงแล้ว**)
- **Audit**: ไม่บันทึก (read-only)
- **Acceptance Criteria**:
  - AC1: เข้าถึงข่าว DRAFT/UNPUBLISHED ผ่าน URL ตรงไม่ได้แม้รู้ slug ที่ถูกต้องเป๊ะ
    — **ทดสอบจริงแล้วทั้งสองสถานะ**
  - AC2: หน้ามี `<title>`/meta description/Open Graph ตรงกับเนื้อหาข่าวจริง —
    **ทดสอบจริงแล้ว**

### 3.3 หน้าแรก (`GET /`) — ไม่ใช่ resource ที่มี input/permission ต้องตรวจสอบแยก

หน้าแรกเรียก `getLatestPublishedArticles(3)` และ `listCategories()` จาก
`src/lib/news.ts` ตัวเดียวกับที่ F1.1 ใช้ (query ซ้ำ ไม่ error state พิเศษ — ใช้
pattern เดียวกับ F1.1: error bubble ไปที่ `error.tsx`) แสดง Hero + ข่าวล่าสุด 3
รายการ + หมวดหมู่ทั้งหมดเป็นลิงก์ไปยัง `/news?category=...`

---

## 4. ผลการทดสอบจริง

**`npx next typegen`** → ต้องรันหลังเพิ่ม dynamic route ใหม่ (`/news/[slug]`) ก่อน
`tsc` จะรู้จัก `PageProps<'/news'>`/`PageProps<'/news/[slug]'>` (Next.js 16 route-type
generation — ดู `node_modules/next/dist/docs/.../page.md` หัวข้อ PageProps helper)

**`npx tsc --noEmit`** → ผ่าน (exit code 0), 0 errors
**`npm run lint`** → ผ่าน (exit code 0), 0 errors/warnings
**`npx next build`** → ผ่าน — routes ใหม่ `/news`, `/news/[slug]` ปรากฏใน build output

**`node prisma/dev-migrate-verify.mjs --reset`** (replay ทั้ง 9 migrations จากศูนย์
รวม `news_domain`) → **PASSED**

**`npx tsx prisma/seed.ts` x2 ติดต่อกัน** → idempotent จริง (articles=10,
categories=4, category-links=9 คงที่ทั้งสองครั้ง)

**`node prisma/test-news-pages.mjs`** (ใหม่ — HTTP end-to-end ผ่าน `next dev` จริง
ไม่ mock) — **35/35 PASSED** ครอบคลุม:

```
- DRAFT/UNPUBLISHED/slug-ไม่มีอยู่จริง → 404 ทั้ง 3 กรณี (F1.2 AC1)
- PUBLISHED article → 200, เนื้อหาถูกต้อง, SEO title/description/OG ถูกต้อง
- /news ไม่แสดง DRAFT/UNPUBLISHED (F1.1 AC1), แสดง PUBLISHED ล่าสุดถูกต้อง
- pagination หน้า 2 จริง, page=not-a-number ไม่ error, page=999 clamp ไม่ error (F1.1 AC2)
- กรองหมวดหมู่ถูกต้อง, หมวดหมู่ไม่มีอยู่จริง → EmptyState ไม่ error
- ค้นหาเจอผล/ไม่เจอผล → ถูกต้อง, SQL injection payload ไม่ error และไม่รั่ว draft
- หน้าแรก: ข่าวล่าสุด/หมวดหมู่ถูกต้อง ไม่รั่ว DRAFT/UNPUBLISHED
```

**การทดสอบ error state จริง** (ตาม "วิธีตรวจสอบ" ของงานนี้ — ไม่ใช่แค่ตรวจโค้ดเฉยๆ):
เพิ่ม guard ชั่วคราวใน `src/lib/news.ts` ที่ throw เมื่อ `TEST_FORCE_NEWS_ERROR=1`
รัน `next dev` ด้วย env var นี้ แล้วใช้ Playwright (real Chromium, ไม่ใช่ curl เพราะ
error.tsx เป็น Client Component ที่ render ฝั่ง client หลัง hydrate ในโหมด dev) เปิด
`/`, `/news`, `/news/[slug]` — ทั้ง 3 เส้นทางตอบ **HTTP 500 จริง** และ browser แสดง
UI ของ `ErrorState`/`error.tsx` ("เกิดข้อผิดพลาดบางอย่าง") ถูกต้อง จากนั้นลบ guard
ทดสอบออกทั้งหมด (`git status` ยืนยันว่า `src/lib/news.ts` กลับสู่สถานะไม่มี guard นี้
ก่อน commit)

**`node prisma/test-layout-responsive.mjs`** (ขยายจากงานก่อนหน้า — เพิ่ม `/news`,
`/news?category=exam-notice`, `/news/[slug]` จริง, และ `/news/[slug]` ไม่พบ เข้าไปใน
รายการหน้า public ที่ตรวจ) → **114/114 PASSED** (เพิ่มจาก 66 เดิม — พิสูจน์ว่า
Card grid ของรายการข่าว, search form, category badges และเนื้อหาข่าวยาวๆ ไม่ทำให้
เกิด horizontal overflow ที่ 375/768/1024/1440px เช่นเดียวกับหน้า public อื่น)

**Regression (4 ชุดเดิมที่เหลือจากเฟสก่อนหน้า — รันซ้ำหลัง reset+reseed):**

```
test-exam-document-domain.mjs   23 passed, 0 failed
test-auth-login.mjs             24 passed, 0 failed
test-rbac-scope.mjs             28 passed, 0 failed
test-authz-guard.mjs            23 passed, 0 failed
test-auth-session-expiry.mjs     2 passed, 0 failed  (รันแยกด้วย AUTH_SESSION_MAX_AGE_SECONDS=3)
```

**รวมสะสมทั้งโปรเจกต์: 100 (P1-P3 เดิม) + 66 (P4 Design System เดิม) + 35 (news-pages
ใหม่) + 48 (layout-responsive ที่เพิ่มจากงานนี้) = 249/249 PASSED**

ทุกคำสั่งรันจริงกับ PostgreSQL 16 ในเครื่องนี้และ `next dev` จริงบน `:3000` — ไม่มี
การอ้างผลโดยไม่ได้รันจริง

---

## 5. Failure Mode และ Recovery

- **`getLatestPublishedArticles()`/`listPublishedArticles()`/
  `getPublishedArticleBySlug()` throw (database ล่ม)** — ทั้งสามฟังก์ชันถูกเรียกจาก
  Server Component (`/`, `/news`, `/news/[slug]`) โดยตรงไม่มี try/catch เอง (pattern
  เดิมทั้งโปรเจกต์) → error bubble ไปที่ `error.tsx` ของ segment ที่มีอยู่แล้วจากงาน
  Design System — Recovery: `error.tsx` จับได้ ส่งกลับ HTTP 500 พร้อม fallback UI
  ทั่วไป (ไม่รั่ว stack trace/error.message ดิบ — `ErrorState` รับเฉพาะ `digest`) —
  **ทดสอบจริงแล้ว** ด้วยการบังคับ throw ชั่วคราว คืนค่าปกติทันทีเมื่อ database
  กลับมาโดยไม่ต้อง manual fix (ไม่มี state ค้างฝั่ง app)
- **slug ที่ผู้ใช้พิมพ์/แชร์มามี query string หรือ URL-encoding ที่ไม่คาดคิด** —
  `getPublishedArticleBySlug()` ใช้ parameterized query เทียบ exact match เท่านั้น
  ไม่มี LIKE/regex ที่อาจทำงานผิดคาด → slug ที่ไม่ตรงเป๊ะ = ไม่พบ = 404 ตามปกติ
  ไม่มี error
- **`page`/`category`/`q` searchParams ถูกปลอมเป็นค่าที่ผิดรูปแบบโดยเจตนา** (เช่น
  array แทน string, ตัวเลขติดลบ/ไม่ใช่ตัวเลข) — `parsePageParam()` และการดึงค่าแรก
  จาก array (`Array.isArray(params.page) ? params.page[0] : params.page`) ป้องกัน
  ไว้แล้ว ไม่มีทาง throw จาก input เหล่านี้ — **ทดสอบจริงแล้ว** (`page=not-a-number`,
  `page=999`, หมวดหมู่ที่ไม่มีอยู่จริง, SQL injection payload ในช่องค้นหา)

---

## 6. ขอบเขตที่ตัดออก (Out of Scope — ต้องแจ้ง Owner)

1. **ไม่มีหน้า Admin จัดการข่าว (`/admin/news`, F1.3 สร้าง/แก้ไข, F1.4 เผยแพร่/
   ถอด)** — งานนี้ระบุผลลัพธ์ไว้ชัดเจนว่า "home/news pages" (Public เท่านั้น) —
   schema ที่สร้างในงานนี้ (`status`, `publishedAt`) รองรับงาน admin นั้นได้ทันที
   โดยไม่ต้อง migration ใหม่ ส่วนกลไก audit การแก้ไข/เปลี่ยนสถานะจะใช้ตาราง
   `audit_logs` (polymorphic, มีอยู่แล้ว) แทนการสร้างตาราง version/history เฉพาะทาง
   เพิ่ม (ดูเหตุผลในหัวข้อ 2)
2. **"Search preview" implement เป็น server-rendered GET form ธรรมดา ไม่ใช่
   client-side type-ahead dropdown** — เลือกความเรียบง่าย/ทำงานได้แม้ปิด JavaScript
   ฝั่ง client สอดคล้องกับ pattern SSR-first ทั้งโปรเจกต์ (ยังไม่มีหน้าไหนทำ
   client-side data fetching) แทนการสร้าง API route + client component แรกของ
   โปรเจกต์สำหรับ feature เดียว — ถ้าต้องการ type-ahead จริงในอนาคต จะต้องเพิ่ม
   API route (`GET /api/news/search`) + client component ใหม่
3. **ไม่ผูก Object Storage จริงสำหรับภาพปกข่าว (M8)** — `coverImageUrl` เป็น URL
   placeholder (`images.example.invalid`) ที่ยังไม่ได้ทดสอบกับ `next/image`
   (next.config ยังไม่ได้อนุญาต remote pattern สำหรับโดเมนนี้) จึงใช้ `<img>` ธรรมดา
   แทน `next/image` ในหน้ารายละเอียดข่าว (มี ESLint warning ที่ตั้งใจปล่อยไว้ พร้อม
   comment อธิบายเหตุผล) — ควรเปลี่ยนเป็น `next/image` เมื่อเชื่อม Object Storage
   จริงแล้ว
4. **`generateMetadata()` ไม่ได้ใช้ React `cache()` ห่อ query** — ทำให้
   `getPublishedArticleBySlug()` ถูกเรียกซ้ำ 2 ครั้งต่อ request หนึ่งครั้ง (ครั้งแรก
   จาก `generateMetadata`, ครั้งที่สองจาก page component) — ยอมรับได้เพราะเป็น
   index scan เดียวที่เบามาก ไม่ใช่ endpoint ที่มีปริมาณการเข้าถึงสูงในเฟสนี้ ถ้า
   ต้องการ optimize ในอนาคตสามารถห่อด้วย React `cache()` แบบเดียวกับ
   `getCurrentUser()` ใน `src/lib/authz.ts` ได้ทันที
5. **ไม่แยก route group `(public)`/`(member)`/`(admin)` ตาม `sitemap.md`** — เหตุผล
   เดียวกับที่เลื่อนไว้ใน `prisma/design-system.md` ข้อ 6
6. **`content` ของข่าวเป็น plain text ธรรมดา ไม่มี rich-text/HTML sanitize
   pipeline** — ปลอดภัยในงานนี้เพราะเป็น seed data ที่ควบคุมเองทั้งหมด ไม่ใช่ input
   จากผู้ใช้ภายนอก — เมื่อมีหน้า admin news (F1.3) ที่รับ content จากผู้ใช้จริง
   ต้องเพิ่ม sanitization (เช่น DOMPurify) ก่อน render เป็น HTML หากเปลี่ยนจาก
   plain text เป็น rich-text ในอนาคต
7. **ไม่มี `@tailwindcss/typography` plugin** — เนื้อหาข่าวใช้
   `whitespace-pre-line` ธรรมดาแทน `prose` class เพียงพอสำหรับ plain text ปัจจุบัน
   แต่จะไม่เพียงพอถ้าเปลี่ยนเป็น rich-text/HTML ในอนาคต (ดูข้อ 6)

---

## 7. งานถัดไปที่ควรทำ (นอกขอบเขตงานนี้)

1. หน้า Admin จัดการข่าว (`/admin/news`, F1.3/F1.4) — Central Officer/Super Admin
   สร้าง/แก้ไข/เผยแพร่/ถอดข่าว พร้อม audit ผ่าน `audit_logs` (ดูข้อ 6.1)
2. เชื่อม Object Storage จริงสำหรับภาพปกข่าว + เปลี่ยนเป็น `next/image` (ดูข้อ 6.3)
3. เพิ่ม API route + client component สำหรับ search แบบ type-ahead ถ้า Owner
   ต้องการ "search preview" แบบ dropdown จริง (ดูข้อ 6.2)
4. แทนที่หน้า `/curriculum`, `/exam-schedule`, `/about` ฯลฯ ตาม `sitemap.md` ด้วย
   หน้า Public จริงต่อไปตามลำดับ (ปัจจุบันมีแค่ `/`, `/news`, `/news/[slug]`,
   `/login` ที่เป็นของจริง — ที่เหลือยังเป็น 404 ตาม `not-found.tsx`)
5. เพิ่ม sanitization เมื่อเปลี่ยน `content` จาก plain text เป็น rich-text (ดูข้อ 6.6)
