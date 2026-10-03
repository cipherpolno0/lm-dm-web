# Exam & Document Schema — คลังข้อสอบและเอกสาร (M3)

Phase: P2 Database & Sangha Domain — งาน "ออกแบบคลังข้อสอบและเอกสาร"
ขอบเขตตามที่ระบุ: **exam sets, questions, choices, answer keys, document metadata,
versions, categories, tags** — ตรงกับโมดูล M3 (คลังข้อสอบ) ใน requirements.md

Implementation อยู่ใน `prisma/schema.prisma` (ต่อจาก P2 education-domain) และ
`prisma/migrations/20260923143443_exam_document_domain/migration.sql` — เอกสารนี้
อธิบายทุกตาราง/คอลัมน์/constraint พร้อมเหตุผลการออกแบบ และ function specification
ของ operation หลัก

## ขอบเขตและสิ่งที่ตั้งใจไม่รวม (Out of Scope)

- **การจัดสอบจริง/บันทึกคะแนนนักเรียนรายบุคคล/ประกาศผล** — เป็น M4 (แบบทดสอบ) โมดูลนี้
  ออกแบบเฉพาะ**คลังข้อสอบ/เอกสาร**และ**ชุดข้อสอบ** (โครงสร้างที่นำไปใช้จัดสอบ) ไม่ใช่ตัว
  การสอบจริง ใบสมัคร การตรวจ หรือผลสอบรายคน
- **การอัปโหลด/จัดเก็บไฟล์จริง (Object Storage)** — เป็น M8 `DocumentVersion.fileKey`/
  `fileName`/`mimeType`/`fileSize` เป็นเพียงคอลัมน์ placeholder สำหรับอ้างอิงไฟล์ใน
  object storage ในอนาคต งานนี้ไม่ได้เชื่อมกับระบบจัดเก็บไฟล์จริงหรือมี business logic
  ตรวจสอบไฟล์ใดๆ
- **สิทธิ์ระดับ column-level ของ AnswerKey** (เช่น "เฉพาะกรรมการออกข้อสอบเท่านั้นที่ดู
  เฉลยได้") — schema เตรียมโครงสร้างไว้ให้รองรับได้ (แยกตารางจาก QuestionVersion) แต่การ
  บังคับสิทธิ์จริงเป็นงานของ Auth/RBAC phase ถัดไป ไม่ได้ implement authorization logic
  ในงานนี้

## หลักการออกแบบสำคัญ (Key Design Decisions)

1. **แยก "ตัวตน" (identity) ออกจาก "เนื้อหาที่มีเวอร์ชัน" (versioned content)** —
   `Question`/`Document` คงที่ตลอดอายุ ส่วนเนื้อหาจริงอยู่ใน `QuestionVersion`/
   `DocumentVersion` ที่มี `versionNo` เพิ่มทีละ 1 ทุกครั้งที่แก้ไข — ตรงตามข้อกำหนด
   "เวอร์ชัน (versioning — ห้ามลบ/เขียนทับของเดิมเมื่อมีการแก้ไข)" ใน requirements.md
2. **Conditional immutability ตาม status แทน append-only แบบเข้มงวด** — ต่างจาก
   `curricula`/`organization_status_history`/`audit_logs` (ล็อกทันทีตั้งแต่แถวแรกถูก
   สร้าง) ตาราง `question_versions`/`document_versions`/`exam_sets` (และตารางลูกที่ผูก
   อยู่) **แก้ไข/ลบได้อิสระขณะสถานะยังเป็น `DRAFT`** เพื่อให้ผู้แต่งข้อสอบร่างและแก้ไขงาน
   ของตัวเองได้ตามธรรมชาติ แต่ทันทีที่ส่งเข้า workflow อนุมัติ (status เปลี่ยนเป็นค่าอื่นที่
   ไม่ใช่ `DRAFT` — `PENDING_REVIEW`/`APPROVED`/`REJECTED`/`RETIRED`) DB trigger จะล็อก
   แถวนั้นถาวรทันที (`BEFORE UPDATE/DELETE` ตรวจ `OLD.status <> 'DRAFT'`) แก้ไขต่อ = ต้อง
   สร้างแถวใหม่ (versionNo ถัดไป หรือ exam set ใหม่) เท่านั้น — **ทดสอบจริงแล้วทั้งสอง
   ทิศทาง**: แก้ไขได้ขณะ DRAFT, ถูกบล็อกทันทีที่พ้น DRAFT (ดูผลทดสอบด้านล่าง)
3. **ตารางลูกที่ไม่มีคอลัมน์ status ของตัวเอง ล็อกผ่าน JOIN ไปยังแถวแม่** —
   `question_choices`/`answer_keys` เช็คสถานะของ `question_versions` แม่ (ผ่าน
   `questionVersionId`) และ `exam_set_items` เช็คสถานะของ `exam_sets` แม่ (ผ่าน
   `examSetId`) ในฟังก์ชัน trigger เอง (ไม่ duplicate คอลัมน์ status ลงมาในตารางลูก) —
   ป้องกันการแก้ไขตัวเลือกคำตอบ/เฉลย/รายการข้อสอบของชุดที่อนุมัติแล้วโดยไม่ต้องแตะเนื้อหา
   เวอร์ชันแม่โดยตรง
4. **`Question` ผูก `subjectId`+`levelId` โดยตรง ไม่ผูก `curriculumLevelSubjectId`
   เฉพาะเจาะจง** — เพื่อให้นำข้อสอบเดิมกลับมาใช้ข้ามหลักสูตรเวอร์ชันใหม่ได้ (หลักสูตรอาจ
   ปรับปรุงแต่วิชา/ระดับชั้นเดิมยังคงมีข้อสอบสะสมอยู่) ส่วนการค้นหา **"ตามหลักสูตร/ปี"**
   ทำผ่าน `ExamSet`/`ExamSetItem` แทน (ดูข้อ 5) เพราะ "ข้อสอบชุดนี้ใช้ในหลักสูตร/ปีไหน"
   เป็นมุมมองการใช้งานจริง (ประกอบเป็นชุด) ไม่ใช่คุณสมบัติถาวรของตัวข้อสอบเดี่ยวๆ
5. **`ExamSet` คือจุดที่ตอบโจทย์ "ค้นตามหลักสูตร/ชั้น/ปี/วิชาได้ด้วย index ที่เหมาะสม"** —
   ผูกกับ `curriculumLevelSubjectId` เสมอ (ให้ค้นตามหลักสูตร+ชั้น+วิชาได้โดยตรงในคีย์เดียว)
   และผูกกับ `examSessionId` แบบ **optional** (ให้ค้นตามปีได้ผ่าน
   `exam_sessions.academicYearId` เมื่อเป็นชุดที่ใช้สอบจริงในรอบสอบหนึ่ง — เป็น `null`
   ได้สำหรับชุดฝึกซ้อม/คลังส่วนกลางที่ยังไม่ผูกรอบสอบใด) มี index ทั้งสองด้าน
   (`curriculumLevelSubjectId`, `examSessionId`) — **ทดสอบจริงแล้ว** ทั้ง 3 รูปแบบการค้น
   (ดูผลทดสอบด้านล่าง)
6. **`AnswerKey` แยกตารางจาก `QuestionVersion` โดยเจตนา** (ไม่ใช่คอลัมน์ในตารางเดียวกัน)
   เพื่อให้ในอนาคตกำหนดสิทธิ์ SELECT เข้มงวดกว่าตัวข้อสอบได้โดยไม่ต้องเปลี่ยนโครงสร้าง
   ตาราง (เช่น เฉพาะกรรมการออกข้อสอบเท่านั้นที่ query ตารางนี้ได้ ในขณะที่ผู้สอบทั่วไปเห็น
   เฉพาะ `question_versions`/`question_choices`) — รองรับทั้งข้อสอบปรนัย
   (`correctChoiceId`) และอัตนัย (`modelAnswer`/`scoringGuide`) ในโครงสร้างเดียวกัน
7. **`ExamSetItem` อ้างอิง `QuestionVersion` เจาะจง ไม่ใช่ `Question` เฉยๆ** — เพื่อให้
   ชุดข้อสอบที่ประกาศใช้แล้ว (APPROVED) อ้างอิงเนื้อหาข้อสอบเวอร์ชันที่แน่นอนตลอดไป แม้
   ข้อสอบนั้นจะถูกแก้ไขและมีเวอร์ชันใหม่กว่าเกิดขึ้นภายหลัง (ความถูกต้องเชิงประวัติศาสตร์
   ของชุดข้อสอบที่ใช้จัดสอบไปแล้ว — เช่นเดียวกับหลักการ `ExamSession.curriculumId` ที่
   ผูกชัดเจนใน education-domain)
8. **`Category` และ `Tag` เป็นสองตารางแยกกัน ใช้ร่วมกันได้ทั้งข้อสอบและเอกสาร** ผ่าน join
   table 4 ตัว (`QuestionCategory`, `QuestionTag`, `DocumentCategory`, `DocumentTag`) —
   `Category` มี `isActive`/soft-delete/รหัส ควบคุมโดย admin (เช่น "หมวดพระวินัย") ส่วน
   `Tag` เป็น free-form label ที่ผู้ใช้งานเพิ่มได้อิสระกว่า ไม่มีสถานะ/ประวัติ
9. **reuse enum `exam_type` เดิม (MULTIPLE_CHOICE/ESSAY/MIXED) สำหรับ `Question.questionType`
   แทนการสร้าง enum ใหม่** — เพราะความหมายตรงกับ "ปรนัย/อัตนัย" ที่ระบุในรายละเอียดงานนี้
   พอดีอยู่แล้ว (enum เดิมนี้ถูกสร้างไว้ใน education-domain สำหรับ
   `CurriculumLevelSubject.examType`) การใช้ enum ร่วมกันหลีกเลี่ยงความสับสนจากการมี
   สอง enum ที่ความหมายซ้ำซ้อนกัน

## Enum Reference

| Enum | ค่า | ใช้กับ |
|---|---|---|
| `approval_status` | DRAFT, PENDING_REVIEW, APPROVED, REJECTED, RETIRED | QuestionVersion.status, DocumentVersion.status, ExamSet.status |
| `document_type` | EXAM_PAPER_PRINT, ANSWER_SHEET_TEMPLATE, CIRCULAR, STUDY_MATERIAL, OTHER | Document.documentType |
| `exam_type` (reuse จาก education-domain) | MULTIPLE_CHOICE, ESSAY, MIXED | Question.questionType (เพิ่มเติมจาก CurriculumLevelSubject.examType เดิม) |

## แผนภาพความสัมพันธ์ (Relationships)

```mermaid
erDiagram
    SUBJECTS ||--o{ QUESTIONS : "asked in"
    EDUCATION_LEVELS ||--o{ QUESTIONS : "targets level"

    QUESTIONS ||--o{ QUESTION_VERSIONS : "has versions"
    QUESTIONS ||--o{ QUESTION_CATEGORIES : "categorized as"
    QUESTIONS ||--o{ QUESTION_TAGS : "tagged as"
    CATEGORIES ||--o{ QUESTION_CATEGORIES : "used by"
    TAGS ||--o{ QUESTION_TAGS : "used by"

    QUESTION_VERSIONS ||--o{ QUESTION_CHOICES : "has choices"
    QUESTION_VERSIONS ||--o{ ANSWER_KEYS : "has answer key"
    QUESTION_CHOICES ||--o{ ANSWER_KEYS : "may be correct choice"

    DOCUMENTS ||--o{ DOCUMENT_VERSIONS : "has versions"
    DOCUMENTS ||--o{ DOCUMENT_CATEGORIES : "categorized as"
    DOCUMENTS ||--o{ DOCUMENT_TAGS : "tagged as"
    CATEGORIES ||--o{ DOCUMENT_CATEGORIES : "used by"
    TAGS ||--o{ DOCUMENT_TAGS : "used by"

    CURRICULUM_LEVEL_SUBJECTS ||--o{ EXAM_SETS : "search key: curriculum+level+subject"
    EXAM_SESSIONS ||--o{ EXAM_SETS : "search key: year (optional)"
    EXAM_SETS ||--o{ EXAM_SET_ITEMS : "contains"
    QUESTION_VERSIONS ||--o{ EXAM_SET_ITEMS : "included as (pinned version)"

    QUESTIONS {
        string id PK
        string subjectId FK
        string levelId FK
        enum questionType "reuse exam_type"
    }
    QUESTION_VERSIONS {
        string id PK
        string questionId FK
        int versionNo "UK with questionId"
        enum status "DRAFT locks after change"
        note "locked when status <> DRAFT"
    }
    QUESTION_CHOICES {
        string id PK
        string questionVersionId FK
        string label "UK with questionVersionId"
        note "locked via parent question_version.status"
    }
    ANSWER_KEYS {
        string id PK
        string questionVersionId FK "UK, 1:1"
        string correctChoiceId FK "nullable"
        note "locked via parent question_version.status"
    }
    DOCUMENTS {
        string id PK
        string title
        enum documentType
    }
    DOCUMENT_VERSIONS {
        string id PK
        string documentId FK
        int versionNo "UK with documentId"
        enum status "DRAFT locks after change"
        string fileKey "placeholder, M8"
    }
    CATEGORIES {
        string id PK
        string code UK "nullable"
    }
    TAGS {
        string id PK
        string name UK
    }
    EXAM_SETS {
        string id PK
        string curriculumLevelSubjectId FK
        string examSessionId FK "nullable"
        enum status "DRAFT locks after change"
    }
    EXAM_SET_ITEMS {
        string id PK
        string examSetId FK
        string questionVersionId FK
        int sortOrder "UK with examSetId"
        note "locked via parent exam_set.status"
    }
```

## Data Dictionary

### ตาราง: `categories`

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| name | text | ไม่ | ชื่อหมวดหมู่ |
| code | text | ได้ | UNIQUE (partial index `WHERE code IS NOT NULL` — Postgres อนุญาตหลาย NULL อยู่แล้ว แต่ระบุ WHERE ให้ชัดเจนตาม convention เดิมของโปรเจกต์) |
| description | text | ได้ | |
| isActive | boolean | ไม่ | default true |
| createdAt/updatedAt/deletedAt | timestamp(3) | ไม่/ไม่/ได้ | soft delete |

**Constraints**: PK(id); UNIQUE(code) WHERE code IS NOT NULL — **ทดสอบจริงแล้ว**
ว่าอนุญาตหลายแถว code=NULL แต่ปฏิเสธ code ซ้ำที่ไม่ใช่ NULL

### ตาราง: `tags`

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| name | text | ไม่ | UNIQUE |
| createdAt | timestamp(3) | ไม่ | ไม่มี updatedAt/soft-delete — ข้อมูลเสริมการค้นหาล้วนๆ |

**Constraints**: PK(id); UNIQUE(name)

### ตาราง: `questions` (identity)

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| subjectId | text | ไม่ | FK → subjects.id |
| levelId | text | ไม่ | FK → education_levels.id |
| questionType | exam_type | ไม่ | MULTIPLE_CHOICE=ปรนัย / ESSAY=อัตนัย / MIXED |
| createdAt/updatedAt/deletedAt | timestamp(3) | ไม่/ไม่/ได้ | soft delete (ข้อผิดพลาดในการบันทึกจริงๆ เท่านั้น — ไม่ใช่การ "เลิกใช้ข้อสอบ" ซึ่งควรใช้ RETIRED ที่ QuestionVersion แทน) |

**Constraints/Indexes**: PK(id); **INDEX(subjectId, levelId)** — ตอบโจทย์ "ค้นตามชั้น/
วิชา" โดยตรงในระดับตัวข้อสอบ; FK ทั้งสอง RESTRICT

### ตาราง: `question_categories` / `question_tags` (join tables)

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| questionId | text | ไม่ | FK → questions.id (ส่วนหนึ่งของ composite PK) |
| categoryId/tagId | text | ไม่ | FK → categories.id / tags.id (ส่วนหนึ่งของ composite PK) |
| createdAt | timestamp(3) | ไม่ | |

**Constraints/Indexes**: composite PK(questionId, categoryId/tagId) — กันซ้ำในตัวเอง;
INDEX(categoryId) / INDEX(tagId) — รองรับ query ย้อนทาง "หมวดหมู่/แท็กนี้มีข้อสอบอะไรบ้าง";
FK ทั้งสอง RESTRICT

### ตาราง: `question_versions` (versioned content — conditional immutability)

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| questionId | text | ไม่ | FK → questions.id |
| versionNo | integer | ไม่ | UNIQUE ร่วมกับ questionId — เพิ่มทีละ 1 |
| content | text | ไม่ | เนื้อหาโจทย์ |
| status | approval_status | ไม่ | default DRAFT |
| authorActorId | text | ได้ | FK → users.id, ON DELETE SET NULL |
| approvedByActorId | text | ได้ | FK → users.id, ON DELETE SET NULL |
| approvedAt | timestamp(3) | ได้ | |
| createdAt/updatedAt | timestamp(3) | ไม่ | |

**Constraints/Indexes**: PK(id); UNIQUE(questionId, versionNo); INDEX(status);
FK ทั้งสาม (questionId RESTRICT, authorActorId/approvedByActorId SET NULL — ผู้ใช้ถูก
soft-delete ได้โดยไม่กระทบประวัติข้อสอบ)

**Trigger**: `question_versions_lock_after_draft_update`,
`question_versions_lock_after_draft_delete` — ปฏิเสธ UPDATE/DELETE เมื่อ
`OLD.status <> 'DRAFT'` **(ทดสอบจริงแล้วทั้ง UPDATE และ DELETE — ดูผลทดสอบด้านล่าง)**

**"เวอร์ชันปัจจุบัน" ของข้อสอบ = APPROVED ตัวล่าสุด** (query pattern เดียวกับแนวคิด
`Curriculum` ใน education-domain):
```sql
SELECT * FROM question_versions
WHERE "questionId" = :questionId AND status = 'APPROVED'
ORDER BY "versionNo" DESC LIMIT 1;
```

### ตาราง: `question_choices` (ล็อกผ่าน parent join)

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| questionVersionId | text | ไม่ | FK → question_versions.id |
| label | text | ไม่ | UNIQUE ร่วมกับ questionVersionId (เช่น "ก","ข","ค","ง") |
| content | text | ไม่ | เนื้อหาตัวเลือก |
| sortOrder | integer | ไม่ | ลำดับแสดงผล |
| createdAt/updatedAt | timestamp(3) | ไม่ | |

**Constraints/Indexes**: PK(id); UNIQUE(questionVersionId, label);
INDEX(questionVersionId); FK RESTRICT

**Trigger**: `question_choices_lock_after_parent_draft_update/delete` — `SELECT status
FROM question_versions WHERE id = OLD."questionVersionId"` แล้วปฏิเสธถ้า status ที่ได้
ไม่ใช่ DRAFT **(ทดสอบจริงแล้ว)**

### ตาราง: `answer_keys` (ล็อกผ่าน parent join)

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| questionVersionId | text | ไม่ | FK → question_versions.id, UNIQUE (1:1) |
| correctChoiceId | text | ได้ | FK → question_choices.id — ใช้สำหรับข้อสอบปรนัย |
| modelAnswer | text | ได้ | ใช้สำหรับข้อสอบอัตนัย |
| scoringGuide | text | ได้ | เกณฑ์การให้คะแนนอัตนัย |
| createdAt/updatedAt | timestamp(3) | ไม่ | |

**Constraints/Indexes**: PK(id); UNIQUE(questionVersionId) — เฉลยหนึ่งชุดต่อหนึ่งเวอร์ชัน
ข้อสอบ; FK ทั้งสอง RESTRICT

**Trigger**: `answer_keys_lock_after_parent_draft_update/delete` — pattern เดียวกับ
`question_choices` **(ทดสอบจริงแล้ว)**

### ตาราง: `documents` (identity)

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| title | text | ไม่ | |
| documentType | document_type | ไม่ | |
| createdAt/updatedAt/deletedAt | timestamp(3) | ไม่/ไม่/ได้ | soft delete |

**Constraints/Indexes**: PK(id); INDEX(documentType)

### ตาราง: `document_categories` / `document_tags` (join tables)

โครงสร้างและเหตุผลเดียวกับ `question_categories`/`question_tags` ทุกประการ
(composite PK, INDEX ย้อนทาง, FK RESTRICT)

### ตาราง: `document_versions` (versioned content — conditional immutability)

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| documentId | text | ไม่ | FK → documents.id |
| versionNo | integer | ไม่ | UNIQUE ร่วมกับ documentId |
| fileKey | text | ได้ | **placeholder — ยังไม่เชื่อม object storage จริง (M8)** |
| fileName | text | ได้ | placeholder |
| mimeType | text | ได้ | placeholder |
| fileSize | integer | ได้ | placeholder |
| status | approval_status | ไม่ | default DRAFT |
| authorActorId / approvedByActorId | text | ได้ | FK → users.id, SET NULL |
| approvedAt | timestamp(3) | ได้ | |
| createdAt/updatedAt | timestamp(3) | ไม่ | |

**Constraints/Indexes**: PK(id); UNIQUE(documentId, versionNo); INDEX(status);
FK ทั้งสาม (documentId RESTRICT, actor คู่ SET NULL)

**Trigger**: `document_versions_lock_after_draft_update/delete` — pattern เดียวกับ
`question_versions` **(ทดสอบจริงแล้ว รวมถึงการเปลี่ยนสถานะ DRAFT→APPROVED สำเร็จ แล้ว
ถูกล็อกทันทีในการแก้ไขครั้งถัดไป)**

### ตาราง: `exam_sets` (versioned/lockable — จุดค้นหาหลักสูตร/ชั้น/ปี/วิชา)

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| curriculumLevelSubjectId | text | ไม่ | FK → curriculum_level_subjects.id |
| examSessionId | text | ได้ | FK → exam_sessions.id, ON DELETE SET NULL — null สำหรับชุดฝึกซ้อม/คลังส่วนกลาง |
| name | text | ไม่ | |
| status | approval_status | ไม่ | default DRAFT |
| authorActorId / approvedByActorId | text | ได้ | FK → users.id, SET NULL |
| approvedAt | timestamp(3) | ได้ | |
| createdAt/updatedAt/deletedAt | timestamp(3) | ไม่/ไม่/ได้ | soft delete |

**Constraints/Indexes**: PK(id); **INDEX(curriculumLevelSubjectId)**,
**INDEX(examSessionId)**, INDEX(status); FK ทั้งสี่

**การค้นหา "ตามหลักสูตร/ชั้น/ปี/วิชา" (ตามวิธีตรวจสอบของงานนี้)**:
```sql
-- ตามหลักสูตร+ชั้น+วิชา (ใช้ curriculumLevelSubjectId โดยตรง)
SELECT es.* FROM exam_sets es
JOIN curriculum_level_subjects cls ON cls.id = es."curriculumLevelSubjectId"
WHERE cls."curriculumId" = :curriculumId
  AND cls."levelId" = :levelId
  AND cls."subjectId" = :subjectId;

-- ตามปีการศึกษา (ผ่าน exam_sessions ที่ผูกไว้ — เฉพาะชุดที่ใช้สอบจริง)
SELECT es.* FROM exam_sets es
JOIN exam_sessions sess ON sess.id = es."examSessionId"
JOIN academic_years ay ON ay.id = sess."academicYearId"
WHERE ay."yearBE" = :yearBE;
```
**ทดสอบจริงแล้วทั้ง 3 รูปแบบ** (หลักสูตร+ชั้น+วิชา / ปี / ทั้งสี่เงื่อนไขรวมกัน) และยืนยัน
ด้วย `EXPLAIN` ว่า Postgres เลือกใช้ `exam_sets_curriculumLevelSubjectId_idx` จริง
(Bitmap Index Scan) ไม่ใช่ Seq Scan — ดูผลทดสอบด้านล่าง

**Trigger**: `exam_sets_lock_after_draft_update/delete` — pattern เดียวกับ
`question_versions`/`document_versions` **(ทดสอบจริงแล้ว)**

### ตาราง: `exam_set_items` (ล็อกผ่าน parent join)

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| examSetId | text | ไม่ | FK → exam_sets.id |
| questionVersionId | text | ไม่ | FK → question_versions.id — **เจาะจงเวอร์ชัน ไม่ใช่ question เฉยๆ** |
| sortOrder | integer | ไม่ | UNIQUE ร่วมกับ examSetId — ลำดับข้อในชุด |
| score | integer | ได้ | คะแนนของข้อนี้ในชุดนี้ (อาจต่างจากชุดอื่น) |
| createdAt | timestamp(3) | ไม่ | |

**Constraints/Indexes**: PK(id); UNIQUE(examSetId, sortOrder); INDEX(examSetId);
INDEX(questionVersionId) — รองรับ query ย้อนทาง "ข้อสอบเวอร์ชันนี้ถูกใช้ในชุดใดบ้าง";
FK ทั้งสอง RESTRICT

**Trigger**: `exam_set_items_lock_after_parent_draft_update/delete` —
`SELECT status FROM exam_sets WHERE id = OLD."examSetId"` แล้วปฏิเสธถ้าไม่ใช่ DRAFT
**(ทดสอบจริงแล้ว)**

## ข้อจำกัดที่ทราบและยอมรับ (Known Limitations)

1. **ไม่มี DB constraint บังคับว่า `AnswerKey.correctChoiceId` ต้องเป็นตัวเลือกที่ผูกกับ
   `QuestionVersion` เดียวกันกับ `AnswerKey` เอง** (เช่น กันไม่ให้เผลออ้าง choice ของ
   version อื่น) — Postgres ไม่รองรับ multi-column FK ข้ามสองคอลัมน์ที่ต้องมาจากแถวเดียวกัน
   แบบนี้โดยตรงโดยไม่เพิ่มความซับซ้อนเกินจำเป็น จึงตรวจที่ application layer แทน
   (ดู Function Specification ข้อ 3)
2. **ไม่มี business-rule constraint ว่าข้อสอบปรนัยต้องมีอย่างน้อย 2 ตัวเลือก หรือ
   AnswerKey ต้องมีก่อนส่งเข้า workflow อนุมัติ** — ตรวจที่ application layer ตอน submit
   (transition DRAFT → PENDING_REVIEW) ไม่ใช่ DB constraint เพราะกฎอาจเปลี่ยนได้ตาม
   ประเภทข้อสอบในอนาคตโดยไม่ต้อง migrate schema
3. **`ExamSetItem` ไม่มี constraint ป้องกันคะแนนรวมของชุดเกิน `maxScore` ของ
   `curriculum_level_subjects`** — เป็นการตรวจเชิงธุรกิจข้าม 2 ตารางที่ปล่อยให้ทำที่
   application layer
4. **การอัปโหลด/จัดเก็บไฟล์จริงยังไม่ implement** ตามขอบเขตที่ระบุ (M8 —
   `DocumentVersion.fileKey` เป็นเพียง placeholder) และ**สิทธิ์การเข้าถึงเฉลยแบบเข้มงวด
   กว่าตัวข้อสอบ**ยังไม่ implement (เป็นงานของ Auth/RBAC phase)
5. Prisma Client ยังไม่เคย generate ได้จริงในสภาพแวดล้อมนี้ (ปัญหาเดิม — ดู
   `prisma/MIGRATIONS.md`) — schema/migration นี้ผ่านการทดสอบจริงกับ PostgreSQL แล้ว
   ผ่าน raw SQL เท่านั้น (harness: `prisma/dev-migrate-verify.mjs`,
   `prisma/test-exam-document-domain.mjs`)

## คำสั่ง/การทดสอบที่รันจริง พร้อมผล

```
$ node prisma/dev-migrate-verify.mjs
Applying 1 pending migration(s):
  [PASSED] applied 20260923143443_exam_document_domain
All pending migrations: PASSED

$ node prisma/dev-migrate-verify.mjs --reset
--reset: dropping and recreating public schema...
  [PASSED] schema reset
Replaying 6 migration(s) from scratch:
  [PASSED] applied 20260914100207_init
  [PASSED] applied 20260914100307_add_user_phone
  [PASSED] applied 20260914100407_rollback_add_user_phone
  [PASSED] applied 20260923135937_sangha_org_domain
  [PASSED] applied 20260923141654_education_domain
  [PASSED] applied 20260923143443_exam_document_domain
Reset + full replay: PASSED

$ node prisma/test-exam-document-domain.mjs
  [PASSED] search exam_sets by curriculum+level+subject returns both seeded sets
  [PASSED] search exam_sets by academic year (2568 BE) returns exactly the official set
  [PASSED] combined curriculum+level+subject+year search returns both sets
  [PASSED] all 4 search-path indexes exist and are valid (pg_index.indisvalid)
  [PASSED] exam_sets has curriculumLevelSubjectId, examSessionId, status indexes
  [PASSED] questions has subjectId+levelId composite index
  [PASSED] DRAFT question_version can be edited freely
  [PASSED] APPROVED question_version blocks UPDATE
  [PASSED] APPROVED question_version blocks DELETE
  [PASSED] question_choice under APPROVED parent blocks UPDATE
  [PASSED] answer_key under APPROVED parent blocks UPDATE
  [PASSED] DRAFT exam_set can be edited freely
  [PASSED] APPROVED exam_set blocks UPDATE
  [PASSED] exam_set_item under APPROVED parent blocks UPDATE
  [PASSED] document_version DRAFT -> APPROVED transition succeeds
  [PASSED] document_version now APPROVED blocks further UPDATE
  [PASSED] new version row can be inserted for a question with a locked v1
  [PASSED] duplicate (questionId, versionNo) rejected by unique constraint
  [PASSED] duplicate (documentId, versionNo) rejected by unique constraint
  [PASSED] exam_set with invalid curriculumLevelSubjectId rejected by FK
  [PASSED] duplicate (examSetId, sortOrder) rejected by unique constraint
  [PASSED] categories.code allows multiple NULLs
  [PASSED] categories.code rejects duplicate non-null code

23 passed, 0 failed
```

`EXPLAIN` บนคำค้น `WHERE "curriculumLevelSubjectId" = 'cls_nt_tri_dhammavibhaga'`
ยืนยันว่า Postgres เลือกใช้ index จริง (ไม่ใช่แค่มี index เฉยๆ):
```
Bitmap Heap Scan on exam_sets  (cost=4.16..9.50 rows=2 width=228)
  Recheck Cond: ("curriculumLevelSubjectId" = 'cls_nt_tri_dhammavibhaga'::text)
  ->  Bitmap Index Scan on "exam_sets_curriculumLevelSubjectId_idx"  (cost=0.00..4.16 rows=2 width=0)
        Index Cond: ("curriculumLevelSubjectId" = 'cls_nt_tri_dhammavibhaga'::text)
```

หลังทดสอบ ได้รัน `node prisma/dev-migrate-verify.mjs --reset` อีกครั้งเพื่อคืนฐานข้อมูล
ให้อยู่ในสภาพ seed data สะอาด (ไม่เหลือแถวทดสอบเฉพาะกิจ เช่น `qv_dhammavibhaga_001_v2`,
`cat_no_code_1/2`) — ตรงตาม convention เดิมของโปรเจกต์

## ปัญหาที่พบระหว่างทดสอบ

ไม่พบปัญหา — schema/migration/trigger ทั้งหมดผ่านการทดสอบสำเร็จตั้งแต่รอบแรกที่รัน
(ทั้ง apply-pending, reset+replay จาก 0 ถึง 6 migrations, และ functional test 23 เคส)

## Function Specification — Operation หลัก

### 1. สร้างข้อสอบใหม่ (Draft Question)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Question Author (ผู้แต่งข้อสอบ), Central Officer, Super Admin |
| Input | subjectId, levelId, questionType, content (เนื้อหาเวอร์ชันแรก), choices[]? (ถ้าปรนัย) |
| Process | (1) เริ่ม transaction (2) ตรวจ subjectId/levelId มีอยู่จริง (3) INSERT questions (4) INSERT question_versions (versionNo=1, status=DRAFT, authorActorId=actor) (5) ถ้าปรนัย: INSERT question_choices ทุกตัวเลือก (6) เขียน AuditLog (7) commit |
| Output | Question + QuestionVersion (v1, DRAFT) + QuestionChoice[] (ถ้ามี) |
| Permission | Question Author ขึ้นไป (deny-by-default — ผู้ใช้ทั่วไปสร้างไม่ได้) |
| Validation | (a) subjectId/levelId ต้องมีอยู่จริง (b) ถ้า questionType=MULTIPLE_CHOICE ต้องมี choices อย่างน้อย 2 ตัว (ตรวจที่ application layer) |
| Error State | 400 หาก subjectId/levelId ไม่มีอยู่จริง หรือปรนัยที่มี choices ไม่ครบ; transaction rollback ทั้งหมดหากขั้นตอนใดล้มเหลว |
| Audit | AuditLog entityType="Question", action=CREATE, after=snapshot ของ question+version+choices |
| Acceptance Criteria | AC1: สร้างข้อสอบสำเร็จพร้อมเวอร์ชันแรกสถานะ DRAFT ในธุรกรรมเดียว (ทดสอบจริงแล้วผ่าน seed data); AC2: แก้ไข content/choices ของเวอร์ชัน DRAFT ได้อิสระ (ทดสอบจริงแล้ว) |

### 2. ส่งข้อสอบเข้า workflow อนุมัติ (Submit Question Version for Review)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Question Author |
| Input | questionVersionId |
| Process | (1) ตรวจว่า version ปัจจุบัน status=DRAFT และ (ถ้าปรนัย) มี answer_keys ที่ correctChoiceId ไม่ null แล้ว (2) UPDATE status=PENDING_REVIEW (3) เขียน AuditLog — **หลังขั้นตอนนี้ DB trigger จะล็อกแถวนี้ถาวรทันที** |
| Output | QuestionVersion (status=PENDING_REVIEW, ล็อกแล้ว) |
| Permission | Question Author ของ version นั้นเท่านั้น (server-side ownership check) |
| Validation | (a) status ปัจจุบันต้องเป็น DRAFT เท่านั้น (ป้องกัน submit ซ้ำ) (b) ถ้าปรนัย ต้องมี AnswerKey ที่ระบุ correctChoiceId แล้ว |
| Error State | 409 หาก status ไม่ใช่ DRAFT อยู่แล้ว; 400 หากปรนัยแต่ยังไม่มีเฉลย |
| Audit | AuditLog entityType="QuestionVersion", action=UPDATE, before/after status |
| Acceptance Criteria | AC1: ส่งสำเร็จเมื่อ DRAFT และมีเฉลยครบ; AC2: หลังส่งแล้ว UPDATE/DELETE เนื้อหา/ตัวเลือก/เฉลยของ version นี้ถูกปฏิเสธทันทีที่ระดับ DB (ทดสอบจริงแล้ว — ทั้ง question_versions, question_choices, answer_keys); AC3: แก้ไขต่อ = ต้อง insert version ใหม่ (versionNo+1) เท่านั้น (ทดสอบจริงแล้ว — สร้าง v2 ให้ question ที่ v1 ถูกล็อกสำเร็จ) |

### 3. อนุมัติ/ปฏิเสธข้อสอบ (Approve / Reject Question Version)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Exam Committee (กรรมการออกข้อสอบ), Central Officer, Super Admin |
| Input | questionVersionId, decision (APPROVED/REJECTED), approvedByActorId (= actor) |
| Process | (1) ตรวจ status ปัจจุบัน = PENDING_REVIEW (2) UPDATE status ตาม decision, approvedByActorId, approvedAt=now() (3) เขียน AuditLog |
| Output | QuestionVersion (status=APPROVED หรือ REJECTED) |
| Permission | เฉพาะ Exam Committee ขึ้นไป — Question Author เดิม**ไม่มีสิทธิ์อนุมัติงานตัวเอง** (segregation of duties) |
| Validation | (a) status ปัจจุบันต้องเป็น PENDING_REVIEW (b) actor ที่อนุมัติต้องไม่ใช่ authorActorId เดียวกัน (ตรวจที่ application layer) |
| Error State | 409 หาก status ไม่ใช่ PENDING_REVIEW; 403 หากผู้อนุมัติเป็นคนเดียวกับผู้แต่ง |
| Audit | AuditLog entityType="QuestionVersion", action=UPDATE, before/after (status, approvedByActorId, approvedAt) |
| Acceptance Criteria | AC1: เปลี่ยนสถานะสำเร็จเมื่อเป็น PENDING_REVIEW; AC2: แถวยังคงถูกล็อกต่อไปหลังอนุมัติ/ปฏิเสธ (สถานะยังคง ≠ DRAFT — trigger เดิมยังทำงาน, ทดสอบจริงแล้วโดยอ้อมผ่านการทดสอบ transition DRAFT→APPROVED ของ document_versions ซึ่งใช้ trigger เดียวกัน) |

### 4. ประกอบชุดข้อสอบ (Assemble Exam Set)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Exam Committee, Central Officer, Super Admin |
| Input | curriculumLevelSubjectId, examSessionId?, name, items: (questionVersionId, sortOrder, score)[] |
| Process | (1) เริ่ม transaction (2) ตรวจ curriculumLevelSubjectId มีอยู่จริง และ (ถ้าระบุ examSessionId) curriculumId ของ session ตรงกับ curriculum ของ curriculumLevelSubjectId ที่ระบุ (3) INSERT exam_sets (status=DRAFT) (4) ตรวจทุก questionVersionId ที่จะใส่มีสถานะ = APPROVED (5) INSERT exam_set_items ทุกแถว (6) เขียน AuditLog (7) commit |
| Output | ExamSet (DRAFT) + ExamSetItem[] |
| Permission | Exam Committee ขึ้นไป |
| Validation | (a) curriculumLevelSubjectId ต้องมีอยู่จริง (b) ถ้าระบุ examSessionId, curriculum ต้องตรงกัน (c) ทุก questionVersionId ที่ใส่ต้องมีสถานะ APPROVED เท่านั้น (ป้องกันใส่ข้อสอบที่ยังไม่ผ่านอนุมัติเข้าชุดจริง) (d) sortOrder ไม่ซ้ำกันภายในชุด |
| Error State | 400 หาก curriculum ไม่ตรงกัน หรือมี questionVersion ที่ไม่ใช่ APPROVED; 409 หาก sortOrder ซ้ำ; rollback ทั้งหมดหากขั้นตอนใดล้มเหลว |
| Audit | AuditLog entityType="ExamSet", action=CREATE, after=snapshot ของชุด+รายการข้อทั้งหมด |
| Acceptance Criteria | AC1: ประกอบชุดสำเร็จพร้อมรายการข้อครบในธุรกรรมเดียว (ทดสอบจริงแล้วผ่าน seed data); AC2: ค้นชุดที่สร้างแล้วได้ตามหลักสูตร/ชั้น/วิชา และตามปี (ถ้าผูก session) ทันที (ทดสอบจริงแล้ว — ดูผลทดสอบด้านบน) |

### 5. ประกาศใช้ชุดข้อสอบ (Approve Exam Set — lock)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Central Officer, Super Admin |
| Input | examSetId |
| Process | (1) ตรวจ status ปัจจุบัน = DRAFT และมี exam_set_items อย่างน้อย 1 รายการ (2) UPDATE status=APPROVED, approvedByActorId, approvedAt (3) เขียน AuditLog — **หลังขั้นตอนนี้ DB trigger ล็อกทั้งชุดและรายการข้อในชุดถาวรทันที** |
| Output | ExamSet (status=APPROVED, ล็อกแล้วทั้งชุดและ exam_set_items ทุกแถว) |
| Permission | เฉพาะ Central Officer/Super Admin (แยกจากผู้ประกอบชุด — segregation of duties) |
| Validation | (a) status ปัจจุบันต้องเป็น DRAFT (b) ต้องมีอย่างน้อย 1 รายการข้อสอบในชุด |
| Error State | 409 หาก status ไม่ใช่ DRAFT; 400 หากชุดว่างเปล่า |
| Audit | AuditLog entityType="ExamSet", action=UPDATE, before/after status |
| Acceptance Criteria | AC1: ประกาศใช้สำเร็จเมื่อเป็น DRAFT และมีรายการข้อ; AC2: หลังประกาศใช้แล้ว แก้ไข/ลบชุดหรือรายการข้อในชุดถูกปฏิเสธทันทีที่ระดับ DB (ทดสอบจริงแล้ว — ทั้ง exam_sets และ exam_set_items ผ่าน parent-join trigger) |

### 6. ค้นหาข้อสอบ/ชุดข้อสอบตามหลักสูตร/ชั้น/ปี/วิชา (Search)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Question Author, Exam Committee, Central Officer, Super Admin (ผลลัพธ์ที่เห็นอาจต่างกันตามสิทธิ์ — เช่น เฉลยเห็นได้เฉพาะ Exam Committee ขึ้นไป เป็นงานของ Auth/RBAC phase) |
| Input | filter: curriculumId?, levelId?, subjectId?, yearBE?, status? (อย่างน้อยหนึ่งเงื่อนไข) |
| Process | (1) ประกอบ SQL query ตาม filter ที่ระบุ (join exam_sets → curriculum_level_subjects และ/หรือ exam_sessions → academic_years ตามที่ต้องการ) (2) รันผ่าน index ที่เตรียมไว้ (3) คืนผลลัพธ์แบบแบ่งหน้า |
| Output | ExamSet[] (พร้อม curriculum/level/subject/year ที่ join มา) |
| Permission | ทุกบทบาทที่ล็อกอินแล้ว เห็นตามสิทธิ์ (ไม่มี anonymous access) |
| Validation | ต้องระบุอย่างน้อย 1 filter (ป้องกัน full table scan โดยไม่จำเป็น) |
| Error State | 400 หากไม่ระบุ filter ใดเลย |
| Audit | ไม่ต้องเขียน AuditLog (read-only operation) |
| Acceptance Criteria | AC1: ค้นตามหลักสูตร/ชั้น/วิชาได้ผ่าน curriculumLevelSubjectId เดียว (ทดสอบจริงแล้ว); AC2: ค้นตามปีได้ผ่าน examSessionId→academicYearId (ทดสอบจริงแล้ว); AC3: ค้นรวมทุกเงื่อนไขพร้อมกันได้ในคำสั่งเดียว (ทดสอบจริงแล้ว); AC4: Postgres เลือกใช้ index ที่เตรียมไว้จริง ไม่ใช่ full table scan เมื่อข้อมูลมีปริมาณมากขึ้น (ยืนยันด้วย EXPLAIN — ดูผลทดสอบด้านบน) |
