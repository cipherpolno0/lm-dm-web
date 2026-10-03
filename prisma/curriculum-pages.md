# หน้า นักธรรม/ธรรมศึกษา/บาลี — Browse หลักสูตร (P4 Public Front End)

Phase: P4 Public Front End — งาน "สร้างหน้า นักธรรม/ธรรมศึกษา/บาลี"
รายละเอียดที่ระบุ: **Browse ตาม program → level → subject → year พร้อม
breadcrumbs และ filter** — ต่อยอดจาก `user-flows.md` Flow 2 (หลักสูตร) F2.1
(ดูรายละเอียดหลักสูตร/ระดับชั้น) และ F2.2 (ดูตารางสอบ/สนามสอบ) และใช้ schema ที่
ออกแบบไว้แล้วทั้งหมดใน P2 (ดู `prisma/education-schema.md`) — **ไม่มี schema/
migration ใหม่ในงานนี้** เป็นงาน read-only ล้วน (ไม่มี write path)

อ้างอิงคู่กับ `prisma/education-schema.md` (data dictionary/schema),
`sitemap.md` (`/curriculum`, `/curriculum/[track]`), `user-flows.md` (Flow 2)

## 1. ขอบเขตงาน

หน้าที่สร้าง: รายการสายการศึกษา (`/curriculum`) → รายการระดับชั้นของสายนั้น
(`/curriculum/[program]`) → รายวิชาของระดับชั้นนั้นในหลักสูตรปัจจุบัน
(`/curriculum/[program]/[level]`) → รายละเอียดวิชา + ตารางสอบของวิชานั้น
(`/curriculum/[program]/[level]/[subject]`) ทุกหน้าเป็น Public (ไม่ตรวจสิทธิ์)
และไม่มีข้อมูล Restricted/Secret ปนอยู่ (ข้อมูลอ้างอิงหลักสูตร/ตารางสอบเป็นข้อมูล
เผยแพร่ได้ทั้งหมดตาม `data-policy.md`)

**ไม่รวมในงานนี้** (ดู §6 สำหรับรายละเอียด): หน้า `/exam-schedule` แบบภาพรวมทั้ง
ระบบตาม `sitemap.md` (คนละหน้ากับตารางสอบที่ผูกกับวิชาเดียวในงานนี้), หน้า admin
จัดการข้อมูลอ้างอิง (F2.3), การสมัครสอบ (F3.2 — เป็น M4)

## 2. URL / Slug Design (การตัดสินใจสำคัญ)

### 2.1 Slug จาก `code` เดิม ไม่เพิ่มคอลัมน์ใหม่

`programs.code`, `education_levels.code`, `subjects.code` ทุกตัวเป็น
UPPER_SNAKE_CASE ที่มีเฉพาะ A-Z/0-9/`_` (ดู `prisma/education-schema.md`) จึง
แปลงเป็น URL slug แบบ bijective ได้ตรงไปตรงมา: `slugifyCode()` = lowercase +
แทน `_` ด้วย `-` (เช่น `NAK_THAM` → `nak-tham`, `PT1_2` → `pt1-2`) และ
`codeFromSlug()` แปลงกลับ (`src/lib/slug.ts`) — เลือกวิธีนี้แทนการเพิ่มคอลัมน์
`slug` ใหม่ในตาราง (ซึ่งต้องมี migration ใหม่) เพราะ `dev-rules.md`/ข้อจำกัดของ
งานนี้กำชับให้ "แก้เฉพาะไฟล์ที่เกี่ยวข้องกับงานนี้" และ `code` เดิมเพียงพอสำหรับ
ทำ URL อ่านง่ายอยู่แล้วโดยไม่ต้องแตะ schema เลย

`education_levels.code` ไม่ unique ข้าม program (unique เฉพาะคู่กับ programId)
— ดังนั้นการค้นหาระดับชั้นจาก slug **ต้องระบุ programId เสมอ**
(`getLevelBySlug(programId, slug)`) ไม่ค้นหาแบบ global เพื่อไม่ให้ผิดพลาดถ้า
อนาคตมีสองสายการศึกษาที่ใช้ code ระดับชั้นซ้ำกัน

### 2.2 "year" เป็นตัวกรอง (query param) ไม่ใช่ URL segment ที่ 4

แม้รายละเอียดงานจะเขียนเป็น "program → level → subject → **year**" แต่เลือก
implement year เป็น `?year=` query param บนหน้ารายละเอียดวิชา แทนที่จะเป็น
`/curriculum/[program]/[level]/[subject]/[year]` เป็น URL segment แยก
เหตุผล:

1. **คะแนนเต็ม/คะแนนผ่าน/ประเภทข้อสอบเป็นคุณสมบัติของหลักสูตร ไม่ใช่ของปี** — สิ่ง
   ที่เปลี่ยนตามปีจริงๆ มีแค่ "ปีไหนมีรอบสอบวิชานี้บ้าง" เท่านั้น การแยก route ต่อ
   ปีจะทำให้หน้าเดียวกัน (เกณฑ์การสอบ) ต้อง render ซ้ำที่ URL หลายอันต่อวิชาเดียว
2. **ป้องกัน orphan-like page ตาม "วิธีตรวจสอบ" ของงานนี้** — จำนวน
   (ปีการศึกษา × วิชา) ส่วนใหญ่ไม่มีรอบสอบเลย (ดูข้อมูล seed จริงใน §4) ถ้าแยก
   URL segment จะมีหน้าเนื้อหาบางๆจำนวนมากที่มีแต่ EmptyState ล้วนๆ ซึ่งใกล้เคียง
   "orphan page" มากกว่าการใช้ query param แบบเดียวกับ pattern ที่ตั้งไว้แล้วใน
   `/news` (category/q filter)
3. สอดคล้องกับ pattern ที่ใช้แล้วในงาน "สร้างหน้า Home + ข่าว/บทความ" (filter
   ด้วย query param, parse แบบ tolerant ไม่ error เมื่อค่าไม่ถูกต้อง)

ตัวกรองปีจึงอยู่ที่ "ส่วนตารางสอบ" ของหน้ารายละเอียดวิชาเท่านั้น ส่วนตัวกรอง
`?examType=` (ปรนัย/อัตนัย/ผสม) อยู่ที่หน้ารายวิชาของระดับชั้น
(`/curriculum/[program]/[level]`) — ทั้งสองเป็น "filter" ที่ระบุไว้ใน
รายละเอียดงาน ("...พร้อม breadcrumbs และ filter")

### 2.3 Deny-by-default ของโดเมนนี้

ต่างจากข่าว (มี `NewsArticleStatus` DRAFT/PUBLISHED/UNPUBLISHED ชัดเจน) โดเมน
หลักสูตรไม่มี status เผยแพร่/ร่างของ programs/education_levels/subjects แต่มี
`isActive` (soft-disable) และ `deletedAt` (soft delete) ตาม `data-policy.md`
ข้อ 7 — ทุก query ในไฟล์ `src/lib/curriculum.ts` กรอง
`isActive = true AND deletedAt IS NULL` เสมอ และ `getXxxBySlug()` ทุกตัวคืน
`null` เหมือนกันทั้งกรณี "ไม่มีจริง" และ "ปิดใช้งาน/ถูกลบแล้ว" (ไม่แยกข้อความ)
ตาม pattern เดียวกับ `news.getPublishedArticleBySlug()`

`getSubjectInLevelBySlug()` ยัง join กับ `curriculum_level_subjects` เพื่อยืนยัน
ว่าวิชานั้น**อยู่ในระดับชั้น+หลักสูตรที่ระบุใน URL จริง** — วิชาที่มีอยู่จริงใน
ระบบแต่ไม่ได้สอนในระดับชั้นนั้น (เช่น `subj_dhammavibhaga` ที่สอนเฉพาะนักธรรม
ชั้นตรี แต่ไม่ได้อยู่ในหลักสูตรธรรมศึกษาชั้นตรี) จะได้ 404 เหมือน "ไม่มีวิชานี้"
— ป้องกัน URL ที่เดาข้าม scope (ทดสอบจริงแล้ว ดู §4)

### 2.4 "หลักสูตรปัจจุบัน" คำนวณอย่างไร

ใช้ pattern เดียวกับที่บันทึกไว้แล้วใน `prisma/education-schema.md` ("วิธี
query หลักสูตรที่ใช้จริง ณ ปีการศึกษา Y") โดยแทนที่ "ปีที่สนใจ" ด้วยปีการศึกษาที่
`isActive=true` ล่าสุดในระบบ (`getCurrentCurriculumForProgram()`) — ไม่
hard-code ปีปัจจุบันไว้ในโค้ดแต่อย่างใด สอดคล้องกับหลักการออกแบบเดิมของ P2

## 3. Function Specification

### F2.1a — ดูรายการสายการศึกษา (`/curriculum`)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Guest (Public) |
| Input | ไม่มี |
| Process | `listPrograms()` — เฉพาะ isActive=true, deletedAt IS NULL, เรียงตามชื่อ |
| Output | รายการสายการศึกษา (นักธรรม/ธรรมศึกษา/บาลี) พร้อมลิงก์ |
| Permission | Public ทั้งหมด |
| Validation | ไม่มี input จากผู้ใช้ |
| Error State | query ล้มเหลว → error.tsx; ไม่มีสายการศึกษาที่ active เลย → EmptyState |
| Audit | ไม่บันทึก (read-only) |
| Acceptance Criteria | AC1: เห็นเฉพาะ isActive=true; AC2: ทุกรายการมีลิงก์ไปต่อได้ (ไม่ orphan) |

### F2.1b — ดูรายการระดับชั้นของสายการศึกษา (`/curriculum/[program]`)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Guest (Public) |
| Input | URL param `program` (slug) |
| Process | `getProgramBySlug()` → 404 ถ้าไม่พบ → `listLevelsForProgram()` +
`getCurrentCurriculumForProgram()` |
| Output | รายการระดับชั้นเรียงตาม sortOrder + ชื่อ/ปีเริ่มใช้ของหลักสูตรปัจจุบัน |
| Permission | Public |
| Validation | program slug ต้องแปลงกลับเป็น code ที่มีอยู่จริงและ active |
| Error State | slug ไม่ตรงสายใดเลย → 404; มีสายจริงแต่ยังไม่มีระดับชั้น → EmptyState |
| Audit | ไม่บันทึก |
| Acceptance Criteria | AC1: slug ผิดตอบ 404 เสมอ (ทดสอบแล้ว); AC2: breadcrumbs ถูกต้อง; AC3: ไม่มี orphan |

### F2.1c — ดูรายวิชาของระดับชั้น + ตัวกรองประเภทข้อสอบ (`/curriculum/[program]/[level]`)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Guest (Public) |
| Input | URL params `program`/`level` (slug), query `examType` (optional) |
| Process | resolve program → level (404 ถ้าไม่ตรง) → หาหลักสูตรปัจจุบัน →
`parseExamTypeParam()` ตรวจ allowlist → `listSubjectsForLevel()` |
| Output | รายวิชาของระดับชั้นนี้ในหลักสูตรปัจจุบัน (คะแนนเต็ม/ผ่าน/ประเภทข้อสอบ) |
| Permission | Public |
| Validation | program/level slug ต้องมีจริง+active; examType ต้องอยู่ใน allowlist (EXAM_TYPES) ไม่งั้นถือว่าไม่ระบุ |
| Error State | program/level ไม่ตรง → 404; ยังไม่มีหลักสูตร/ยังไม่มีวิชาในระดับนี้/filter ไม่ตรงวิชาใด → EmptyState |
| Audit | ไม่บันทึก |
| Acceptance Criteria | AC1: 404 ถูกต้อง (ทดสอบแล้ว); AC2: filter ทำงานถูกต้อง parameterized+allowlist สองชั้น (ทดสอบแล้ว รวม SQL-injection-safety); AC3: EmptyState ไม่ orphan |

### F2.1d + F2.2 (ขอบเขต) — รายละเอียดวิชา + ตารางสอบ + ตัวกรองปี (`/curriculum/[program]/[level]/[subject]`)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Guest (Public) |
| Input | URL params `program`/`level`/`subject` (slug), query `year` (optional, พ.ศ.) |
| Process | resolve program → level → หลักสูตรปัจจุบัน → `getSubjectInLevelBySlug()`
ยืนยัน scope (404 ถ้าไม่ตรง) → `parseYearParam()` → `listExamScheduleForSubject()` |
| Output | เกณฑ์การสอบของวิชา (คะแนนเต็ม/ผ่าน/ประเภทข้อสอบ) + รายการรอบสอบที่มีวิชานี้ (ปี, วันเวลา, สนามสอบ) |
| Permission | Public |
| Validation | subject ต้องอยู่ในหลักสูตร+ระดับชั้นที่ระบุจริง; year ต้องเป็นจำนวนเต็ม พ.ศ. 2400-2700 ไม่งั้นถือว่าไม่ระบุ |
| Error State | program/level ไม่ตรง หรือวิชาไม่มี/ไม่อยู่ใน scope นี้ → 404 (เหมือนกันทุกกรณี ไม่แยกข้อความ); ไม่มีรอบสอบตรงปีที่กรอง → EmptyState เฉพาะส่วนตารางสอบ |
| Audit | ไม่บันทึก |
| Acceptance Criteria | AC1: 404 ถูกต้องทุกกรณีรวมวิชาข้าม scope (ทดสอบแล้ว); AC2: ตัวกรองปีถูกต้อง (ทดสอบแล้วทั้งปีที่มี/ไม่มีรอบสอบ); AC3: year query ผิดรูปแบบ/นอกช่วงไม่ error (ทดสอบแล้ว) |

## 4. ผลการทดสอบจริง (รันเมื่อ 2026-09-24)

หลังรีเซ็ตฐานข้อมูลและ seed ใหม่ทั้งหมด (`node prisma/dev-migrate-verify.mjs --reset`
→ `npx tsx prisma/seed.ts` ×2 เพื่อยืนยัน idempotent — programs=3, education
levels=8, curricula=2, curriculum_level_subjects=4, academic_years=2,
exam_sessions=1 คงที่ทั้งสองรอบ) แล้วรัน:

| คำสั่ง | ผล |
|---|---|
| `npx next typegen` | ผ่าน (จำเป็นเพราะเพิ่ม dynamic route ใหม่ 3 ระดับ) |
| `npx tsc --noEmit` | ผ่าน ไม่มี type error |
| `npm run lint` | ผ่าน ไม่มี warning/error |
| `node prisma/test-curriculum-pages.mjs` (ใหม่) | **36/36 PASSED** |
| `node prisma/test-layout-responsive.mjs` (ขยาย) | **198/198 PASSED** (เดิม 114 + เพิ่ม 84 จาก 7 หน้าใหม่ × 4 viewport) |
| `node prisma/test-exam-document-domain.mjs` (regression) | 23/23 PASSED |
| `node prisma/test-auth-login.mjs` (regression) | 24/24 PASSED |
| `node prisma/test-auth-session-expiry.mjs` (regression, ต้องรัน dev server ด้วย `AUTH_SESSION_MAX_AGE_SECONDS=3`) | 2/2 PASSED |
| `node prisma/test-authz-guard.mjs` (regression) | 23/23 PASSED |
| `node prisma/test-rbac-scope.mjs` (regression) | 28/28 PASSED |
| `node prisma/test-news-pages.mjs` (regression) | 35/35 PASSED |
| `npm run build` (production build) | ผ่าน — ทุก route ใหม่ปรากฏใน route manifest (`ƒ /curriculum`, `ƒ /curriculum/[program]`, `ƒ /curriculum/[program]/[level]`, `ƒ /curriculum/[program]/[level]/[subject]`) |
| ตรวจ error.tsx จริง (ไม่ใช่แค่ "ควรทำงาน") | เพิ่ม `throwIfForcedTestError()` ชั่วคราวใน `src/lib/curriculum.ts` (gate ด้วย `TEST_FORCE_CURRICULUM_ERROR=1`) รีสตาร์ท dev server พร้อม env var นั้น เปิดด้วย Playwright Chromium จริง ยืนยัน HTTP 500 + เนื้อหา error.tsx จริง ("เกิดข้อผิดพลาด...", "ลองใหม่") ปรากฏ แล้วลบ hook ออกทันที (ยืนยันด้วย `grep` คืนค่าว่างและ `tsc`ผ่าน) |

**รวมสะสมทั้งโปรเจกต์: 369/369 PASSED** (249 เดิม + 36 ใหม่ + 84 layout เพิ่ม)

**ปัญหาที่พบระหว่างทำ (ไม่ใช่บั๊กของ requirement แก้แล้วทั้งหมด)**:
1. `operator does not exist: exam_type = text` — `cls."examType"` เป็น
   PostgreSQL enum column เปรียบเทียบกับ `$3::text` โดยตรงไม่ได้ ต้อง cast คอลัมน์
   เป็น `::text` ก่อนเทียบ (`cls."examType"::text = $3`) แก้แล้วในตอนพัฒนา
   ก่อนเขียน test suite ด้วยซ้ำ (พบจาก manual curl smoke-test)
2. รอบแรกที่รัน regression suite เจอ `test-exam-document-domain.mjs` และ
   `test-auth-session-expiry.mjs` ล้มเหลว — ไม่ใช่บั๊กจากงานนี้ แต่เป็นความผิดพลาด
   ของผู้เขียน (ผม) เอง: (a) ไม่ได้ reset ฐานข้อมูลก่อนรัน regression ทำให้ test
   ที่ mutate state (DRAFT→APPROVED transition) รันซ้ำไม่ได้ (ฐานข้อมูลเดิม
   APPROVED ไปแล้วจากรอบก่อน ซึ่งเป็นพฤติกรรมที่ถูกต้องของ trigger
   immutability ไม่ใช่บั๊ก) — แก้โดย reset+reseed ก่อนรัน; (b) รัน
   session-expiry test กับ dev server ที่ตั้งค่าปกติ (session 8 ชั่วโมง) แทนที่
   จะรันด้วย `AUTH_SESSION_MAX_AGE_SECONDS=3` ตามที่ไฟล์ทดสอบกำหนดไว้ในตัวเอง —
   แก้โดยรีสตาร์ท server ด้วย env var ที่ถูกต้อง ทั้งสองกรณีไม่ต้องแก้โค้ดใดๆ

## 5. Failure Mode และ Recovery

- **Query ล้มเหลว (database ล่ม/connection error) ทุกหน้า** → error bubble ไป
  `error.tsx` ของ root segment (ตัวเดียวกับทุกหน้าในโปรเจกต์) แสดงข้อความทั่วไป
  + digest อ้างอิง log ไม่แสดง error.message ดิบ (ทดสอบจริงแล้วด้วยวิธี forced
  error ใน §4)
- **หลักสูตร/ระดับชั้น/วิชาที่ query param/URL อ้างถึงถูกปิดใช้งาน (isActive=false)
  ระหว่างที่ผู้ใช้เปิดหน้าค้างไว้** → refresh ครั้งถัดไปจะได้ 404 ทันที (deny-by-
  default ตรวจสดทุก request ไม่มี cache ฝั่ง server) ไม่มีความเสี่ยงข้อมูลเก่าค้าง
- **เพิ่มปีการศึกษา/หลักสูตรเวอร์ชันใหม่ระหว่างระบบทำงานอยู่** → หน้า
  `/curriculum/[program]/[level]` จะเปลี่ยนไปแสดงหลักสูตรใหม่โดยอัตโนมัติในการ
  request ครั้งถัดไป (ไม่ hard-code ปี/เวอร์ชันไว้ที่ใดในโค้ดเลย ตาม
  `prisma/education-schema.md` หลักการออกแบบข้อ 1) ไม่ต้อง deploy โค้ดใหม่
- **rollback**: งานนี้ไม่มี write path และไม่มี migration ใหม่ — ไม่มีความเสี่ยง
  ต่อข้อมูลเดิมเลย การ rollback (ถ้าจำเป็น) คือลบไฟล์ที่สร้างในงานนี้เท่านั้น

## 6. ขอบเขตที่ตัดออก (โปร่งใส สำหรับ Owner Review)

1. **หน้า `/exam-schedule` ภาพรวมทั้งระบบตาม `sitemap.md`** — ยังไม่สร้างในงานนี้
   (nav-config.ts ยังชี้ไปหน้านี้และจะเจอ not-found.tsx ต่อไปจนกว่าจะมีงานแยก
   สร้างหน้านี้) งานนี้สร้างเฉพาะตารางสอบที่ผูกกับวิชาเดียว (ที่
   `/curriculum/.../[subject]`) เท่านั้น
2. **exam_session_status ไม่มีสถานะ "ร่าง" แยกจาก PLANNED อย่างชัดเจน** —
   ตีความว่า PLANNED เป็นข้อมูลสาธารณะได้แล้ว (ดู §2.3/comment ใน
   `listExamScheduleForSubject`) กรองออกเฉพาะ CANCELLED เท่านั้น — หากอนาคต
   ต้องการสถานะร่างจริง ต้องเพิ่ม enum value และย้าย filter
3. **ไม่มีหน้า admin จัดการข้อมูลอ้างอิงหลักสูตร/ระดับชั้น/วิชา (F2.3)** — งานนี้
   เป็น read-only ฝั่ง Public เท่านั้น
4. **การนำทาง "หลักสูตรเวอร์ชันก่อนหน้า" ไม่มี UI** — `getCurrentCurriculumForProgram()`
   คืนเฉพาะเวอร์ชันล่าสุดเสมอ แม้ query pattern จะรองรับปีย้อนหลังได้ (ดู
   `education-schema.md`) แต่หน้าเว็บยังไม่มีปุ่ม/ลิงก์ให้ผู้ใช้เลือกดูเวอร์ชันเก่า
   ของหลักสูตรเอง — ข้อมูลจริงปัจจุบันมีหลักสูตรเดียวต่อสายอยู่แล้วจึงยังไม่จำเป็น
5. **ไม่มี pagination ที่หน้ารายการระดับชั้น/รายวิชา** — จำนวนระดับชั้น/วิชาต่อ
   สายการศึกษาในความเป็นจริงมีจำกัด (ไม่กี่รายการต่อสาย ต่างจากข่าวที่เพิ่มไม่
   จำกัด) จึงยังไม่จำเป็นในเฟสนี้

## 7. งานถัดไปที่ควรทำ

1. สร้างหน้า `/exam-schedule` ภาพรวมทั้งระบบ (ทุกสาย/ทุกระดับชั้น พร้อมตัวกรอง)
   ตาม `sitemap.md` — ต่างจากงานนี้ที่ผูกกับวิชาเดียวเท่านั้น
2. สร้างหน้า admin จัดการข้อมูลอ้างอิงหลักสูตร/ระดับชั้น/วิชา/สนามสอบ (F2.3, F6.2)
3. เพิ่ม UI สำหรับดูหลักสูตรเวอร์ชันย้อนหลัง เมื่อมีมากกว่า 1 เวอร์ชันต่อสายจริง
4. เชื่อมหน้ารายละเอียดวิชาเข้ากับคลังข้อสอบ (M3) เมื่อมีหน้า public แสดงตัวอย่าง
   ข้อสอบ/แบบฝึกหัดของวิชานั้น
5. พิจารณาเพิ่มสถานะ "ร่าง" ที่ชัดเจนให้ `exam_session_status` หากต้องแยกรอบสอบ
   ที่ยังไม่พร้อมเผยแพร่ออกจาก PLANNED
