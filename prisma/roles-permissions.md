# roles-permissions.md — RBAC + Scope-based Permission

**งาน:** ออกแบบ RBAC + Scope-based Permission
**Phase:** P3 Authentication & RBAC
**สถานะ:** ร่างสำหรับ Owner review — ออกแบบ + implement + ทดสอบจริงแล้ว (ดูหัวข้อ 7)
**อ้างอิงคู่กับ:** `requirements.md` §3/§4/§6, `dev-rules.md` ข้อ 4, `adr/0003-authjs-server-side-authorization.md`, `prisma/AUTH.md`

> ต่อยอดจากงาน "ติดตั้ง Auth.js และ Session" (เสร็จแล้ว) — งานนั้นให้เฉพาะ
> role-level deny-by-default (`requireRole()`) งานนี้เพิ่ม **scope-based**
> permission (ตรวจทั้ง role + module + action + ขอบเขตองค์กร/สายการศึกษา/ความ
> เป็นเจ้าของ) ตามที่ `requirements.md` §6 ระบุไว้ว่าจะทำให้เสร็จ "ใน P2 (Auth &
> RBAC Foundation)"

---

## 1. การเทียบชื่อบทบาท (Role Mapping) — ต้องแจ้ง Owner

โจทย์งานนี้ระบุบทบาทแบบทั่วไป: **Guest, Member, Teacher, Data Editor, Reviewer,
Admin, Super Admin** แต่ระบบมี `UserRole` enum ที่ implement จริงอยู่แล้วตั้งแต่
งาน P1/P3 ก่อนหน้า (ใช้ทั่วทั้งโปรเจกต์ รวม `prisma/AUTH.md`, seed data, ทุก
migration): `SUPER_ADMIN, CENTRAL_OFFICER, REGIONAL_ADMIN, REGISTRAR_STAFF,
TEACHER, EXAMINER, STUDENT, AUDITOR` — ซึ่งตรงกับ actor 8 รายใน `requirements.md`
§3 (เอกสาร P0 ที่ authoritative กว่าโจทย์งานทั่วไป)

**การตัดสินใจ (ในฐานะ Product Owner + Architect):** ใช้ `UserRole` enum เดิมเป็น
หลัก (ไม่เปลี่ยนชื่อ role ในฐานข้อมูล/โค้ดที่มีอยู่แล้ว) แล้วเทียบชื่อทั่วไปจาก
โจทย์เข้ากับ role จริงดังนี้:

| ชื่อทั่วไปในโจทย์ | Role จริงที่ใช้ | เหตุผล |
|---|---|---|
| Super Admin | `SUPER_ADMIN` | ตรงชื่อ/นิยามโดยตรง |
| Admin | `CENTRAL_OFFICER` | "เจ้าหน้าที่ส่วนกลาง" = ผู้ดูแลระดับปฏิบัติการทั่วระบบ ไม่ใช่สูงสุด (นั้นคือ Super Admin) |
| Reviewer | `EXAMINER` | "ผู้ตรวจข้อสอบ/กรรมการคุมสอบ" = ผู้ตรวจ/ทบทวนและบันทึกผล |
| Data Editor | `REGISTRAR_STAFF` | "เจ้าหน้าที่ธุรการ" = ผู้บันทึก/ปรับปรุงข้อมูลระดับปฏิบัติการ |
| Teacher | `TEACHER` | ตรงชื่อ/นิยามโดยตรง |
| Member | `STUDENT` | ผู้ใช้งานปลายทางระดับสมาชิกทั่วไปที่เข้าถึงเฉพาะข้อมูลของตน |
| Guest | *(ไม่ใช่ User row)* | ผู้เยี่ยมชมที่ไม่ได้ login — ไม่มีบัญชีในตาราง `users` เหมือนเดิมตั้งแต่ P1 |
| *(ไม่มีในโจทย์)* | `REGIONAL_ADMIN` | บทบาทที่โจทย์นี้เองระบุว่าต้องมี "+ organization scope" ต้องมี role ที่ scope แบบเขตปกครองจริง จึงคงไว้ |
| *(ไม่มีในโจทย์)* | `AUDITOR` | จำเป็นตาม NFR "Traceability"/read-only compliance access (`requirements.md` §5) — ไม่มีในโจทย์งานทั่วไปแต่ถูกใช้จริงในระบบตั้งแต่ auth ก่อนหน้านี้ |

**Owner ควรยืนยัน:** การตีความ "Admin" (ทั่วไป) = `CENTRAL_OFFICER` (ไม่ใช่
`SUPER_ADMIN`) และการคงไว้ซึ่ง `REGIONAL_ADMIN`/`AUDITOR` นอกเหนือรายชื่อในโจทย์
— หากไม่ตรงกับที่ตั้งใจไว้ สามารถแก้ mapping ในเอกสารนี้และ `src/lib/permissions.ts`
ได้โดยไม่กระทบโครงสร้างฐานข้อมูล (การ rename เป็นเรื่องของ label เท่านั้น)

---

## 2. โมเดล Scope — ภาพรวม

Permission หนึ่งรายการ = **role × module × action × scope** ประเภทของ scope ที่
ออกแบบไว้ (`src/lib/permissions.ts` — `ScopeType`):

| Scope | ความหมาย | ตรวจสอบด้วย |
|---|---|---|
| `ALL` | ไม่จำกัดขอบเขต | ไม่ต้องตรวจเพิ่ม |
| `PUBLIC` | ไม่ต้อง login | ใช้กับ Guest เท่านั้น |
| `OWN_ORG_SUBTREE` | องค์กรที่มี scope ครอบคลุม + ลูกหลานทั้งหมด (cascade ลงล่างตามลำดับชั้นการปกครอง) | `UserOrganizationScope` + recursive query เดินขึ้นจาก org เป้าหมายผ่าน `parentId` |
| `OWN_PROGRAM` | สายการศึกษาที่มี scope ครอบคลุม (นักธรรม/ธรรมศึกษา/บาลี) | `UserProgramScope` |
| `OWN_RECORD` | ระเบียนของตนเอง | `User.personId` (เทียบ Person) หรือ `userId` ตรงๆ |
| `RESPONSIBLE_RECORD` | ทรัพยากรที่ตนเป็นผู้แต่ง/รับผิดชอบ | `authorId`/`approverId` (มีอยู่แล้วบน `QuestionVersion`/`DocumentVersion`/`ExamSet`) หรือ `OWN_PROGRAM` |
| `ASSIGNED_SESSION` | รอบสอบที่ได้รับมอบหมาย | **ยังไม่มีตารางรองรับ** (ดูหัวข้อ 7) — deny เสมอ |
| `NONE` | ไม่มีสิทธิ์ | เทียบเท่าไม่มี entry |

### 2.1 ช่องว่างเชิงโครงสร้างที่งานนี้อุด

ก่อนงานนี้ **ไม่มีการเชื่อมโยงใดๆ ระหว่าง `User` (ตัวตนที่ login) กับ
`Organization`/`Program`/`Person`** เลยในสคีมา — ทำให้ scope ตาม `requirements.md`
§6 ("เฉพาะเขต", "เฉพาะสังกัด", "เฉพาะของตน" ฯลฯ) ไม่มีข้อมูลจริงให้ตรวจสอบ งานนี้
เพิ่ม 3 จุดเชื่อม:

1. **`UserOrganizationScope`** (ตารางใหม่) — ผูก User ↔ Organization สำหรับ
   `OWN_ORG_SUBTREE` (Regional Admin, Registrar Staff)
2. **`UserProgramScope`** (ตารางใหม่) — ผูก User ↔ Program สำหรับ `OWN_PROGRAM`
   (Teacher/Examiner ที่รับผิดชอบเฉพาะสายการศึกษาหนึ่ง)
3. **`User.personId`** (คอลัมน์ใหม่) — ผูก User ↔ Person (ทะเบียน M1) สำหรับ
   `OWN_RECORD` (Student ดูทะเบียน/ข้อมูลของตนเอง)

ทั้งสองตารางใหม่เป็น **append-only** (ถอนสิทธิ์ = ตั้ง `revokedAt` ไม่ใช่ลบแถว
บังคับด้วย DB trigger ห้าม DELETE) ตาม data-policy.md ข้อ 7 — ดูรายละเอียดเต็มใน
`prisma/migrations/20260923215000_rbac_scope_permissions/migration.sql`

### 2.2 ทำไม `OWN_ORG_SUBTREE` ไม่ denormalize เป็น closure table

โครงสร้างองค์กร (`Organization.parentId`) เปลี่ยนแปลงได้ (ย้าย/ยุบ/รวมหน่วยงาน —
ดู `Organization` model เดิม) การตรวจสอบ "ครอบคลุมลูกหลานหรือไม่" จึงใช้
**recursive CTE เดินขึ้นจากองค์กรเป้าหมายผ่าน `parentId` แบบสด** ทุกครั้งที่ตรวจสอบ
(ดู `src/lib/scope.ts::isOrganizationInScope`) แทนการ denormalize เป็น closure
table ที่ต้องคอย sync — ถูกต้องเสมอโดยไม่มีความเสี่ยงข้อมูลไม่ตรงกัน แลกกับ query
ที่ซับซ้อนขึ้นเล็กน้อย (ยอมรับได้ที่สเกลปัจจุบัน ตาม ADR-0003 ที่ปฏิเสธ
policy-engine ภายนอกด้วยเหตุผลเดียวกัน)

---

## 3. Permission Matrix ฉบับเต็ม (สรุปจาก `src/lib/permissions.ts`)

ที่มา: แปลตรงจาก `requirements.md` §6 ทีละเซลล์ — ดูซอร์สต้นฉบับในหัวข้อ 3.1

| Role | M1 ทะเบียน | M2 หลักสูตร | M3 คลังข้อสอบ | M4 ทดสอบ/จัดสอบ | M5 สมาชิก | M6 Admin | M7 Import | M8 ไฟล์ | M9 RBAC config |
|---|---|---|---|---|---|---|---|---|---|
| SUPER_ADMIN | CRUD (ALL) | CRUD (ALL) | CRUD+Approve (ALL) | CRUD (ALL) | CRUD (ALL) | CRUD (ALL) | Execute (ALL) | CRUD (ALL) | CRUD (ALL) |
| CENTRAL_OFFICER | CRUD (ALL) | CRUD (ALL) | CRUD+Approve (ALL) | R+Manage (ALL) | R (ALL) | R (ALL)* | Execute (ALL) | CRUD (ALL) | *(deny)* |
| REGIONAL_ADMIN | CRUD (OWN_ORG_SUBTREE) | R (ALL) | R (ALL) | R+Manage (OWN_ORG_SUBTREE) | R (OWN_ORG_SUBTREE) | *(deny)* | Execute (OWN_ORG_SUBTREE) | CRUD (OWN_ORG_SUBTREE) | *(deny)* |
| REGISTRAR_STAFF | CRU (OWN_ORG_SUBTREE)** | R (ALL) | R (ALL) | *(deny)* | R (OWN_ORG_SUBTREE) | *(deny)* | Execute (OWN_ORG_SUBTREE) | CRU (OWN_ORG_SUBTREE) | *(deny)* |
| TEACHER | R (ALL) | R (ALL) | CR (RESPONSIBLE_RECORD) | R (RESPONSIBLE_RECORD) | *(deny)* | *(deny)* | *(deny)* | R (ALL) | *(deny)* |
| EXAMINER | R (ALL) | R (ALL) | R (ALL) | RU (ASSIGNED_SESSION)*** | *(deny)* | *(deny)* | *(deny)* | R (ALL) | *(deny)* |
| STUDENT | R (OWN_RECORD) | R (ALL) | *(deny)* | CR (OWN_RECORD) | RU (OWN_RECORD) | *(deny)* | *(deny)* | R (OWN_RECORD) | *(deny)* |
| AUDITOR | R (ALL) | R (ALL) | R (ALL) | R (ALL) | R (ALL) | R (ALL) | R (ALL) | R (ALL) | R (ALL) |
| GUEST | R (PUBLIC) | *(deny)* | *(deny)* | R (PUBLIC) | *(deny)* | *(deny)* | *(deny)* | *(deny)* | *(deny)* |

`*` M6 ของ Central Officer ตีความเป็น read-only ทั้งหมดในเลเยอร์นี้ (deny-by-default
ต่อ "บาง config" ที่เอกสารต้นฉบับไม่ได้ระบุรายละเอียด — ดูหัวข้อ 7)
`**` ไม่มี D (delete) ตามนโยบาย no-overwrite/no-delete ประวัติทะเบียน (data-policy.md ข้อ 7)
`***` deny จริงเสมอในเฟสนี้ — ยังไม่มีตารางมอบหมายรอบสอบ (ดูหัวข้อ 7)

C=Create, R=Read, U=Update, D=Delete — วงเล็บ = scope; "(deny)" = ไม่มี entry
เลย = deny-by-default โดย `getPermission()`/`can()` คืนค่าปฏิเสธเสมอ

### 3.1 ตารางต้นฉบับ (requirements.md §6, คัดลอกมาเพื่ออ้างอิง)

```
| Actor \ โมดูล | M1 ทะเบียน | M2 หลักสูตร | M3 คลังข้อสอบ | M4 ทดสอบ/จัดสอบ | M5 สมาชิก | M6 Admin | M7 Import | M8 ไฟล์ | M9 RBAC config |
| Super Admin | CRUD ทุกเขต | CRUD | CRUD+Approve | CRUD | CRUD | CRUD | Execute | CRUD | CRUD |
| Central Officer | CRUD ทุกเขต | CRUD | CRUD+Approve | R/Manage | R | R/บาง config | Execute | CRUD | - |
| Regional Admin | CRUD เฉพาะเขต | R | R | R/Manage เฉพาะเขต | R เฉพาะเขต | - | Execute เฉพาะเขต | CRUD เฉพาะเขต | - |
| Registrar Staff | CRU เฉพาะสังกัด | R | R | - | R เฉพาะสังกัด | - | Execute เฉพาะสังกัด | CRU เฉพาะสังกัด | - |
| Teacher | R | R | CR (เสนอ) เฉพาะที่รับผิดชอบ | R เฉพาะที่รับผิดชอบ | - | - | - | R | - |
| Examiner | R | R | R | RU (บันทึกคะแนน) เฉพาะรอบที่มอบหมาย | - | - | - | R | - |
| Student | R เฉพาะของตน | R | - | R/สมัครสอบ เฉพาะของตน | RU เฉพาะของตน | - | - | R เฉพาะของตน | - |
| Auditor | R ทั้งระบบ | R | R | R | R | R (audit log) | R (รายงาน) | R | R |
| Guest | R เฉพาะหน้าสาธารณะ | - | - | R เฉพาะผลสอบสาธารณะ (ถ้าเปิด) | - | - | - | - | - |
| System Job | ตาม config | ตาม config | ตาม config | ตาม config | - | - | Execute | CRUD (เฉพาะที่ config) | - |
```

**หมายเหตุ:** แถว "System Job" ไม่ implement ในเฟสนี้ — ยังไม่มี service-account
infrastructure จริง (M4/M7 job scheduler ยังไม่ถูกออกแบบ) การ config สิทธิ์ของ
System Job จึงยังเป็น deny-by-default โดยปริยาย (ไม่มี User row ที่เป็น System
Job ในสคีมาปัจจุบัน) จนกว่าจะออกแบบ service account จริง

---

## 4. Schema ที่เพิ่ม (migration `20260923215000_rbac_scope_permissions`)

- `user_organization_scopes` (id, userId→users, organizationId→organizations,
  grantedById→users?, createdAt, revokedAt?, revokedById→users?) — partial
  unique `(userId, organizationId) WHERE revokedAt IS NULL`; trigger ห้าม
  DELETE และห้าม UPDATE ฟิลด์อื่นนอกจาก revokedAt/revokedById
- `user_program_scopes` — โครงสร้าง/กติกาเดียวกัน แทนที่ organizationId ด้วย
  programId→programs
- `users.personId` (nullable, unique) → `persons.id`, `ON DELETE SET NULL`

ทดสอบจริงกับ PostgreSQL แล้ว (apply แบบ incremental และ reset+replay จากศูนย์
ทั้ง 8 migration) — ดูผลในหัวข้อ 7

---

## 5. Function Specifications

### 5.1 `can(user, module, action, context?)` — `src/lib/authz.ts`

```
Actor: internal — ทุก Server Action/Route Handler ที่ต้องตรวจสิทธิ์
Input: user (CurrentUser | null — null = Guest), module (Module), action (Action),
       context?: { organizationId?, programId?, ownerUserId?, ownerPersonId? }
Process:
  1. หา entry จาก PERMISSION_MATRIX[role][module] (หรือ GUEST_PERMISSIONS ถ้า user เป็น null)
  2. ไม่มี entry หรือ action ไม่อยู่ใน entry.actions → deny (return false) ทันที
  3. ตาม entry.scope: ALL/PUBLIC → true; OWN_ORG_SUBTREE/OWN_PROGRAM/OWN_RECORD/
     RESPONSIBLE_RECORD → ต้องมี user และ context ฟิลด์ที่เกี่ยวข้องครบ มิฉะนั้น
     deny (ไม่เดา); ASSIGNED_SESSION/NONE → deny เสมอ
Output: boolean
Permission: n/a (เป็นฟังก์ชันตรวจสอบเอง)
Validation: context ที่ขาดฟิลด์ที่ scope ต้องใช้ = deny (fail-closed)
Error State: database error จาก isOrganizationInScope/isProgramInScope → throw ขึ้นไป
Audit: ไม่บันทึกเอง (ผู้เรียกที่เป็นเจ้าของ resource บันทึก audit ของการกระทำจริง)
Acceptance Criteria:
  AC1: role/module ที่ไม่มี entry เลย → deny เสมอ (ทดสอบจริง: STUDENT ต่อ /api/organizations)
  AC2: ASSIGNED_SESSION deny เสมอในเฟสนี้
  AC3: OWN_ORG_SUBTREE คืนค่าตาม isOrganizationInScope() จริง ไม่ mock (ทดสอบจริงใน test-rbac-scope.mjs)
```

### 5.2 `canAccessOrganization(user, organizationId)` / `requireOrganizationScope(organizationId)` — `src/lib/authz.ts`

```
Actor: internal — endpoint ที่คืนข้อมูลผูกกับองค์กรตรงๆ
Input: user (CurrentUser | null), organizationId (string)
Process:
  1. ไม่มี user → false (canAccessOrganization) / redirect (requireOrganizationScope)
  2. REGISTRY entry ของ role มี scope=ALL → true ทันที
  3. อื่นๆ → isOrganizationInScope(user.id, organizationId) (recursive CTE จริง)
Output: boolean (canAccessOrganization) | CurrentUser หรือ redirect (requireOrganizationScope)
Permission: n/a
Validation: organizationId ต้องมาจาก URL/DB เท่านั้น ไม่เชื่อ client-side role/scope claim ใดๆ
Error State: query ล้มเหลว → throw; ไม่มีสิทธิ์ → 403 (ไม่ใช่ 404 — ไม่ช่วยเดา id)
Audit: อ่านอย่างเดียว ไม่บันทึก
Acceptance Criteria: ดู AC ของ GET /api/organizations/[id] ด้านล่าง (5.4)
```

### 5.3 `grantOrganizationScopeAction` / `revokeOrganizationScopeAction` — `src/app/actions/scope.ts`

```
Function: ให้/ถอนสิทธิ์ organization scope
Actor: Super Admin เท่านั้น (M9 RBAC_CONFIG มี entry เฉพาะ SUPER_ADMIN)
Input: grant: targetUserId, organizationId | revoke: scopeId
Process:
  1. requirePermission("RBAC_CONFIG", "create"/"update") — deny-by-default อัตโนมัติสำหรับ role อื่นทั้งหมด
  2. grant: INSERT แถวใหม่ + AuditLog (action=CREATE) ใน transaction เดียว
     revoke: SELECT...FOR UPDATE ตรวจว่ายัง active อยู่ → UPDATE ตั้ง revokedAt + AuditLog (action=UPDATE) ใน transaction เดียว
Output: { error: null, success: true } หรือ { error: <ข้อความทั่วไป> }
Permission: Super Admin เท่านั้น
Validation: targetUserId/organizationId ต้องมีอยู่จริง (FK); ห้าม grant ซ้ำขณะ active (partial unique index); ห้าม revoke ซ้ำ (application-level guard)
Error State: ไม่มีสิทธิ์ → redirect (ไม่ throw ข้อความ); FK/unique violation → error ทั่วไป ไม่รั่ว SQL ดิบ
Audit: audit_logs (entityType=UserOrganizationScope, action=CREATE/UPDATE, actorId=ผู้กระทำ)
Acceptance Criteria:
  AC1: Super Admin grant สำเร็จ → แถวใหม่ revokedAt IS NULL (ทดสอบจริง)
  AC2: บทบาทอื่นเรียก → redirect ทันที ไม่มี INSERT ใดๆ เกิดขึ้น (รับประกันโดย requirePermission ก่อน DB call ใดๆ)
  AC3: revoke ซ้ำ (scope ที่ revoke ไปแล้ว) → ปฏิเสธ ไม่ throw ข้อความ SQL ดิบ (ทดสอบจริงในรูปแบบเดียวกันที่ DB layer — ดู test-rbac-scope.mjs)
```

(`grantProgramScopeAction`/`revokeProgramScopeAction` — spec เดียวกันทุกประการ ต่างแค่มิติ program แทน organization)

### 5.4 `GET /api/organizations/[id]` — `src/app/api/organizations/[id]/route.ts`

```
Function: ดูรายละเอียดองค์กรตาม id
Actor: ผู้ใช้ที่ login แล้วทุกบทบาท (ขอบเขตข้อมูลต่างกันตาม scope)
Input: URL param id (string)
Process:
  1. getCurrentUser() — ไม่มี session → 401
  2. canAccessOrganization(user, id) — ไม่ผ่าน → 403
  3. query องค์กรจริง (WHERE deletedAt IS NULL) — ไม่พบ → 404
Output: 200 { id, code, type, name, nameEn, status, parentId } | 401 | 403 | 404
Permission: canAccessOrganization() — ตรวจ scope จริงฝั่ง server เสมอ
Validation: id เป็น URL segment (string) เสมอ
Error State: 401/403/404 ตามข้างต้น; 500 = database error (ไม่คาดคิด)
Audit: read-only ไม่บันทึก (เหมือน GET /api/health)
Acceptance Criteria (ทดสอบจริงทั้งหมดใน prisma/test-rbac-scope.mjs):
  AC1: ไม่มี session → 401 เสมอ
  AC2: Regional Admin scope=province1 เข้าถึง region1 (ancestor) → 403 (cascade ลงล่างเท่านั้น)
  AC3: Regional Admin คนเดียวกันเข้าถึง district1/temple1 (descendants) → 200
  AC4: Regional Admin เข้าถึง examOffice (สาขาไม่เกี่ยวข้อง) → 403
  AC5: Super Admin/Central Officer/Auditor (REGISTRY scope=ALL) เข้าถึงองค์กรใดก็ได้ → 200
  AC6: Student (REGISTRY scope=OWN_RECORD ไม่ใช่องค์กร) → 403 เสมอสำหรับ endpoint นี้
```

---

## 6. Seed data สำหรับทดสอบ (`prisma/seed.ts::seedRbacScopes`)

| ผู้ใช้ | Scope ที่ได้รับ | ใช้พิสูจน์ |
|---|---|---|
| `mock.regional.admin` | Organization scope = จังหวัดมือกทดสอบ (province1) | cascade ลงอำเภอ/ตำบล/วัด/สำนักเรียนทั้งหมดใต้จังหวัดนี้ แต่ไม่ขึ้นไปถึงภาค/หนกลาง |
| `mock.registrar.staff` | Organization scope = วัดมือกทดสอบหนึ่ง (temple1) | คลุมสำนักเรียนใต้วัดนี้ (studyInstitute1) แต่ไม่คลุมวัดพี่น้อง (temple2) |
| `mock.teacher` | Program scope = นักธรรม (prog_naktham) | ใช้เป็นฐานของ RESPONSIBLE_RECORD ในอนาคตเมื่อ M3 UI จริงตรวจ scope นี้ |
| `mock.examiner` | Program scope = นักธรรม (prog_naktham) | เดียวกับ Teacher |
| `mock.student` | `users.personId` → `seed_person_05` ("สามเณรสมมติ ใจดี") | ฐานของ OWN_RECORD — ระเบียนที่ไม่มี Appointment ผูกอยู่แล้ว จึงไม่ชนกับข้อมูลจำลองอื่น |

---

## 7. คำสั่ง/การทดสอบที่รันจริง พร้อมผล

ลำดับที่รันจริง (ต้อง reset ก่อนเพื่อผลลัพธ์ที่สะอาด เนื่องจาก
`test-exam-document-domain.mjs` ทำ state transition แบบ immutable
DRAFT→APPROVED ที่ rerun ซ้ำไม่ได้โดยไม่ reset — เป็นข้อจำกัดเดิมของสคริปต์นั้น
ไม่เกี่ยวกับงานนี้):

```
$ node prisma/dev-migrate-verify.mjs --reset
Replaying 8 migration(s) from scratch:
  [PASSED] applied 20260914100207_init
  [PASSED] applied 20260914100307_add_user_phone
  [PASSED] applied 20260914100407_rollback_add_user_phone
  [PASSED] applied 20260923135937_sangha_org_domain
  [PASSED] applied 20260923141654_education_domain
  [PASSED] applied 20260923143443_exam_document_domain
  [PASSED] applied 20260923150512_auth_credentials_and_login_security
  [PASSED] applied 20260923215000_rbac_scope_permissions
Reset + full replay: PASSED

$ npm run db:seed          # รันซ้ำ 2 ครั้งติดกัน ยืนยัน idempotent — ผลลัพธ์เท่าเดิมทั้งสองครั้ง
Seed committed successfully. (rbacScopes: { organizationScopes: 2, programScopes: 2 })

$ node prisma/test-exam-document-domain.mjs      # regression เดิม (ไม่แตะไฟล์นี้เลยในงานนี้)
23 passed, 0 failed

$ node prisma/test-auth-login.mjs                # regression เดิม (ไม่แตะไฟล์นี้เลยในงานนี้)
24 passed, 0 failed

$ node prisma/test-rbac-scope.mjs                # ใหม่ — งานนี้
=== Part 1: HTTP end-to-end — GET /api/organizations/[id] deny-by-default + scope ===
  [PASSED] no session at all -> 401
  [PASSED] SUPER_ADMIN: 200 for any organization (REGISTRY scope=ALL)
  [PASSED] SUPER_ADMIN: unknown organization id -> 404
  [PASSED] CENTRAL_OFFICER: 200 for examOffice
  [PASSED] AUDITOR: 200 for the root organization
  [PASSED] REGIONAL_ADMIN: 200 for province1 (own scope)
  [PASSED] REGIONAL_ADMIN: 200 for district1 (child)
  [PASSED] REGIONAL_ADMIN: 200 for temple1 (deeper descendant)
  [PASSED] REGIONAL_ADMIN: 403 for region1 (ancestor — no upward cascade)
  [PASSED] REGIONAL_ADMIN: 403 for examOffice (unrelated branch)
  [PASSED] REGISTRAR_STAFF: 200 for temple1 (own affiliation)
  [PASSED] REGISTRAR_STAFF: 200 for studyInstitute1 (descendant)
  [PASSED] REGISTRAR_STAFF: 403 for temple2 (sibling)
  [PASSED] TEACHER: 200 for any organization (REGISTRY scope=ALL, plain "R")
  [PASSED] STUDENT: 403 (REGISTRY scope=OWN_RECORD, not org-based)
=== Part 2: append-only + uniqueness contract (real PostgreSQL) ===
  [PASSED] x13 (grant/coverage/duplicate-reject/revoke/double-revoke-reject/
           append-only DELETE+UPDATE rejection/program scope/personId link)
28 passed, 0 failed

$ AUTH_SESSION_MAX_AGE_SECONDS=3 npm run dev      # regression เดิม (ไม่แตะไฟล์นี้เลยในงานนี้)
$ node prisma/test-auth-session-expiry.mjs
2 passed, 0 failed

$ npx next build
✓ Compiled successfully — TypeScript ผ่าน, ทุก route generate สำเร็จ รวม
  /api/organizations/[id] ใหม่

$ npm run lint
(no output — 0 errors, 0 warnings)

$ npx tsc --noEmit
(no output — 0 errors)
```

**รวมการทดสอบจริงที่รันสำเร็จในงานนี้: 4 คำสั่ง schema/build (reset+replay,
seed×2, build, lint, tsc) + 4 test suite (23+24+28+2 = 77 assertion จริงที่ผ่าน,
28 รายการเป็นของใหม่จากงานนี้)**

---

## 8. ขอบเขตที่ตัดออก (Out of Scope — ต้องแจ้ง Owner)

1. **`ASSIGNED_SESSION` (Examiner "เฉพาะรอบที่มอบหมาย") ยัง deny เสมอ** — ไม่มี
   ตาราง exam-session-assignment ในสคีมาปัจจุบัน (M4 Testing Engine/การมอบหมาย
   กรรมการคุมสอบยังไม่ถูกออกแบบ) `can()` คืน false เสมอสำหรับ scope นี้
   (fail-safe แทนการอนุมัติโดยไม่มีข้อมูลจริง) — ต้องกลับมาทำเมื่อ M4 ถูกออกแบบ
2. **M6 Admin ของ Central Officer ตีความเป็น read-only ทั้งหมด** — เอกสารต้นฉบับ
   ระบุ "R/บาง config" โดยไม่ระบุว่า config ใดบ้าง เลเยอร์นี้เลือก deny-by-default
   ต่อสิ่งที่ไม่ชัดเจน (ให้ read-only ก่อน) รอ Owner ระบุ sub-resource ที่ชัดเจน
3. **ไม่มี Admin UI สำหรับจัดการ scope** — มีเฉพาะ Server Action
   (`grantOrganizationScopeAction`/`revokeOrganizationScopeAction` ฯลฯ) ยังไม่มี
   หน้าจอ — นอกขอบเขตงานนี้ (งานนี้คือ "ออกแบบ RBAC + scope" ไม่ใช่ Admin Console UI ซึ่งเป็น M6)
4. **`RESPONSIBLE_RECORD` ของ Teacher ต่อ M3 (คลังข้อสอบ) ตีความอย่างเคร่งครัด**
   — โจทย์ระบุ "CR (เสนอ) เฉพาะที่รับผิดชอบ" โดยไม่ชัดว่า Teacher อ่านคลังข้อสอบ
   ที่อนุมัติแล้วโดยรวม (ไม่ใช่แค่ของตน) ได้หรือไม่ — ตีความ deny-by-default
   (จำกัดเฉพาะที่ตนแต่ง/โปรแกรมที่ตนรับผิดชอบ) รอ Owner ยืนยัน
5. **Excel Import (M7)/Object Storage จริง (M8)** — ไม่มี endpoint จริงให้ผูก
   permission เหล่านี้เข้าไปทดสอบ (มีแค่ entry ใน matrix เตรียมไว้) เหมือนเดิม
   ตาม README ก่อนหน้านี้
6. **System/Scheduled Job actor** — ไม่มี service account infrastructure จริง
   ในสคีมาปัจจุบัน แถว "System Job" ในตารางต้นฉบับจึงยังไม่ implement (deny
   โดยปริยายเพราะไม่มี User row ประเภทนี้อยู่จริง)
7. **การเชื่อม `Appointment`/`authorId` เข้ากับ `RESPONSIBLE_RECORD` แบบเต็มรูปแบบ**
   — `can()` รองรับ `ownerUserId`/`programId` context แล้ว แต่ยังไม่มี endpoint
   จริงที่ query `QuestionVersion.authorId` มาป้อนเข้า `can()` (นอกขอบเขตงานนี้ —
   M3 UI ยังไม่ถูกสร้าง) `RESPONSIBLE_RECORD` จึงพิสูจน์แล้วเฉพาะ logic ระดับ
   unit ผ่านโครงสร้าง `can()` เอง ยังไม่มี integration test ระดับ endpoint จริง

---

## 9. Failure mode และ Recovery

- **Migration ล้มเหลวระหว่าง apply** — `dev-migrate-verify.mjs` ไม่ wrap
  หลาย migration ในธุรกรรมเดียว (ตาม convention เดิมของสคริปต์นี้) แต่ทุก
  statement ในไฟล์นี้เป็น DDL ที่ idempotent-safe เมื่อรันซ้ำหลัง fix (CREATE
  TABLE/INDEX จะ error ชัดเจนถ้ามีอยู่แล้ว ไม่ silent corrupt) — แก้ที่ต้นเหตุ
  แล้ว `--reset` เพื่อ replay ใหม่ทั้งหมดคือทาง recovery ที่ปลอดภัยที่สุดใน dev
- **grant scope ซ้ำขณะ active** — ปฏิเสธด้วย partial unique index ก่อนจะเกิดข้อมูล
  ขัดแย้ง (สอง active scope ของคู่เดียวกัน) — ไม่มีทาง corrupt ข้อมูลได้แม้ race condition (unique index บังคับที่ database)
- **revoke ผิดพลาด (เช่น revoke ทั้งที่ยังต้องการสิทธิ์)** — ไม่ใช่ destructive
  operation จริง เพราะแถวเดิมไม่ถูกลบ (append-only) แก้ไขได้ทันทีด้วยการ grant
  ใหม่ (แถวใหม่ id ใหม่) ประวัติเดิมยังอยู่ครบสำหรับ audit
- **`isOrganizationInScope`/`isProgramInScope` query ล้มเหลว (database error)**
  — `can()`/`canAccessOrganization()` throw ขึ้นไป (fail-closed) ไม่ silent-allow
  — ผู้เรียก (Route Handler) ต้องปล่อยให้ error กลายเป็น 500 ไม่ใช่ตีความเป็น
  "อนุญาต" โดยบังเอิญ (ตรวจสอบแล้วว่าไม่มี catch-and-allow pattern ใดๆ ในโค้ด
  ทั้ง `authz.ts`/`scope.ts`)
- **ลบ Organization ที่มี active scope ผูกอยู่** — `onDelete: Cascade` บน
  `UserOrganizationScope.organizationId` หมายความว่า scope นั้นจะถูกลบไปด้วย
  ถ้า Organization ถูกลบจริง — แต่ตาม data-policy.md องค์กรไม่ควรถูก hard-delete
  เลย (ใช้ status=DISSOLVED/MERGED แทน ดู comment เดิมใน schema.prisma) จึงไม่
  ควรเกิดกรณีนี้ในทางปฏิบัติ

---

## 10. งานถัดไปที่ควรทำ (นอกขอบเขตงานนี้)

1. ออกแบบ M4 Testing Engine ให้มีตาราง exam-session-assignment จริง แล้วกลับมา
   implement `ASSIGNED_SESSION` scope ให้สมบูรณ์
2. Admin Console UI (M6) สำหรับจัดการ organization/program scope ผ่านหน้าจอ
   (ปัจจุบันมีแค่ Server Action)
3. ผูก `RESPONSIBLE_RECORD` เข้ากับ endpoint จริงของ M3 (สร้าง/แก้ไข
   QuestionVersion) เมื่อ UI นั้นถูกสร้าง
4. ยืนยันกับ Owner ตามหัวข้อ 1 (role mapping) และหัวข้อ 8 (ขอบเขตที่ตัดออก)
