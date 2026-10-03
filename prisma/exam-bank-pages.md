# คลังข้อสอบ + Search (P4 Public Front End)

Phase: P4 Public Front End — งาน "สร้างคลังข้อสอบ + Search"
รายละเอียดที่ระบุ: **filter หลักสูตร ชั้น ปี วิชา ประเภทเอกสาร + pagination +
full-text/search** — ต่อยอดจากคลังเอกสาร (M3, ดู `prisma/exam-document-schema.md`)
ที่ออกแบบไว้แล้วใน P2 **มี schema/migration ใหม่ 1 ตัวในงานนี้**
(`20260924090000_document_curriculum_link`) เพื่อผูก `Document` เข้ากับ
หลักสูตร/ชั้น/วิชา/ปี — รายละเอียดเหตุผลเต็มอยู่ใน §2

อ้างอิงคู่กับ `prisma/exam-document-schema.md` (schema เดิมของคลังเอกสาร),
`prisma/curriculum-pages.md` (ตัวกรอง/utility ที่ reuse), `prisma/schema.prisma`,
`sitemap.md` (ไม่มี path `/exam-bank` ในเอกสารต้นฉบับ P0 — ดู §1 สำหรับ
รายละเอียดการขยาย)

## 1. ขอบเขตงาน

หน้าที่สร้าง: หน้าค้นหา/รายการเอกสารในคลังข้อสอบ (`/exam-bank`) พร้อมฟอร์มกรอง 5
มิติ (หลักสูตร/ชั้น/วิชา/ปีการศึกษา/ประเภทเอกสาร) + ค้นหาชื่อเรื่อง + pagination,
และหน้ารายละเอียดเอกสาร (`/exam-bank/[id]`) ทั้งสองหน้าเป็น Public (ไม่ตรวจสิทธิ์)

**หมายเหตุเรื่อง `sitemap.md`**: เอกสาร sitemap.md ต้นฉบับ (P0, เขียนก่อนงานนี้ถูก
ระบุ) ไม่มี path `/exam-bank` อยู่เลย มีเฉพาะ `/exam-schedule` (ตารางสอบ) และ
`/admin/question-bank` (จัดการคลังข้อสอบฝั่ง admin) — เช่นเดียวกับที่งาน "สร้างหน้า
นักธรรม/ธรรมศึกษา/บาลี" ขยาย `/curriculum` เกินกว่าที่ sitemap.md ระบุไว้เดิม
(`curriculum-pages.md` §2) งานนี้จึงเพิ่ม path ใหม่ `/exam-bank`,
`/exam-bank/[id]` ที่ยังไม่มีในเอกสาร P0 — ไม่ได้แก้ไข `sitemap.md` เอง (เอกสารนั้น
เป็นสถานะ "ร่างสำหรับ Owner Review" ของเฟส P0 อยู่แล้ว) แต่บันทึกการขยายไว้ที่นี่
อย่างโปร่งใสตามธรรมเนียมเดิมของโปรเจกต์ — `nav-config.ts` อัปเดตแล้วให้ชี้ไปหน้าจริง

**สิ่งที่ตัดสินใจว่า "คลังข้อสอบ" สาธารณะหมายถึงอะไร — การตัดสินใจด้านความปลอดภัย
ที่สำคัญที่สุดของงานนี้**: schema เดิมมีทั้ง `ExamSet`/`Question`/`QuestionVersion`/
`AnswerKey` (เนื้อหาข้อสอบจริง+เฉลย) และ `Document`/`DocumentVersion` (ไฟล์แนบ เช่น
ข้อสอบเก่าที่พิมพ์แล้ว/กระดาษคำตอบเปล่า/ระเบียบ/เอกสารประกอบการสอน) พิจารณาแล้วว่า
**"คลังข้อสอบ" สาธารณะในงานนี้ต้องหมายถึง `Document` เท่านั้น** เพราะการเผยแพร่
เนื้อหาข้อสอบจริง (`Question`/`QuestionVersion`) หรือเฉลย (`AnswerKey`) ต่อ
สาธารณะจะเป็นการรั่วไหลข้อสอบ/เฉลยก่อนวันสอบจริง ขัดกับสิทธิ์ที่ออกแบบไว้ใน
`prisma/roles-permissions.md`/`prisma/authz-guards.md` (เฉพาะ Examiner/Central
Officer/ผู้ที่เกี่ยวข้องในการออกข้อสอบเท่านั้นที่ควรเข้าถึงเนื้อหาข้อสอบจริงได้)
งานนี้จึง**ไม่มีฟังก์ชันใดใน `src/lib/exam-bank.ts` ที่ query ตาราง
Question/QuestionVersion/QuestionChoice/AnswerKey/ExamSet/ExamSetItem เลย**

**ไม่รวมในงานนี้** (ดู §6 สำหรับรายละเอียด): หน้า admin จัดการ/อนุมัติเอกสาร
(`/admin/question-bank` ตาม sitemap.md), การเชื่อมต่อ object storage จริง (M8 —
ไฟล์ยังเป็น placeholder เหมือนเดิม), การค้นหา/แสดงเนื้อหาข้อสอบจริง (Question)

## 2. การตัดสินใจสำคัญ

### 2.1 Schema: เพิ่ม `levelId`/`subjectId`/`academicYearId` ที่ `Document` (nullable)

`Document` เดิมไม่มีการผูกกับหลักสูตร/ชั้น/วิชา/ปีเลย (มีแค่ `documentType` +
many-to-many กับ `Category`/`Tag` ทั่วไป) แต่รายละเอียดงานนี้ระบุชัดว่าต้อง filter
ตาม "หลักสูตร ชั้น ปี วิชา" — จึงจำเป็นต้องมี schema เปลี่ยนแปลง (migration
`20260924090000_document_curriculum_link`) เพิ่ม 3 คอลัมน์ **nullable** ที่
`Document`: `levelId` (FK→`education_levels`), `subjectId` (FK→`subjects`),
`academicYearId` (FK→`academic_years`)

การตัดสินใจย่อยที่สำคัญ:

1. **ผูกกับ `levelId`+`subjectId` โดยตรง ไม่ผูก `curriculumLevelSubjectId`
   เฉพาะเจาะจง** — เจตนาเดียวกับที่ `Question` ทำไว้แล้ว (ดู comment บน model
   `Question` ข้อ 4 ใน `prisma/exam-document-schema.md`: "เพื่อให้นำข้อสอบเดิม
   กลับมาใช้ข้ามหลักสูตรเวอร์ชันใหม่ได้") เอกสาร เช่น ข้อสอบเก่าที่พิมพ์แล้ว ผูกกับ
   "ชั้น+วิชา" ในความเป็นจริง ไม่ได้ผูกกับหลักสูตรเวอร์ชันใดเวอร์ชันหนึ่งเจาะจง —
   ถ้าหลักสูตรมีการปรับเวอร์ชันใหม่ในอนาคต เอกสารเก่าที่มีอยู่แล้วไม่ต้องอัปเดต
2. **`academicYearId` ผูกตรงไปยัง `academic_years` ไม่ผ่าน `ExamSession`** —
   ต่างจาก `ExamSet` ที่ผูก `examSessionId` (optional) เพื่อรู้ "รอบสอบ" ที่ใช้จริง
   เอกสารสาธารณะในคลังนี้สนใจแค่ "ปีไหน" เท่านั้น ไม่สนใจรอบสอบ/session ใด
3. **ทั้งสามคอลัมน์เป็น nullable** — เอกสารบางประเภท (`CIRCULAR`/`OTHER` เช่น
   ระเบียบ/ประกาศทั่วไป) ไม่จำเป็นต้องผูกชั้น/วิชา/ปีใดเลย บังคับ NOT NULL จะทำให้
   ต้องหาค่า dummy มาใส่ซึ่งผิดความหมาย
4. **Foreign key เป็น `ON DELETE SET NULL`** — level/subject/academic_year ที่ผูก
   อยู่เป็นข้อมูลจัดหมวดหมู่เสริม ไม่ใช่ identity ของเอกสาร หากถูกลบ (กรณีหายาก
   เพราะระบบใช้ soft-delete เป็นหลัก) เอกสารต้องไม่หายไปด้วย

รายละเอียด migration เต็มอยู่ที่
`prisma/migrations/20260924090000_document_curriculum_link/migration.sql`
(hand-authored ตาม convention เดิมของโปรเจกต์ — ดู `prisma/MIGRATIONS.md`)
ยืนยันจริงแล้วว่า apply ได้สำเร็จทั้งจากฐานข้อมูลที่มีอยู่แล้วและจาก
`--reset` (replay ทั้ง 10 migration จากศูนย์) — ดู §4

### 2.2 URL Design: `/exam-bank/[id]` ใช้ Document.id ตรงๆ ไม่ใช่ slug อ่านง่าย

ต่างจาก `/curriculum/...` ที่ใช้ slug จาก `code` (UPPER_SNAKE_CASE, bijective —
ดู `curriculum-pages.md` §2.1) `Document` ไม่มีคอลัมน์ที่เหมาะเป็น slug เลย:
ไม่มี `code` เฉพาะของตัวเอง และ `title` ก็ไม่ unique (เช่น ข้อสอบวิชาเดียวกันหลาย
ปีการศึกษาอาจตั้งชื่อคล้ายกันมาก ดู §4 ข้อมูล seed จริง) การสร้างคอลัมน์ slug ใหม่
จะต้องแก้ schema เพิ่มอีก ซึ่งเกินขอบเขตที่จำเป็นสำหรับงานนี้ — จึงเลือกใช้
`Document.id` (cuid) ตรงๆ เป็น URL segment แทน คล้ายกับแนวทางที่ระบบใช้กับ entity
ที่ไม่มี slug ธรรมชาติ (เช่น `exam_sets`) — "วิธีตรวจสอบ" ของงานนี้คือ "query
ภาษาไทยและ empty state ผ่าน test cases" ไม่ได้ระบุเรื่อง URL อ่านง่ายเหมือนงาน
ก่อนหน้า จึงไม่ใช่ trade-off ที่ขัดกับข้อกำหนดของงานนี้

### 2.3 ค้นหาด้วย ILIKE ไม่ใช่ PostgreSQL full-text search (tsvector)

พิจารณาใช้ PostgreSQL full-text search (`tsvector`/`to_tsvector`) แล้วตัดสินใจ
**ไม่ใช้** เพราะ PostgreSQL ไม่มี text search configuration/dictionary สำหรับ
ตัดคำภาษาไทยมาให้ในตัว (ต่างจากภาษาอังกฤษที่มี config `'english'` พร้อมใช้อยู่
แล้ว) การใช้ `to_tsvector('simple', ...)` กับข้อความไทยที่มักไม่มีช่องว่างคั่นคำ
ตามธรรมชาติของภาษา จะทำให้ทั้งวลี/ประโยคถูก tokenize เป็น token เดียวก้อนใหญ่
ค้นหาแบบ substring บางส่วนไม่ได้เลย (แย่กว่า ILIKE ธรรมดาเสียอีก) — จึงเลือก
`title ILIKE '%...%'` ต่อจาก pattern ที่ใช้อยู่แล้วใน `src/lib/news.ts`
(parameterized เสมอ ป้องกัน SQL injection — ทดสอบจริงแล้ว ดู §4) หากอนาคตต้องการ
ค้นหาที่ดีกว่านี้จริงๆ ควรพิจารณาระบบตัดคำภาษาไทยแยกต่างหาก (เช่น PyThaiNLP หรือ
extension `pg_trgm` สำหรับ fuzzy matching) — ดู §7

### 2.4 ตัวกรองเป็น query param เสมอ — ไม่ error/ไม่ 404 เมื่อ resolve ไม่ได้

หน้านี้เป็นหน้าค้นหาเดี่ยว (ไม่ใช่ nested browse route แบบ `/curriculum/...`) ทุก
ตัวกรอง (`program`/`level`/`subject`/`year`/`documentType`/`q`/`page`) จึงเป็น
query param ล้วน ตาม pattern เดิมที่ใช้แล้วทั้งใน `news.ts` (category/q) และ
`curriculum.ts` (examType/year): **ค่าที่ resolve ไม่ได้ถือว่า "ไม่ได้ระบุตัวกรอง
นั้น" เสมอ ไม่ error ไม่ 404** เพราะเป็นตัวกรองที่ผู้ใช้พิมพ์/เลือกได้อิสระ ไม่ใช่
URL segment ที่บ่งบอกว่าเนื้อหาต้องมีอยู่จริง (ต่างจาก `/curriculum/[program]`
ที่ program ที่ไม่มีจริงคือ 404 เพราะเป็นส่วนหนึ่งของ URL path)

กรณีพิเศษที่ต้องบันทึกไว้: **`level` ที่ให้มาโดยไม่มี `program` ที่ resolve ได้
จะถูกละเว้นทั้งหมด** เพราะ `education_levels.code` ไม่ unique ข้าม program (unique
เฉพาะคู่กับ `programId` — ดู `prisma/schema.prisma`) จึงไม่มีทาง resolve
`levelId` ที่ถูกต้องได้โดยไม่ทราบ `programId` ก่อน — หน้าเว็บ (`src/app/exam-bank/
page.tsx`) จึง disable ตัว `<select name="level">` ไว้เมื่อยังไม่มี program ที่
resolve ได้ (browser จะไม่ส่งค่าของ input ที่ disabled มาด้วยเลย ป้องกันไม่ให้เกิด
สถานการณ์นี้จาก UI ปกติ แต่ยัง handle ไว้ที่ data-access layer ด้วยเผื่อผู้ใช้พิมพ์
URL เอง — ทดสอบจริงแล้ว ดู §4)

### 2.5 Deny-by-default: ต้องมีเวอร์ชันที่ `status = 'APPROVED'` อย่างน้อยหนึ่งเวอร์ชัน

`DocumentVersion.status` ใช้ `ApprovalStatus` เดียวกับ `QuestionVersion`/
`ExamSet` (DRAFT/PENDING_REVIEW/APPROVED/REJECTED/RETIRED — ล็อกถาวรด้วย DB
trigger ทันทีที่พ้น DRAFT) — เอกสารจะปรากฏต่อ public ก็ต่อเมื่อมีเวอร์ชันที่
`APPROVED` อย่างน้อยหนึ่งเวอร์ชันเท่านั้น (เวอร์ชัน "ปัจจุบัน" ที่แสดง = APPROVED
ล่าสุดตาม `versionNo`) เอกสารที่ทุกเวอร์ชันเป็น DRAFT/PENDING_REVIEW/REJECTED/
RETIRED (ไม่มี APPROVED เลยแม้แต่เวอร์ชันเดียว) ถือว่า "ไม่มีอยู่จริง" ต่อ public
เช่นเดียวกับ pattern deny-by-default ที่ใช้ทั้งระบบ

ใช้ **`INNER JOIN LATERAL`** (ไม่ใช่ `LEFT JOIN LATERAL` + `WHERE IS NOT NULL`)
เป็นกลไกหลัก — เลือก resolve เวอร์ชัน APPROVED ล่าสุดต่อเอกสาร แล้วให้ join เอง
เป็นตัว exclude เอกสารที่ไม่มีเวอร์ชัน APPROVED เลยออกไปโดยอัตโนมัติ (ไม่มีทางลืม
เงื่อนไขนี้ในบาง query เพราะเป็นส่วนหนึ่งของ FROM clause ที่ query ทุกตัวใน
`src/lib/exam-bank.ts` ใช้ร่วมกัน) — ทดสอบจริงแล้วว่าเอกสารที่มีแต่เวอร์ชัน DRAFT/
RETIRED ไม่ปรากฏทั้งในหน้ารายการและหน้ารายละเอียด แม้จะค้นด้วยคำที่ตรงกับชื่อเรื่อง
เป๊ะก็ตาม (ดู §4) — สำคัญเป็นพิเศษสำหรับเอกสารประเภท `EXAM_PAPER_PRINT` ที่อาจเป็น
ข้อสอบที่ยังไม่ถึงกำหนดเผยแพร่จริง

### 2.6 ทำไม enum ต้อง cast `::text` ก่อนเทียบ (บั๊กที่เจอมาแล้วในงานก่อนหน้า)

`documentType` เป็น PostgreSQL enum (`document_type`) — เทียบกับ bind parameter
`$N` ที่ PostgreSQL infer type เป็น `text` โดยตรงจะพัง
(`operator does not exist: document_type = text`) ต้อง cast คอลัมน์ enum เป็น
`::text` ก่อนเทียบเสมอ (`d."documentType"::text = $N`) — เจอบั๊กนี้มาแล้วครั้งหนึ่ง
กับ `examType` ในงาน "สร้างหน้า นักธรรม/ธรรมศึกษา/บาลี" (ดู
`prisma/curriculum-pages.md` §4) จึงใส่ cast นี้ไว้ตั้งแต่แรกในงานนี้โดยไม่ต้อง
เจอบั๊กซ้ำ (ยืนยันด้วย manual smoke-test ก่อนเขียน automated suite — ดู §4)

## 3. Function Specification

### F4.1 — ค้นหา/รายการเอกสารในคลังข้อสอบ (`/exam-bank`)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Guest (Public — ทุกบทบาทที่ login แล้วก็เข้าถึงได้เหมือนกัน ไม่ตรวจสิทธิ์) |
| Input | searchParams: `program`/`level`/`subject` (slug, optional), `year` (พ.ศ., optional), `documentType` (allowlist, optional), `q` (คำค้นหา, optional), `page` (optional) |
| Process | resolve program → resolve level (เฉพาะเมื่อ resolve program ได้แล้ว) → resolve subject (global) → `parseYearParam()` → `parseDocumentTypeParam()` (allowlist) → `parsePageParam()` → `listExamBankDocuments()` (INNER JOIN LATERAL หาเวอร์ชัน APPROVED ล่าสุด + WHERE ทุกตัวกรองแบบ AND + pagination) |
| Output | รายการเอกสาร (ชื่อเรื่อง, ประเภท, ชั้น/วิชา/ปีที่ผูกถ้ามี, วันที่อนุมัติ) พร้อมตัวกรองและ pagination |
| Permission | Public — เฉพาะเอกสารที่มีเวอร์ชันอนุมัติแล้วเท่านั้น (ไม่มีเนื้อหาข้อสอบจริง/เฉลยปนอยู่ — ดู §1) |
| Validation | program/subject slug ที่ resolve ไม่ได้ถือว่าไม่ได้ระบุตัวกรอง (ไม่ error/ไม่ 404); level ที่ไม่มี program ที่ resolve ได้ถูกละเว้น (ดู §2.4); year/documentType ที่ parse ไม่ได้/ไม่อยู่ใน allowlist ถือว่าไม่ได้ระบุ |
| Error State | query ล้มเหลว → error bubble ไปที่ error.tsx (ทดสอบจริงแล้ว); ไม่มีผลลัพธ์ตรงเงื่อนไข (รวม q ที่ไม่ตรงเอกสารใด) → EmptyState ไม่ error |
| Audit | ไม่บันทึก (read-only, ไม่ใช่ข้อมูลสำคัญ) |
| Acceptance Criteria | AC1: query คำค้นภาษาไทยทำงานถูกต้อง parameterized เสมอ (ทดสอบแล้ว รวม SQL-injection-safety); AC2: ทุก combination ของตัวกรองทำงานถูกต้องร่วมกัน (AND — ทดสอบแล้ว); AC3: เอกสาร DRAFT/PENDING_REVIEW/REJECTED/RETIRED ไม่ปรากฏไม่ว่าจะกรองด้วยเงื่อนไขใด (ทดสอบแล้วทุกสถานะที่ไม่ใช่ APPROVED); AC4: ไม่มีผลลัพธ์ตรงเงื่อนไข → EmptyState (ทดสอบแล้ว) |

### F4.2 — ดูรายละเอียดเอกสาร (`/exam-bank/[id]`)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Guest (Public — ไม่ตรวจสิทธิ์) |
| Input | URL param `id` (Document.id — cuid, ดูเหตุผลที่ไม่ใช้ slug ใน §2.2) |
| Process | `getDocumentById(id)` — ค้นหาเฉพาะเอกสารที่มีเวอร์ชัน APPROVED อย่างน้อยหนึ่งเวอร์ชันเท่านั้น (deny-by-default) |
| Output | รายละเอียดเอกสาร (ชื่อเรื่อง, ประเภท, หลักสูตร/ชั้น/วิชา/ปีที่ผูกถ้ามี, เลขเวอร์ชันที่อนุมัติแล้ว, วันที่อนุมัติ, ชื่อไฟล์/ประเภทไฟล์) พร้อม SEO metadata |
| Permission | Public — เฉพาะเอกสารที่มีเวอร์ชันอนุมัติแล้วเท่านั้น |
| Validation | id ต้องมีอยู่จริงและมีเวอร์ชัน APPROVED อย่างน้อยหนึ่งเวอร์ชัน |
| Error State | ไม่พบ/ไม่มีเวอร์ชันอนุมัติ (ไม่ว่าเหตุผลใด) → notFound() เสมอ ไม่แยกข้อความ (ป้องกันไม่ให้ทราบว่ามีเอกสารที่ยังไม่อนุมัติ/ถูกถอดแล้วอยู่จริงตาม id นี้); query ล้มเหลว → error.tsx |
| Audit | ไม่บันทึก (read-only) |
| Acceptance Criteria | AC1: เข้าถึงเอกสาร DRAFT/PENDING_REVIEW/REJECTED/RETIRED ผ่าน URL ตรงไม่ได้แม้รู้ id ที่ถูกต้องเป๊ะ (ทดสอบจริงแล้วทั้ง DRAFT และ RETIRED); AC2: หน้ามี `<title>`/meta description ตรงกับเอกสารจริง; AC3: ปุ่มดาวน์โหลดแสดงเป็น disabled พร้อมข้อความอธิบายชัดเจนว่ายังไม่เชื่อมต่อ object storage จริง ไม่ทำให้ผู้ใช้เข้าใจผิด (M8 — นอกขอบเขตงานนี้) |

## 4. ผลการทดสอบจริง (รันเมื่อ 2026-09-24)

หลัง apply migration ใหม่ (`20260924090000_document_curriculum_link`) แล้ว
reset ฐานข้อมูลและ seed ใหม่ทั้งหมด (`node prisma/dev-migrate-verify.mjs --reset`
replay ทั้ง 10 migrations จากศูนย์ → `npx tsx prisma/seed.ts` ×2 เพื่อยืนยัน
idempotent — documents=7, documentVersions=7 คงที่ทั้งสองรอบ) แล้วรัน:

| # | คำสั่ง/การทดสอบที่รันจริง | ผล |
|---|---|---|
| 1 | `npx next typegen` (เพิ่ม dynamic route ใหม่ `/exam-bank/[id]`) | สร้าง route types สำเร็จ |
| 2 | `node prisma/dev-migrate-verify.mjs` (ก่อน reset — apply migration ใหม่กับฐานข้อมูลเดิม) | PASSED |
| 3 | `node prisma/dev-migrate-verify.mjs --reset` (replay ทั้ง 10 migrations จากศูนย์ รวม migration ใหม่) | PASSED |
| 4 | `npx tsx prisma/seed.ts` ×2 ติดต่อกัน | idempotent — documents=7, documentVersions=7 คงที่ทั้งสองรอบ (ยืนยันด้วย SQL ตรงว่า levelId/subjectId/academicYearId ของทั้ง 7 แถวตรงตาม matrix ที่ตั้งใจ) |
| 5 | manual smoke test ด้วย `curl`/`psql` ครอบคลุมทุกเส้นทาง+ตัวกรองก่อนเขียน automated suite | ยืนยัน deny-by-default, enum-cast, combined filter ทำงานถูกต้องตั้งแต่รอบแรก (ไม่พบบั๊กใหม่ในรอบนี้ — บั๊ก enum-cast ที่เคยเจอในงานก่อนหน้าถูกป้องกันไว้ล่วงหน้าแล้วตาม §2.6) |
| 6 | `node prisma/test-exam-document-domain.mjs` (regression, รันทันทีหลัง reset) | 23/23 PASSED |
| 7 | `node prisma/test-auth-login.mjs` (regression) | 24/24 PASSED |
| 8 | `node prisma/test-rbac-scope.mjs` (regression) | 28/28 PASSED |
| 9 | `node prisma/test-authz-guard.mjs` (regression) | 23/23 PASSED |
| 10 | `node prisma/test-auth-session-expiry.mjs` กับ `AUTH_SESSION_MAX_AGE_SECONDS=3` (regression) | 2/2 PASSED |
| 11 | `node prisma/test-news-pages.mjs` (regression) | 35/35 PASSED |
| 12 | `node prisma/test-curriculum-pages.mjs` (regression) | 36/36 PASSED |
| 13 | `node prisma/test-exam-bank-pages.mjs` (ใหม่ — HTTP end-to-end จริงผ่าน `next dev`: deny-by-default APPROVED-only ต่อ DRAFT/PENDING_REVIEW/REJECTED/RETIRED, filter หลักสูตร/ชั้น/วิชา/ปี/ประเภทเอกสารทั้งเดี่ยวและรวมกัน, ค้นหาภาษาไทยรวม SQL-injection-safety, pagination แบบ tolerant, EmptyState, 404 ของหน้ารายละเอียด) | **44/44 PASSED** |
| 14 | `node prisma/test-layout-responsive.mjs` (ขยาย — เพิ่ม 5 หน้า `/exam-bank...` ใหม่) | **258/258 PASSED** (เดิม 198 + เพิ่ม 60 จาก 5 หน้าใหม่ × 4 viewport × 3 assertion) |
| 15 | ทดสอบ error state จริง: เพิ่ม `throwIfForcedTestError()` ชั่วคราวใน `src/lib/exam-bank.ts` (gate ด้วย `TEST_FORCE_EXAM_BANK_ERROR=1`) รีสตาร์ท dev server พร้อม env var นั้น เปิดด้วย Playwright Chromium จริง ยืนยัน HTTP 500 + เนื้อหา error.tsx จริง ("เกิดข้อผิดพลาด...", "ลองใหม่") ปรากฏ แล้วลบ hook ออกทันที (ยืนยันด้วย `grep` คืนค่าว่างและ `tsc --noEmit` ผ่าน) | ยืนยันสำเร็จ |
| 16 | `npx tsc --noEmit` | ผ่าน ไม่มี type error |
| 17 | `npm run lint` | ผ่าน ไม่มี warning/error |
| 18 | `npx next build` (production build) | ผ่าน — route manifest แสดง `ƒ /exam-bank`, `ƒ /exam-bank/[id]` ใหม่ |

**สรุปผล P4 คลังข้อสอบ + Search: 18/18 รายการในตารางข้างต้นผ่าน (PASSED)** —
รายการที่ 13 และ 14 ครอบคลุม 44 + 60 (ส่วนเพิ่มจาก 198 เดิม) = 104 assertion จริง
ที่เป็นของใหม่จากงานนี้ นอกเหนือจาก 369 assertion เดิมที่ยังผ่านไม่มีเปลี่ยนแปลง
(รวมสะสมทั้งโปรเจกต์: 369 (เดิม) + 44 + 60 = **473/473 PASSED**)
ฐานข้อมูลสุดท้ายถูกปล่อยไว้ในสถานะ migrate + seed ครบ (เหมือนงานก่อนหน้า)

**ปัญหาที่พบระหว่างทำ**: ไม่พบบั๊กใหม่จากงานนี้เอง ระหว่าง manual smoke test พบ
document row เก่าชื่อ `doc_answer_sheet_template` ที่ไม่ได้มาจาก `seed.ts` ปนอยู่
ในฐานข้อมูล — ตรวจสอบแล้วเป็น fixture ที่ `test-exam-document-domain.mjs` insert
ตรงเพื่อทดสอบ trigger-lock (ดูบรรทัดที่ insert ในไฟล์นั้น) ที่ยังไม่ถูกล้างจาก
รอบทดสอบก่อนหน้าในเซสชันเดียวกัน — ไม่ใช่บั๊ก เป็นพฤติกรรมที่รู้อยู่แล้วว่าไฟล์นั้น
ไม่ idempotent ข้าม run โดยไม่ reset (ดู `prisma/curriculum-pages.md` §4 ข้อ 2)
จึงออกแบบ `test-exam-bank-pages.mjs` ให้ assert ด้วยการตรวจ "มี/ไม่มีข้อความของ
เอกสารที่รู้จัก" เสมอ ไม่ตรวจจำนวนผลลัพธ์ทั้งหมดแบบเป๊ะ เพื่อไม่ให้ผลทดสอบขึ้นกับ
ลำดับการรัน test suite อื่นก่อนหน้า (ดู comment หัวไฟล์ทดสอบ) — regression run
เต็มรูปแบบ (รายการที่ 3 เป็นต้นไปในตารางข้างต้น) ยืนยันแล้วว่าหลัง reset+reseed
สะอาด ไม่มีแถวปนเปื้อนนี้อยู่ และผลทดสอบยังคง 44/44 PASSED เหมือนเดิม

## 5. Failure Mode และ Recovery

- **Query ล้มเหลว (database ล่ม/connection error) ทุกหน้า** → error bubble ไป
  `error.tsx` ของ root segment เดียวกับทุกหน้าในโปรเจกต์ แสดงข้อความทั่วไป + digest
  อ้างอิง log ไม่แสดง error.message ดิบ (ทดสอบจริงแล้วด้วยวิธี forced error — ดู §4
  รายการที่ 15)
- **เอกสารที่กำลังแสดงอยู่ถูกเปลี่ยนสถานะ (APPROVED → RETIRED) ระหว่างที่ผู้ใช้เปิด
  หน้าค้างไว้** → refresh ครั้งถัดไปจะได้ 404 ทันที (deny-by-default ตรวจสดทุก
  request ไม่มี cache ฝั่ง server) ไม่มีความเสี่ยงข้อมูลเก่า/ที่ถูกถอดแล้วค้างอยู่
- **เพิ่มเอกสารใหม่หรืออนุมัติเวอร์ชันใหม่ระหว่างระบบทำงานอยู่** → ปรากฏใน
  `/exam-bank` โดยอัตโนมัติในการ request ครั้งถัดไป ไม่ต้อง deploy โค้ดใหม่ (ไม่มี
  cache ฝั่ง server ทั้งหมด)
- **Migration ใหม่ (`20260924090000_document_curriculum_link`) ล้มเหลวระหว่าง
  apply กับฐานข้อมูล production ในอนาคต** → เป็น `ADD COLUMN` (nullable) +
  `CREATE INDEX` + `ADD CONSTRAINT ... ON DELETE SET NULL` ล้วน ไม่มีการแก้ไข/ลบ
  ข้อมูลเดิมใดๆ — rollback ทำได้ปลอดภัยด้วยการ `DROP CONSTRAINT`/`DROP COLUMN`
  ย้อนกลับ (เอกสารเดิมทั้งหมดไม่ถูกกระทบ เพราะคอลัมน์ใหม่เป็น nullable ล้วน)
- **rollback ของงานนี้โดยรวม**: นอกจาก migration ข้างต้น งานนี้ไม่มี write path
  อื่นเลย (read-only ทั้งหมด) การ rollback ส่วน UI ทำได้ด้วยการลบไฟล์
  `src/lib/exam-bank.ts`, `src/app/exam-bank/**` และ entry ใน `nav-config.ts`
  เท่านั้น โดยไม่กระทบข้อมูลเดิม

## 6. ขอบเขตที่ตัดออก (โปร่งใส สำหรับ Owner Review)

1. **`/exam-bank/[id]` ใช้ id (cuid) แทน slug อ่านง่าย** — ดูเหตุผลเต็มใน §2.2
   (Document ไม่มีคอลัมน์ที่เหมาะเป็น slug และ title ไม่ unique)
2. **ค้นหาด้วย ILIKE ไม่ใช่ PostgreSQL full-text search จริง** — ดู §2.3 สำหรับ
   เหตุผลเรื่องข้อจำกัดการตัดคำภาษาไทยของ PostgreSQL
3. **ไม่มีการเชื่อมต่อ object storage จริง** — `fileKey` ยังเป็น `null`/placeholder
   เหมือนเดิมตาม comment บน `DocumentVersion` ใน `schema.prisma` (M8) ปุ่ม
   ดาวน์โหลดในหน้ารายละเอียดจึงแสดงเป็น disabled พร้อมข้อความอธิบาย ไม่ใช่ปุ่มที่
   ใช้งานได้จริงแต่ไม่มีไฟล์ให้โหลด (ป้องกันผู้ใช้เข้าใจผิด)
4. **ไม่มีการค้นหา/แสดงเนื้อหาข้อสอบจริง (Question/QuestionVersion/AnswerKey)** —
   เป็นการตัดสินใจด้านความปลอดภัยโดยเจตนา ดู §1
5. **ไม่มีหน้า admin อนุมัติ/จัดการเอกสาร** — งานนี้เป็น read-only ฝั่ง Public
   เท่านั้น (`/admin/question-bank` ตาม sitemap.md ยังไม่สร้าง)
6. **`subject`/`documentType`/`year` เป็นตัวกรองอิสระจากกัน ไม่ตรวจว่า "วิชานี้มี
   สอนในชั้น/หลักสูตรที่เลือกจริงหรือไม่"** (ต่างจาก `curriculum.ts`'s
   `getSubjectInLevelBySlug()` ที่ join กับ `curriculum_level_subjects` เพื่อยืนยัน
   scope) — เพราะ `Document` ผูก `levelId`/`subjectId` อิสระต่อกัน (ตาม §2.1 ข้อ 1)
   ไม่ได้ผ่าน `CurriculumLevelSubject` เหมือน `Question` การเลือก filter ที่ไม่มี
   เอกสารใดตรงพร้อมกันเลยจะได้ EmptyState ตามปกติ ไม่ error แต่ก็ไม่มีการเตือนว่า
   "ชั้น X ไม่มีวิชา Y" แบบที่หน้าหลักสูตรทำ
7. **pagination ยังไม่ผ่านการทดสอบข้ามหน้าจริง** — ข้อมูลจำลองปัจจุบันมีเอกสารที่
   APPROVED เพียง 4 รายการ (น้อยกว่า `EXAM_BANK_PAGE_SIZE = 9`) จึงมีแค่ 1 หน้า
   เสมอในข้อมูลทดสอบชุดนี้ — ทดสอบเฉพาะพฤติกรรม tolerant parsing ของ `page`
   (0/ติดลบ/ไม่ใช่ตัวเลข/เกินหน้าสุดท้ายมาก) เท่านั้น ไม่ได้ทดสอบว่าเนื้อหาของหน้า
   2 ต่างจากหน้า 1 จริงหรือไม่ (ซึ่ง logic การคำนวณ `OFFSET`/`LIMIT` เหมือนกับที่
   `news.ts`/`listPublishedArticles()` ใช้และทดสอบผ่านแล้วในงานก่อนหน้าด้วยข้อมูล
   ข่าว 10 รายการ — ความเสี่ยงจึงต่ำ แต่ยังบันทึกไว้อย่างโปร่งใส)

## 7. งานถัดไปที่ควรทำ

1. เชื่อมต่อ object storage จริง (M8) แล้วเปิดใช้งานปุ่มดาวน์โหลดจริงในหน้า
   รายละเอียดเอกสาร
2. สร้างหน้า admin จัดการ/อนุมัติเอกสาร (`/admin/question-bank` ตาม sitemap.md)
   — ปัจจุบันเอกสารทั้งหมดถูกสร้างผ่าน seed เท่านั้น ไม่มี write path ทาง UI เลย
3. พิจารณาใช้ extension `pg_trgm` (fuzzy/similarity search) หรือระบบตัดคำ
   ภาษาไทยแยกต่างหาก แทน ILIKE ธรรมดา เมื่อจำนวนเอกสารในคลังเพิ่มขึ้นมากพอที่ความ
   แม่นยำของการค้นหาเริ่มเป็นปัญหาจริง
4. เพิ่มข้อมูลจำลองให้มีเอกสาร APPROVED เกิน `EXAM_BANK_PAGE_SIZE` (9 รายการ) เพื่อ
   ทดสอบ pagination ข้ามหน้าจริงได้ครบถ้วน (ดู §6 ข้อ 7)
5. พิจารณาเพิ่มการตรวจ "วิชานี้มีสอนในชั้น/หลักสูตรที่เลือกจริงหรือไม่" หากในอนาคต
   ต้องการความเข้มงวดของ scope เท่ากับหน้าหลักสูตร (ดู §6 ข้อ 6)
6. เชื่อมหน้ารายละเอียดวิชา (`/curriculum/.../[subject]`) เข้ากับคลังข้อสอบ —
   แสดงลิงก์ "ดูข้อสอบเก่าของวิชานี้" ที่ชี้ไปยัง `/exam-bank?subject=...`
