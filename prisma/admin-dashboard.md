# Admin Dashboard Shell (P5 Admin & CMS)

Phase: P5 Admin & CMS — งาน "สร้าง Admin Dashboard Shell"
รายละเอียดที่ระบุ: **sidebar, KPI mock, recent activity, permission-aware
navigation** — วิธีตรวจสอบที่ระบุ: **"ผู้ใช้เห็นเฉพาะ module ที่มีสิทธิ์"**
**ไม่มี schema/migration ใหม่ในงานนี้** — ใช้โครงสร้าง permission matrix +
`audit_logs` ที่ implement และทดสอบจริงแล้วตั้งแต่งาน RBAC (P3) ทั้งหมด

อ้างอิงคู่กับ `prisma/roles-permissions.md`/`src/lib/permissions.ts` (permission
matrix — แหล่งเดียวของ "module ที่มีสิทธิ์"), `src/lib/authz.ts`/`src/lib/guard.ts`
(deny-by-default), `claude/sitemap.md` (Admin Zone ที่เสนอไว้ — ยังเป็นร่าง ดู §2.2),
`prisma/schema.prisma` (ตาราง `audit_logs`)

## 1. ขอบเขตงาน

หน้าที่สร้าง: `src/app/admin/layout.tsx` (ประตูเข้า Admin Zone + sidebar
permission-aware, ครอบคลุมทุกหน้าใต้ `/admin/*` ในจุดเดียว) และ
`src/app/admin/page.tsx` (`/admin` — แดชบอร์ดหลัก แสดงการ์ด KPI mock + รายการ
กิจกรรมล่าสุดจริงจาก `audit_logs`) พร้อม data-access layer สองไฟล์ใหม่
(`src/lib/admin-nav.ts`, `src/lib/admin-dashboard.ts`) และ sidebar component
ใหม่ (`src/components/layout/admin-sidebar.tsx`)

นี่คือ **"shell"** ตามชื่องาน — หน้าย่อยของแต่ละ module (เช่น
`/admin/registry`, `/admin/question-bank` ฯลฯ ที่ sidebar ลิงก์ไปหา) **ยังไม่ถูก
สร้างจริงในงานนี้** คลิกแล้วจะเจอ `not-found.tsx` ชั่วคราว — เป็นพฤติกรรมที่ถูก
ต้องตามขอบเขตงาน ไม่ใช่บั๊ก (เหมือน pattern เดิมที่ยอมรับแล้วใน
`src/components/layout/nav-config.ts::PUBLIC_NAV_ITEMS`) หน้าย่อยจริงแต่ละ
module เป็นงานในอนาคตของ P5 (ดู §7)

## 2. การตัดสินใจสำคัญ

### 2.1 กลไก "permission-aware navigation" — derive จาก permission matrix จริง ไม่ hardcode ต่อ role

"วิธีตรวจสอบ" ของงานนี้ระบุตรงๆ ว่า **"ผู้ใช้เห็นเฉพาะ module ที่มีสิทธิ์"** —
ไม่ใช่ "ผู้ใช้เห็นเฉพาะเมนูตาม role ที่กำหนดไว้ตายตัว" จึงออกแบบให้ sidebar
(`getVisibleAdminNavItems()`) และการ์ด KPI (`getAdminKpiCards()`) **ได้มาจาก
permission matrix จริงโดยตรง** — วนทุก module ใน `MODULES` (M1–M9 จาก
`src/lib/permissions.ts`) แล้วถาม `getPermission(role, module)` ว่ามี entry
หรือไม่ (entry ใดๆ ก็พอ ไม่แยกตาม action) มี entry = แสดง, ไม่มี entry
(deny-by-default) = ซ่อน ไม่มีการเขียน logic การซ่อน/แสดงชุดใหม่แยกต่างหาก
และไม่มี role ใดถูก hardcode ไว้ในโค้ด UI เลย — เพิ่ม/แก้ permission ที่
`src/lib/permissions.ts` จุดเดียว sidebar จะตามให้อัตโนมัติ

### 2.2 ประตูเข้า Admin Zone: `requirePermission("ADMIN", "read")` — ไม่ใช่ allowlist role ใหม่

ต้องตัดสินใจว่าใครเข้า `/admin` ได้บ้าง มีสองทางเลือก: (ก) เขียน
allowlist role ใหม่ในโค้ด (เช่น `requireRole(["SUPER_ADMIN","CENTRAL_OFFICER","AUDITOR"])`)
หรือ (ข) ใช้ permission matrix เดิมโดยถามว่า "มีสิทธิ์อ่าน module ADMIN (M6)
หรือไม่" — **เลือก (ข)** เพราะ M6 Admin ใน `PERMISSION_MATRIX` มี entry
เฉพาะ `SUPER_ADMIN` (CRUD ALL), `CENTRAL_OFFICER` (Read ALL), `AUDITOR`
(Read ALL) เท่านั้นอยู่แล้ว — ตรงกับ `claude/sitemap.md` ข้อ 7 "Zone Access
Summary" ที่ระบุว่ามีเพียง 3 role นี้เข้าถึง Admin Zone ได้ **โดยไม่ต้องเขียน
allowlist ซ้ำอีกชุด** (single source of truth เดียวกับที่ sidebar ใช้) ยืนยัน
ด้วยการทดสอบจริง (ดู §4 Part 1): REGIONAL_ADMIN/REGISTRAR_STAFF/TEACHER/
EXAMINER/STUDENT/Guest ถูกปฏิเสธเข้า `/admin` ครบทุก role ตรงกับที่
sitemap.md ระบุ

### 2.3 Path ของแต่ละ module: `/admin/<module-slug>` (path เดียวต่อ module) แทน path ที่ sitemap.md เสนอไว้

`claude/sitemap.md` ข้อ 5 เสนอ Admin Zone เป็นหลายหน้าไม่ตรงกับ module M1–M9
โดยตรง (เช่น `/admin/users`, `/admin/roles`, `/admin/reference-data` ที่รวม
หลาย module) แต่เอกสารนั้นเองยังเป็น **"ร่างสำหรับ Owner Review"** (ระบุไว้ใน
หัวข้อ 9/10 ของเอกสารว่าชื่อ path ยังไม่ยืนยัน) จึงเลือกให้ path ของ sidebar
เป็น `/admin/<module-slug>` หนึ่ง path ต่อหนึ่ง module (`REGISTRY` →
`/admin/registry`, `QUESTION_BANK` → `/admin/question-bank` ฯลฯ — ดู
`src/lib/admin-nav.ts::ADMIN_NAV_DEFINITIONS`) เพื่อให้ derive จาก `MODULES`
ได้ตรงๆ โดยไม่ต้องเก็บ mapping หลายชั้น เมื่อ Owner ยืนยัน sitemap.md
ภายหลัง ปรับ path ที่ไฟล์นี้จุดเดียวได้โดยไม่กระทบ permission logic ใดๆ เลย

### 2.4 KPI mock: เฉพาะ 5 module ที่มี "จำนวนนับ" ที่สมเหตุสมผล + label "ข้อมูลตัวอย่าง" กำกับชัดเจน

บรีฟระบุ "KPI mock" (มีคำว่า mock กำกับชัดเจน ต่างจาก "recent activity" ที่ไม่มี
— ดู §2.5) จึงใช้ค่าคงที่ (`KPI_MOCK_DEFINITIONS` ใน
`src/lib/admin-dashboard.ts`) ไม่ query ฐานข้อมูลจริง เพราะ endpoint/ตารางที่
จะผลิตตัวเลขจริงของแต่ละ module (เช่น จำนวนข้อสอบที่รออนุมัติจริงของ M3,
จำนวนรอบสอบจริงของ M4) ยังไม่ถูกสร้าง — นอกขอบเขตงาน "shell" นี้ (ดู §6)
เลือกให้ KPI เฉพาะ 5 module ที่มีความหมายเป็น "จำนวนนับ" ได้ตามธรรมชาติ
(REGISTRY/QUESTION_BANK/TESTING/MEMBERSHIP/IMPORT) — ตัด ADMIN/FILES/
RBAC_CONFIG ออก เพราะไม่มีตัวเลขที่มีความหมายชัดเจนพอจะ mock อย่างมีเหตุผล
ทุกการ์ด KPI แสดง badge **"ข้อมูลตัวอย่าง"** กำกับไว้บนหน้าจอจริง (ไม่ใช่แค่
comment ในโค้ด) เพื่อไม่ให้ผู้ใช้เข้าใจผิดว่าเป็นรายงานจริง — สอดคล้องกับ
dev-rules.md ข้อ 1 (ห้ามใช้ข้อมูลจริงจนกว่าจะผ่าน Real-data Readiness Gate)
และป้องกันไม่ให้ตัวเลขสมมติถูกเข้าใจผิดว่าเป็นรายงานที่ใช้งานจริงได้

การกรอง KPI ใช้กติกาเดียวกับ sidebar (`getPermission(role, module) !== null`)
— ในทางปฏิบัติทั้ง 3 role ที่ผ่านประตู `/admin` เข้ามาได้ (SUPER_ADMIN/
CENTRAL_OFFICER/AUDITOR) ล้วนมีสิทธิ์เห็นทั้ง 5 module ที่มี KPI mock อยู่แล้ว
(ดู PERMISSION_MATRIX) จึงเห็นการ์ด KPI ชุดเดียวกันทั้งหมด — **นี่เป็น
คุณสมบัติจริงของ permission matrix ปัจจุบัน ไม่ใช่ช่องว่างของการทดสอบ** กลไก
การกรองเองพิสูจน์ได้แล้วผ่าน sidebar (SUPER_ADMIN 9 module vs CENTRAL_OFFICER
8 module — ดู §4 Part 2) เพราะใช้ฟังก์ชันตัวกรองแบบเดียวกัน

### 2.5 Recent activity: ข้อมูลจริงจาก `audit_logs` — ไม่ใช่ mock

ต่างจาก KPI ตรงที่บรีฟไม่ได้แนบคำว่า "mock" กับ "recent activity" จึงตีความว่า
ต้องเป็นข้อมูลจริง — ใช้ตาราง `audit_logs` (P1, มีอยู่แล้ว, append-only บังคับ
ด้วย DB trigger `audit_logs_no_update`/`audit_logs_no_delete`) แสดง 10
รายการล่าสุดเรียงตาม `createdAt DESC` ไม่มีเงื่อนไข scope เพิ่มเติมนอกจากที่
ประตู `/admin` ตรวจไปแล้ว เพราะ module `ADMIN` (จุดตรวจสิทธิ์เดียวของ
`/admin`) มี `scope: ALL` เหมือนกันหมดสำหรับทั้ง 3 role ที่เข้าถึงได้ — ไม่มี
role ใดที่ผ่าน guard เข้ามาแล้วควรเห็น audit log แคบกว่ากัน (ยืนยันด้วยการ
ทดสอบจริงว่า CENTRAL_OFFICER เห็น feed เดียวกับ SUPER_ADMIN เป๊ะ — ดู §4 Part 4)

**ผลข้างเคียงที่ต้องรู้**: `prisma/seed.ts` ตั้งใจไม่เขียนแถวลง `audit_logs`
(ดูคอมเมนต์ท้ายไฟล์นั้น) ดังนั้นหลัง `--reset` + seed สด `audit_logs` จะว่าง
เปล่าเสมอ — หน้าแดชบอร์ดจึงต้องจัดการกรณีนี้ด้วย `EmptyState` ("ยังไม่มี
กิจกรรม") ไม่ใช่แสดงเป็น error หรือปล่อยว่างเปล่าไม่มีคำอธิบาย (ทดสอบจริงแล้ว
— ดู §4 Part 4 และหมายเหตุเรื่องลำดับการรัน regression suite ด้านล่าง)

### 2.6 RootLayout เดิม (SiteHeader/SiteFooter สาธารณะ) ยังคงครอบ `/admin` — ไม่แยก route group

`src/app/layout.tsx` (RootLayout จากงาน P4 Design System + Layout) มีคอมเมนต์
เดิมอยู่แล้วว่า "ยังไม่แยก route group (public)/(member)/(admin) ... เพราะยัง
ไม่ใช่ขอบเขตงานนั้น" งานนี้ยึดการตัดสินใจเดิมต่อ — **ไม่แก้ RootLayout** ตาม
ข้อจำกัด "แก้เฉพาะไฟล์ที่เกี่ยวข้องกับงานนี้" ผลคือหน้า Admin จะมี Header/Footer
สาธารณะ (โลโก้, เมนู public, ปุ่มเข้าสู่ระบบ/แดชบอร์ด) ซ้อนอยู่เหนือ/ใต้ Admin
Sidebar+Content ชั่วคราว — ไม่ใช่บั๊ก แต่เป็นข้อจำกัดที่ต้องแจ้งโปร่งใส (ดู §6)

## 3. Function Specification

### F6.1 — `/admin` layout: ประตูเข้า Admin Zone + Sidebar permission-aware (`src/app/admin/layout.tsx`, `src/lib/admin-nav.ts`)

| หัวข้อ | รายละเอียด |
|---|---|
| Actor | SUPER_ADMIN, CENTRAL_OFFICER, AUDITOR เท่านั้น |
| Input | ไม่มี (อ่าน session ผ่าน `requirePermission()`) |
| Process | `requirePermission("ADMIN","read")` → `getVisibleAdminNavItems(role)` → render sidebar + children |
| Output | JSX (sidebar + children) หรือ redirect |
| Permission | `requirePermission("ADMIN","read")` — deny-by-default |
| Validation | n/a |
| Error State | ไม่มี session → redirect `/login`; ไม่มีสิทธิ์ → redirect `/dashboard?error=forbidden`; database error → throw (fail-closed) |
| Audit | ไม่บันทึก (page view ไม่ใช่การเปลี่ยนแปลงข้อมูล) |
| Acceptance Criteria | AC1: ไม่มี session → `/login`; AC2: role ที่ไม่มี entry `ADMIN` → `/dashboard?error=forbidden`; AC3: SUPER_ADMIN เห็น 9 module, CENTRAL_OFFICER เห็น 8 (ไม่มี RBAC_CONFIG), AUDITOR เห็น 9; AC4: หน้าย่อยที่ยังไม่ถูกสร้าง → `not-found.tsx` ปกติ |

### F6.3 — KPI mock cards (`src/app/admin/page.tsx`, `src/lib/admin-dashboard.ts::getAdminKpiCards`)

| หัวข้อ | รายละเอียด |
|---|---|
| Actor | ตรงกับ F6.1 |
| Input | role ของผู้ใช้ปัจจุบัน |
| Process | กรอง `MODULES` ด้วย `getPermission(role, module) !== null` แล้วกรองต่อด้วยว่ามี KPI mock กำหนดไว้หรือไม่ (5 module: REGISTRY/QUESTION_BANK/TESTING/MEMBERSHIP/IMPORT) |
| Output | การ์ด KPI 0–5 ใบ พร้อม badge "ข้อมูลตัวอย่าง" |
| Permission | derive จาก permission matrix ที่ตรวจแล้วที่ layout (ไม่ตรวจซ้ำ) |
| Validation | n/a |
| Error State | ไม่มี (pure function, ไม่มี I/O) |
| Audit | ไม่บันทึก (ข้อมูลสมมติ) |
| Acceptance Criteria | AC1: role ที่ไม่มีสิทธิ์เห็น module กลุ่ม KPI เลย → array ว่าง; AC2: ค่าทั้งหมดเป็นข้อมูลสมมติ hardcode ล่วงหน้า ไม่มี query ฐานข้อมูลเกิดขึ้น |

### F6.4 — Recent activity (`src/app/admin/page.tsx`, `src/lib/admin-dashboard.ts::listRecentActivity`)

| หัวข้อ | รายละเอียด |
|---|---|
| Actor | ตรงกับ F6.1 |
| Input | ไม่มี |
| Process | `SELECT ... FROM audit_logs LEFT JOIN users ... ORDER BY "createdAt" DESC LIMIT 10` |
| Output | รายการกิจกรรม 0–10 รายการ (เรียงใหม่สุดก่อน) หรือ `EmptyState` ถ้าว่างเปล่า |
| Permission | ไม่ตรวจสิทธิ์เอง — พึ่ง `requirePermission("ADMIN","read")` ของหน้า/layout ที่เรียกมาก่อนเสมอ |
| Validation | n/a |
| Error State | database error → throw ขึ้นไป (fail-closed, กลายเป็น `error.tsx`) — ทดสอบจริงแล้วด้วยวิธี forced-error (ดู §4) |
| Audit | ไม่บันทึกเอง (read-only) |
| Acceptance Criteria | AC1: `audit_logs` ว่างเปล่า → `EmptyState` "ยังไม่มีกิจกรรม"; AC2: มากกว่า 10 แถว → คืนเฉพาะ 10 แถวล่าสุด; AC3: `actorId` เป็น null → `actorName` เป็น null ไม่ throw (LEFT JOIN) |

## 4. ผลการทดสอบจริง (รันเมื่อ 2026-09-24)

**หมายเหตุลำดับการรัน (สำคัญ)**: `test-admin-dashboard.mjs` ต้องรันทันทีหลัง
`dev-migrate-verify.mjs --reset` + seed และ**ก่อน** `test-rbac-scope.mjs`/
`test-authz-guard.mjs` เพราะ Part 4 ของ suite นี้ตรวจ `EmptyState` ของ
`audit_logs` ตอนยังว่างเปล่า (ทั้งสอง suite หลังจะ grant/revoke scope ผ่าน HTTP
จริง ซึ่งเขียนแถว `audit_logs` จริง ทำให้ตารางไม่ว่างอีกต่อไป) — ถ้ารันผิดลำดับ
suite นี้จะ `[SKIP]` การตรวจ EmptyState โดยอัตโนมัติ (ไม่ fail) แล้วทดสอบส่วน
ที่เหลือต่อได้ตามปกติ (ดูโค้ดในไฟล์)

```
$ node prisma/dev-migrate-verify.mjs --reset
Reset + full replay: PASSED (11 migrations)

$ npx tsx prisma/seed.ts    # รันซ้ำ 2 ครั้งติดกัน — output เหมือนกันทุกประการ (idempotent)
Seed committed successfully.

$ npm run dev   # restart ปกติ (ไม่มี env var พิเศษ)

$ node prisma/test-admin-dashboard.mjs      # ใหม่ทั้งหมด — งานนี้
=== Part 1: /admin — deny-by-default entry gate (F6.1) ===
  [PASSED] no session -> 307 redirect to /login
  [PASSED] REGIONAL_ADMIN/TEACHER/EXAMINER/STUDENT -> 307 redirect ไป /dashboard?error=forbidden (4 role)
  [PASSED] REGISTRAR_STAFF (เปิดใช้งานชั่วคราว) -> 307 redirect ไป /dashboard?error=forbidden
  [PASSED] SUPER_ADMIN/CENTRAL_OFFICER/AUDITOR -> 200 (3 role)
=== Part 2: permission-aware sidebar navigation (F6.1) ===
  [PASSED] SUPER_ADMIN: เห็นครบ 9 module
  [PASSED] CENTRAL_OFFICER: เห็น 8 module (ไม่มี RBAC_CONFIG)
  [PASSED] AUDITOR: เห็นครบ 9 module
=== Part 3: KPI mock cards (F6.3) ===
  [PASSED] SUPER_ADMIN เห็นการ์ด KPI ครบ 5 ใบ พร้อม badge "ข้อมูลตัวอย่าง"
=== Part 4: recent activity (F6.4) ===
  [PASSED] audit_logs ว่างเปล่า (หลัง seed สด) -> EmptyState "ยังไม่มีกิจกรรม" (3 role)
  [PASSED] grant scope จริงผ่าน HTTP -> แดชบอร์ดแสดง entityType/action จริงจาก audit_logs
  [PASSED] revoke scope จริงผ่าน HTTP -> เพิ่มแถว UPDATE จริง เรียงลำดับ createdAt DESC ถูกต้อง
  [PASSED] CENTRAL_OFFICER เห็น feed เดียวกับ SUPER_ADMIN (ADMIN module scope=ALL ทั้งคู่)
52 passed, 0 failed

$ node prisma/test-exam-document-domain.mjs      # regression เดิม (ไม่แตะไฟล์นี้เลยในงานนี้)
23 passed, 0 failed

$ node prisma/test-auth-login.mjs                # regression เดิม
24 passed, 0 failed

$ node prisma/test-rbac-scope.mjs                # regression เดิม
28 passed, 0 failed

$ node prisma/test-authz-guard.mjs               # regression เดิม
23 passed, 0 failed

$ node prisma/test-curriculum-pages.mjs          # regression เดิม
36 passed, 0 failed

$ node prisma/test-news-pages.mjs                # regression เดิม
35 passed, 0 failed

$ node prisma/test-exam-bank-pages.mjs           # regression เดิม
44 passed, 0 failed

$ node prisma/test-library-pages.mjs             # regression เดิม
46 passed, 0 failed

$ AUTH_SESSION_MAX_AGE_SECONDS=3 npm run dev     # restart เฉพาะสำหรับ test นี้
$ node prisma/test-auth-session-expiry.mjs       # regression เดิม
2 passed, 0 failed

$ npm run dev   # restart ปกติกลับมา
$ node prisma/test-layout-responsive.mjs   # เพิ่ม Part 3 (/admin หลังล็อกอินจริงเป็น
                                            # SUPER_ADMIN — sidebar เดสก์ท็อป/มือถือ,
                                            # KPI grid, recent activity — 4 viewport)
344 passed, 0 failed   # เดิม 318 + ใหม่ 26

$ npx next typegen
✓ Types generated successfully (มี /admin เป็น route ใหม่แล้ว)

$ npx tsc --noEmit
(no output — 0 errors)

$ npm run lint
(no output — 0 errors, 0 warnings)

$ npx next build
✓ Compiled successfully — /admin ปรากฏใน route list (ƒ /admin, dynamic เพราะ
  requirePermission() อ่าน session ทุกครั้ง)
```

**Forced-error test (error.tsx) — ทำแล้วลบออกตามระเบียบ**: เพิ่ม throw ชั่วคราว
ใน `listRecentActivity()` กัน้ำด้วย `TEST_FORCE_ADMIN_DASHBOARD_ERROR=1`, restart
dev server ด้วย env var นั้น, เข้า `/admin` ด้วย Playwright ในฐานะ SUPER_ADMIN
→ ยืนยันเห็นข้อความ "เกิดข้อผิดพลาดบางอย่าง"/"ลองใหม่" จาก root `error.tsx`
จริง แล้วลบ hook ออกทั้งหมด ยืนยันด้วย `grep -rn "TEST_FORCE" src/` (ไม่พบ) +
`tsc --noEmit` (ผ่าน) ก่อนรัน regression ชุดสุดท้ายด้านบน

**รวมการทดสอบจริงที่รันสำเร็จในงานนี้: 52 assertion ใหม่ทั้งหมด
(`test-admin-dashboard.mjs`) + 26 assertion ใหม่ใน `test-layout-responsive.mjs`
(รวม 78 assertion ใหม่) + regression เดิมทั้งหมดผ่านครบ (23+24+28+23+36+35+44+
46+2+318=579) รวมทั้งหมดหลังงานนี้ = 579 + 78 = 657 assertion**

## 5. Failure Mode และ Recovery

- **`getPermission()`/`can()` throw (database error ขณะตรวจสิทธิ์ที่ layout)**
  — `requirePermission()` ไม่ catch เอง ปล่อย throw ขึ้นไปกลายเป็น `error.tsx`
  (fail-closed) ไม่ใช่ตีความเป็น "อนุญาต" หรือ "ปฏิเสธเงียบๆ" โดยบังเอิญ —
  ผู้ใช้เห็นข้อความทั่วไป + digest อ้างอิง ไม่เห็นรายละเอียด SQL/stack trace
  (ตาม dev-rules.md ข้อ 7) — recovery: ตรวจ log ฝั่ง server ด้วย digest แล้ว
  แก้ที่ต้นเหตุ (เช่น database connection)
- **`listRecentActivity()` query ล้มเหลว** — throw ขึ้นไปเช่นกัน กลายเป็น
  `error.tsx` ของทั้งหน้า `/admin` (ไม่ใช่แค่ widget เดียวพัง เพราะเป็น Server
  Component เดียวที่ await ทั้งสองอย่างก่อน render) — ทดสอบจริงแล้วด้วย
  forced-error methodology (ดู §4) — recovery: ตรวจ log แล้วโหลดหน้าใหม่ (ปุ่ม
  "ลองใหม่" ของ `error.tsx`)
- **`audit_logs` ว่างเปล่าถูกเข้าใจผิดว่าเป็น error** — ป้องกันไว้แล้วด้วยการ
  แยก "query สำเร็จแต่ไม่มีข้อมูล" (`EmptyState`) ออกจาก "query ล้มเหลว"
  (`error.tsx`) อย่างชัดเจนตาม pattern เดิมของโปรเจกต์ (`EmptyState` component
  ใช้แล้วในหน้าอื่นๆ เช่น `/curriculum`) — ไม่มีทาง confuse สองกรณีนี้เพราะเป็น
  UI คนละชุดกัน ไม่ใช่ error message ที่ต้อง parse
- **sidebar/KPI แสดงเมนู/การ์ดผิด role เพราะ permission matrix ถูกแก้ผิด** —
  ไม่ใช่ความเสี่ยงของโค้ดในงานนี้เอง (ไฟล์นี้ไม่มี logic ตัดสินสิทธิ์ของตัวเอง
  เลย เป็นเพียงตัวแสดงผลจาก `getPermission()`) ความเสี่ยงจึงอยู่ที่การแก้ไข
  `src/lib/permissions.ts` โดยตรง — recovery: แก้ที่ permission matrix จุดเดียว
  แล้ว regression test เดิมทั้งหมด (test-rbac-scope.mjs, test-authz-guard.mjs,
  test-admin-dashboard.mjs) จะจับความเปลี่ยนแปลงที่ไม่ได้ตั้งใจได้ทันที
- **หน้าย่อยใต้ `/admin/*` ที่ยังไม่ถูกสร้าง ถูกเข้าใจผิดว่าเป็นลิงก์เสีย** —
  ตั้งใจให้เจอ `not-found.tsx` (ดู §1) ไม่ใช่บั๊ก — ไม่มี recovery ที่ต้องทำ
  จนกว่าจะถึงคิวสร้างหน้าย่อยนั้นจริงตาม roadmap (§7)

## 6. ขอบเขตที่ตัดออก (โปร่งใส สำหรับ Owner Review)

1. **หน้าย่อยของแต่ละ module (`/admin/registry`, `/admin/question-bank`,
   `/admin/testing`, `/admin/membership`, `/admin/settings`, `/admin/import`,
   `/admin/files`, `/admin/rbac-config`, `/admin/curriculum`) ยังไม่ถูกสร้าง**
   — นี่คืองาน "shell" ตามชื่อ ไม่ใช่ Admin Console เต็มรูปแบบ — sidebar ลิงก์
   ไปหาแล้วแต่ยังเป็น `not-found.tsx`
2. **KPI ยังเป็นข้อมูลสมมติทั้งหมด (5 module)** — รอ endpoint/query จริงของ
   แต่ละ module (เช่น จำนวนข้อสอบรออนุมัติจริงต้อง query `QuestionVersion`
   ที่ status=PENDING ของ M3) ซึ่งยังไม่มี UI/business logic รองรับ
3. **ไม่มี path การจัดการ scope ใน UI** — `/admin/rbac-config` ที่ sidebar
   ลิงก์ไปยังไม่มีหน้าจอจริง มีเฉพาะ Server Action/API เดิม
   (`grantOrganizationScopeAction`/`/api/admin/organization-scopes`) จากงาน
   RBAC ก่อนหน้า — ตรงกับขอบเขตที่ตัดออกข้อ 3 ของ `roles-permissions.md` อยู่แล้ว
4. **path ของแต่ละ module (`/admin/<module-slug>`) เป็นข้อเสนอของงานนี้เอง
   ไม่ใช่จาก sitemap.md โดยตรง** — sitemap.md เองยังไม่ยืนยัน (ดู §2.3) —
   Owner อาจต้องการ path/การจัดกลุ่มเมนูต่างจากนี้เมื่อยืนยัน sitemap.md จริง
5. **RootLayout (SiteHeader/SiteFooter สาธารณะ) ยังคงครอบ `/admin`** — ไม่แยก
   route group `(admin)` ตาม sitemap.md ข้อ 2 (ดู §2.6) — Header สาธารณะ
   (โลโก้/เมนู public) จะปรากฏซ้อนเหนือ Admin Sidebar ชั่วคราว
6. **"recent activity" แสดงทุก entityType ปนกัน ไม่มีตัวกรอง** — 10 รายการ
   ล่าสุดจาก `audit_logs` ทั้งตาราง ไม่แยกตาม module/entityType — ยังไม่มี UI
   กรอง/pagination ของ audit log เต็มรูปแบบ (นั่นคือ `/admin/audit-log` ตาม
   sitemap.md ข้อ 5.3 ซึ่งเป็นหน้าแยกในอนาคต)
7. **ไม่มี real-time update** — recent activity เป็น server-render ครั้งเดียว
   ต่อการโหลดหน้า ไม่มี polling/websocket รีเฟรชอัตโนมัติ

## 7. งานถัดไปที่ควรทำ

1. สร้างหน้าย่อยจริงของแต่ละ module ตาม sidebar ที่มีอยู่แล้ว (เริ่มจาก M3
   คลังข้อสอบ/M7 Import ตามลำดับความสำคัญที่ requirements.md ระบุ)
2. แทนที่ KPI mock ด้วย query จริงทีละ module เมื่อ UI/business logic ของ
   module นั้นถูกสร้างขึ้น (ดู §6 ข้อ 2)
3. สร้าง `/admin/audit-log` (ตาม sitemap.md ข้อ 5.3) เป็นหน้าแยกที่มีตัวกรอง/
   pagination เต็มรูปแบบ แทนที่ "recent activity" แบบย่อในแดชบอร์ดหลัก
4. แยก route group `(admin)` ออกจาก RootLayout สาธารณะเมื่อ Admin Console
   เติบโตขึ้น (ดู §6 ข้อ 5 และคอมเมนต์เดิมใน `src/app/layout.tsx`)
5. ยืนยันกับ Owner เรื่อง path ของแต่ละ module (§2.3/§6 ข้อ 4) และการตีความ
   M6 Admin ของ CENTRAL_OFFICER (read-only ทั้งหมด — ประเด็นเดิมจาก
   `roles-permissions.md` ข้อ 8.2 ที่ยังไม่ได้ข้อสรุป)
