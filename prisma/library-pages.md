# ห้องสมุด PDF/Download (P4 Public Front End)

Phase: P4 Public Front End — งาน "สร้างห้องสมุด PDF/Download"
รายละเอียดที่ระบุ: **metadata, preview, version, download, public/private
access** — ต่อยอดจากคลังเอกสาร (M3, ดู `prisma/exam-document-schema.md`) และ
หน้าคลังข้อสอบ (`prisma/exam-bank-pages.md`) ที่ทำไว้แล้วก่อนหน้า **มี
schema/migration ใหม่ 1 ตัวในงานนี้** (`20260924110000_document_visibility`)
เพื่อเพิ่มคอลัมน์ `isPublic` ให้ `Document` — รายละเอียดเหตุผลเต็มอยู่ใน §2.1

อ้างอิงคู่กับ `prisma/exam-document-schema.md` (schema เดิมของคลังเอกสาร),
`prisma/exam-bank-pages.md` (หน้าคู่ขนานที่ query ตารางเดียวกัน — ดู §1 สำหรับ
ความสัมพันธ์), `prisma/roles-permissions.md`/`src/lib/permissions.ts`
(FILES module ที่พิจารณาแล้วไม่ใช้ตรงๆ — ดู §2.2), `prisma/schema.prisma`,
`sitemap.md` (ไม่มี path `/library` ในเอกสารต้นฉบับ P0 — ดู §1)

## 1. ขอบเขตงาน

หน้าที่สร้าง: หน้าค้นหา/รายการเอกสารในห้องสมุด (`/library`) พร้อมฟอร์มกรอง 3
มิติ (หมวดหมู่/แท็ก/ประเภทเอกสาร) + ค้นหาชื่อเรื่อง + pagination, หน้ารายละเอียด
เอกสาร (`/library/[id]`) พร้อม metadata/preview-placeholder/ประวัติเวอร์ชันที่
อนุมัติแล้วทั้งหมด, และ `GET /api/library/[id]/download` (Route Handler จริง)
สำหรับดาวน์โหลดไฟล์ตามเวอร์ชันที่ระบุหรือเวอร์ชันล่าสุดที่อนุมัติแล้ว ทั้งสาม
จุดตรวจสอบ **public/private access** ตาม `isPublic` ของเอกสารร่วมกัน

**หมายเหตุเรื่อง `sitemap.md`**: เอกสาร sitemap.md ต้นฉบับ (P0) ไม่มี path
`/library` อยู่เลย (ตรวจสอบแล้วไม่มีการอ้างถึงห้องสมุด/PDF section ใดๆ) —
เช่นเดียวกับที่ `/exam-bank` ถูกเพิ่มนอกเหนือ sitemap.md เดิมมาก่อนแล้ว
(`exam-bank-pages.md` §1) งานนี้จึงเพิ่ม path ใหม่ `/library`, `/library/[id]`,
`/api/library/[id]/download` ที่ยังไม่มีในเอกสาร P0 — ไม่ได้แก้ไข `sitemap.md`
เอง (เอกสารนั้นเป็นสถานะ "ร่างสำหรับ Owner Review" ของเฟส P0 อยู่แล้ว) แต่
บันทึกการขยายไว้ที่นี่อย่างโปร่งใสตามธรรมเนียมเดิมของโปรเจกต์ — `nav-config.ts`
อัปเดตแล้วให้ชี้ไปหน้าจริง (เพิ่ม "ห้องสมุด" ต่อจาก "คลังข้อสอบ")

**ความสัมพันธ์กับ `/exam-bank`**: ทั้งสองหน้า query ตาราง
`documents`/`document_versions` เดียวกัน ไม่ได้แยกตารางกันคนละชุด —
"คลังข้อสอบ" กรองตามบริบทหลักสูตร/ชั้น/ปี/วิชา ส่วน "ห้องสมุด" กรองตาม
หมวดหมู่/แท็ก (`Category`/`Tag` — มีอยู่ในสคีมาตั้งแต่ P2 แต่ไม่เคยถูกใช้จริง
โดยหน้าใดมาก่อนงานนี้) เอกสารที่เข้าเงื่อนไขทั้งสองมุมมองพร้อมกัน (เช่น
`libraryGuideMultiVersion` ที่เป็น `STUDY_MATERIAL` และมี APPROVED version
ด้วย) จะปรากฏได้ในทั้งสองหน้า — **เป็นการออกแบบที่ตั้งใจ ไม่ใช่บั๊ก** (เอกสาร
สาธารณะชุดเดียวกัน มีสองมุมมอง/ตัวกรองที่ต่างกันสำหรับผู้ใช้ต่างบริบท เหมือนกับ
ที่ร้านเดียวกันอาจถูก list ทั้งในหมวด "ร้านอาหาร" และ "เปิด 24 ชม.")

**ไม่รวมในงานนี้** (ดู §6 สำหรับรายละเอียด): หน้า admin จัดการเอกสาร, การเชื่อม
ต่อ object storage จริง (M8 — ไฟล์ยังเป็น placeholder เหมือนเดิม), การแสดง
preview ไฟล์จริง (PDF viewer), FILES-module RBAC scope เต็มรูปแบบ (ดู §2.2)

## 2. การตัดสินใจสำคัญ

### 2.1 Schema: เพิ่ม `isPublic` (Boolean, NOT NULL, default false) ที่ `Document`

`Document` เดิมไม่มีคอลัมน์ใดบ่งบอกว่า "สาธารณะ" หรือ "ภายใน" เลย — งานนี้ระบุ
ชัดว่าต้องมี "public/private access" จึงจำเป็นต้องมี schema เปลี่ยนแปลง
(migration `20260924110000_document_visibility`) เพิ่ม 1 คอลัมน์:
`isPublic Boolean @default(false)` + index `documents_isPublic_idx`

การตัดสินใจย่อยที่สำคัญ:

1. **default = `false` (deny-by-default)** — ตาม data-policy.md/dev-rules.md
   ข้อ 4 ("Authorization ต้องตรวจฝั่ง server และใช้ deny-by-default") เอกสาร
   ใหม่ที่ไม่ได้ระบุชัดเจนถือเป็น private/internal ก่อนเสมอ ป้องกันไม่ให้
   เอกสารใหม่ที่ลืมตั้งค่ากลายเป็นสาธารณะโดยไม่ตั้งใจ
2. **ผลกับข้อมูลเดิม (7 เอกสารจาก `seedDocuments()` ก่อนงานนี้)**: default
   `false` ทำให้ script/seed เดิมที่ insert ไปแล้วก่อนหน้านี้ยังคง valid โดยไม่
   ต้องแก้ย้อนหลังในระดับ database แต่ **`prisma/seed.ts` เองถูกอัปเดตให้ตั้ง
   `isPublic: true` อย่างชัดเจนสำหรับทั้ง 7 แถวเดิม** (ไม่พึ่ง default โดย
   ปริยาย) เพื่อรักษาพฤติกรรมเดิมของ `/exam-bank` ที่เคยแสดงเอกสารทั้งหมดนี้ต่อ
   Guest มาก่อน — ยืนยันด้วย regression `test-exam-bank-pages.mjs` 44/44
   PASSED ไม่เปลี่ยนแปลงหลัง fix (ดู §2.7 และ §4)
3. **ไม่มี "ระดับที่สาม" ระหว่าง public/private** — data-policy.md ข้อ 2 มี 4
   ระดับ (Public/Internal/Restricted/Secret) แต่งานนี้ระบุแค่ "public/private"
   สองระดับตรงตามคำในบรีฟ จึงแมป `isPublic=true` → Public, `isPublic=false` →
   Internal เท่านั้น (Restricted/Secret ไม่เกี่ยวกับเอกสารในห้องสมุดนี้ — ไม่มี
   PII ในตัวเอกสารเหล่านี้)

รายละเอียด migration เต็มอยู่ที่
`prisma/migrations/20260924110000_document_visibility/migration.sql`
(hand-authored ตาม convention เดิมของโปรเจกต์ — ดู `prisma/MIGRATIONS.md`)
ยืนยันจริงแล้วว่า apply ได้สำเร็จทั้งจากฐานข้อมูลที่มีอยู่แล้วและจาก
`--reset` (replay ทั้ง 11 migration จากศูนย์) — ดู §4

### 2.2 "private" = ต้อง login เท่านั้น — ไม่ใช้ FILES-module scope (`src/lib/permissions.ts`)

ตรวจสอบแล้วว่า `src/lib/permissions.ts` มีโมดูล **FILES (M8)** อยู่แล้วพร้อม
scope ต่อ role ครบ (SUPER_ADMIN/CENTRAL_OFFICER: `ALL`; REGIONAL_ADMIN:
`OWN_ORG_SUBTREE`; REGISTRAR_STAFF: `OWN_ORG_SUBTREE` อ่าน/เขียนบางส่วน;
TEACHER/EXAMINER: `ALL` อ่านอย่างเดียว; STUDENT: `OWN_RECORD`; AUDITOR: `ALL`
อ่านอย่างเดียว) แต่ **`GUEST_PERMISSIONS` ไม่มี entry สำหรับ FILES เลย** —
พิจารณาแล้วตัดสินใจ **ไม่ใช้ `can()`/`guardRoute()`/โมดูล FILES นี้** สำหรับ
งานนี้ ด้วยเหตุผล:

1. Scope อย่าง `OWN_ORG_SUBTREE`/`OWN_RECORD` ต้องการบริบท (organizationId
   เจ้าของ, ownerUserId/ownerPersonId) ที่ resolve จากแถวข้อมูลจริง — แต่
   `Document` **ไม่มีคอลัมน์ ownership/org-linkage ใดๆ เลย** (ไม่มี
   `authorActorId`/`organizationId` ที่ระดับ Document เอง — มีแค่ที่ระดับ
   `DocumentVersion.authorActorId` ซึ่งเป็นผู้เขียนเนื้อหา ไม่ใช่เจ้าของ
   ในเชิง visibility)
2. หากบังคับใช้ scope เหล่านี้ตรงๆ (เช่นตีความ "private" = ต้องมี
   `OWN_ORG_SUBTREE` ที่ครอบคลุมองค์กรใดองค์กรหนึ่ง) จะ **deny ผิดกลุ่มที่ควร
   เห็นได้ตามเจตนาโจทย์** เช่น STUDENT (scope `OWN_RECORD` เท่านั้น) หรือ
   REGISTRAR_STAFF ที่ scope ครอบคลุมแค่บางองค์กรย่อย ทั้งที่คำว่า
   "public/private access" ในบรีฟนี้สื่อถึงการแบ่งแค่สองระดับอย่างง่าย
   (สาธารณะ vs ต้อง login) ไม่ใช่ RBAC ที่ซับซ้อนตาม organization/ownership
3. จึงเลือกกฎที่ง่ายและตรงกับคำที่โจทย์ระบุที่สุด: **"private" =
   `getCurrentUser() !== null`** (มี session ที่ ACTIVE, ไม่ถูกลบ — ไม่สนใจ
   role/scope เพิ่มเติมเลย) — เอกสาร `isPublic=false` มองเห็นได้โดยผู้ใช้ที่
   login แล้ว **ทุกบทบาท** เหมือนกันหมด นี่คือ **scope simplification ที่
   บันทึกไว้อย่างโปร่งใส** ตาม pattern เดียวกับการตัดสินใจก่อนหน้า (เช่น
   `ASSIGNED_SESSION` deny เสมอเพราะยังไม่มีตารางมอบหมายรอบสอบจริง, การตีความ
   M6 เป็น read-only ในงานก่อนหน้า) — ดู §6 ข้อ 5 สำหรับผลกระทบที่ตัดออก

ทดสอบจริงแล้วว่า STUDENT (บทบาทที่มี FILES-module scope จำกัดสุดคือ
`OWN_RECORD`) เห็นเอกสารภายในได้ปกติหลัง login — พิสูจน์ว่ากฎ "แค่ login พอ"
ทำงานได้จริงโดยไม่ผูกกับ scope ใดๆ (ดู §4)

### 2.3 Category กรองด้วย `id` ไม่ใช่ `code`/slug, Tag กรองด้วย `name` ตรงๆ

`Category.code` เป็น **nullable** ตามสคีมา (`code String? @unique`) ต่างจาก
`Program.code`/`Subject.code` ที่ไม่ nullable — แม้ข้อมูลจำลองปัจจุบันจะมี
`code` ครบทุกแถว (`GENERAL_KNOWLEDGE`, `VINAYA_CAT`, `INTERNAL_CIRCULARS`) แต่
schema ไม่รับประกันว่าจะมีค่าเสมอ การใช้ slug-from-code แบบ `/curriculum`/
`/exam-bank` (subject filter) จึงเสี่ยงต่อหมวดหมู่ในอนาคตที่ `code IS NULL` —
จึงเลือกกรองด้วย `Category.id` ตรงๆ ผ่าน query param `?category=<id>` (รูปแบบ
เดียวกับ `/exam-bank/[id]` ที่ใช้ id ตรงๆ เพราะเหตุผลคล้ายกัน — ดู
`exam-bank-pages.md` §2.2)

`Tag` ไม่มีคอลัมน์ `code`/slug ใดๆ เลย มีแค่ `name` (unique) — จึงกรองด้วย
`?tag=<name ภาษาไทยตรงๆ>` เหมือน pattern ที่ `q` (คำค้นหา) ของ `/exam-bank`
ใช้อยู่แล้ว (ภาษาไทยใน query param ทำงานได้ปกติ ทดสอบจริงแล้วทั้งสองที่)

### 2.4 "version" — แสดงประวัติทุกเวอร์ชันที่ APPROVED ต่างจาก `/exam-bank`

`/exam-bank` แสดงเฉพาะเวอร์ชัน APPROVED ล่าสุด (`currentVersionNo`) เท่านั้น
เพราะโจทย์เดิมของงานนั้นไม่ได้ระบุเรื่อง "version" เป็น feature เฉพาะ — แต่
บรีฟงานนี้ระบุ "version" ตรงๆ เป็นหนึ่งในสี่รายละเอียดหลัก (metadata, preview,
version, download) จึงตีความว่าต้องแสดง **ประวัติเวอร์ชันจริง** ไม่ใช่แค่
เวอร์ชันปัจจุบัน — `getLibraryDocumentById()` จึง query ทุกแถว
`document_versions` ที่ `status = 'APPROVED'` เรียงจากใหม่ไปเก่า (ไม่ใช่แค่
`LIMIT 1`) เอกสารเดียวกันอาจเคยผ่านการอนุมัติมาแล้วหลายเวอร์ชัน (แต่ละเวอร์ชัน
เป็นแถว immutable แยกกัน ล็อกถาวรทันทีที่พ้น DRAFT — ดู
`prisma/exam-document-schema.md`) หน้ารายละเอียดจึงแสดงทุกเวอร์ชันพร้อมวันที่
อนุมัติและลิงก์ดาวน์โหลดแยกกันของแต่ละเวอร์ชัน — ทดสอบจริงด้วยเอกสารจำลอง
`libraryGuideMultiVersion` ที่มี 2 เวอร์ชัน APPROVED (ดู §4)

### 2.5 Download endpoint: แยก 404 (not_found) กับ 503 (file_unavailable) โดยตั้งใจ

`GET /api/library/[id]/download` (รองรับ `?version=N` ทางเลือก) ต้องตอบสอง
สถานะที่ต่างกันโดยเจตนา:

- **404** เมื่อ "ไม่มีสิทธิ์เห็น หรือไม่มีอยู่จริง" — id ไม่มีอยู่จริง, เวอร์ชัน
  ที่ระบุไม่มีอยู่จริง/ไม่ใช่ APPROVED, หรือเอกสาร `isPublic=false` ขณะที่ไม่ได้
  login — ทั้งสี่กรณีนี้ตอบเหมือนกันหมด (ผ่าน `notFoundOrForbidden()` จาก
  `src/lib/guard.ts` ที่มีอยู่แล้ว) เพื่อป้องกัน IDOR enumeration (ผู้โจมตีแยก
  ไม่ออกว่า "id นี้มีอยู่จริงแต่ไม่มีสิทธิ์" กับ "id นี้ไม่มีอยู่จริงเลย")
- **503** เมื่อ "ผ่านการตรวจสิทธิ์แล้ว แต่ไฟล์จริงยังไม่พร้อมใช้งาน" —
  `resolveFileUrl(fileKey)` คืน `null` (เพราะยังไม่เชื่อมต่อ object storage
  จริง — M8) การบอกว่า "ไฟล์ยังไม่พร้อม" ในจุดนี้**ไม่รั่วไหลข้อมูลใดๆ เพิ่มเติม
  เกี่ยวกับสิทธิ์การเข้าถึง** เพราะผู้เรียกผ่านการตรวจสิทธิ์เรื่อง
  "มองเห็นเอกสารนี้ได้ไหม" มาแล้วก่อนถึงจุดนี้ — ต่างจาก 404 ที่ต้องไม่แยก
  ข้อความเพื่อไม่ให้รู้ว่ามีเอกสารอยู่จริงหรือไม่

การแยกสองสถานะนี้ทดสอบจริงแล้วครบทุก combination (ดู §4): เอกสารภายใน+Guest
(404), เอกสารภายใน+login แล้ว (503 ไม่ใช่ 404), เอกสารสาธารณะ+Guest (503),
id ไม่มีอยู่จริง (404), เอกสาร DRAFT-only (404 แม้ login แล้ว), version ที่
ระบุเจาะจงถูกต้อง (503), version ที่ไม่มีอยู่จริง (404), version ที่ parse
ไม่ได้/ติดลบ (ถือว่าไม่ได้ระบุ ตกไปใช้เวอร์ชันล่าสุด → 503)

### 2.6 `resolveFileUrl()` — placeholder เดียวสำหรับทุกจุดที่ต้องใช้ fileKey

`fileKey`/`fileName`/`mimeType`/`fileSize` ใน `DocumentVersion` ยังเป็นเพียง
คอลัมน์ placeholder (ตาม comment เดิมบน model — M8 ยังไม่เชื่อมต่อ object
storage จริง) แทนที่จะให้ทั้งหน้ารายละเอียดและ download endpoint ตรวจ
`fileKey === null` แยกกันคนละจุด งานนี้รวมไว้เป็นฟังก์ชันเดียว
`resolveFileUrl(fileKey)` ใน `src/lib/library.ts` (คืน `null` เสมอในเฟสนี้)
เพื่อให้มี **จุดแก้ไขจุดเดียว** เมื่อเชื่อมต่อ M8 จริงในอนาคต (ไม่ต้องไล่แก้ทุก
จุดที่เคยเรียกใช้ `fileKey` ตรงๆ)

### 2.7 อัปเดต `src/lib/exam-bank.ts` ให้กรอง `isPublic = true` ด้วย (consistency fix)

เมื่อ `Document` มีคอลัมน์ `isPublic` แล้ว หาก `/exam-bank` (หน้า Guest ล้วน
ไม่มีการ login) ไม่กรองด้วยเงื่อนไขนี้ เอกสารภายในใหม่ (เช่น
`internalCircularPrivate` ที่เพิ่มในงานนี้) ที่บังเอิญมี `levelId`/`subjectId`
ตรงกับตัวกรองของ `/exam-bank` จะรั่วไหลผ่านหน้าคลังข้อสอบได้ — จึงเพิ่ม
`d."isPublic" = true` เข้าไปในเงื่อนไข WHERE ของทั้ง `listExamBankDocuments()`
(`buildConditions()`) และ `getDocumentById()` เอกสารเดิมทั้ง 7 รายการก่อนงานนี้
ถูก seed ใหม่ให้ `isPublic: true` ครบทุกรายการ (ดู §2.1 ข้อ 2) จึงพฤติกรรมเดิม
ของ `/exam-bank` ไม่เปลี่ยนแปลง — ยืนยันด้วย regression 44/44 PASSED เหมือนเดิม
(ดู §4)

## 3. Function Specification

### F8.1 — ค้นหา/รายการเอกสารในห้องสมุด (`/library`)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Guest (เห็นเฉพาะ `isPublic=true`) หรือผู้ใช้ที่ login แล้วทุกบทบาท (เห็นทั้ง public และ private — ดู §2.2) |
| Input | searchParams: `category` (Category.id, optional), `tag` (Tag.name ตรงๆ, optional), `documentType` (allowlist, optional), `q` (คำค้นหา, optional), `page` (optional) |
| Process | `getCurrentUser()` → ทราบ isAuthenticated → ตรวจ category/tag กับรายการที่ query มาแล้ว (ไม่ trust ค่าจาก searchParams ตรงๆ) → `parseDocumentTypeParam()` → `parsePageParam()` → `listLibraryDocuments()` (INNER JOIN LATERAL หาเวอร์ชัน APPROVED ล่าสุด + WHERE isPublic-หรือ-login + ตัวกรองอื่นแบบ AND + pagination) |
| Output | รายการเอกสาร (ชื่อเรื่อง, ประเภท, สถานะ public/private, เวอร์ชันล่าสุด, วันที่อนุมัติ) พร้อมตัวกรองและ pagination |
| Permission | Guest เห็นเฉพาะ `isPublic=true`, ผู้ใช้ที่ login แล้วเห็นทั้งหมด (ดู §2.2) |
| Validation | category/tag ที่ไม่มีอยู่จริงถือว่าไม่ได้ระบุตัวกรอง (ไม่ error); documentType ที่ไม่อยู่ใน allowlist ถือว่าไม่ได้ระบุ |
| Error State | query ล้มเหลว → error bubble ไปที่ error.tsx (ทดสอบจริงแล้ว); ไม่มีผลลัพธ์ตรงเงื่อนไข → EmptyState ไม่ error |
| Audit | ไม่บันทึก (read-only) |
| Acceptance Criteria | AC1: Guest ไม่เห็นเอกสาร `isPublic=false` ไม่ว่าจะกรองด้วยเงื่อนไขใด (ทดสอบแล้ว); AC2: ผู้ใช้ที่ login แล้ว (ทดสอบด้วย STUDENT) เห็นทั้ง public และ private (ทดสอบแล้ว); AC3: filter หมวดหมู่/แท็ก/ประเภทเอกสาร/คำค้นหา ทำงานถูกต้องทั้งแยกและรวมกัน (ทดสอบแล้ว); AC4: ไม่มีผลลัพธ์ตรงเงื่อนไข → EmptyState (ทดสอบแล้ว) |

### F8.2 — ดูรายละเอียดเอกสาร + ประวัติเวอร์ชัน (`/library/[id]`)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Guest (เฉพาะ `isPublic=true`) หรือผู้ใช้ที่ login แล้วทุกบทบาท |
| Input | URL param `id` (Document.id) |
| Process | `getCurrentUser()` → `getLibraryDocumentById(id, isAuthenticated)` — deny-by-default (ต้องมีเวอร์ชัน APPROVED อย่างน้อยหนึ่งเวอร์ชัน) + public/private ตาม isAuthenticated |
| Output | metadata (ชื่อเรื่อง, ประเภท, หมวดหมู่, แท็ก, สถานะ public/private), preview-placeholder (ยังไม่เชื่อม object storage), ประวัติเวอร์ชันที่ APPROVED ทั้งหมดเรียงใหม่→เก่า พร้อมลิงก์ดาวน์โหลดแต่ละเวอร์ชัน |
| Permission | ตรงกับ F8.1 |
| Validation | id ต้องมีอยู่จริง มีเวอร์ชัน APPROVED อย่างน้อยหนึ่งเวอร์ชัน และผ่านเงื่อนไข public/private — ไม่ผ่านเงื่อนไขใดก็ตามได้ผลเดียวกันคือ notFound() (ไม่แยกข้อความ) |
| Error State | ไม่พบ/ไม่มีสิทธิ์เห็น → 404 (`notFound()`); query ล้มเหลว → error.tsx |
| Audit | ไม่บันทึก (read-only) |
| Acceptance Criteria | AC1: เอกสารภายใน → Guest 404, login แล้วเห็นปกติ (ทดสอบด้วย STUDENT — ทดสอบแล้ว); AC2: เอกสารที่มีมากกว่า 1 เวอร์ชัน APPROVED แสดงประวัติครบทุกเวอร์ชัน (ทดสอบแล้วด้วย 2 เวอร์ชัน); AC3: ลิงก์ดาวน์โหลดชี้ไปที่ endpoint จริงพร้อม `?version=` เมื่อจำเป็น ไม่ทำให้เข้าใจผิดว่ามีไฟล์จริงเมื่อ `hasFile=false`; AC4: id ไม่มีอยู่จริง/DRAFT/RETIRED → 404 เหมือนกันหมด (ทดสอบแล้ว) |

### F8.3 — ดาวน์โหลดไฟล์เอกสาร (`GET /api/library/[id]/download`)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | ตรงกับ F8.1/F8.2 |
| Input | URL param `id`, query param `version` (เลขเวอร์ชัน, ทางเลือก) |
| Process | `getCurrentUser()` → query เอกสาร+เวอร์ชันเป้าหมายครั้งเดียว (ระบุ version ให้ตรง versionNo นั้น, ไม่ระบุใช้ APPROVED ล่าสุด) พร้อมเงื่อนไข public/private → ไม่พบแถว → 404; พบแล้วแต่ `resolveFileUrl()` คืน null → 503; มี URL จริง → 307 redirect |
| Output | 307 redirect (ยังไม่เกิดจริงในเฟสนี้) \| 404 `not_found` \| 503 `file_unavailable` \| 500 |
| Permission | ตรงกับ F8.1/F8.2 — ไม่ใช้ `guardRoute()`/FILES-module (ดู §2.2) |
| Validation | version ที่ parse เป็นจำนวนเต็มบวกไม่ได้ถือว่าไม่ได้ระบุ |
| Error State | ดู §2.5 สำหรับการแยก 404/503 โดยละเอียด |
| Audit | ไม่บันทึก (read-only, ไม่มีการเปลี่ยนแปลงข้อมูล) |
| Acceptance Criteria | AC1: เอกสารภายใน → Guest 404, login แล้ว 503 ไม่ใช่ 404 (ทดสอบแล้ว); AC2: id/version ที่ไม่มีอยู่จริงหรือไม่ใช่ APPROVED → 404 เสมอ (ทดสอบแล้ว); AC3: มีสิทธิ์เห็นจริงแต่ fileKey เป็น null → 503 ไม่ใช่ 404/500 (ทดสอบแล้ว); AC4: version ที่ parse ไม่ได้/ติดลบ/ศูนย์ → ถือว่าไม่ได้ระบุ ใช้เวอร์ชันล่าสุด (ทดสอบแล้ว) |

## 4. ผลการทดสอบจริง (รันเมื่อ 2026-09-24)

หลัง apply migration ใหม่ (`20260924110000_document_visibility`) แก้ไข
`prisma/seed.ts` (isPublic ของ 7 เอกสารเดิม + เอกสารจำลองใหม่ 2 รายการ:
`libraryGuideMultiVersion` 2 เวอร์ชัน APPROVED + `internalCircularPrivate`
1 เวอร์ชัน APPROVED, isPublic=false) แล้ว reset ฐานข้อมูลและ seed ใหม่ทั้งหมด
(`node prisma/dev-migrate-verify.mjs --reset` replay ทั้ง 11 migrations จาก
ศูนย์ → `npx tsx prisma/seed.ts` ×2 เพื่อยืนยัน idempotent — documents=9,
documentVersions=10, categories=3 คงที่ทั้งสองรอบ) แล้วรัน:

| # | คำสั่ง/การทดสอบที่รันจริง | ผล |
|---|---|---|
| 1 | `npx next typegen` (เพิ่ม route ใหม่ `/library`, `/library/[id]`, `/api/library/[id]/download`) | สร้าง route types สำเร็จ |
| 2 | `node prisma/dev-migrate-verify.mjs` (ก่อน reset — apply migration ใหม่กับฐานข้อมูลเดิม) | PASSED |
| 3 | `node prisma/dev-migrate-verify.mjs --reset` (replay ทั้ง 11 migrations จากศูนย์ รวม migration ใหม่) | PASSED |
| 4 | `npx tsx prisma/seed.ts` ×2 ติดต่อกัน | idempotent — documents=9, documentVersions=10, categoriesAndTags.categories=3 คงที่ทั้งสองรอบ (ยืนยันด้วย SQL ตรงว่า isPublic ของทุกแถวตรงตาม matrix ที่ตั้งใจ) |
| 5 | manual smoke test ด้วย `curl`/`psql` ก่อนเขียน automated suite (Guest vs ไม่ได้กรอง, private doc ไม่ปรากฏใน `/library` แต่ปรากฏใน dropdown หมวดหมู่, download endpoint ทั้ง 404/503) | ยืนยันพฤติกรรมถูกต้องตั้งแต่รอบแรก |
| 6 | `node prisma/test-exam-document-domain.mjs` (regression, รันทันทีหลัง reset) | 23/23 PASSED |
| 7 | `node prisma/test-auth-login.mjs` (regression) | 24/24 PASSED |
| 8 | `node prisma/test-authz-guard.mjs` (regression) | 23/23 PASSED |
| 9 | `node prisma/test-rbac-scope.mjs` (regression) | 28/28 PASSED |
| 10 | `node prisma/test-curriculum-pages.mjs` (regression) | 36/36 PASSED |
| 11 | `node prisma/test-news-pages.mjs` (regression) | 35/35 PASSED |
| 12 | `node prisma/test-exam-bank-pages.mjs` (regression — ยืนยัน isPublic consistency fix ใน §2.7 ไม่ทำให้พฤติกรรมเดิมเปลี่ยน) | 44/44 PASSED |
| 13 | `node prisma/test-library-pages.mjs` (ใหม่ — HTTP end-to-end จริงผ่าน `next dev` + Jar/`loginAs()` จริงผ่าน Auth.js Credentials flow: public/private access ทั้ง Guest และ STUDENT ที่ login แล้ว, filter หมวดหมู่/แท็ก/ประเภทเอกสาร/คำค้นหา รวม SQL-injection-safety, pagination แบบ tolerant, ประวัติเวอร์ชันครบ 2 เวอร์ชัน, download endpoint ทั้ง 404/503 ครบทุก combination) | **46/46 PASSED** |
| 14 | `node prisma/test-auth-session-expiry.mjs` กับ `AUTH_SESSION_MAX_AGE_SECONDS=3` (regression) | 2/2 PASSED |
| 15 | `node prisma/test-layout-responsive.mjs` (ขยาย — เพิ่ม 5 หน้า `/library...` ใหม่) | **318/318 PASSED** (เดิม 258 + เพิ่ม 60 จาก 5 หน้าใหม่ × 4 viewport × 3 assertion) |
| 16 | ทดสอบ error state จริง: เพิ่ม `throwIfForcedTestError()`-style guard ชั่วคราวใน `src/lib/library.ts::listLibraryDocuments()` (gate ด้วย `TEST_FORCE_LIBRARY_ERROR=1`) รีสตาร์ท dev server พร้อม env var นั้น เปิดด้วย Playwright Chromium จริง ยืนยัน HTTP 500 + เนื้อหา error.tsx จริง ("เกิดข้อผิดพลาด...", "ลองใหม่") ปรากฏ แล้วลบ hook ออกทันที (ยืนยันด้วย `grep` คืนค่าว่างและ `tsc --noEmit`/`npm run lint` ผ่าน) | ยืนยันสำเร็จ |
| 17 | `npx tsc --noEmit` | ผ่าน ไม่มี type error |
| 18 | `npm run lint` | ผ่าน ไม่มี warning/error (แก้ 2 warning ที่พบระหว่างทำ — ดูด้านล่าง) |
| 19 | `npx next build` (production build) | ผ่าน — route manifest แสดง `ƒ /library`, `ƒ /library/[id]`, `ƒ /api/library/[id]/download` ใหม่ |

**สรุปผล P4 ห้องสมุด PDF/Download: 19/19 รายการในตารางข้างต้นผ่าน (PASSED)** —
รายการที่ 13 และ 15 ครอบคลุม 46 + 60 (ส่วนเพิ่มจาก 258 เดิม) = 106 assertion
จริงที่เป็นของใหม่จากงานนี้ นอกเหนือจาก 473 assertion เดิมที่ยังผ่านไม่มี
เปลี่ยนแปลง (รวมสะสมทั้งโปรเจกต์: 473 (เดิม) + 46 + 60 = **579/579 PASSED**)
ฐานข้อมูลสุดท้ายถูกปล่อยไว้ในสถานะ migrate + seed ครบ (เหมือนงานก่อนหน้า)

**ปัญหาที่พบระหว่างทำ**:

1. `npm run lint` พบ 2 warning จากไฟล์ใหม่ของงานนี้: `Link` ที่ import ไว้ใน
   `src/app/library/[id]/page.tsx` แต่ไม่ได้ใช้จริง (ลบ import ออก) และ
   parameter `_fileKey` ของ `resolveFileUrl()` ที่ไม่มีการใช้งาน (แก้ด้วย
   `void fileKey;` แทนที่จะขึ้นต้นด้วย `_` เพราะพบว่า config ESLint ของ
   โปรเจกต์นี้ไม่มี `argsIgnorePattern` ตั้งไว้ — การขึ้นต้นด้วย `_` จึงไม่ได้
   ยกเว้นจริง) — ไม่ใช่บั๊กเชิงตรรกะ แก้แล้วก่อน commit และรัน
   `npx tsc --noEmit`/`npm run lint` ซ้ำจนผ่านสะอาด
2. ระหว่าง manual smoke test พบ document row เก่าชื่อ
   `doc_answer_sheet_template` ปนอยู่ในฐานข้อมูล (fixture จาก
   `test-exam-document-domain.mjs` — ปัญหาเดิมที่เคยบันทึกไว้แล้วใน
   `exam-bank-pages.md` §4) ไม่ใช่บั๊กของงานนี้ — regression run เต็มรูปแบบ
   หลัง reset+reseed สะอาดยืนยันแล้วว่าไม่มีผลกระทบต่อผลทดสอบ (44/44 และ
   46/46 PASSED เหมือนเดิม)
3. **ไม่พบบั๊กด้าน authorization/visibility ใดๆ** ระหว่างพัฒนา — การออกแบบ
   ด้วย `INNER JOIN LATERAL` (deny-by-default เดิม) ร่วมกับเงื่อนไข
   `isPublic OR isAuthenticated` (public/private ใหม่) ทำงานถูกต้องตั้งแต่
   การทดสอบด้วยมือรอบแรก

## 5. Failure Mode และ Recovery

- **Query ล้มเหลว (database ล่ม/connection error) ทุกหน้า** → error bubble ไป
  `error.tsx` ของ root segment เดียวกับทุกหน้าในโปรเจกต์ (ทดสอบจริงแล้วด้วยวิธี
  forced error — ดู §4 รายการที่ 16)
- **เอกสารที่กำลังแสดงอยู่ถูกเปลี่ยน `isPublic` จาก true → false ระหว่างที่
  Guest เปิดหน้าค้างไว้** → refresh ครั้งถัดไปจะได้ 404 ทันที (ตรวจสดทุก
  request ไม่มี cache ฝั่ง server) ไม่มีความเสี่ยงข้อมูลเก่าค้างอยู่ — เช่นกัน
  กับ download endpoint ที่ตรวจสิทธิ์ใหม่ทุก request
- **เพิ่มเอกสารใหม่/อนุมัติเวอร์ชันใหม่/เปลี่ยน `isPublic` ระหว่างระบบทำงานอยู่**
  → ปรากฏ/หายไปจาก `/library` โดยอัตโนมัติในการ request ครั้งถัดไป ไม่ต้อง
  deploy โค้ดใหม่ (ไม่มี cache ฝั่ง server ทั้งหมด)
- **Migration ใหม่ (`20260924110000_document_visibility`) ล้มเหลวระหว่าง apply
  กับฐานข้อมูล production ในอนาคต** → เป็น `ADD COLUMN ... NOT NULL DEFAULT
  false` + `CREATE INDEX` ล้วน (ไม่มี FK/constraint ที่อาจ fail จากข้อมูลเดิมที่
  ไม่ตรงเงื่อนไข เพราะ default ใช้ได้กับทุกแถวเดิมทันที) — rollback ทำได้
  ปลอดภัยด้วย `DROP INDEX`/`DROP COLUMN` ย้อนกลับ (เอกสารเดิมทั้งหมดไม่ถูก
  กระทบ เพราะไม่มีข้อมูลใดถูกแก้ไข/ลบระหว่าง migration นี้)
- **Download endpoint คืน 503 ตลอดไปในเฟสนี้** (fileKey เป็น null เสมอ) — ไม่ใช่
  bug แต่เป็นสถานะที่ตั้งใจ (M8 ยังไม่เชื่อมต่อจริง) เมื่อเชื่อมต่อ M8 จริง
  ในอนาคต จุดแก้ไขมีที่เดียวคือ `resolveFileUrl()` ใน `src/lib/library.ts`
  (ดู §2.6) ไม่ต้องแก้ไข route handler/หน้าเว็บใดๆ เพิ่มเติม
- **rollback ของงานนี้โดยรวม**: นอกจาก migration ข้างต้น งานนี้ไม่มี write path
  อื่นเลย (read-only ทั้งหมด) การ rollback ส่วน UI ทำได้ด้วยการลบไฟล์
  `src/lib/library.ts`, `src/app/library/**`,
  `src/app/api/library/**`, entry ใน `nav-config.ts`, และ revert การแก้ไข
  `src/lib/exam-bank.ts` (ลบเงื่อนไข `isPublic = true` ทั้งสองจุด) โดยไม่กระทบ
  ข้อมูลเดิม

## 6. ขอบเขตที่ตัดออก (โปร่งใส สำหรับ Owner Review)

1. **"private" = ต้อง login เท่านั้น ไม่ตรวจ role/scope เพิ่มเติม** — ดู §2.2
   สำหรับเหตุผลเต็ม (Document ไม่มีคอลัมน์ ownership/org-linkage ให้ resolve
   FILES-module scope ได้ถูกต้อง) — ผลกระทบ: ทุกบทบาทที่ login แล้ว (แม้แต่
   STUDENT) เห็นเอกสารภายในได้เหมือนกันหมด ไม่มีการแบ่งระดับ "ภายในเฉพาะเจ้า
   หน้าที่" vs "ภายในที่ทุกคนที่ login เห็นได้" แยกจากกัน
2. **ไม่มีการเชื่อมต่อ object storage จริง** — `fileKey` ยังเป็น
   `null`/placeholder เหมือนเดิม (M8) `resolveFileUrl()` คืน `null` เสมอ
   download endpoint จึงตอบ 503 เสมอในข้อมูลจำลองชุดนี้ (ดู §2.5/§2.6)
3. **preview เป็นเพียงข้อความ placeholder** ไม่มี PDF viewer/thumbnail จริง —
   เพราะยังไม่มีไฟล์จริงให้แสดง (ต่อเนื่องจากข้อ 2)
4. **ไม่มีหน้า admin จัดการ `isPublic`/หมวดหมู่/แท็ก** — งานนี้เป็น read-only
   ฝั่ง Public เท่านั้น ปัจจุบันตั้งค่าผ่าน seed เท่านั้น ไม่มี write path ทาง UI
5. **category/tag เป็นตัวกรองอิสระจากกัน ไม่ตรวจว่าเอกสารในหมวดหมู่นั้นเป็น
   public หรือ private ก่อนแสดงในตัวเลือก dropdown** — `listCategories()`/
   `listTags()` คืนหมวดหมู่/แท็กทั้งหมดแบบ global (เหมือน `listAllSubjects()`
   ของ `/exam-bank`) แม้หมวดหมู่นั้นจะมีแต่เอกสาร private ที่ Guest มองไม่เห็น
   ก็ตาม (เช่น "หมวดหนังสือเวียนภายใน" ปรากฏใน dropdown ให้ Guest เลือกได้ แม้
   ผลลัพธ์ที่กรองได้จะว่างเปล่าเสมอสำหรับ Guest) — ไม่ใช่การรั่วไหลของเนื้อหา
   เอกสาร (แค่ชื่อหมวดหมู่ซึ่งเป็นข้อมูลจัดหมวดทั่วไป ไม่ใช่ PII/ข้อมูลลับ) แต่
   บันทึกไว้อย่างโปร่งใสว่าเป็น trade-off ด้าน UX ที่ยังไม่ได้ปรับ
6. **เอกสารเดียวกันปรากฏได้ทั้งใน `/exam-bank` และ `/library`** หากเข้าเงื่อนไข
   ทั้งสองมุมมอง — เป็นการออกแบบที่ตั้งใจ ไม่ใช่บั๊ก (ดู §1)
7. **pagination ยังไม่ผ่านการทดสอบข้ามหน้าจริง** — ข้อมูลจำลองปัจจุบันมีเอกสาร
   ที่ APPROVED เพียง 5 รายการ (น้อยกว่า `LIBRARY_PAGE_SIZE = 9`) เหตุผลและ
   ความเสี่ยงเดียวกับที่บันทึกไว้แล้วใน `exam-bank-pages.md` §6 ข้อ 7

## 7. งานถัดไปที่ควรทำ

1. เชื่อมต่อ object storage จริง (M8) — แก้ที่ `resolveFileUrl()` จุดเดียว
   (ดู §2.6) แล้วเปิดใช้งาน preview/download จริงทั้งในหน้ารายละเอียดและ
   download endpoint โดยไม่ต้องแก้ไขจุดอื่น
2. พิจารณาออกแบบ scope ที่ละเอียดกว่า "login แล้ว = เห็น private ทั้งหมด" หาก
   ในอนาคตต้องการแบ่งระดับ "ภายใน" ตาม role/organization จริง (ดู §6 ข้อ 1) —
   ต้องเพิ่มคอลัมน์ ownership/org-linkage ให้ `Document` ก่อนจึงจะใช้
   FILES-module scope ที่มีอยู่แล้วได้อย่างถูกต้อง
3. สร้างหน้า admin จัดการเอกสาร/ตั้งค่า `isPublic`/หมวดหมู่/แท็ก — ปัจจุบัน
   ทั้งหมดถูกสร้างผ่าน seed เท่านั้น ไม่มี write path ทาง UI เลย (ดู §6 ข้อ 4)
4. เพิ่มข้อมูลจำลองให้มีเอกสาร APPROVED เกิน `LIBRARY_PAGE_SIZE` (9 รายการ)
   เพื่อทดสอบ pagination ข้ามหน้าจริงได้ครบถ้วน (ดู §6 ข้อ 7)
5. พิจารณากรอง `listCategories()`/`listTags()` ให้แสดงเฉพาะหมวดหมู่/แท็กที่มี
   เอกสารที่ผู้เรียกมองเห็นได้จริง แทนที่จะแสดงทั้งหมดแบบ global (ดู §6 ข้อ 5)
6. เชื่อมหน้ารายละเอียดวิชา/หน้าคลังข้อสอบเข้ากับห้องสมุด — แสดงลิงก์ไขว้กัน
   เมื่อเอกสารเดียวกันปรากฏได้ทั้งสองที่ (ดู §6 ข้อ 6)
