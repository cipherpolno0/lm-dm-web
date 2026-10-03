# authz-guards.md — Authorization Guard ฝั่ง Server

**งาน:** สร้าง Authorization Guard ฝั่ง Server
**Phase:** P3 Authentication & RBAC
**สถานะ:** ร่างสำหรับ Owner review — implement + ทดสอบจริงแล้ว (ดูหัวข้อ 5)
**อ้างอิงคู่กับ:** `prisma/roles-permissions.md` (permission matrix + scope model), `prisma/AUTH.md`,
`dev-rules.md` ข้อ 4, `adr/0003-authjs-server-side-authorization.md`

> ต่อยอดจากงาน "ออกแบบ RBAC + Scope-based Permission" (เสร็จแล้ว) — งานนั้นให้ `can()`/
> `requirePermission()` (สำหรับ Server Action/Server Component ที่ redirect ได้) งานนี้เพิ่ม
> **guard utility มาตรฐานสำหรับ Route Handler/API** (ที่ redirect ไม่ได้ ต้องตอบ HTTP status
> code ตรงๆ) แล้วพิสูจน์ด้วย endpoint จริง 4 ตัวว่าไม่มี IDOR/privilege-escalation หลุดรอด

---

## 1. ปัญหาที่ต้องแก้: ทำไมต้องมี "Guard" แยกจาก `can()`/`requirePermission()`

`src/lib/authz.ts` (จากงาน RBAC ก่อนหน้า) มี `requirePermission()`/`requireRole()` ที่ใช้
`redirect()` ของ Next.js เมื่อไม่มีสิทธิ์ — ใช้ได้ดีใน Server Component/Server Action แต่ **ใช้
ไม่ได้ใน Route Handler** (API) เพราะ Route Handler ต้องคืน `NextResponse` พร้อม HTTP status
code ที่ถูกต้อง (401/403/404) ไม่ใช่ redirect ก่อนงานนี้ `GET /api/organizations/[id]` (จากงาน
RBAC ก่อนหน้า) เขียน pattern "เรียก `getCurrentUser()` → เรียก `can()`/`canAccessOrganization()`
→ ตอบ 401/403 เอง" ตรงๆ ในไฟล์ route — ถ้ามี endpoint ใหม่เพิ่มขึ้นแล้วมีใครลืมเขียนสามบรรทัด
นี้ (หรือเขียนผิดลำดับ เช่น query ข้อมูลก่อนตรวจสิทธิ์) จะเกิด **Broken Object Level
Authorization (OWASP API1:2023)** ทันที — นี่คือสาเหตุอันดับต้นๆ ของ IDOR ในทางปฏิบัติจริง
งานนี้จึงสกัด pattern นั้นออกมาเป็น utility กลาง (`src/lib/guard.ts`) ที่ endpoint ใหม่ทุกตัว
เรียกใช้แทนการเขียนซ้ำ

---

## 2. Guard utilities ที่เพิ่ม (`src/lib/guard.ts`)

สอง guard ตามลักษณะของ scope ที่ต้องตรวจ (ดู `roles-permissions.md` §2 `ScopeType`):

### 2.1 `guardRoute(module, action, context?)`

ใช้เมื่อบริบทที่ต้องตรวจรู้ล่วงหน้าได้จาก request เอง (เช่น `organizationId` จาก URL param)
**ก่อน** ต้อง query ข้อมูลจริง — ตรวจสิทธิ์ก่อนแล้วค่อย query ใช้กับ scope `ALL`/`PUBLIC`/
`OWN_ORG_SUBTREE`/`OWN_PROGRAM` คืนค่า `{ok:true,user}` หรือ `{ok:false,response}` (response
เป็น `NextResponse` 401/403 พร้อมใช้ทันที — `return guard.response` บรรทัดเดียวจบ)

### 2.2 `authorizeOwnedRow(user, module, action, ownerContext)` + `notFoundOrForbidden()`

ใช้เมื่อบริบทที่ต้องตรวจ **มาจากตัวแถวข้อมูลเอง** (เช่น `QuestionVersion.authorActorId`,
`Person.id` เทียบกับ `user.personId`) — ต้อง query ข้อมูลมาก่อนเพื่อรู้เจ้าของ แล้วจึงตรวจสิทธิ์
ใช้กับ scope `OWN_RECORD`/`RESPONSIBLE_RECORD`

**หลักการสำคัญ:** เมื่อไม่ผ่าน `authorizeOwnedRow()` ต้องตอบด้วย `notFoundOrForbidden()`
(**404 เสมอ ไม่ใช่ 403**) ไม่ว่า resource จะไม่มีอยู่จริง หรือมีอยู่จริงแต่ผู้เรียกไม่มีสิทธิ์เห็น —
เพราะถ้าตอบ 403 แยกจาก 404 ผู้โจมตีจะรู้ทันทีว่า "id นี้มีอยู่จริงแต่ไม่ใช่ของฉัน" ซึ่งเปิดช่องให้
ไล่เดา id (IDOR enumeration) ได้ ทั้ง `Person`/`QuestionVersion` เป็นข้อมูลระดับ **Restricted**
ตาม `data-policy.md` การมีอยู่ของ id เองก็ถือเป็นข้อมูลที่ต้องปกปิดจากผู้ไม่มีสิทธิ์ — ต่างจาก
`GET /api/organizations/[id]` ที่ยังคงตอบ 403 (องค์กรเป็นข้อมูลอ้างอิงกึ่งสาธารณะที่หลายบทบาท
อ่านได้อยู่แล้วตาม matrix ไม่จำเป็นต้องซ่อนการมีอยู่)

---

## 3. Endpoint ที่ implement/ปรับปรุงในงานนี้

| Endpoint | Scope ที่พิสูจน์ | Guard ที่ใช้ | สถานะที่เป็นไปได้ |
|---|---|---|---|
| `GET /api/organizations/[id]` | `OWN_ORG_SUBTREE` (+ `ALL`) | `guardRoute` | 401/403/404/200 (**refactor** จาก `canAccessOrganization()` ตรงๆ ไปใช้ `guardRoute` — พฤติกรรมเดิมทุกประการ ยืนยันด้วย regression) |
| `GET /api/persons/[id]` (**ใหม่**) | `OWN_RECORD` + `OWN_ORG_SUBTREE` ผสมกัน | `authorizeOwnedRow` + `notFoundOrForbidden` | 401/404/200 |
| `GET /api/question-versions/[id]` (**ใหม่**) | `RESPONSIBLE_RECORD` (authorship OR program scope) | `authorizeOwnedRow` + `notFoundOrForbidden` | 401/404/200 |
| `POST /api/admin/organization-scopes` (**ใหม่**) | `RBAC_CONFIG` (Super Admin เท่านั้น) — privilege-escalation target | `guardRoute` | 401/403/400/409/201 |
| `DELETE /api/admin/organization-scopes/[id]` (**ใหม่**) | เดียวกัน | `guardRoute` | 401/403/409/204 |

สอง endpoint หลัง (`/api/admin/organization-scopes*`) ห่อฟังก์ชันเดิมจาก `src/lib/scope.ts`
(`grantOrganizationScope`/`revokeOrganizationScope` — สร้างไว้แล้วในงาน RBAC ก่อนหน้าสำหรับ
Server Action `src/app/actions/scope.ts`) ด้วย Route Handler ธรรมดา เพื่อให้ทดสอบ
"privilege escalation ผ่าน HTTP ตรงๆ" ได้ง่าย (Server Action ต้องเลียนแบบ encoding เฉพาะที่
ทดสอบยาก) — Server Action เดิมยังคงอยู่สำหรับใช้กับ UI ในอนาคต ทั้งสองทางเรียก
`src/lib/scope.ts` เดียวกัน ไม่มี logic ซ้ำซ้อน

---

## 4. Function Specifications

### 4.1 `guardRoute(module, action, context?)`

```
Actor: internal — เรียกที่ต้นทุก Route Handler ก่อน query/เขียนข้อมูลใดๆ
Input: module (Module), action (Action), context (PermissionContext ที่รู้ล่วงหน้าจาก
       request เอง — ห้ามมาจาก client body ที่ไม่ผ่านการตรวจสอบ)
Process: getCurrentUser() -> ไม่มี session -> 401; can() -> ไม่ผ่าน -> 403; ผ่านทั้งคู่ -> {user}
Output: { ok:true, user } | { ok:false, response: NextResponse }
Permission: n/a
Validation: n/a (context ต้องถูกสร้างอย่างปลอดภัยโดยผู้เรียกก่อนแล้ว)
Error State: can() throw (database error) -> throw ขึ้นไป (fail-closed)
Audit: ไม่บันทึกเอง
Acceptance Criteria:
  AC1: ไม่มี session -> 401 เสมอ
  AC2: มี session แต่ can() คืน false -> 403 (ไม่ query ข้อมูลจริงต่อ)
  AC3: ผ่านทั้งคู่ -> คืน user ให้ query ต่อได้ทันที
```

### 4.2 `authorizeOwnedRow(user, module, action, ownerContext)`

```
Actor: internal — เรียกหลัง query แถวข้อมูลเป้าหมายมาแล้ว
Input: user, module, action, ownerContext (ownerUserId/ownerPersonId/programId/organizationId
       ที่ "อ่านมาจากแถวข้อมูลจริงในฐานข้อมูล" เท่านั้น)
Process: ส่งต่อเข้า can() พร้อม ownerContext
Output: boolean
Permission: n/a
Validation: ownerContext ต้องมาจากแถวข้อมูลที่ query จริง ไม่ใช่ query param ที่ยังไม่ตรวจสอบ
Error State: can() throw -> throw ขึ้นไป (fail-closed)
Audit: ไม่บันทึกเอง
Acceptance Criteria:
  AC1: ไม่ผ่าน -> ผู้เรียกต้องตอบด้วย notFoundOrForbidden() (404) เสมอ ไม่ใช่ 403
  AC2: RESPONSIBLE_RECORD ผ่านได้สองทาง (authorship หรือ program scope) — ทดสอบจริงทั้งสองทาง
```

### 4.3 `GET /api/persons/[id]`

```
Function: ดูระเบียนทะเบียนบุคคล (M1) ตาม id
Actor: ผู้ใช้ login แล้วทุกบทบาท
Input: URL param id (Person.id)
Process:
  1. getCurrentUser() -> ไม่มี session -> 401
  2. query Person + สังกัดปัจจุบัน (Appointment ACTIVE ล่าสุด) ในคำสั่งเดียว -> ไม่พบ -> 404
  3. authorizeOwnedRow(user, "REGISTRY", "read", { organizationId: สังกัดปัจจุบัน, ownerPersonId:
     person.id }) -> ไม่ผ่าน -> 404
Output: 200 { id, referenceCode, prefix, fullName } | 401 | 404
Permission: authorizeOwnedRow() ผ่าน can() เดียวกับทั้งระบบ
Validation: id เป็น URL segment เสมอ
Error State: 401, 404 (ไม่พบ/ไม่มีสิทธิ์ — แยกไม่ออกโดยตั้งใจ), 500
Audit: อ่านอย่างเดียว ไม่บันทึก
Acceptance Criteria: ดูผลทดสอบจริงในหัวข้อ 5 (Part 1)
```

### 4.4 `GET /api/question-versions/[id]`

```
Function: ดูรายละเอียด QuestionVersion ตาม id
Actor: ผู้ใช้ login แล้วทุกบทบาท (STUDENT deny-by-default เสมอ — ไม่มี entry ใน matrix)
Input: URL param id (QuestionVersion.id)
Process:
  1. getCurrentUser() -> ไม่มี session -> 401
  2. query QuestionVersion + join Question -> Level เพื่อดึง programId -> ไม่พบ -> 404
  3. authorizeOwnedRow(user, "QUESTION_BANK", "read", { ownerUserId: authorActorId, programId })
     -> ไม่ผ่าน -> 404
Output: 200 { id, questionId, versionNo, status, authorActorId } | 401 | 404
Permission: authorizeOwnedRow()
Validation: id เป็น URL segment เสมอ
Error State: 401, 404, 500
Audit: อ่านอย่างเดียว ไม่บันทึก
Acceptance Criteria: ดูผลทดสอบจริงในหัวข้อ 5 (Part 2)
```

### 4.5 `POST /api/admin/organization-scopes` / `DELETE /api/admin/organization-scopes/[id]`

```
Function: ให้/ถอนสิทธิ์ organization scope ผ่าน HTTP โดยตรง
Actor: Super Admin เท่านั้น (RBAC_CONFIG module มี entry เฉพาะ SUPER_ADMIN)
Input: POST: JSON body { targetUserId, organizationId } | DELETE: URL param id (scope id)
Process:
  1. guardRoute("RBAC_CONFIG", "create"/"update") -> ไม่มี session -> 401; ไม่ใช่ Super Admin
     -> 403 **ก่อน**อ่าน/ประมวลผล body หรือแตะฐานข้อมูลใดๆ
  2. POST: parse+ตรวจรูปแบบ body ขั้นต่ำ -> grantOrganizationScope() (INSERT+AuditLog ใน
     transaction เดียว, src/lib/scope.ts เดิม)
  3. DELETE: revokeOrganizationScope() (SELECT...FOR UPDATE ตรวจ active -> UPDATE
     revokedAt+AuditLog ใน transaction เดียว, เดิมเช่นกัน)
Output: POST: 201 {id} | 400 | 401 | 403 | 409 — DELETE: 204 | 401 | 403 | 409
Permission: guardRoute("RBAC_CONFIG", ...) — Super Admin เท่านั้น
Validation: targetUserId/organizationId ต้องเป็น string ไม่ว่าง (POST); ต้องมีอยู่จริง (FK)
Error State: 401/403 ตาม guard; 400 body ผิดรูปแบบ; 409 FK/unique violation หรือ revoke ซ้ำ
Audit: audit_logs (entityType=UserOrganizationScope, action=CREATE/UPDATE) — เหมือน Server
       Action เดิมทุกประการ (เรียกฟังก์ชันเดียวกัน)
Acceptance Criteria: ดูผลทดสอบจริงในหัวข้อ 5 (Part 3) — โดยเฉพาะ AC ที่ยืนยันว่าการปฏิเสธ
  403 เกิดขึ้น "ก่อน" การเขียนฐานข้อมูลใดๆ (ตรวจนับแถวจริงก่อน/หลังการยิง request)
```

---

## 5. คำสั่ง/การทดสอบที่รันจริง พร้อมผล

ลำดับที่รันจริง (reset ก่อนเพื่อผลลัพธ์ที่สะอาด ด้วยเหตุผลเดิม — ดู `roles-permissions.md` §7):

```
$ node prisma/dev-migrate-verify.mjs --reset      # replay 8 migrations เดิม (ไม่มี migration ใหม่ในงานนี้)
Reset + full replay: PASSED

$ npm run db:seed          # x2 ติดกัน — ยืนยัน idempotent (เพิ่ม 2 question_versions ใหม่
                            # สำหรับทดสอบ RESPONSIBLE_RECORD — ดูหัวข้อ 6)
Seed committed successfully. (questions: 5, questionVersions: 5 ทั้งสองครั้ง)

$ node prisma/test-exam-document-domain.mjs      # regression เดิม
23 passed, 0 failed

$ node prisma/test-auth-login.mjs                # regression เดิม
24 passed, 0 failed

$ node prisma/test-rbac-scope.mjs                # regression เดิม (ยืนยันว่า refactor
                                                   # /api/organizations/[id] ไปใช้ guardRoute()
                                                   # ไม่เปลี่ยนพฤติกรรม HTTP แม้แต่กรณีเดียว)
28 passed, 0 failed

$ node prisma/test-authz-guard.mjs               # ใหม่ — งานนี้
=== Part 1: IDOR — GET /api/persons/[id] ===
  8 assertions: no-session 401, own-record 200, guessed-other-id 404, unknown-id 404,
  ALL-scope roles 200, org-scope-covers-descendant 200, org-scope-excludes-ancestor 404
=== Part 2: IDOR — GET /api/question-versions/[id] ===
  5 assertions: no-session 401, own-authored 200, program-scope-not-author 200,
  different-program-not-author 404, ALL-scope role 200, STUDENT (no entry) 404
=== Part 3: Privilege escalation — /api/admin/organization-scopes ===
  10 assertions: no-session 401, non-Super-Admin grant-self 403 + verified NO row written,
  Super Admin grant 201 + row verified active, non-Super-Admin revoke-other's-scope 403 +
  verified row untouched, Super Admin revoke 204 + row verified revoked (not deleted)
23 passed, 0 failed

$ AUTH_SESSION_MAX_AGE_SECONDS=3 npm run dev
$ node prisma/test-auth-session-expiry.mjs       # regression เดิม
2 passed, 0 failed

$ npx next build
✓ Compiled successfully — TypeScript ผ่าน, route ใหม่ทั้ง 4 ปรากฏ:
  /api/admin/organization-scopes, /api/admin/organization-scopes/[id],
  /api/persons/[id], /api/question-versions/[id]

$ npm run lint        (no output — 0 error)
$ npx tsc --noEmit    (no output — 0 error)
```

**รวมการทดสอบจริงที่รันสำเร็จในงานนี้: 23 assertion ใหม่ (IDOR ×13, privilege escalation ×10)
ผ่านทั้งหมด + regression เดิม 23+24+28+2 = 77 assertion ที่ยังผ่านไม่มีเปลี่ยนแปลง (รวมสะสม
ทั้งโปรเจกต์: 116 (เดิม) + 23 = 139/139 PASSED)**

---

## 6. Seed data เพิ่มเติมสำหรับงานนี้ (`prisma/seed.ts::seedQuestions`)

เพิ่ม `Question`/`QuestionVersion` สองรายการที่ผู้แต่ง (`authorActorId`) ไม่ใช่
`mock.teacher` เพื่อพิสูจน์ทั้งสองแขนงของ `RESPONSIBLE_RECORD`:

| Id | สาย (Program) | ผู้แต่ง | ผลที่คาดกับ `mock.teacher` (program scope = นักธรรม) |
|---|---|---|---|
| `seed_qv_naktham_other_author_v1` | นักธรรม (prog_naktham) | Central Officer | **อ่านได้** — program-scope ครอบคลุม แม้ไม่ได้แต่งเอง |
| `seed_qv_ds_other_author_v1` | ธรรมศึกษา (prog_dhammastudies) | Central Officer | **อ่านไม่ได้ (404)** — คนละ program และไม่ได้แต่งเอง |

---

## 7. IDOR/Privilege-escalation checklist (สรุปสิ่งที่พิสูจน์แล้วจริง)

- [x] Object-level check ที่ endpoint ทุกตัว ไม่ใช่แค่ UI ซ่อนปุ่ม (ตาม "รายละเอียด" ของโจทย์งานนี้)
- [x] การปฏิเสธเกิด "ก่อน" การเขียน/อ่านข้อมูลจริงเสมอ (`guardRoute` ตรวจก่อน handler ทำงานต่อ)
- [x] การปฏิเสธของ resource ระดับบุคคล/Restricted ตอบ 404 ไม่ใช่ 403 (ป้องกัน id enumeration)
- [x] Privilege escalation ถูกทดสอบจริงผ่าน HTTP ตรงๆ (ไม่ใช่แค่ unit-level) พร้อมตรวจนับแถวใน
      ฐานข้อมูลจริงว่าไม่มีการเขียนเกิดขึ้นเมื่อถูกปฏิเสธ
- [x] Scope cascade (org-hierarchy) ถูกทดสอบทั้งทิศทางถูก (descendant → allow) และผิด
      (ancestor → deny) ผ่าน resource คนละประเภทจากที่เคยทดสอบมาก่อน (Person แทน Organization)
- [x] RESPONSIBLE_RECORD ถูกทดสอบทั้งสองแขนง (authorship-only และ program-scope-only) แยกกัน
      ชัดเจน — ปิดช่องว่าง "ยังไม่มี integration test ระดับ endpoint จริง" ที่ `roles-permissions.md`
      หัวข้อ 8 ข้อ 7 เคยระบุไว้

---

## 8. ขอบเขตที่ตัดออก (Out of Scope — ต้องแจ้ง Owner)

1. **ไม่ได้เพิ่ม guard สำหรับ Server Action โดยเฉพาะ** — `requirePermission()`/`requireRole()`
   เดิม (จากงาน RBAC) ทำหน้าที่นี้อยู่แล้วด้วย `redirect()` ซึ่งเหมาะกับ Server Action/Server
   Component มากกว่า `NextResponse` ของ `guardRoute()` — สองรูปแบบนี้ตั้งใจแยกกันตามบริบทการใช้
   งาน ไม่ได้รวมเป็น utility เดียวเพราะ contract การคืนค่าต่างกันโดยธรรมชาติ (throw/redirect vs.
   คืนค่าที่ผู้เรียกตัดสินใจต่อ)
2. **`ASSIGNED_SESSION` ของ Examiner ยัง deny เสมอ** (สืบทอดจากงาน RBAC ก่อนหน้า — ไม่มีตาราง
   มอบหมายรอบสอบจริง) จึงยังไม่มี endpoint ทดสอบ scope นี้ในงานนี้ด้วยเหตุผลเดียวกัน
3. **`POST /api/admin/organization-scopes` ไม่ validate ว่า `organizationId`/`targetUserId`
   มีอยู่จริงก่อน INSERT** — พึ่ง FK constraint ของฐานข้อมูลจับแล้วแปลงเป็น 409 (ไม่ query ซ้ำ
   ก่อนเพื่อลด round-trip) เพียงพอสำหรับป้องกัน data corruption แต่ error message ยังเป็น
   ข้อความทั่วไปเดียวกันทั้ง "ไม่มีอยู่จริง" และ "grant ซ้ำขณะ active" (ตั้งใจ ไม่รั่วรายละเอียด)
4. **ไม่มี rate limiting บน endpoint ใหม่เหล่านี้** — เหมือน endpoint อื่นๆ ในโปรเจกต์ (มีเฉพาะ
   per-account lockout บน login ตาม `prisma/AUTH.md`) การไล่เดา id ผ่าน `/api/persons/[id]`
   จึงยังทำได้ในทางเทคนิค (แค่ไม่ได้ผลลัพธ์ที่มีประโยชน์เพราะ 404 เหมือนกันหมด) — rate
   limiting ระดับ endpoint เป็นงานแยกในอนาคต (นอกขอบเขต M9)

---

## 9. Failure mode และ Recovery

- **guard ล้มเหลวเพราะ database error (`can()` throw)** — throw ขึ้นไปจน Next.js แปลงเป็น
  500 มาตรฐาน (ไม่รั่ว stack trace ตาม `dev-rules.md` ข้อ 7) — ไม่มี catch-and-allow ใดๆ ในเส้น
  ทางนี้ (ตรวจสอบโค้ดแล้ว) จึง fail-closed เสมอ ไม่ใช่ fail-open
- **POST /api/admin/organization-scopes ล้มเหลวระหว่าง INSERT (เช่น เชื่อมต่อฐานข้อมูลขาด
  กลางคัน)** — `grantOrganizationScope()` ใช้ `withTransaction()` (BEGIN/COMMIT/ROLLBACK)
  อยู่แล้วจากงาน RBAC ก่อนหน้า ไม่มีทางเกิดแถวค้างครึ่งๆ กลางๆ (INSERT+AuditLog เป็นหน่วยเดียว)
- **DELETE ถูกเรียกซ้ำสองครั้งพร้อมกัน (race) บน scope เดียวกัน** — `revokeOrganizationScope()`
  ใช้ `SELECT ... FOR UPDATE` ล็อกแถวก่อนตรวจสอบ+อัปเดต ครั้งที่สองจะเห็น `revokedAt` ที่ไม่ใช่
  null แล้วและ throw (แปลงเป็น 409) — ไม่มีทาง revoke ซ้ำสำเร็จสองครั้ง
- **แถวใน `user_organization_scopes` ที่สร้างจาก endpoint นี้ผิดพลาด (grant ผิดคน/ผิดองค์กร)**
  — ไม่ใช่ destructive operation จริง เพราะแก้ไขได้ทันทีด้วย DELETE (จริงคือ revoke) แล้ว grant
  ใหม่ที่ถูกต้อง ประวัติเดิมยังอยู่ครบสำหรับ audit (append-only)

---

## 10. งานถัดไปที่ควรทำ (นอกขอบเขตงานนี้)

1. เพิ่ม rate limiting ระดับ endpoint สำหรับ resource ที่มีความเสี่ยง IDOR สูง (`/api/persons/[id]`)
2. ผูก guard เดียวกันนี้เข้ากับ endpoint จริงของ M4 เมื่อออกแบบตารางมอบหมายรอบสอบแล้ว (ปลด
   `ASSIGNED_SESSION` ออกจากสถานะ deny-เสมอ)
3. พิจารณาเพิ่ม audit log สำหรับการอ่าน (read) resource ระดับ Restricted ที่สำเร็จ ไม่ใช่แค่
   เขียน — ปัจจุบัน `GET /api/persons/[id]`/`GET /api/question-versions/[id]` เป็น read-only
   ไม่บันทึก audit (สอดคล้องกับ pattern เดิมของโปรเจกต์ที่ endpoint อ่านอย่างเดียวไม่บันทึก)
   แต่ระดับความอ่อนไหวของข้อมูล (Restricted tier) อาจสมควรมี access log แยกในอนาคต — รอ Owner ตัดสินใจ
