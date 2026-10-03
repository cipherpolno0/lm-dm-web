# ERD — Organizations, Hierarchy, Positions, Appointments, Contacts, Addresses (P2)

Phase: P2 Database & Sangha Domain — ขอบเขต: organizations, hierarchy, positions,
appointments, contacts, addresses, organization status และ history เท่านั้น
(ไม่รวมทะเบียนพระภิกษุ/สามเณรฉบับเต็ม — ดูเหตุผลใน `data-dictionary.md` หัวข้อ "ขอบเขตและ
สิ่งที่ตั้งใจไม่รวม")

ตารางจากเฟส P1 (`users`, `audit_logs`) แสดงไว้แบบย่อเพื่อให้เห็นจุดเชื่อมกับตารางใหม่เท่านั้น
รายละเอียดเต็มของตารางเหล่านั้นอยู่ใน `prisma/schema.prisma` (คอมเมนต์) และเอกสารเฟส P1

```mermaid
erDiagram
    USERS ||--o{ ORGANIZATION_STATUS_HISTORY : "recorded by (optional)"

    ORGANIZATIONS ||--o{ ORGANIZATIONS : "parent / children"
    ORGANIZATIONS ||--o{ ORGANIZATION_STATUS_HISTORY : "has status history"
    ORGANIZATIONS ||--o{ ADDRESSES : "has addresses"
    ORGANIZATIONS ||--o{ CONTACTS : "has contacts"
    ORGANIZATIONS ||--o{ APPOINTMENTS : "hosts appointment"
    ORGANIZATIONS ||--o{ APPOINTMENTS : "issues appointment (optional)"
    ORGANIZATION_HIERARCHY_RULES }o--|| ORGANIZATIONS : "validates (type, parentId) via trigger, not FK"

    POSITIONS ||--o{ APPOINTMENTS : "defines role for"
    PERSONS ||--o{ APPOINTMENTS : "holds"

    USERS {
        string id PK
        string email UK
        string name
        enum role
        enum status
        datetime deletedAt "soft delete"
    }

    ORGANIZATIONS {
        string id PK
        string code UK "nullable, partial unique"
        enum type "organization_type"
        string name
        string nameEn
        string parentId FK "self-reference, nullable"
        enum status "organization_status, denormalized current value"
        datetime establishedDate
        datetime dissolvedDate
        datetime deletedAt "soft delete, mistaken-entry only"
    }

    ORGANIZATION_HIERARCHY_RULES {
        string id PK
        enum childType "organization_type"
        enum parentType "organization_type, nullable = root allowed"
        string notes
    }

    ORGANIZATION_STATUS_HISTORY {
        string id PK
        string organizationId FK
        enum status "organization_status"
        datetime effectiveFrom "UK with organizationId"
        string reason
        string documentRef
        string recordedByActorId FK "nullable, -> users.id"
        note "append-only: DB trigger blocks UPDATE/DELETE"
    }

    ADDRESSES {
        string id PK
        string organizationId FK
        enum addressType "MAIN / MAILING / OTHER"
        string province
        string district
        string subDistrict
        boolean isCurrent "partial unique per (org, type) where true"
        datetime deletedAt "soft delete"
    }

    CONTACTS {
        string id PK
        string organizationId FK
        enum type "PHONE / EMAIL / etc."
        string value
        boolean isPrimary
        datetime deletedAt "soft delete"
    }

    POSITIONS {
        string id PK
        string code UK
        string title
        enum applicableOrgType "organization_type, nullable, advisory"
        boolean isUniquePerOrganization
        boolean isActive
    }

    PERSONS {
        string id PK
        string referenceCode UK "nullable — stub only, not full registry"
        string prefix
        string fullName
        note "MINIMAL STUB — full monk/novice registry is a future task"
    }

    APPOINTMENTS {
        string id PK
        string organizationId FK
        string positionId FK
        string personId FK
        string appointingOrganizationId FK "nullable, self-relation target = organizations"
        datetime startDate "UK with org+position+person"
        datetime endDate "nullable = currently active"
        enum status "appointment_status"
        string documentRef
        datetime deletedAt "soft delete, mistaken-entry only — normal end = endDate+status"
    }
```

## หมายเหตุการอ่านแผนภาพ

- เส้น `ORGANIZATIONS ||--o{ ORGANIZATIONS` คือความสัมพันธ์ parent/child แบบ self-reference
  หนึ่งเดียว ใช้ทั้งสำหรับ "หน่วยงานแม่" (parent) และ "หน่วยงานลูก" (children)
- `ORGANIZATION_HIERARCHY_RULES` ไม่มี FK จริงไปยัง `ORGANIZATIONS` (เป็นตาราง
  reference/lookup ที่ใช้ enum value เทียบ ไม่ใช่ FK ไปยังแถวจริง) แต่ถูกใช้โดย DB
  trigger บนตาราง `organizations` เพื่อตรวจสอบทุกครั้งที่ insert/update `type` หรือ
  `parentId` — เส้นในแผนภาพนี้แสดงความสัมพันธ์เชิงตรรกะ (validates) ไม่ใช่ FK
- `APPOINTMENTS` มี FK ไปยัง `ORGANIZATIONS` สองเส้นคนละความหมาย: `organizationId`
  (หน่วยงานที่ไปดำรงตำแหน่ง) และ `appointingOrganizationId` (หน่วยงานที่ออกคำสั่งแต่งตั้ง
  — nullable, อาจเป็นคนละหน่วยงานกัน)
- ตารางที่มี "append-only" ในหมายเหตุ (`ORGANIZATION_STATUS_HISTORY`) ถูกบังคับด้วย DB
  trigger ห้าม UPDATE/DELETE จริง (ทดสอบแล้ว — ดู `prisma/MIGRATIONS.md`) เช่นเดียวกับ
  `audit_logs` ในเฟส P1
