# Data Dictionary — P2 Database & Sangha Domain

Phase: P2 Database & Sangha Domain (ออกแบบฐานข้อมูลคณะสงฆ์)
ขอบเขตตามที่ระบุ: **organizations, hierarchy, positions, appointments, contacts,
addresses, organization status และ history**

ดูแผนภาพ ER แบบเต็มใน `prisma/erd.md` และ schema.prisma ที่ implement จริงใน
`prisma/schema.prisma` — เอกสารนี้อธิบายทุกตาราง/คอลัมน์/constraint พร้อมเหตุผลการ
ออกแบบ และ function specification ของ operation หลักตามรูปแบบที่โครงการกำหนด
(Actor/Input/Process/Output/Permission/Validation/Error State/Audit/Acceptance Criteria)

## ขอบเขตและสิ่งที่ตั้งใจไม่รวม (Out of Scope)

รายละเอียดงานที่ระบุคือ "organizations, hierarchy, positions, appointments, contacts,
addresses, organization status และ history" เท่านั้น ซึ่งเป็นส่วน **โครงสร้างองค์กร/
สายการปกครอง** ของโมดูล M1 (ทะเบียนคณะสงฆ์ ตาม requirements.md) — เอกสารนี้จึง **ไม่รวม**:

- ทะเบียนพระภิกษุ/สามเณรฉบับเต็ม (ประวัติการบวช, สังกัดเดิม, การศึกษา, การย้ายวัด,
  รูปถ่าย, เลขบัตรประชาชน ฯลฯ) — ตาราง `Person` ในเฟสนี้เป็นเพียง **stub ขั้นต่ำสุด**
  (id, referenceCode, prefix, fullName) เพื่อให้ `Appointment` มี FK อ้างอิงได้เท่านั้น
  ทะเบียนฉบับเต็มต้องออกแบบแยกเป็นงานถัดไป และอาจต้อง migrate ตาราง `persons` นี้
  (เปลี่ยนชื่อ/เพิ่มคอลัมน์) เมื่อถึงเวลานั้น
- Auth.js / RBAC เต็มรูปแบบ (เป็นเฟส "Auth & RBAC Foundation" ตาม project-charter.md
  ข้อ 12) — Permission ที่ระบุในหัวข้อ Function Specification ด้านล่างเป็น **ข้อกำหนด
  เชิงออกแบบ** (design intent) สำหรับให้ทีม Auth นำไปผูกจริง ยังไม่มีการ enforce จริง
  ในโค้ดเฟสนี้ เพราะยังไม่มีระบบ login
- Catalog สมณศักดิ์/ยศตำแหน่งแบบเป็นทางการ (`Position.applicableOrgType`/`titleEn` เป็น
  ฟิลด์ advisory เท่านั้น)

## หลักการออกแบบสำคัญ (Key Design Decisions)

1. **สถานะปัจจุบัน vs ประวัติ แยกตาราง** (`Organization.status` vs
   `OrganizationStatusHistory`) — ตาม data-policy.md ข้อ 7 ("ค่าปัจจุบันอ่านเร็วจาก
   ตารางหลัก ส่วนประวัติอ่านจากตาราง history แยก") `OrganizationStatusHistory` เป็น
   **append-only แท้ๆ** (ไม่มีคอลัมน์ `effectiveTo` — คำนวณจาก `effectiveFrom` ของแถว
   ถัดไปตอน query แทน) และบังคับ immutable ด้วย DB trigger เดียวกับที่ใช้กับ `audit_logs`
   ในเฟส P1 (ทดสอบจริงแล้วว่าปฏิเสธ UPDATE/DELETE ทั้งคู่ — ดู `prisma/MIGRATIONS.md`)
2. **Hierarchy validation เป็นข้อมูล ไม่ hardcode ในโค้ด** — `OrganizationHierarchyRule`
   เป็นตาราง reference ที่บอกว่า (childType, parentType) คู่ใดถูกต้อง ใช้โดย DB trigger
   `organizations_validate_hierarchy()` ตรวจทุกครั้งที่ insert/update หน่วยงาน วิธีนี้
   ทำให้ปรับโครงสร้างการปกครองในอนาคตได้โดยแก้ข้อมูล ไม่ต้องออก schema migration ใหม่
3. **Address เป็น current-flag + insert แถวใหม่แทนการ overwrite** — เปลี่ยนที่อยู่ =
   ปิดแถวเก่า (`isCurrent = false`) แล้ว insert แถวใหม่ ไม่แก้ค่าที่อยู่ในแถวเดิม บังคับ
   "มีได้แค่ 1 แถวปัจจุบันต่อ (หน่วยงาน, ประเภทที่อยู่)" ด้วย partial unique index
4. **Contact เป็นตารางปกติที่แก้ไขในแถวเดิมได้** (ต่างจาก Address/StatusHistory) —
   เพราะการเปลี่ยนเบอร์โทร/อีเมลไม่ใช่ "ประวัติสำคัญ" ระดับเดียวกับสถานะหน่วยงานหรือที่อยู่
   ทางการ แต่ยังคงถูกจับด้วย `AuditLog` (generic, จากเฟส P1) เมื่อ application layer
   เขียน audit record ทุกครั้งที่แก้ไข ตาม dev-rules.md ข้อ 6
5. **Appointment คือประวัติในตัวเอง** — ปิดวาระ = update `endDate`/`status` ในแถวเดิม
   (ไม่ใช่ "overwrite ประวัติ" เพราะเป็นการปิดข้อเท็จจริงเดียวกัน ไม่ใช่ทำลายข้อมูลเก่า)
   การแต่งตั้งใหม่ = แถวใหม่เสมอ ไม่มีทางเขียนทับแถวเก่า (unique constraint ป้องกัน
   แถวซ้ำที่ระบุ org+position+person+startDate เดียวกัน)
6. **Soft delete สงวนไว้สำหรับบันทึกผิดพลาดเท่านั้น** — ทุกตารางหลักมี `deletedAt`
   ตาม data-policy.md ข้อ 7 แต่การ "ยุติ" ที่เป็นเหตุการณ์จริงทางธุรกิจ (หน่วยงานถูกยุบ,
   วาระหมด) ให้ใช้ status/endDate ไม่ใช้ soft-delete เพื่อไม่ให้ประวัติที่มีอยู่จริง
   หายไปจาก query ปกติโดยไม่ตั้งใจ

## Enum Reference

| Enum | ค่า | ใช้กับ |
|---|---|---|
| `organization_type` | MAHATHERASAMAKHOM, SANGHA_ZONE, SANGHA_REGION, SANGHA_PROVINCE, SANGHA_DISTRICT, SANGHA_SUBDISTRICT, TEMPLE, STUDY_INSTITUTE, EXAM_OFFICE | Organization.type, OrganizationHierarchyRule.childType/parentType, Position.applicableOrgType |
| `organization_status` | ACTIVE, INACTIVE, SUSPENDED, DISSOLVED, MERGED | Organization.status, OrganizationStatusHistory.status |
| `address_type` | MAIN, MAILING, OTHER | Address.addressType |
| `contact_type` | PHONE, MOBILE, FAX, EMAIL, WEBSITE, LINE, OTHER | Contact.type |
| `appointment_status` | ACTIVE, RESIGNED, REMOVED, TRANSFERRED, DECEASED, EXPIRED | Appointment.status |

## ตาราง: `organizations`

หน่วยงานในสายการปกครองคณะสงฆ์ทุกระดับ (แทนด้วยแถวเดียว โครงสร้างต้นไม้ผ่าน `parentId`
อ้างอิงตัวเอง)

| คอลัมน์ | ชนิด | Null ได้ | Default | คำอธิบาย |
|---|---|---|---|---|
| id | text | ไม่ | cuid() | PK |
| code | text | ได้ | — | รหัสทะเบียน — unique เฉพาะเมื่อไม่เป็น null (partial unique index) |
| type | organization_type | ไม่ | — | ประเภทหน่วยงาน |
| name | text | ไม่ | — | ชื่อ (ไทย) |
| nameEn | text | ได้ | — | ชื่อ (อังกฤษ) |
| parentId | text | ได้ | — | FK → organizations.id (self) — null = หน่วยงานระดับบนสุด |
| status | organization_status | ไม่ | ACTIVE | สถานะปัจจุบัน (denormalized จาก history ล่าสุด) |
| establishedDate | timestamp(3) | ได้ | — | วันที่ก่อตั้ง |
| dissolvedDate | timestamp(3) | ได้ | — | วันที่ยุบ (ถ้ามี) |
| createdAt | timestamp(3) | ไม่ | now() | |
| updatedAt | timestamp(3) | ไม่ | — | |
| deletedAt | timestamp(3) | ได้ | — | Soft delete — เฉพาะบันทึกผิดพลาด |

**Constraints/Indexes**: PK(id); UNIQUE partial (code) WHERE code IS NOT NULL;
INDEX(type); INDEX(parentId); INDEX(status); FK(parentId→organizations.id,
ON DELETE SET NULL, ON UPDATE CASCADE)

**Trigger**: `organizations_validate_hierarchy_trigger` (BEFORE INSERT/UPDATE OF
type, parentId) — เรียก `organizations_validate_hierarchy()` ซึ่งตรวจ:
1. ถ้า parentId เป็น NULL → ต้องมี rule ใน `organization_hierarchy_rules` ที่
   childType = ค่านี้ และ parentType IS NULL มิฉะนั้น RAISE EXCEPTION
2. ถ้า parentId ไม่ใช่ NULL → parentId ≠ id ของตัวเอง (กัน self-parent) และต้องมี
   rule ที่ childType/parentType ตรงกับ (type ของแถวนี้, type ของแถว parent) จริง

**ทดสอบจริงแล้ว** (ดู `prisma/MIGRATIONS.md`): สร้างสายหน่วยงานที่ถูกต้องครบ 7 ชั้น
(MAHATHERASAMAKHOM→...→TEMPLE) สำเร็จ; ปฏิเสธ TEMPLE ที่ parent เป็น SANGHA_PROVINCE
(ข้ามชั้น); ปฏิเสธ TEMPLE ที่ไม่มี parent; ปฏิเสธ self-parent; ปฏิเสธ code ซ้ำ

## ตาราง: `organization_hierarchy_rules`

ตาราง reference กำหนดคู่ (childType, parentType) ที่ถูกต้อง — ข้อมูล seed เริ่มต้น
(10 แถว) สร้างจากโครงสร้างการปกครองคณะสงฆ์ไทยโดยทั่วไป

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| childType | organization_type | ไม่ | ประเภทหน่วยงานลูก |
| parentType | organization_type | ได้ | ประเภทหน่วยงานแม่ — NULL = childType นี้เป็นระดับบนสุดได้ |
| notes | text | ได้ | คำอธิบายกฎ |
| createdAt | timestamp(3) | ไม่ | |

**Constraints**: PK(id); UNIQUE partial (childType) WHERE parentType IS NULL
(กัน rule "เป็นระดับบนสุด" ซ้ำสำหรับ type เดียวกัน); UNIQUE partial (childType,
parentType) WHERE parentType IS NOT NULL

**⚠️ ต้องให้ Owner/ผู้เชี่ยวชาญด้านการปกครองคณะสงฆ์ตรวจสอบ**: ชุด seed 10 แถวนี้เป็น
จุดเริ่มต้นที่สมเหตุสมผลตามความรู้ทั่วไปเรื่องโครงสร้างการปกครองคณะสงฆ์ไทย ไม่ใช่ชุดที่
ผ่านการยืนยันกับผู้เชี่ยวชาญ — ควรทบทวนก่อนผ่าน Real-data Readiness Gate (data-policy.md
ข้อ 4) เนื่องจากเป็น reference data (ไม่ใช่โครงสร้าง schema) จึงแก้ไข/เพิ่มแถวได้ภายหลัง
ด้วย DML ธรรมดา ไม่ต้อง migration schema ใหม่

Seed ปัจจุบัน:

| childType | parentType |
|---|---|
| MAHATHERASAMAKHOM | (ระดับบนสุด) |
| SANGHA_ZONE | MAHATHERASAMAKHOM |
| SANGHA_REGION | SANGHA_ZONE |
| SANGHA_PROVINCE | SANGHA_REGION |
| SANGHA_DISTRICT | SANGHA_PROVINCE |
| SANGHA_SUBDISTRICT | SANGHA_DISTRICT |
| TEMPLE | SANGHA_SUBDISTRICT |
| STUDY_INSTITUTE | TEMPLE |
| STUDY_INSTITUTE | SANGHA_PROVINCE |
| EXAM_OFFICE | MAHATHERASAMAKHOM |

## ตาราง: `organization_status_history`

ประวัติสถานะหน่วยงานแบบ append-only (ไม่มี `effectiveTo` — สถานะ ณ วันที่ X หาได้จาก
แถวที่มี `effectiveFrom` ล่าสุดที่ ≤ X)

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| organizationId | text | ไม่ | FK → organizations.id |
| status | organization_status | ไม่ | สถานะ ณ ช่วงเวลานี้ |
| effectiveFrom | timestamp(3) | ไม่ | วันที่มีผล — UNIQUE ร่วมกับ organizationId |
| reason | text | ได้ | เหตุผล |
| documentRef | text | ได้ | เลขที่คำสั่ง/ประกาศ |
| recordedByActorId | text | ได้ | FK → users.id — ผู้บันทึก (null ได้สำหรับ seed/migration) |
| createdAt | timestamp(3) | ไม่ | เวลาที่บันทึกจริงในระบบ (ต่างจาก effectiveFrom ซึ่งเป็นวันที่มีผลทางธุรกิจ) |

**Constraints/Indexes**: PK(id); UNIQUE(organizationId, effectiveFrom);
INDEX(organizationId); INDEX(recordedByActorId); FK(organizationId→organizations.id,
ON DELETE RESTRICT); FK(recordedByActorId→users.id, ON DELETE SET NULL)

**Trigger**: `organization_status_history_no_update` และ `..._no_delete` —
ปฏิเสธ UPDATE/DELETE ทุกกรณี (ทดสอบจริงแล้ว — ดู `prisma/MIGRATIONS.md`)

## ตาราง: `addresses`

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| organizationId | text | ไม่ | FK → organizations.id |
| addressType | address_type | ไม่ | MAIN / MAILING / OTHER |
| houseNo, moo, soi, road, subDistrict, district, province, postalCode | text | ได้ | ส่วนประกอบที่อยู่ |
| country | text | ไม่ | default 'ไทย' |
| isCurrent | boolean | ไม่ | default true |
| createdAt/updatedAt | timestamp(3) | ไม่ | |
| deletedAt | timestamp(3) | ได้ | Soft delete |

**Constraints/Indexes**: PK(id); INDEX(organizationId, addressType); UNIQUE
partial (organizationId, addressType) WHERE isCurrent = true AND deletedAt IS
NULL (กันมี "ที่อยู่ปัจจุบัน" ซ้ำต่อประเภทต่อหน่วยงาน); FK(organizationId→
organizations.id, ON DELETE RESTRICT)

**ทดสอบจริงแล้ว**: insert ที่อยู่ MAIN แถวแรกสำเร็จ, insert ที่อยู่ MAIN แถวที่สองขณะ
แถวแรกยัง isCurrent=true ถูกปฏิเสธ (duplicate key), ปิดแถวเก่า (isCurrent=false) แล้ว
insert แถวใหม่สำเร็จ

## ตาราง: `contacts`

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| organizationId | text | ไม่ | FK → organizations.id |
| type | contact_type | ไม่ | PHONE/MOBILE/FAX/EMAIL/WEBSITE/LINE/OTHER |
| value | text | ไม่ | ค่าที่ติดต่อ — ห้ามข้อมูลบุคคลจริงใน dev/test |
| label | text | ได้ | คำอธิบายเพิ่มเติม |
| isPrimary | boolean | ไม่ | default false |
| createdAt/updatedAt | timestamp(3) | ไม่ | |
| deletedAt | timestamp(3) | ได้ | Soft delete |

**Constraints/Indexes**: PK(id); INDEX(organizationId); FK(organizationId→
organizations.id, ON DELETE RESTRICT)

## ตาราง: `positions`

Catalog ตำแหน่ง/สมณศักดิ์ (master data — ไม่ผูกกับหน่วยงานใดหน่วยงานหนึ่งโดยเฉพาะ
ผูกผ่าน `Appointment` แทน)

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| code | text | ไม่ | รหัสตำแหน่ง — UNIQUE |
| title | text | ไม่ | ชื่อตำแหน่ง (ไทย) |
| titleEn | text | ได้ | ชื่อตำแหน่ง (อังกฤษ) |
| applicableOrgType | organization_type | ได้ | ประเภทหน่วยงานที่มักสังกัด — **advisory เท่านั้น ไม่บังคับด้วย DB** |
| rankLevel | integer | ได้ | ลำดับชั้นเชิงตัวเลข (ใช้จัดเรียง) |
| isUniquePerOrganization | boolean | ไม่ | default false — **บังคับที่ application layer เท่านั้น** |
| isActive | boolean | ไม่ | default true |
| createdAt/updatedAt | timestamp(3) | ไม่ | |
| deletedAt | timestamp(3) | ได้ | Soft delete |

**Constraints/Indexes**: PK(id); UNIQUE(code); INDEX(applicableOrgType)

## ตาราง: `persons` (STUB — ดูหัวข้อขอบเขต)

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| referenceCode | text | ได้ | UNIQUE — สำหรับเชื่อมทะเบียนฉบับเต็มในอนาคต |
| prefix | text | ได้ | คำนำหน้า (free text ในเฟสนี้) |
| fullName | text | ไม่ | ชื่อ-สกุล |
| createdAt/updatedAt | timestamp(3) | ไม่ | |
| deletedAt | timestamp(3) | ได้ | Soft delete |

**Constraints/Indexes**: PK(id); UNIQUE(referenceCode)

## ตาราง: `appointments`

| คอลัมน์ | ชนิด | Null ได้ | คำอธิบาย |
|---|---|---|---|
| id | text | ไม่ | PK |
| organizationId | text | ไม่ | FK → organizations.id — หน่วยงานที่ไปดำรงตำแหน่ง |
| positionId | text | ไม่ | FK → positions.id |
| personId | text | ไม่ | FK → persons.id |
| appointingOrganizationId | text | ได้ | FK → organizations.id — หน่วยงานที่ออกคำสั่ง (อาจต่างจาก organizationId) |
| startDate | timestamp(3) | ไม่ | วันที่เริ่มดำรงตำแหน่ง |
| endDate | timestamp(3) | ได้ | วันที่สิ้นสุด — NULL = ยังดำรงตำแหน่งอยู่ |
| status | appointment_status | ไม่ | default ACTIVE |
| documentRef | text | ได้ | เลขที่คำสั่งแต่งตั้ง |
| notes | text | ได้ | |
| createdAt/updatedAt | timestamp(3) | ไม่ | |
| deletedAt | timestamp(3) | ได้ | Soft delete — เฉพาะบันทึกผิดพลาด (การสิ้นสุดวาระปกติใช้ endDate+status) |

**Constraints/Indexes**: PK(id); UNIQUE(organizationId, positionId, personId,
startDate); INDEX(organizationId, positionId, status); INDEX(personId);
FK(organizationId→organizations.id, RESTRICT); FK(positionId→positions.id,
RESTRICT); FK(personId→persons.id, RESTRICT); FK(appointingOrganizationId→
organizations.id, SET NULL)

**ทดสอบจริงแล้ว**: สร้าง appointment สำเร็จ, ปฏิเสธแถวซ้ำ (org+position+person+
startDate เดียวกัน), ปฏิเสธ personId ที่ไม่มีอยู่จริง (FK violation), ปิดวาระด้วย
endDate+status สำเร็จ (mutable update ปกติ)

## ข้อจำกัดที่ทราบและยอมรับ (Known Limitations)

1. **`Position.isUniquePerOrganization` ไม่ได้บังคับด้วย DB constraint** — การ
   ตรวจสอบ "ตำแหน่งนี้มีผู้ดำรงพร้อมกันได้แค่ 1 คนต่อหน่วยงาน" (เช่น เจ้าอาวาส) ต้องทำที่
   application layer ภายใน transaction ตอนสร้าง Appointment ใหม่ (ตรวจว่าไม่มี
   appointment อื่นที่ status=ACTIVE สำหรับ org+position เดียวกันอยู่ก่อน) เหตุผล:
   partial unique index แบบ static ทำแบบมีเงื่อนไข "เฉพาะตำแหน่งที่ flag นี้เป็น true"
   ไม่ได้โดยตรงในระดับ schema (ต้องมี dynamic condition ข้าม table) — บันทึกเป็น
   Validation rule ใน Function Specification ด้านล่างแทน
2. **`Position.applicableOrgType` เป็น advisory ไม่บังคับ** — ไม่มี DB constraint กัน
   การสร้าง Appointment ที่ position กับ organization type ไม่ตรงกัน (เช่น เอา "เจ้าอาวาส"
   ไปผูกกับ SANGHA_PROVINCE) — เหตุผลเดียวกับข้อ 1 บังคับที่ application layer แทน
3. **Cycle detection ในลำดับชั้นตรวจเฉพาะ self-parent โดยตรง** ไม่ตรวจ cycle ที่ยาวกว่า
   1 ชั้น (เช่น A→B→C→A) — การตรวจ cycle เต็มรูปแบบต้องใช้ recursive CTE ซึ่งจะเพิ่ม
   ความซับซ้อนของ trigger มาก ในทางปฏิบัติ trigger การตรวจ (childType,parentType) ที่มี
   อยู่แล้วช่วยลดความเสี่ยงนี้ไปมาก (เพราะ cycle ข้าม level ที่ต่างกันจะถูก type-rule
   ปฏิเสธอยู่แล้ว) แต่ยังมีช่องโหว่ทางทฤษฎีสำหรับ 2 หน่วยงานที่ type เดียวกันหากในอนาคต
   มี rule ที่ type เป็น parent ของตัวเองได้ (ปัจจุบันไม่มี rule แบบนั้นในข้อมูล seed)
4. **`Person` เป็น stub** ตามที่ระบุในหัวข้อขอบเขต — ทะเบียนฉบับเต็มเป็นงานถัดไป
5. **Prisma Client ยังไม่เคย generate ได้จริง** ในสภาพแวดล้อมนี้ (ปัญหาเดิมจากเฟส P1 —
   ดู `prisma/MIGRATIONS.md`) — schema/migration นี้ผ่านการทดสอบจริงกับ PostgreSQL
   ผ่าน raw SQL แล้ว แต่ยังไม่ผ่าน Prisma schema-engine ตัวจริง

## Function Specification — Operation หลัก

### 1. สร้างหน่วยงานใหม่ (Create Organization)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Regional Admin (ระดับที่มีอำนาจเหนือหน่วยงานแม่ที่จะสังกัด), Central Officer, Super Admin |
| Input | type, name, nameEn?, parentId?, code?, establishedDate? |
| Process | (1) เริ่ม transaction (2) ตรวจ parentId (ถ้ามี) มีอยู่จริงและยังไม่ถูก soft-delete (3) INSERT ลง organizations — DB trigger ตรวจ (type, parentId) กับ organization_hierarchy_rules อัตโนมัติ (4) INSERT แถวแรกใน organization_status_history (status=ACTIVE, effectiveFrom=now หรือ establishedDate) (5) เขียน AuditLog (action=CREATE) (6) commit |
| Output | Organization record ที่สร้างสำเร็จ พร้อม id |
| Permission | ต้องมีสิทธิ์ปกครองในเขต parent (deny-by-default — Regional Admin สร้างได้เฉพาะในเขตตนและใต้บังคับบัญชา) |
| Validation | (a) parentId ต้องมีอยู่จริง ไม่ถูก soft-delete (b) (type, parent.type) ต้องผ่าน DB trigger (c) code ถ้าระบุต้องไม่ซ้ำ (d) name ห้ามว่าง |
| Error State | 400 หาก parentId ไม่มีอยู่จริง; 409 หาก DB trigger ปฏิเสธ hierarchy หรือ code ซ้ำ (unique violation); 403 หากไม่มีสิทธิ์ในเขต parent; transaction rollback ทั้งหมดหากขั้นตอนใดล้มเหลว (ไม่ปล่อยให้มี organization ที่ไม่มี status history แรกเริ่ม) |
| Audit | บันทึก AuditLog entityType="Organization", action=CREATE, after=snapshot ของแถวที่สร้าง |
| Acceptance Criteria | AC1: สร้างหน่วยงานที่ (type,parentType) ถูกต้องสำเร็จ และมีแถว organization_status_history แถวแรกเกิดขึ้นในธุรกรรมเดียวกัน; AC2: สร้างหน่วยงานที่ (type,parentType) ผิดกฎถูกปฏิเสธ ไม่มีข้อมูลค้างในฐานข้อมูล (ทดสอบจริงแล้วที่ระดับ DB — ดู `prisma/MIGRATIONS.md`) |

### 2. เปลี่ยนสถานะหน่วยงาน (Change Organization Status)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Regional Admin ของเขตนั้น, Central Officer, Super Admin |
| Input | organizationId, newStatus, effectiveFrom, reason?, documentRef? |
| Process | (1) เริ่ม transaction (2) ตรวจ organization มีอยู่จริง (3) INSERT แถวใหม่ใน organization_status_history (recordedByActorId=ผู้กระทำ) (4) UPDATE organizations.status = newStatus (5) เขียน AuditLog (action=UPDATE, before/after ของฟิลด์ status) (6) commit |
| Output | OrganizationStatusHistory แถวใหม่ + Organization.status ที่อัปเดตแล้ว |
| Permission | เฉพาะผู้มีอำนาจปกครองเหนือหน่วยงานนั้นหรือสูงกว่า (deny-by-default) |
| Validation | (a) effectiveFrom ต้องไม่ซ้ำกับแถวเดิมของหน่วยงานเดียวกัน (unique constraint) (b) ไม่อนุญาตให้ effectiveFrom ย้อนหลังก่อนแถวล่าสุดที่มีอยู่ (ป้องกันประวัติสับสนลำดับเวลา — ตรวจที่ application layer) |
| Error State | 404 หาก organization ไม่พบ; 409 หาก effectiveFrom ซ้ำ (unique violation) หรือ trigger ปฏิเสธการ UPDATE/DELETE บน history (ซึ่งไม่ควรเกิดขึ้นเพราะ flow นี้ insert เท่านั้น — เป็น defense-in-depth); 403 หากไม่มีสิทธิ์ |
| Audit | AuditLog entityType="Organization", action=UPDATE, before={status: เดิม}, after={status: ใหม่} — และตัวแถว organization_status_history เองก็เป็นบันทึกถาวรอยู่แล้ว |
| Acceptance Criteria | AC1: เปลี่ยนสถานะสำเร็จ มีแถว history ใหม่ และ Organization.status สอดคล้องกัน; AC2: การพยายามแก้ไข/ลบแถว history เดิมถูกปฏิเสธเสมอ (ทดสอบจริงแล้วที่ระดับ DB) |

### 3. แต่งตั้งดำรงตำแหน่ง (Create Appointment)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Regional Admin ของหน่วยงานที่ออกคำสั่ง, Central Officer, Super Admin |
| Input | organizationId, positionId, personId, startDate, appointingOrganizationId?, documentRef?, notes? |
| Process | (1) เริ่ม transaction (2) ตรวจ organization/position/person มีอยู่จริง (3) ถ้า position.isUniquePerOrganization=true → ตรวจว่าไม่มี appointment อื่นที่ status=ACTIVE สำหรับ (organizationId, positionId) นี้อยู่ก่อน (application-layer check — ดูข้อจำกัดที่ทราบข้อ 1) (4) INSERT appointments (5) เขียน AuditLog (6) commit |
| Output | Appointment record ใหม่ |
| Permission | เฉพาะผู้มีอำนาจของหน่วยงานที่ออกคำสั่งแต่งตั้ง |
| Validation | (a) unique(organizationId, positionId, personId, startDate) (b) ถ้า isUniquePerOrganization ต้องไม่มีผู้ดำรงตำแหน่งซ้ำที่ยัง ACTIVE (c) startDate ต้องไม่อยู่ในอดีตไกลเกินสมเหตุสมผล (business rule, application layer) |
| Error State | 404 หาก organization/position/person ไม่พบ (FK violation จะดักที่ DB เป็น defense-in-depth); 409 หากซ้ำแถวเดิม หรือ ละเมิด isUniquePerOrganization; 403 หากไม่มีสิทธิ์ |
| Audit | AuditLog entityType="Appointment", action=CREATE |
| Acceptance Criteria | AC1: แต่งตั้งสำเร็จเมื่อข้อมูลถูกต้องครบ; AC2: ปฏิเสธ personId ที่ไม่มีอยู่จริง (ทดสอบจริงแล้ว — FK violation); AC3: ปฏิเสธแถวซ้ำเป๊ะ (ทดสอบจริงแล้ว — unique violation) |

### 4. ปิดวาระการดำรงตำแหน่ง (Close Appointment)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Regional Admin ของหน่วยงานที่ออกคำสั่งเดิม, Central Officer, Super Admin |
| Input | appointmentId, endDate, newStatus (RESIGNED/REMOVED/TRANSFERRED/DECEASED/EXPIRED), notes? |
| Process | (1) เริ่ม transaction (2) ตรวจ appointment มีอยู่จริงและยัง status=ACTIVE (3) UPDATE endDate, status (4) เขียน AuditLog (before/after) (5) commit |
| Output | Appointment ที่อัปเดตแล้ว |
| Permission | เฉพาะผู้มีอำนาจของหน่วยงานที่เกี่ยวข้อง |
| Validation | (a) appointment ต้องยัง status=ACTIVE ก่อนปิด (ป้องกันปิดซ้ำ) (b) endDate ต้อง ≥ startDate |
| Error State | 404 หาก appointment ไม่พบ; 409 หาก status ปัจจุบันไม่ใช่ ACTIVE อยู่แล้ว; 400 หาก endDate < startDate |
| Audit | AuditLog entityType="Appointment", action=UPDATE, before={status:ACTIVE, endDate:null}, after={status:newStatus, endDate} |
| Acceptance Criteria | AC1: ปิดวาระสำเร็จเมื่อสถานะเดิมเป็น ACTIVE; AC2: ปฏิเสธการปิดวาระซ้ำ (ทดสอบจริงแล้วว่าคอลัมน์อัปเดตได้ปกติในระดับ DB — application-layer guard เป็นชั้นถัดไปที่ต้อง implement ในเฟส backend) |

### 5. อัปเดตที่อยู่หน่วยงาน (Update Organization Address)

| องค์ประกอบ | รายละเอียด |
|---|---|
| Actor | Regional Admin ของหน่วยงานนั้น, Central Officer, Super Admin |
| Input | organizationId, addressType, ที่อยู่ใหม่ทั้งหมด |
| Process | (1) เริ่ม transaction (2) UPDATE แถว address เดิมที่ isCurrent=true สำหรับ (organizationId, addressType) นี้ → isCurrent=false (3) INSERT แถวใหม่ isCurrent=true (4) เขียน AuditLog (5) commit — ลำดับ (2) ก่อน (3) จำเป็น เพราะ partial unique index จะปฏิเสธถ้า insert แถวใหม่ isCurrent=true ก่อนที่แถวเก่ายังเป็น true อยู่ |
| Output | Address แถวใหม่ (isCurrent=true) |
| Permission | เฉพาะผู้มีอำนาจของหน่วยงานนั้น |
| Validation | ต้องมีที่อยู่อย่างน้อย province หรือ district (business rule ระดับ application) |
| Error State | 409 หาก transaction ทำผิดลำดับจนละเมิด partial unique index (ทดสอบจริงแล้วว่า DB บังคับ constraint นี้จริง) |
| Audit | AuditLog entityType="Address", action=UPDATE (ปิดแถวเก่า) + action=CREATE (แถวใหม่) |
| Acceptance Criteria | AC1: อัปเดตที่อยู่สำเร็จ มีแถวเดียวที่ isCurrent=true ต่อ (org, addressType) เสมอ (ทดสอบจริงแล้วที่ระดับ DB) |
