# sangha-system — Project Foundation

ระบบฐานข้อมูลคณะสงฆ์และการศึกษาพระปริยัติธรรม (นักธรรม / ธรรมศึกษา / บาลี) พร้อมคลังข้อสอบ
ระบบแบบทดสอบ ระบบสมาชิก และระบบผู้ดูแลระบบ

**เฟสปัจจุบัน:** P1 — Project Foundation (โครงโปรเจกต์ + PostgreSQL/Prisma schema และ migration workflow;
ยังไม่เชื่อมต่อ authentication จริง)
**สถานะ:** ร่างสำหรับ Owner review — `npm run lint` และ `npm run build` รันผ่านจริงแล้ว (ดูหัวข้อ "หลักฐานการทดสอบ")
Migration workflow ถูกทดสอบจริงกับ PostgreSQL แล้ว (ดูหัวข้อ "ฐานข้อมูล (PostgreSQL + Prisma)" และ
`prisma/MIGRATIONS.md`)

> โค้ดและ config ทั้งหมดในโปรเจกต์นี้ไม่มีข้อมูลบุคคล/หน่วยงานจริง ไม่มี secret จริง — ตาม `data-policy.md`

---

## เอกสารที่เกี่ยวข้อง (เฟส P0)

โปรเจกต์นี้พัฒนาต่อจากเอกสาร P0 ที่จัดทำไว้ก่อนหน้า (อยู่ใน Project docs แยกจาก repository นี้):
`project-charter.md`, `requirements.md`, `data-policy.md`, `dev-rules.md`, `sitemap.md`, `user-flows.md`
— อ้างอิงเอกสารเหล่านี้ก่อนเพิ่มฟีเจอร์ใหม่ทุกครั้ง โดยเฉพาะ `dev-rules.md` (workflow + Definition of Done) และ
`data-policy.md` (กติกาความปลอดภัยข้อมูล) ซึ่งบังคับใช้กับโค้ดในโปรเจกต์นี้ทุกบรรทัด

## Tech Stack (เฟสนี้)

| ส่วนประกอบ | เวอร์ชันที่ติดตั้งจริง |
|---|---|
| Next.js (App Router) | 16.3.5 |
| React | 19.2.8 |
| TypeScript | ^5 (strict mode) |
| Tailwind CSS | ^4 (CSS-first config, ไม่มี `tailwind.config.js`) |
| shadcn/ui | ตั้งค่าด้วยมือ (ดูหัวข้อ "หมายเหตุ shadcn/ui" ด้านล่าง) — style `new-york`, base color `neutral` |
| ESLint | ^9 (`eslint-config-next`) |
| PostgreSQL | 16 (local dev) |
| Prisma | 7.10.0 (`prisma`, `@prisma/client`) — pinned to latest **stable** release (ไม่ใช้ tag `latest` ซึ่งชี้ไป 8.0.0-rc.15 ที่มีช่องโหว่จาก dev-tooling dependency) |

**ยังไม่รวมในเฟสนี้ (ตามขอบเขตงานที่ระบุ):** Auth.js — จะเชื่อมต่อในเฟสถัดไปตาม `project-charter.md` ข้อ 12
(P2 Auth & RBAC Foundation) `.env.example` เตรียมชื่อตัวแปรไว้ล่วงหน้าแล้ว

## หมายเหตุสำคัญ — การตัดสินใจที่เบี่ยงจากสเปกเดิม (ต้องแจ้ง Owner)

1. **เวอร์ชัน Next.js: ใช้ 16.x แทน 14/15 ที่ระบุในโจทย์**
   ตรวจสอบด้วย `npm audit` พบว่า Next.js 14.2.35 มีช่องโหว่ความปลอดภัยระดับ **critical** (Unauthenticated Remote
   Code Execution) และ Next.js 15.5.25 (เวอร์ชัน backport ล่าสุดของสาย 15) ยังมีช่องโหว่ **high** (PostCSS XSS/path
   traversal) ที่ไม่มี patch ในสาย 15 — แก้ได้เฉพาะการอัปเกรดเป็น 16.x เท่านั้น ในฐานะ QA/Security Engineer
   จึงตัดสินใจใช้ **Next.js 16.3.5 (เวอร์ชัน stable ล่าสุด, 0 vulnerabilities)** แทน เพราะ App Router
   เป็นสถาปัตยกรรมเดียวกัน ไม่กระทบขอบเขต/โมดูลที่ออกแบบไว้ใน P0 — **Owner ควรยืนยันว่ายอมรับการเบี่ยงเวอร์ชันนี้**
2. **next/font/google (Geist) ไม่ได้ใช้งาน** — สภาพแวดล้อมที่ build โปรเจกต์นี้ (sandboxed CI) บล็อกการเชื่อมต่อ
   ออกไปยัง `fonts.googleapis.com`/`fonts.gstatic.com` ตามนโยบายองค์กร (`next build` ของ `next/font/google`
   ต้องดาวน์โหลดไฟล์ฟอนต์ตอน build) จึงเปลี่ยนไปใช้ system font stack ผ่านตัวแปร CSS `--font-sans`/`--font-mono`
   ใน `globals.css` แทน — **ไม่กระทบการทำงาน แต่ทำให้ฟอนต์ไม่ใช่ Geist ที่ตั้งใจไว้เดิม** เมื่อ deploy จริงใน
   environment ที่เข้าถึงอินเทอร์เน็ตได้ปกติ สามารถนำ `next/font/google` กลับมาใช้ได้ หรือดาวน์โหลดไฟล์ฟอนต์มาใช้กับ
   `next/font/local` แทน
3. **shadcn/ui ตั้งค่าด้วยมือ ไม่ได้ใช้ CLI (`npx shadcn init`)** — CLI ของ shadcn ต้องเรียก
   `https://ui.shadcn.com/init` ซึ่งถูกบล็อกโดยนโยบายเครือข่ายเดียวกัน จึงติดตั้ง dependency ที่จำเป็น
   (`class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `@radix-ui/react-slot`,
   `tw-animate-css`) ผ่าน npm โดยตรง (npm registry ไม่ถูกบล็อก) แล้วเขียน `components.json`, `src/lib/utils.ts`,
   และ component (`Button`, `Card`) ให้ตรงกับ output มาตรฐานของ shadcn/ui (style `new-york`, base color
   `neutral`) ด้วยมือ — ผลลัพธ์เทียบเท่ากับที่ CLI จะสร้างให้ทุกประการ และ `components.json` ที่มีอยู่ทำให้
   คำสั่ง `npx shadcn add <component>` ใช้เพิ่ม component อื่นภายหลังได้ตามปกติเมื่อ build ใน environment
   ที่เข้าถึง `ui.shadcn.com` ได้
4. **Prisma CLI ใช้งานไม่ได้เลยในสภาพแวดล้อมนี้ (ทุกคำสั่ง รวมถึง `generate`)** — เพราะต้องดาวน์โหลด
   schema-engine binary จาก `binaries.prisma.sh` ซึ่งถูกบล็อกโดยนโยบายเครือข่ายเดียวกับข้อ 2–3 จึงเขียน
   `schema.prisma` และไฟล์ migration ด้วยมือตาม convention จริงของ Prisma แล้วทดสอบ SQL ทุก migration
   จริงกับ PostgreSQL ผ่านสคริปต์ชั่วคราว `prisma/dev-migrate-verify.mjs` แทน — รายละเอียดการตรวจสอบ
   ทั้งหมด ผลทดสอบจริง และขั้นตอน remediation เมื่อมีเครือข่ายปกติ อยู่ใน **`prisma/MIGRATIONS.md`**
   (สำคัญ: ยังไม่เคย generate Prisma Client ได้จริงในสภาพแวดล้อมนี้ — ต้องทำก่อนเริ่มเขียนโค้ดที่ query
   ฐานข้อมูลจริงในเฟสถัดไป)
5. **P3 Auth.js: ค่าที่ไม่ได้ระบุไว้ในสเปกเดิม ต้องตัดสินใจเอง** — (ก) เลือก Credentials provider
   เท่านั้นในงานนี้ ยังไม่ผูก OAuth จริง (ไม่มี client secret ให้ทดสอบในสภาพแวดล้อมนี้ และเอกสารทุกฉบับ
   อธิบายเฉพาะ email+password) (ข) เลือก `bcryptjs` (pure JS) แทน `bcrypt`/`argon2` (native binding) ด้วย
   เหตุผลเดียวกับ Prisma CLI ในข้อ 4 (ค) **session timeout = 8 ชั่วโมง** — `dev-rules.md` §10 เลื่อนการ
   ตัดสินใจนี้มาไว้ที่เฟสนี้โดยตั้งใจ ไม่มีตัวเลขในสเปกเดิม (ง) **ระยะเวลาล็อกบัญชี = 15 นาที** —
   `requirements.md` §8 ระบุจำนวนครั้ง (5 ครั้ง) ไว้ชัดเจนแต่ไม่ได้ระบุระยะเวลาล็อกไว้เลยที่ใด — ทั้ง (ค)
   และ (ง) ปรับได้ผ่าน environment variable โดยไม่ต้องแก้โค้ด (ดู `.env.example`) — **Owner ควรทบทวนค่า
   เริ่มต้นทั้งสองนี้** รายละเอียดเต็มอยู่ใน `prisma/AUTH.md` หัวข้อ "การตัดสินใจเชิงวิศวกรรม"
6. **RBAC: ชื่อ role ทั่วไปในโจทย์งาน "ออกแบบ RBAC" (Guest/Member/Teacher/Data Editor/
   Reviewer/Admin/Super Admin) ถูกเทียบเข้ากับ `UserRole` enum เฉพาะทางเดิมที่ implement
   จริงอยู่แล้วทั่วทั้งโปรเจกต์** (เช่น Admin → `CENTRAL_OFFICER` ไม่ใช่ `SUPER_ADMIN`, และ
   คงบทบาท `REGIONAL_ADMIN`/`AUDITOR` ไว้นอกเหนือรายชื่อในโจทย์เพราะจำเป็นต่อ
   organization-scope และ NFR traceability ตามลำดับ) — **Owner ควรยืนยันการเทียบนี้**
   รายละเอียดเต็มอยู่ใน `prisma/roles-permissions.md` หัวข้อ 1

## ฐานข้อมูล (PostgreSQL + Prisma)

```bash
# 1. ติดตั้ง PostgreSQL 16 ในเครื่อง dev แล้วสร้าง role/database (ตัวอย่าง — เปลี่ยนรหัสผ่านเอง)
sudo -u postgres psql -c "CREATE ROLE your_dev_role LOGIN PASSWORD 'change-me';"
sudo -u postgres psql -c "CREATE DATABASE your_dev_db OWNER your_dev_role;"

# 2. ตั้งค่า DATABASE_URL ใน .env.local (ไม่ commit ไฟล์นี้)
echo 'DATABASE_URL="postgresql://your_dev_role:change-me@localhost:5432/your_dev_db?schema=public"' >> .env.local

# 3. ใช้สคริปต์ verify แทน `prisma migrate dev` (ดูเหตุผลในหมายเหตุข้อ 4 ด้านบน)
node prisma/dev-migrate-verify.mjs --status   # ดู migration ที่ applied แล้ว / ค้างอยู่
node prisma/dev-migrate-verify.mjs            # apply migration ที่ค้างอยู่ทั้งหมด (ใน transaction, มี rollback อัตโนมัติถ้า fail)
node prisma/dev-migrate-verify.mjs --reset    # DESTRUCTIVE: drop schema public แล้ว replay migration ทั้งหมดจากศูนย์ (เทียบเท่า prisma migrate reset — ใช้กับ dev/test เท่านั้น)

# 4. เติมข้อมูลจำลอง (idempotent — รันซ้ำได้ ไม่สร้าง duplicate) แทน `prisma db seed`
npm run db:seed                               # = tsx prisma/seed.ts — ดูรายละเอียดใน prisma/seed.ts และ prisma/MIGRATIONS.md §8
```

Schema ปัจจุบัน (`prisma/schema.prisma`) แบ่งเป็น 2 กลุ่ม:

| ตาราง | เฟส | หน้าที่ |
|---|---|---|
| `users` | P1 | ตัวตนผู้ใช้ขั้นต่ำ พร้อม role/status และ soft-delete (`deletedAt`) — ยังไม่ผูก Auth.js adapter tables (เฟสถัดไป) |
| `audit_logs` | P1 | Audit log แบบ generic/polymorphic append-only — บังคับด้วย database trigger ห้าม UPDATE/DELETE |
| `organizations`, `organization_hierarchy_rules`, `organization_status_history`, `addresses`, `contacts`, `positions`, `persons` (stub), `appointments` | P2 | โครงสร้างองค์กร/สายการปกครองคณะสงฆ์ — ดูรายละเอียดเต็มทุกตาราง/คอลัมน์/constraint ใน **`prisma/data-dictionary.md`** และแผนภาพ ER ใน **`prisma/erd.md`** |
| `academic_years`, `programs`, `education_levels`, `subjects`, `curricula`, `curriculum_level_subjects`, `exam_centers`, `exam_sessions`, `exam_session_centers`, `exam_schedules` | P2 | โดเมนนักธรรม/ธรรมศึกษา/บาลี (M2) — ปีการศึกษาและระดับชั้นเป็นตารางข้อมูล ไม่ hard-code; ดูรายละเอียดเต็มใน **`prisma/education-schema.md`** |
| `categories`, `tags`, `questions`, `question_categories`, `question_tags`, `question_versions`, `question_choices`, `answer_keys`, `documents`, `document_categories`, `document_tags`, `document_versions`, `exam_sets`, `exam_set_items` | P2 | คลังข้อสอบและเอกสาร (M3) — versioning แบบ "แก้ไขได้อิสระขณะ DRAFT แล้วล็อกถาวรด้วย DB trigger ทันทีที่เข้า workflow อนุมัติ"; ค้นข้อสอบ/ชุดข้อสอบตามหลักสูตร/ชั้น/ปี/วิชาผ่าน index บน `exam_sets`; `documents.isPublic` (P4, เพิ่มจากงาน "สร้างห้องสมุด PDF/Download") แยกเอกสารสาธารณะออกจากเอกสารภายในที่ต้อง login — ดูรายละเอียดเต็มใน **`prisma/exam-document-schema.md`** และ **`prisma/library-pages.md`** |
| `news_categories`, `news_articles`, `news_article_categories` | P4 | ข่าว/บทความ (M10) — `status` (DRAFT/PUBLISHED/UNPUBLISHED) ตัดสินการมองเห็นฝั่ง Public; ดูรายละเอียดเต็มใน **`prisma/news-articles.md`** |

**Seed data**: `prisma/seed.ts` (รันด้วย `npm run db:seed`) เติมข้อมูลจำลองที่ยังไม่มีใน
migration ใดๆ — บัญชี `users` ครบทุก role, สายการปกครองคณะสงฆ์จำลอง 10 หน่วยงาน (ครบ
7 ชั้น + สำนักเรียน + สำนักงานแม่กองธรรม) พร้อมที่อยู่/ช่องทางติดต่อ, ตำแหน่ง/บุคลากร/
การแต่งตั้งจำลอง 10 รูป (รวมกรณีประวัติเจ้าอาวาสที่ลาออกแล้วมีผู้สืบตำแหน่งใหม่), และ
ต่อยอดโดเมนการศึกษา/คลังข้อสอบด้วยหลักสูตรธรรมศึกษาชุดแรก + ข้อสอบ/เอกสาร/ชุดข้อสอบ
เพิ่มเติม — ทุกแถวใช้ id คงที่ + `ON CONFLICT` จึง idempotent (ทดสอบจริงแล้วโดยรัน
ซ้ำ 3 ครั้งติดต่อกันแล้วเทียบจำนวนแถวทุกตาราง ไม่มี duplicate — ดูผลทดสอบใน
`prisma/MIGRATIONS.md` §8)

Rollback plan: dev ใช้ `--reset` (destructive, replay จากศูนย์); staging/prod ใช้ compensating forward
migration (เขียน migration ใหม่ที่ย้อนกลับการเปลี่ยนแปลงเดิม — Prisma ไม่มี auto down-migration) — มี
ตัวอย่างจริงที่ทดสอบแล้วคือ `20260914100307_add_user_phone` ถูกย้อนกลับด้วย
`20260914100407_rollback_add_user_phone` รายละเอียดเต็มและผลทดสอบทุกกรณี (รวม failure scenario, และ
P2: hierarchy-validation trigger, append-only status history, partial-unique address/hierarchy-rule
constraints) อยู่ใน **`prisma/MIGRATIONS.md`**

## เริ่มต้นใช้งาน (Getting Started)

ต้องมี Node.js 22 ขึ้นไป และ PostgreSQL ที่สร้างฐานข้อมูลเปล่าไว้แล้ว (เช่น `createdb sangha_system_dev`)

```bash
npm install
cp .env.example .env.local   # แก้ค่าตามตารางด้านล่าง — ห้าม commit .env.local
npm run db:migrate           # apply migration ทั้งหมด (= node prisma/dev-migrate-verify.mjs)
npm run db:seed              # เติมข้อมูลจำลอง + บัญชีทดสอบ (รันซ้ำได้ ไม่สร้างข้อมูลซ้ำ)
npm run dev                  # http://localhost:3000
```

ค่าใน `.env.local` ที่ต้องแก้ก่อนรัน (ค่าอื่นใน `.env.example` ยังไม่ถูกใช้ในเฟสนี้):

| ตัวแปร | ค่า |
|---|---|
| `DATABASE_URL` | connection string ของฐานข้อมูลเปล่าที่สร้างไว้ — ถ้ายังเป็นค่าตัวอย่าง ทุกหน้าที่อ่านฐานข้อมูลจะ error |
| `AUTH_SECRET` | ค่าสุ่มของเครื่องนี้เอง เช่นจาก `openssl rand -base64 32` — ถ้ายังเป็นค่าตัวอย่างจะเข้าสู่ระบบไม่ได้อย่างปลอดภัย |
| `AUTH_URL` | `http://localhost:3000` |

เข้าสู่ระบบที่ `/login` ด้วยบัญชีจำลองจาก seed เช่น `mock.super.admin@sangha-system.invalid`
(รายชื่อบัญชีทั้ง 8 บทบาทอยู่ใน `prisma/seed.ts`) รหัสผ่านทดสอบร่วมของทุกบัญชีอยู่ใน
`prisma/seed-constants.mjs` — ใช้กับ dev/test เท่านั้น ห้ามใช้กับ staging/production

ชุดทดสอบ (`prisma/test-*.mjs`) รันกับ dev server ที่เปิดอยู่ เช่น `node prisma/test-auth-login.mjs`
ยกเว้น `test-auth-session-expiry.mjs` ที่ต้องเปิด dev server ด้วย `AUTH_SESSION_MAX_AGE_SECONDS=3`

### คำสั่งที่มี

| คำสั่ง | หน้าที่ |
|---|---|
| `npm run dev` | เริ่ม dev server (Turbopack) |
| `npm run build` | Build สำหรับ production |
| `npm run start` | รัน production server (ต้อง build ก่อน) |
| `npm run lint` | ตรวจสอบด้วย ESLint |
| `npm run db:migrate` | apply migration ที่ค้างอยู่ทั้งหมด |
| `npm run db:status` | ดู migration ที่ applied แล้ว / ค้างอยู่ |
| `npm run db:seed` | เติมข้อมูลจำลอง (idempotent) |

## โครงสร้างโฟลเดอร์

```
src/
  auth.ts                    — Auth.js v5 config (Credentials provider, JWT session) — ดู prisma/AUTH.md
  proxy.ts                   — Proxy (เดิมชื่อ middleware.ts — Next.js 16 เปลี่ยนชื่อ) — optimistic route redirect
  app/
    layout.tsx          — Root layout (SiteHeader/SiteFooter ของ Design System — P4, อ่าน session เพื่อแสดงผลเท่านั้น ไม่ใช่จุดตรวจสิทธิ์)
    page.tsx             — หน้าแรกจริงตาม sitemap.md (Hero + ข่าวล่าสุด + หมวดหมู่ query จากฐานข้อมูลจริง — P4 "สร้างหน้า Home + ข่าว/บทความ" ดู prisma/news-articles.md)
    news/page.tsx, news/[slug]/page.tsx — หน้ารายการข่าว (F1.1: แบ่งหน้า/กรองหมวดหมู่/ค้นหา) และรายละเอียดข่าว (F1.2: SEO metadata, deny-by-default ต่อ DRAFT/UNPUBLISHED) — ดู prisma/news-articles.md
    curriculum/page.tsx, curriculum/[program]/page.tsx, curriculum/[program]/[level]/page.tsx, curriculum/[program]/[level]/[subject]/page.tsx — Browse หลักสูตรนักธรรม/ธรรมศึกษา/บาลี ตาม program→level→subject→year พร้อม breadcrumbs/filter (F2.1 ขยาย + F2.2 ผูกกับวิชา) — ดู prisma/curriculum-pages.md
    exam-bank/page.tsx, exam-bank/[id]/page.tsx — คลังข้อสอบ + Search (F4.1 ค้นหา/รายการเอกสาร กรองหลักสูตร/ชั้น/วิชา/ปี/ประเภทเอกสาร + pagination + search, F4.2 รายละเอียดเอกสาร) เฉพาะ Document/DocumentVersion ที่ APPROVED เท่านั้น (ไม่มี Question/AnswerKey ปนอยู่ — ดู prisma/exam-bank-pages.md
    library/page.tsx, library/[id]/page.tsx — ห้องสมุด PDF/Download (F8.1 ค้นหา/รายการเอกสาร กรองหมวดหมู่/แท็ก/ประเภทเอกสาร + pagination + search, F8.2 รายละเอียด + metadata/preview-placeholder/ประวัติทุกเวอร์ชันที่ APPROVED) พร้อม public/private access ตาม isAuthenticated — ดู prisma/library-pages.md
    api/library/[id]/download/route.ts — Route Handler ดาวน์โหลดไฟล์เอกสาร (F8.3) แยก 404 not_found (ไม่มีสิทธิ์เห็น/ไม่มีอยู่จริง) กับ 503 file_unavailable (มีสิทธิ์เห็นแต่ยังไม่เชื่อม object storage จริง) — ดู prisma/library-pages.md §2.5
    admin/layout.tsx — Admin Dashboard Shell (P5): ประตูเข้า Admin Zone (F6.1, requirePermission("ADMIN","read") — SUPER_ADMIN/CENTRAL_OFFICER/AUDITOR เท่านั้น) + sidebar permission-aware ที่ derive จาก permission matrix จริง — ดู prisma/admin-dashboard.md
    admin/page.tsx — Admin Dashboard (F6.3 การ์ด KPI mock กรองตามสิทธิ์ + F6.4 กิจกรรมล่าสุดจริงจาก audit_logs) — ดู prisma/admin-dashboard.md
    design-system/page.tsx — หน้าอ้างอิงรวม component ทั้งหมดของ P4 (ไม่อยู่ใน sitemap.md — ดู prisma/design-system.md ข้อ 6)
    not-found.tsx, error.tsx, global-error.tsx — Empty/Error state ตาม Next.js file convention (P4 — ดู prisma/design-system.md)
    globals.css           — Tailwind v4 + shadcn/ui CSS variables (light/dark) + semantic status tokens (success/warning/info — P4)
    api/health/route.ts   — Health-check endpoint (ดูสเปกฟังก์ชันในหัวข้อถัดไป)
    api/auth/[...nextauth]/route.ts — Auth.js route handler
    api/organizations/[id]/route.ts — Protected endpoint พิสูจน์ deny-by-default + organization-scope จริง (ใช้ guardRoute() — ดู prisma/authz-guards.md)
    api/persons/[id]/route.ts — Protected endpoint พิสูจน์ OWN_RECORD scope + IDOR-safe 404 (ดู prisma/authz-guards.md)
    api/question-versions/[id]/route.ts — Protected endpoint พิสูจน์ RESPONSIBLE_RECORD scope (authorship OR program) (ดู prisma/authz-guards.md)
    api/admin/organization-scopes/route.ts, api/admin/organization-scopes/[id]/route.ts — Super-Admin-only scope grant/revoke ผ่าน HTTP (privilege-escalation test target — ดู prisma/authz-guards.md)
    login/                — หน้า login (Server Component + login-form.tsx Client Component)
    dashboard/             — Protected demo page (พิสูจน์ session/authorization ทำงานจริง)
    actions/auth.ts         — Server Actions: loginAction, logoutAction
    actions/scope.ts        — Server Actions: grant/revokeOrganizationScopeAction, grant/revokeProgramScopeAction (Super Admin เท่านั้น — M9)
  components/
    ui/                    — Design System primitives (P1: Button, Card; P4: Input, Label, Textarea, Select, Checkbox, Badge, Table, Skeleton, Alert, Separator, Sheet, FormField, EmptyState, ErrorState — ดู prisma/design-system.md)
    layout/                — Container, SiteHeader, SiteFooter, Breadcrumbs, PageHeader, nav-config.ts (P4 — ดู prisma/design-system.md); admin-sidebar.tsx (P5 Admin Dashboard Shell — sidebar permission-aware, desktop คงที่/มือถือ Sheet drawer — ดู prisma/admin-dashboard.md)
    news/news-article-card.tsx — การ์ดสรุปข่าว ใช้ร่วมกันทั้งหน้าแรกและ /news (P4 — ดู prisma/news-articles.md)
  lib/
    utils.ts                — `cn()` helper (clsx + tailwind-merge)
    format.ts                — `formatThaiDate()`/`formatThaiDateTime()`/`formatFileSize()` — วันที่/เวลา/ขนาดไฟล์แบบไทย พ.ศ. ใช้ร่วมหลายหน้า (P4)
    slug.ts                  — `slugifyCode()`/`codeFromSlug()` แปลง `code` (UPPER_SNAKE_CASE) เป็น URL slug อ่านง่ายแบบ bijective ไม่ต้องเพิ่มคอลัมน์ใหม่ (P4 — ดู prisma/curriculum-pages.md §2.1)
    curriculum.ts            — Browse หลักสูตร data-access layer (F2.1 ขยาย/F2.2, read-only) — ดู prisma/curriculum-pages.md
    exam-bank.ts             — คลังข้อสอบ + Search data-access layer (F4.1/F4.2, read-only, INNER JOIN LATERAL หาเวอร์ชัน APPROVED ล่าสุด, กรอง isPublic=true เพิ่มจากงานห้องสมุด) — ดู prisma/exam-bank-pages.md
    library.ts               — ห้องสมุด PDF/Download data-access layer (F8.1/F8.2, read-only, INNER JOIN LATERAL + isPublic OR isAuthenticated, ประวัติทุกเวอร์ชันที่ APPROVED, resolveFileUrl() placeholder เดียวสำหรับ M8) — ดู prisma/library-pages.md
    admin-nav.ts              — permission-aware sidebar nav derivation (F6.1, derive จาก MODULES + getPermission() จริง ไม่ hardcode ต่อ role) — ดู prisma/admin-dashboard.md
    admin-dashboard.ts        — Admin Dashboard data-access layer: getAdminKpiCards() (F6.3, ข้อมูลสมมติล้วน) + listRecentActivity() (F6.4, query audit_logs จริง) — ดู prisma/admin-dashboard.md
    db.ts                    — raw `pg` Pool (แทน @prisma/client — ดูเหตุผลใน prisma/MIGRATIONS.md ข้อ 1)
    password.ts, auth-config.ts, auth-errors.ts, login-security.ts, login-audit.ts, domain-types.ts
                              — Auth.js support layer (ดู prisma/AUTH.md ข้อ 2 สำหรับหน้าที่แต่ละไฟล์)
    permissions.ts           — Permission matrix แบบ code (role × module → action + scope) — ดู prisma/roles-permissions.md
    scope.ts                 — Scope resolution (organization-hierarchy recursive query, program scope, grant/revoke)
    authz.ts                 — Permission-resolution layer: getCurrentUser/requireUser/requireRole (role-level) + can/requirePermission/canAccessOrganization/requireOrganizationScope (scope-level, P3 RBAC)
    guard.ts                  — Authorization Guard สำหรับ Route Handler/API: guardRoute()/authorizeOwnedRow()/notFoundOrForbidden() — ดู prisma/authz-guards.md
    news.ts                    — ข่าว/บทความ data-access layer (F1.1/F1.2, เฉพาะ status=PUBLISHED เสมอ) — ดู prisma/news-articles.md
components.json            — shadcn/ui config (style: new-york, baseColor: neutral)
prisma/
  schema.prisma              — Prisma schema เต็ม (P1 User/AuditLog + P2 org-domain + P2 education-domain + P2 exam/document-domain + P3 auth/login-security + P3 RBAC/scope + P4 news-domain + P4 document-curriculum-link + P4 document-visibility)
  migrations/                 — Migration folders ตาม convention ของ Prisma (init, add_user_phone, rollback_add_user_phone, sangha_org_domain, education_domain, exam_document_domain, auth_credentials_and_login_security, rbac_scope_permissions, news_domain, document_curriculum_link, document_visibility)
  seed.ts, seed-constants.mjs — Seed data แบบสมมติ (idempotent, รวม passwordHash + RBAC scope + question ownership ทดสอบ) — รันด้วย `npm run db:seed`
  dev-migrate-verify.mjs      — สคริปต์ทดสอบ migration ชั่วคราว (ใช้แทน Prisma CLI ที่ใช้งานไม่ได้ในสภาพแวดล้อมนี้)
  test-exam-document-domain.mjs — Functional test สำหรับ conditional-immutability trigger + search path ของโดเมนคลังข้อสอบ
  test-auth-login.mjs         — ทดสอบจริงผ่าน HTTP: login/logout/lockout/inactive-account/authorization (24 assertions)
  test-auth-session-expiry.mjs — ทดสอบจริง: session หมดอายุตามเวลาจริง (2 assertions)
  test-rbac-scope.mjs         — ทดสอบจริงผ่าน HTTP + PostgreSQL: deny-by-default/organization-scope-cascade/append-only scope tables (28 assertions)
  test-authz-guard.mjs        — ทดสอบจริงผ่าน HTTP + PostgreSQL: IDOR (OWN_RECORD/RESPONSIBLE_RECORD) + privilege escalation (23 assertions)
  test-layout-responsive.mjs   — ทดสอบจริงผ่าน Playwright + Chromium: ไม่มี horizontal overflow ที่ 375/768/1024/1440px (344 assertions — รวมหน้า /news, /curriculum/..., /exam-bank/..., /library/... และ /admin (หลังล็อกอินจริงเป็น SUPER_ADMIN) ที่เพิ่มจากห้างานหลังสุด)
  test-news-pages.mjs           — ทดสอบจริงผ่าน HTTP: F1.1/F1.2 deny-by-default, pagination, category filter, search, SEO metadata, SQL-injection-safety (35 assertions)
  test-curriculum-pages.mjs      — ทดสอบจริงผ่าน HTTP: browse program→level→subject→year, examType/year filter, deny-by-default ข้ามระดับชั้น/หลักสูตร, EmptyState แทน orphan page (36 assertions)
  test-exam-bank-pages.mjs       — ทดสอบจริงผ่าน HTTP: F4.1/F4.2 deny-by-default (APPROVED เท่านั้น), filter หลักสูตร/ชั้น/วิชา/ปี/ประเภทเอกสารทั้งเดี่ยวและรวมกัน, ค้นหาภาษาไทยรวม SQL-injection-safety, pagination, EmptyState, 404 (44 assertions)
  test-library-pages.mjs         — ทดสอบจริงผ่าน HTTP + Jar/loginAs() จริงผ่าน Auth.js Credentials flow: F8.1/F8.2/F8.3 public/private access (Guest vs STUDENT ที่ login แล้ว), filter หมวดหมู่/แท็ก/ประเภทเอกสาร/คำค้นหารวม SQL-injection-safety, pagination, ประวัติเวอร์ชัน, download endpoint 404/503 ครบทุก combination (46 assertions)
  test-admin-dashboard.mjs       — ทดสอบจริงผ่าน HTTP + Jar/loginAs() จริง: F6.1 deny-by-default entry gate ครบทุก role (SUPER_ADMIN/CENTRAL_OFFICER/AUDITOR เข้าได้, ที่เหลือถูกปฏิเสธ), permission-aware sidebar (จำนวน module ต่อ role ตรงตาม matrix), F6.3 KPI mock cards, F6.4 recent activity จริงจาก audit_logs (รวม EmptyState ตอนว่างเปล่า + grant/revoke จริงผ่าน HTTP แล้วตรวจ ordering) — ต้องรันก่อน test-rbac-scope.mjs/test-authz-guard.mjs (ดู prisma/admin-dashboard.md §4) (52 assertions)
  MIGRATIONS.md                — เอกสารข้อจำกัดเครื่องมือ + ผลการทดสอบจริงทั้งหมด (ทุกเฟส) + rollback plan
  erd.md, data-dictionary.md         — P2 org-domain: ER diagram + data dictionary เต็ม
  education-schema.md                — P2 education-domain: ER diagram + data dictionary + function spec เต็ม
  exam-document-schema.md            — P2 exam/document-domain: ER diagram + data dictionary + function spec เต็ม
  AUTH.md                              — P3 auth: function spec, การตัดสินใจเชิงวิศวกรรม, ผลการทดสอบเต็ม, ขอบเขตที่ตัดออก
  roles-permissions.md                 — P3 RBAC: role mapping, scope model, permission matrix เต็ม, function spec, ผลการทดสอบเต็ม, ขอบเขตที่ตัดออก
  authz-guards.md                       — P3 Authorization Guard: guard utility design, function spec ของ endpoint ใหม่ 4 ตัว, IDOR/privilege-escalation checklist, ผลการทดสอบเต็ม, ขอบเขตที่ตัดออก
  design-system.md                       — P4 Design System + Layout: รายการ component เต็ม, function spec, ผลการทดสอบ responsive เต็ม, ขอบเขตที่ตัดออก, failure mode (รวม bug จริงเรื่อง loading.tsx vs redirect)
  news-articles.md                       — P4 Home + ข่าว/บทความ: schema M10, function spec F1.1/F1.2 เต็ม, ผลการทดสอบเต็ม, ขอบเขตที่ตัดออก, failure mode
  curriculum-pages.md                    — P4 นักธรรม/ธรรมศึกษา/บาลี: URL/slug design เต็ม, function spec F2.1 ขยาย/F2.2 เต็ม, ผลการทดสอบเต็ม, ขอบเขตที่ตัดออก, failure mode
  exam-bank-pages.md                     — P4 คลังข้อสอบ + Search: schema extension (document_curriculum_link), การตัดสินใจด้านความปลอดภัย (ไม่เผยแพร่ Question/AnswerKey), function spec F4.1/F4.2 เต็ม, ผลการทดสอบเต็ม, ขอบเขตที่ตัดออก, failure mode
  library-pages.md                       — P4 ห้องสมุด PDF/Download: schema extension (document_visibility — isPublic), การตัดสินใจเรื่อง public/private access (ทำไมไม่ใช้ FILES-module scope), 404-vs-503 design ของ download endpoint, function spec F8.1/F8.2/F8.3 เต็ม, ผลการทดสอบเต็ม, ขอบเขตที่ตัดออก, failure mode
  admin-dashboard.md                     — P5 Admin Dashboard Shell: ไม่มี schema ใหม่, การตัดสินใจเรื่อง permission-aware navigation (derive จาก permission matrix จริง), ประตูเข้า Admin Zone (requirePermission("ADMIN","read")), path ต่อ module, KPI mock vs recent activity จริง, function spec F6.1/F6.3/F6.4 เต็ม, ผลการทดสอบเต็ม, ขอบเขตที่ตัดออก, failure mode
.env.example                — ตัวแปรสภาพแวดล้อมที่ต้องใช้ (DATABASE_URL, AUTH_SECRET/AUTH_URL, session/lockout tunables — ผูกโค้ดจริงแล้วตั้งแต่ P3)
```

หน้าจอ/route จริงตาม 3 โซน (Public/Member/Admin) และ 9+ โมดูล จะทยอยเพิ่มตามแผนเฟสใน `project-charter.md`
ข้อ 12 — โครงสร้างปัจจุบันมี login/dashboard (protected) เพิ่มจาก P3 นอกเหนือจากหน้าแรกชั่วคราวและ
health-check endpoint

## ฟังก์ชันที่มีอยู่ในเฟสนี้ (ตามรูปแบบ Function Specification — dev-rules.md ข้อ 3)

### `GET /api/health`

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | System/monitoring tooling, Guest (Public — ไม่ต้องล็อกอินโดยตั้งใจ) |
| Input | ไม่มี (GET, ไม่มี param/body) |
| Process | คืนค่าสถานะแบบ static ทันที ยังไม่ตรวจสอบ dependency ใด ๆ (จะขยายให้ตรวจ DB/Storage ใน P2 เป็นต้นไป) |
| Output | JSON `{ status, phase, environment, timestamp }` |
| Permission | Public — ไม่มีข้อมูล Restricted/Secret ปนอยู่ในผลลัพธ์ |
| Validation | ไม่ต้องตรวจสอบ (ไม่มี input) |
| Error State | ไม่คาดว่าจะเกิด error; หากเกิด exception ที่ไม่ได้ดักไว้ Next.js จะตอบ 500 มาตรฐาน (ไม่รั่วไหล stack trace ตาม `dev-rules.md` ข้อ 7) |
| Audit | ไม่บันทึก — เป็น read-only ไม่มีข้อมูลสำคัญ (รูปแบบเดียวกับ F1.1 ใน `user-flows.md`) |
| Acceptance Criteria | AC1: `GET /api/health` คืน HTTP 200 พร้อม `{ status: "ok" }`; AC2: response ไม่มี secret/PII หลุดออกมา |

รายละเอียดสเปกเต็มอยู่เป็น comment ในไฟล์ `src/app/api/health/route.ts` โดยตรง

หน้าแรก (`/`) แทนที่ด้วยหน้า Public จริงตาม `sitemap.md` แล้วในงาน "สร้างหน้า Home +
ข่าว/บทความ" (P4) — ดูสเปกฟังก์ชันเต็มของ Home/`/news`/`/news/[slug]` ในหัวข้อถัดไป
และ **`prisma/news-articles.md`**

### เข้าสู่ระบบ / ออกจากระบบ (P3 Authentication & RBAC)

Auth.js v5 (Credentials provider) + session แบบ JWT ผูกกับฐานข้อมูลจริงแล้ว — สเปกฟังก์ชันเต็ม
(Actor/Input/Process/Output/Permission/Validation/Error State/Audit/Acceptance Criteria) ของ
เข้าสู่ระบบ, ออกจากระบบ และการตรวจสอบ session/สิทธิ์ (`getCurrentUser`/`requireUser`/`requireRole`)
อยู่ใน **`prisma/AUTH.md`** พร้อมการตัดสินใจเชิงวิศวกรรม (session timeout, lockout policy ฯลฯ) และ
ผลการทดสอบจริงทั้งหมด — สรุปเร็ว: `/login` (public), `/dashboard` (protected demo page),
`loginAction`/`logoutAction` (Server Actions ใน `src/app/actions/auth.ts`)

### RBAC + Scope-based Permission (P3 Authentication & RBAC)

Permission matrix ฉบับเต็ม (role × module → action + scope) ผูกกับข้อมูลจริงแล้ว
(`src/lib/permissions.ts` + `src/lib/scope.ts` + `src/lib/authz.ts`) — รองรับ
scope ตามลำดับชั้นการปกครององค์กร (`UserOrganizationScope`, cascade ลงลูกหลาน
ผ่าน recursive query), สายการศึกษา (`UserProgramScope`), และ "เฉพาะของตน"
(`users.personId` → `persons`) สเปกฟังก์ชันเต็ม (`can`/`requirePermission`/
`canAccessOrganization`/`requireOrganizationScope`/Server Actions จัดการ scope/
`GET /api/organizations/[id]`), การเทียบชื่อ role กับโจทย์ทั่วไป, และผลการทดสอบ
จริงทั้งหมด (28 assertions ใหม่) อยู่ใน **`prisma/roles-permissions.md`**

### Authorization Guard ฝั่ง Server (P3 Authentication & RBAC)

Guard utility กลาง (`src/lib/guard.ts`: `guardRoute()`/`authorizeOwnedRow()`/
`notFoundOrForbidden()`) รวม pattern "ตรวจ auth → ตรวจ permission → ตอบ 401/403/404
มาตรฐาน" ไว้จุดเดียวสำหรับทุก Route Handler/API พิสูจน์ด้วย endpoint จริง 4 ตัว
(`GET /api/persons/[id]` — OWN_RECORD, `GET /api/question-versions/[id]` —
RESPONSIBLE_RECORD, `POST`/`DELETE /api/admin/organization-scopes[/id]` —
privilege-escalation target) ทดสอบ IDOR และ privilege escalation จริงผ่าน HTTP
(23 assertions ใหม่ รวมการตรวจนับแถวในฐานข้อมูลว่าไม่มีการเขียนเกิดขึ้นเมื่อถูก
ปฏิเสธ) — รายละเอียดเต็มอยู่ใน **`prisma/authz-guards.md`**

### Design System + Layout (P4 Public Front End)

Component ชุดใหม่ใน `components/ui/` (Input/Label/Textarea/Select/Checkbox/
Badge/Table/Skeleton/Alert/Separator/Sheet/FormField/EmptyState/ErrorState) และ
`components/layout/` (Container/SiteHeader/SiteFooter/Breadcrumbs/PageHeader)
ครอบคลุม Header, Nav (พร้อมเมนูมือถือแบบ Sheet), Breadcrumbs, Footer, Cards,
Tables (มี wrapper scroll แนวนอนในตัวกันจอมือถือ), Forms, และ Empty/Loading/
Error states (`not-found.tsx`/`error.tsx`/`global-error.tsx`) — Header/Footer
ถูกผูกเข้า Root Layout แล้วครอบทุกหน้า พิสูจน์ด้วยหน้าแรกที่ปรับปรุงใหม่ +
หน้าอ้างอิง `/design-system` ทดสอบจริงด้วย Playwright ว่าไม่มี horizontal
overflow ที่ 375/768/1024/1440px ทั้งหน้า public และหลัง login จริง (66
assertions ใหม่) — **พบและแก้ bug จริงระหว่างทำงาน**: root `loading.tsx` ทำให้
`redirect()` ของหน้า protected กลายเป็น HTTP 200 แทน 307 (Suspense streaming
ทำให้ header ถูกส่งไปก่อน page component จะ throw redirect) จึงตัดสินใจไม่ใส่
root `loading.tsx` ในงานนี้ — รายละเอียดเต็ม (function spec, ผลการทดสอบ,
ขอบเขตที่ตัดออก, failure mode) อยู่ใน **`prisma/design-system.md`**

### Home + ข่าว/บทความ (P4 Public Front End)

หน้าแรก (`/`) แสดง Hero + ข่าวล่าสุด 3 รายการ + หมวดหมู่ข่าว query จากฐานข้อมูลจริง
เป็นครั้งแรก (เดิมเป็นข้อมูลสมมติล้วนๆ จากงาน Design System) — หน้ารายการข่าว
(`/news`, F1.1) รองรับแบ่งหน้า/กรองหมวดหมู่/ค้นหา (search preview) และหน้ารายละเอียด
ข่าว (`/news/[slug]`, F1.2) มี SEO metadata (title/description/Open Graph) ตรงกับ
เนื้อหาข่าวจริง — ทั้งสองหน้าบังคับ deny-by-default ต่อข่าวสถานะ DRAFT/UNPUBLISHED
เสมอ (query เฉพาะ `status='PUBLISHED'`, ไม่แยกข้อความ 404 ระหว่าง "ไม่พบ" กับ "ยังไม่
เผยแพร่" เพื่อไม่เปิดเผยว่ามี draft อยู่จริงตาม slug) migration ใหม่ `news_domain`
เพิ่ม 3 ตาราง (`news_categories`, `news_articles`, `news_article_categories`) —
**ยังไม่รวมหน้า Admin จัดการข่าว** (`/admin/news`, F1.3/F1.4 — งานแยกในอนาคต) —
รายละเอียดเต็ม (schema, function spec, ผลการทดสอบ, ขอบเขตที่ตัดออก, failure mode)
อยู่ใน **`prisma/news-articles.md`**

### นักธรรม/ธรรมศึกษา/บาลี — Browse หลักสูตร (P4 Public Front End)

หน้า `/curriculum` (รายการสายการศึกษา) → `/curriculum/[program]` (รายการระดับชั้น)
→ `/curriculum/[program]/[level]` (รายวิชาของระดับชั้นในหลักสูตรปัจจุบัน พร้อม
ตัวกรอง `?examType=`) → `/curriculum/[program]/[level]/[subject]` (เกณฑ์การสอบ +
ตารางสอบของวิชานั้น พร้อมตัวกรอง `?year=`) — ทุกหน้าอ่านจากตาราง
education-domain ที่ออกแบบไว้แล้วใน P2 ทั้งหมด **ไม่มี schema/migration ใหม่**
slug ของ program/level/subject แปลงมาจากคอลัมน์ `code` เดิมแบบ bijective
(`src/lib/slug.ts`) ไม่เพิ่มคอลัมน์ใหม่ deny-by-default ครอบคลุมทั้ง
`isActive=false`/`deletedAt` ของข้อมูลอ้างอิง และการเข้าถึงวิชาข้ามระดับชั้น/
หลักสูตรผ่าน URL (คืน 404 เหมือนกันทุกกรณี) — รายละเอียดเต็ม (URL/slug design,
function spec, ผลการทดสอบ, ขอบเขตที่ตัดออก, failure mode) อยู่ใน
**`prisma/curriculum-pages.md`**

### คลังข้อสอบ + Search (P4 Public Front End)

หน้า `/exam-bank` (ค้นหา/รายการเอกสาร — ฟอร์มกรอง 5 มิติ: หลักสูตร/ชั้น/วิชา/ปี
การศึกษา/ประเภทเอกสาร + ค้นหาชื่อเรื่อง + pagination) และ `/exam-bank/[id]`
(รายละเอียดเอกสาร) — **มี schema/migration ใหม่**
(`20260924090000_document_curriculum_link`) เพิ่มคอลัมน์ nullable
`levelId`/`subjectId`/`academicYearId` ที่ `Document` เพื่อรองรับตัวกรอง
การตัดสินใจด้านความปลอดภัยที่สำคัญ: "คลังข้อสอบ" สาธารณะในที่นี้หมายถึง
**เอกสารแนบ (`Document`/`DocumentVersion`) เท่านั้น** — ไม่มีฟังก์ชันใด query
`Question`/`QuestionVersion`/`AnswerKey`/`ExamSet` เพื่อป้องกันข้อสอบ/เฉลยรั่วไหล
ก่อนวันสอบจริง เอกสารจะปรากฏต่อ public ก็ต่อเมื่อมีเวอร์ชันที่ `status='APPROVED'`
อย่างน้อยหนึ่งเวอร์ชันเท่านั้น (deny-by-default ผ่าน `INNER JOIN LATERAL`) ค้นหา
ด้วย ILIKE (ไม่ใช่ PostgreSQL full-text search จริง — ภาษาไทยไม่มี text search
config ในตัว ดูเหตุผลเต็มใน `prisma/exam-bank-pages.md` §2.3) — รายละเอียดเต็ม
(schema extension เหตุผล, URL design, function spec F4.1/F4.2, ผลการทดสอบ,
ขอบเขตที่ตัดออก, failure mode) อยู่ใน **`prisma/exam-bank-pages.md`**

### ห้องสมุด PDF/Download (P4 Public Front End)

หน้า `/library` (ค้นหา/รายการเอกสาร — ฟอร์มกรอง 3 มิติ: หมวดหมู่/แท็ก/ประเภท
เอกสาร + ค้นหาชื่อเรื่อง + pagination), `/library/[id]` (รายละเอียด + metadata/
preview-placeholder/ประวัติทุกเวอร์ชันที่ APPROVED) และ
`GET /api/library/[id]/download` (ดาวน์โหลดไฟล์ตามเวอร์ชันที่ระบุหรือล่าสุด) —
**มี schema/migration ใหม่** (`20260924110000_document_visibility`) เพิ่ม
คอลัมน์ `isPublic` (NOT NULL, default false) ที่ `Document` เพื่อรองรับ
"public/private access" ที่งานนี้ระบุ ทั้งสามหน้า/endpoint query ตาราง
`documents`/`document_versions` เดียวกับ `/exam-bank` (ปรับ
`src/lib/exam-bank.ts` ให้กรอง `isPublic=true` เพิ่มเติมด้วยแล้ว เพื่อไม่ให้
เอกสารภายในรั่วไหลผ่านหน้าคลังข้อสอบ) การตัดสินใจสำคัญ: **"private" หมายถึง
"ต้อง login เท่านั้น" ไม่ตรวจ role/scope เพิ่มเติม** เพราะ `Document` ไม่มี
คอลัมน์ ownership/org-linkage ให้ใช้ FILES-module scope (`src/lib/
permissions.ts`) ได้อย่างถูกต้อง (ดูเหตุผลเต็มใน `prisma/library-pages.md`
§2.2) — deny-by-default เดิม (ต้องมีเวอร์ชัน `APPROVED`) ยังคงอยู่ครบเป็นเงื่อนไข
เพิ่มเติมจาก public/private ไม่ใช่แทนที่กัน download endpoint แยก 404
(ไม่มีสิทธิ์เห็น/ไม่มีอยู่จริง) กับ 503 (มีสิทธิ์เห็นแต่ไฟล์จริงยังไม่พร้อม — M8
ยังไม่เชื่อมต่อ) โดยตั้งใจ — รายละเอียดเต็ม (schema extension เหตุผล, การไม่ใช้
FILES-module scope, 404-vs-503 design, function spec F8.1/F8.2/F8.3,
ผลการทดสอบ, ขอบเขตที่ตัดออก, failure mode) อยู่ใน **`prisma/library-pages.md`**

### Admin Dashboard Shell (P5 Admin & CMS)

`/admin` (layout + dashboard page) — **ไม่มี schema/migration ใหม่ในงานนี้**
ใช้ permission matrix (`src/lib/permissions.ts`) และตาราง `audit_logs` (P1)
ที่มีอยู่แล้วทั้งหมด ประตูเข้า Admin Zone คือ
`requirePermission("ADMIN","read")` จุดเดียว — มีเพียง SUPER_ADMIN,
CENTRAL_OFFICER, AUDITOR เท่านั้นที่มี entry ของ module ADMIN (M6) ใน
`PERMISSION_MATRIX` ตรงกับ `claude/sitemap.md` ข้อ 7 "Zone Access Summary"
พอดี sidebar (`src/lib/admin-nav.ts::getVisibleAdminNavItems()`) และการ์ด
KPI (`src/lib/admin-dashboard.ts::getAdminKpiCards()`) **derive จาก
permission matrix จริงโดยตรง** (วน `MODULES` ทั้ง 9 แล้วถาม `getPermission()`
ว่ามี entry หรือไม่) ตรงกับ "วิธีตรวจสอบ" ที่งานนี้ระบุ ("ผู้ใช้เห็นเฉพาะ module
ที่มีสิทธิ์") ทุกประการ — ไม่มี role ใดถูก hardcode ไว้ในโค้ด UI เลย KPI เป็น
"ข้อมูลสมมติ" ล้วนตามที่บรีฟระบุ (มี badge "ข้อมูลตัวอย่าง" กำกับบนหน้าจอจริง)
ส่วน "recent activity" เป็น**ข้อมูลจริง**จาก `audit_logs` (append-only,
บังคับด้วย DB trigger) — ต่างจาก KPI ตรงที่บรีฟไม่ได้แนบคำว่า "mock" กำกับไว้
เลย — รายละเอียดเต็ม (การตัดสินใจเรื่อง permission-aware navigation, ประตูเข้า
Admin Zone, path ต่อ module, KPI mock vs recent activity จริง, function spec
F6.1/F6.3/F6.4 เต็ม, ผลการทดสอบ, ขอบเขตที่ตัดออก, failure mode) อยู่ใน
**`prisma/admin-dashboard.md`**

## กติกาที่บังคับใช้กับโค้ดในโปรเจกต์นี้ (สรุปจาก P0)

- **ข้อมูลสมมติเท่านั้น** ใน dev/test จนกว่าจะผ่าน Real-data Readiness Gate (`data-policy.md` ข้อ 4)
- **Authorization ตรวจฝั่ง server เสมอ ยึด deny-by-default** — เชื่อม Auth.js จริงแล้วตั้งแต่ P3
  และมี scope-based permission เต็มรูปแบบแล้วตั้งแต่งาน RBAC (`src/lib/authz.ts` — ดู
  `prisma/AUTH.md` และ `prisma/roles-permissions.md`) ตาม `dev-rules.md` ข้อ 4
- **ห้าม commit secret** — ใช้ `.env.example` เป็นแม่แบบ, `.env*` อยู่ใน `.gitignore` แล้ว (ตรวจสอบว่าไม่มีการลบ
  บรรทัดนี้ออกโดยไม่ตั้งใจ)
- **Transaction สำหรับ operation ที่ต้อง atomic** และ **history แทนการ overwrite** — จะมีผลเมื่อเริ่มเชื่อม
  Prisma/PostgreSQL (`data-policy.md` ข้อ 7, 10)
- ทุกฟังก์ชันใหม่ต้องระบุ Actor/Input/Process/Output/Permission/Validation/Error State/Audit/Acceptance
  Criteria ก่อนเริ่ม implement (`dev-rules.md` ข้อ 3 — Definition of Ready)
- Workflow บังคับ: วิเคราะห์ → ออกแบบ → ลงมือทำ → ทดสอบ → review → แก้ → regression test → commit
  (`dev-rules.md` ข้อ 2)

## หลักฐานการทดสอบ (รันจริงแล้ว — ไม่ใช่การอ้างลอย ๆ)

รันด้วย Node.js v22.22.2 / npm 10.9.7 บน 2026-09-14:

```
$ npm run lint
> sangha-system@0.1.0 lint
> eslint
(ไม่มี error/warning — exit code 0)
```
**ผล: Passed**

```
$ npm run build
▲ Next.js 16.3.5 (Turbopack)
✓ Compiled successfully in 8.8s
  Running TypeScript ...
  Finished TypeScript in 2.3s ...
✓ Generating static pages using 1 worker (5/5) in 153ms

Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /api/health

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```
**ผล: Passed**

```
$ npm run start -- -p 3399
$ curl http://localhost:3399/            → HTTP 200 (Tailwind/shadcn class ปรากฏใน HTML จริง)
$ curl http://localhost:3399/api/health  → HTTP 200 {"status":"ok","phase":"P1 — Project Foundation",...}
```
**ผล: Passed** (smoke test เพิ่มเติมนอกเหนือจากเกณฑ์ที่กำหนด เพื่อยืนยันว่า build ที่ผ่านใช้งานได้จริง ไม่ใช่แค่คอมไพล์ผ่าน)

```
$ npm audit
found 0 vulnerabilities
```
**ผล: Passed**

### Migration workflow (PostgreSQL + Prisma)

รายละเอียดคำสั่งและผลลัพธ์ทั้งหมดของทุกเฟส (P1: 16 การทดสอบ รันเมื่อ 2026-09-14 — forward/rollback
migration, immutability trigger, reset+replay, failure scenario; P2 org-domain: 20 การทดสอบ; P2
education-domain: 12 การทดสอบ; P2 exam/document-domain: 23 การทดสอบ; P2 seed data: 11 การทดสอบ —
สี่รายการหลังรันเมื่อ 2026-09-23; P3 Auth.js/login-security: 6 รายการ ครอบคลุม 26 assertion จริงจาก
`test-auth-login.mjs`/`test-auth-session-expiry.mjs`; P3 RBAC + Scope-based Permission: 7 รายการ
ครอบคลุม 28 assertion จริงจาก `test-rbac-scope.mjs`; P3 Authorization Guard ฝั่ง Server: 8 รายการ
ครอบคลุม 23 assertion จริงจาก `test-authz-guard.mjs` (IDOR/privilege-escalation); P4 Design System +
Layout: ครอบคลุม 66 assertion จริงจาก `test-layout-responsive.mjs` (Playwright จริง — no horizontal
overflow ที่ 375/768/1024/1440px ทั้งหน้า public และหลัง login จริง); P4 Home + ข่าว/บทความ: ครอบคลุม
35 assertion จริงจาก `test-news-pages.mjs` (deny-by-default/pagination/category-filter/search/SEO
metadata/SQL-injection-safety) บวก 48 assertion เพิ่มเติมใน `test-layout-responsive.mjs` (ขยายให้
ครอบคลุมหน้า `/news`/`/news/[slug]` รวมเป็น 114 assertion); P4 นักธรรม/ธรรมศึกษา/บาลี (Browse
หลักสูตร): ครอบคลุม 36 assertion จริงจาก `test-curriculum-pages.mjs`
(browse program→level→subject→year, examType/year filter, deny-by-default ข้ามระดับชั้น/หลักสูตร,
EmptyState แทน orphan page) บวก 84 assertion เพิ่มเติมใน `test-layout-responsive.mjs` (ขยายให้
ครอบคลุมหน้า `/curriculum/...` รวมเป็น 198 assertion); P4 คลังข้อสอบ + Search: ครอบคลุม 44
assertion จริงจาก `test-exam-bank-pages.mjs` (deny-by-default APPROVED-only, filter หลักสูตร/ชั้น/
วิชา/ปี/ประเภทเอกสารทั้งเดี่ยวและรวมกัน, ค้นหาภาษาไทยรวม SQL-injection-safety, pagination,
EmptyState, 404) บวก 60 assertion เพิ่มเติมใน `test-layout-responsive.mjs` (ขยายให้ครอบคลุมหน้า
`/exam-bank/...` รวมเป็น 258 assertion); P4 ห้องสมุด PDF/Download: ครอบคลุม 46 assertion จริงจาก
`test-library-pages.mjs` (public/private access ผ่าน Jar/`loginAs()` จริง, filter หมวดหมู่/แท็ก/
ประเภทเอกสารทั้งเดี่ยวและรวมกัน, ค้นหาภาษาไทยรวม SQL-injection-safety, pagination, ประวัติเวอร์ชัน,
download endpoint 404/503 ครบทุก combination) บวก 60 assertion เพิ่มเติมใน
`test-layout-responsive.mjs` (ขยายให้ครอบคลุมหน้า `/library/...` รวมเป็น 318 assertion — ทั้งหมด
รันเมื่อ 2026-09-23/24); P5 Admin Dashboard Shell: ครอบคลุม 52 assertion จริงจาก
`test-admin-dashboard.mjs` (deny-by-default entry gate ครบทุก role, permission-aware sidebar,
KPI mock cards, recent activity จริงจาก `audit_logs` รวม EmptyState + grant/revoke จริงผ่าน HTTP)
บวก 26 assertion เพิ่มเติมใน `test-layout-responsive.mjs` (ขยายให้ครอบคลุมหน้า `/admin` หลังล็อกอิน
จริงเป็น SUPER_ADMIN รวมเป็น 344 assertion — ทั้งหมดรันเมื่อ 2026-09-24)
อยู่ใน **`prisma/MIGRATIONS.md`** — สรุปสั้น: **657/657 PASSED สะสมทุกเฟส** ทุกคำสั่งรันกับ
PostgreSQL 16 จริงในเครื่องนี้และ `next dev` จริงบน `:3000` (11 migration ล่าสุด replay จากศูนย์ +
`npm run db:seed` + login/logout/lockout/session-expiry/organization-scope-cascade/deny-by-default/
IDOR/privilege-escalation/responsive-layout/news-deny-by-default/curriculum-browse-deny-by-default/
exam-bank-deny-by-default/library-public-private-access/admin-dashboard-permission-aware-navigation
ผ่านการทดสอบจริงทั้งหมด) ไม่มีการอ้างผลโดยไม่ได้รันจริง

`npx next typegen`, `npx tsc --noEmit`, `npm run lint` และ `npx next build` ถูกรันซ้ำหลังเพิ่มหน้า
คลังข้อสอบ (`src/lib/exam-bank.ts`, `src/lib/domain-types.ts` ที่ขยาย (`DOCUMENT_TYPES`),
`src/app/exam-bank/page.tsx`, `src/app/exam-bank/[id]/page.tsx`) แล้วผ่านทั้งหมด (exit code 0) —
`npx next build` แสดง route ใหม่ `/exam-bank`, `/exam-bank/[id]` เพิ่มจากเดิมทั้งหมด

`npx next typegen`, `npx tsc --noEmit`, `npm run lint` และ `npx next build` ถูกรันซ้ำอีกครั้งหลัง
เพิ่มห้องสมุด (`src/lib/library.ts`, `src/lib/format.ts` ที่ขยาย (`formatFileSize`),
`src/app/library/page.tsx`, `src/app/library/[id]/page.tsx`,
`src/app/api/library/[id]/download/route.ts`, `src/lib/exam-bank.ts` ที่แก้ isPublic
consistency) แล้วผ่านทั้งหมด (exit code 0) — `npx next build` แสดง route ใหม่ `/library`,
`/library/[id]`, `/api/library/[id]/download` เพิ่มจากเดิมทั้งหมด

`npx next typegen`, `npx tsc --noEmit`, `npm run lint` และ `npx next build` ถูกรันซ้ำอีกครั้งหลัง
เพิ่ม Admin Dashboard Shell (`src/app/admin/layout.tsx`, `src/app/admin/page.tsx`,
`src/lib/admin-nav.ts`, `src/lib/admin-dashboard.ts`, `src/components/layout/admin-sidebar.tsx`)
แล้วผ่านทั้งหมด (exit code 0) — `npx next build` แสดง route ใหม่ `/admin` เพิ่มจากเดิมทั้งหมด

## ปัญหาที่พบระหว่างทำงาน

- `npx shadcn@latest init` ล้มเหลว (เครือข่ายบล็อก `ui.shadcn.com`) → แก้ด้วยการตั้งค่าด้วยมือ (ดูหัวข้อ
  "หมายเหตุสำคัญ" ข้อ 3) — ไม่ใช่ bug ของโปรเจกต์ แต่เป็นข้อจำกัดของ build environment นี้
- `next/font/google` ทำให้ build ล้มเหลวในสภาพแวดล้อมนี้ (บล็อก Google Fonts) → แก้ด้วย system font stack
  (ดูหัวข้อ "หมายเหตุสำคัญ" ข้อ 2)
- Next.js 14/15 ที่ระบุในสเปกเดิมมีช่องโหว่ความปลอดภัยที่ไม่มี patch → เปลี่ยนเป็น 16.x (ดูหัวข้อ "หมายเหตุสำคัญ" ข้อ 1)
- Prisma CLI (`init`/`generate`/`validate`/`format`/`migrate *`) ใช้งานไม่ได้เลยในสภาพแวดล้อมนี้ (บล็อก
  `binaries.prisma.sh`) → เขียน schema/migration ด้วยมือ + สคริปต์ทดสอบทดแทน (ดูหัวข้อ "หมายเหตุสำคัญ" ข้อ 4
  และ `prisma/MIGRATIONS.md`) — **ต้องแก้ก่อนเริ่มเขียนโค้ดที่ query ฐานข้อมูลจริง** โดย generate Prisma
  Client ใน environment ที่เข้าถึงเครือข่ายได้ปกติ แล้ว baseline migration ทั้ง 3 ด้วย
  `prisma migrate resolve --applied`
- root `loading.tsx` (Next.js file convention) ทำให้ `redirect()` ของหน้า protected (เช่น `/dashboard`
  เมื่อบัญชีถูก SUSPENDED) ตอบ HTTP 200 แทน 307 จริง (ตรวจพบจาก `test-auth-login.mjs` ล้มเหลวหลังเพิ่ม
  ไฟล์นี้) → ไม่ใส่ root `loading.tsx` ในงานนี้ ใช้ `Skeleton` component ต่อ segment แทนเมื่อจำเป็นในอนาคต
  (รายละเอียดเต็มอยู่ใน `prisma/design-system.md` หัวข้อ "ขอบเขตที่ตัดออก" ข้อ 3)

## งานถัดไป (นอกขอบเขตของเฟสนี้)

- Generate Prisma Client จริง + baseline migration history เข้าสู่ Prisma Migrate อย่างเป็นทางการ ใน
  environment ที่เข้าถึง `binaries.prisma.sh` ได้ (ดูขั้นตอนใน `prisma/MIGRATIONS.md` หัวข้อ 2)
- ออกแบบ ER model เต็มรูปแบบของ 9 โมดูล (M1–M9 ใน `requirements.md`) ต่อจาก schema พื้นฐาน (User, AuditLog)
- แทนที่หน้าแรกชั่วคราวด้วยหน้า Public จริงตาม `sitemap.md`
- พิจารณาอัปเกรด dependency รอง (eslint 10.x, react 19.3.x, typescript 7.x — ยังไม่จำเป็นและยังไม่ทดสอบ
  ความเข้ากันได้ในเฟสนี้ ตาม `npm outdated`)
- **(ใหม่จาก P3 Auth.js)** งานที่ตัดออกอย่างโปร่งใส — ดูรายละเอียดเหตุผลเต็มใน `prisma/AUTH.md` หัวข้อ
  "ขอบเขตที่ตัดออก": OAuth provider จริง, การสมัครสมาชิก/ยืนยันอีเมล/อนุมัติบัญชี (F5.1-F5.3),
  rate-limit ต่อ IP address, หน้า Admin ตั้งค่าระบบ (F6.5 — session timeout/lockout ให้ configurable
  แทน env var คงที่), และ `/forgot-password`
- **(ใหม่จาก P3 RBAC + Scope-based Permission)** งานที่ตัดออกอย่างโปร่งใส — ดูรายละเอียดเหตุผลเต็มใน
  `prisma/roles-permissions.md` หัวข้อ 8: `ASSIGNED_SESSION` scope ของ Examiner (รอตาราง exam-session-
  assignment จริงจาก M4), Admin UI สำหรับจัดการ scope (ปัจจุบันมีแค่ Server Action), การผูก
  `RESPONSIBLE_RECORD` เข้ากับ endpoint จริงของ M3, และการยืนยัน role-mapping/M6-config-granularity
  กับ Owner (ดูหัวข้อ "หมายเหตุสำคัญ" ข้อ 6)
- **(ใหม่จาก P3 Authorization Guard ฝั่ง Server)** งานที่ตัดออกอย่างโปร่งใส — ดูรายละเอียดเหตุผลเต็มใน
  `prisma/authz-guards.md` หัวข้อ 8 และ 10: guard เฉพาะสำหรับ Server Action (ยังใช้
  `requirePermission()`/`requireRole()` แบบ `redirect()` เดิม — ตั้งใจแยกจาก `guardRoute()` เพราะ
  contract การคืนค่าต่างกัน), `ASSIGNED_SESSION` ของ Examiner ยัง deny เสมอ (รอตารางมอบหมายรอบสอบจริง
  จาก M4), rate limiting ระดับ endpoint สำหรับ resource เสี่ยง IDOR สูง (`/api/persons/[id]`), และ
  access log แยกสำหรับการอ่าน resource ระดับ Restricted ที่สำเร็จ (ปัจจุบันไม่บันทึก audit เพราะเป็น
  read-only ตาม pattern เดิม — รอ Owner ตัดสินใจ)
- **(ใหม่จาก P4 Design System + Layout)** งานที่ตัดออกอย่างโปร่งใส — ดูรายละเอียดเหตุผลเต็มใน
  `prisma/design-system.md` หัวข้อ 6 และ 8: แยก route group `(public)`/`(member)`/`(admin)` ตาม
  sitemap.md, ผูก react-hook-form/zod เข้ากับ FormField เมื่อมีฟอร์มจริงตัวแรก, พิจารณา gate/ลบหน้า
  `/design-system` ก่อน production, UI สลับ light/dark mode (token มีพร้อมแล้ว), และเพิ่ม `loading.tsx`
  เฉพาะ route ที่ไม่มี auth redirect (ดูคำเตือนเรื่อง Suspense-vs-redirect ในหัวข้อเดียวกัน) ก่อนเพิ่มใน
  เส้นทางใดๆ ที่มีการตรวจสิทธิ์
- **(ใหม่จาก P4 Home + ข่าว/บทความ)** งานที่ตัดออกอย่างโปร่งใส — ดูรายละเอียดเหตุผลเต็มใน
  `prisma/news-articles.md` หัวข้อ 6 และ 7: หน้า Admin จัดการข่าว (`/admin/news`, F1.3/F1.4), เชื่อม
  Object Storage จริงสำหรับภาพปกข่าวแล้วเปลี่ยนเป็น `next/image`, search แบบ type-ahead ฝั่ง client
  (ปัจจุบันเป็น server-rendered GET form), แทนที่หน้า `/curriculum`/`/exam-schedule`/`/about` ฯลฯ ตาม
  sitemap.md ต่อไปตามลำดับ, และเพิ่ม sanitization หากเปลี่ยน content ข่าวจาก plain text เป็น rich-text
- **(ใหม่จาก P4 นักธรรม/ธรรมศึกษา/บาลี — Browse หลักสูตร)** งานที่ตัดออกอย่างโปร่งใส — ดูรายละเอียด
  เหตุผลเต็มใน `prisma/curriculum-pages.md` หัวข้อ 6: หน้า `/exam-schedule` ภาพรวมทั้งระบบตาม
  sitemap.md (งานนี้สร้างเฉพาะตารางสอบที่ผูกกับวิชาเดียว), หน้า Admin จัดการข้อมูลอ้างอิงหลักสูตร/
  ระดับชั้น/วิชา (F2.3), UI สำหรับดูหลักสูตรเวอร์ชันย้อนหลัง (ปัจจุบันมีหลักสูตรเดียวต่อสายจริง),
  การเชื่อมกับคลังข้อสอบ (M3) ที่หน้ารายละเอียดวิชา, และการเพิ่มสถานะ "ร่าง" ที่ชัดเจนให้
  `exam_session_status` (ปัจจุบันตีความ PLANNED เป็นข้อมูลสาธารณะ)
- **(ใหม่จาก P4 คลังข้อสอบ + Search)** งานที่ตัดออกอย่างโปร่งใส — ดูรายละเอียดเหตุผลเต็มใน
  `prisma/exam-bank-pages.md` หัวข้อ 6 และ 7: เชื่อมต่อ object storage จริง (M8 — ปุ่มดาวน์โหลดยัง
  disabled), หน้า Admin จัดการ/อนุมัติเอกสาร (`/admin/question-bank` ตาม sitemap.md), พิจารณาใช้
  `pg_trgm`/ระบบตัดคำภาษาไทยแทน ILIKE เมื่อจำนวนเอกสารเพิ่มขึ้นมากพอ, เพิ่มข้อมูลจำลองให้เกิน
  `EXAM_BANK_PAGE_SIZE` เพื่อทดสอบ pagination ข้ามหน้าจริง, และเชื่อมหน้ารายละเอียดวิชาเข้ากับ
  `/exam-bank?subject=...`
- **(ใหม่จาก P4 ห้องสมุด PDF/Download)** งานที่ตัดออกอย่างโปร่งใส — ดูรายละเอียดเหตุผลเต็มใน
  `prisma/library-pages.md` หัวข้อ 6 และ 7: scope "private" ที่ใช้แค่ isAuthenticated (ไม่แยก role/
  organization — ต้องเพิ่มคอลัมน์ ownership ให้ `Document` ก่อนจึงใช้ FILES-module scope ที่มีอยู่แล้ว
  ได้ถูกต้อง), เชื่อมต่อ object storage จริง (M8 — `resolveFileUrl()` คืน null เสมอ, download endpoint
  จึงตอบ 503 เสมอในเฟสนี้), PDF viewer/thumbnail จริงสำหรับ preview, หน้า Admin ตั้งค่า
  `isPublic`/หมวดหมู่/แท็ก, กรอง `listCategories()`/`listTags()` ให้ตรงกับสิทธิ์ผู้เรียกจริง (ปัจจุบัน
  เป็น global list เหมือน `listAllSubjects()`), เพิ่มข้อมูลจำลองให้เกิน `LIBRARY_PAGE_SIZE` เพื่อทดสอบ
  pagination ข้ามหน้าจริง, และเชื่อมหน้าคลังข้อสอบ/หลักสูตรเข้ากับห้องสมุดแบบไขว้กัน
- **(ใหม่จาก P5 Admin Dashboard Shell)** งานที่ตัดออกอย่างโปร่งใส — ดูรายละเอียดเหตุผลเต็มใน
  `prisma/admin-dashboard.md` หัวข้อ 6 และ 7: หน้าย่อยจริงของแต่ละ module (sidebar ลิงก์ไปหาแล้วแต่ยัง
  เจอ `not-found.tsx`), แทนที่ KPI mock ด้วย query จริงทีละ module, หน้า `/admin/audit-log` แยกที่มีตัว
  กรอง/pagination เต็มรูปแบบ (ปัจจุบันมีแค่ "recent activity" แบบย่อ 10 รายการในแดชบอร์ดหลัก), แยก route
  group `(admin)` ออกจาก RootLayout สาธารณะ, และยืนยัน path ของแต่ละ module กับ Owner เมื่อ sitemap.md
  Admin Zone ได้รับการยืนยันแล้ว
