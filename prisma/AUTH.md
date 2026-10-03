# Auth.js และ Session — P3 Authentication & RBAC

งาน: "ติดตั้ง Auth.js และ Session" — ผลลัพธ์ที่ต้องส่ง: auth config, login/logout
(ทดสอบจริง: login/logout/expired session/error state)

เอกสารนี้เป็นทั้ง (1) function spec ที่เขียนก่อนเริ่ม implement ตาม dev-rules.md
("ห้ามเริ่ม implement ก่อนมี spec ครบ 9 หัวข้อ") และ (2) บันทึกผลการทดสอบจริงเมื่อ
งานเสร็จ — สอดคล้องกับรูปแบบที่ `prisma/exam-document-schema.md` ใช้ในงานก่อนหน้า

## 1. สถาปัตยกรรมโดยสรุป

- **Auth.js v5** (`next-auth@5.0.0-beta.32`, ยืนยัน peerDependency รองรับ
  Next.js `^16.0.0` และ React 19 แล้วก่อนติดตั้ง) — Credentials provider เท่านั้น
  (ดูขอบเขตที่ตัดออก ข้อ 7)
- **Session strategy = `jwt`** — ไม่มี "database" strategy เพราะไม่มี Prisma
  Adapter ที่ใช้งานได้จริง (Prisma CLI/Client ใช้งานไม่ได้ในสภาพแวดล้อมนี้ ดู
  prisma/MIGRATIONS.md หัวข้อ 1)
- **Authentication (Auth.js) แยกจาก Authorization (custom layer)** ตาม
  adr/0003-authjs-server-side-authorization.md: `src/lib/authz.ts` คือเลเยอร์
  ตรวจสอบสิทธิ์จริง (deny-by-default, query ฐานข้อมูลสดทุกครั้ง) — session/JWT
  เป็นเพียงแหล่งข้อมูล identity ตอน sign-in เท่านั้น ไม่ใช่จุดตัดสินใจสุดท้าย
- **proxy.ts** (Next.js 16 เปลี่ยนชื่อจาก `middleware.ts` — ดู
  node_modules/next/dist/docs/.../proxy.md, ตรวจสอบก่อนเขียนโค้ดเพราะ
  AGENTS.md เตือนว่า Next.js เวอร์ชันนี้มี breaking changes จาก training data
  จริง) ทำ optimistic redirect เท่านั้น ไม่ใช่จุดตรวจสอบสิทธิ์จริง

## 2. ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|---|---|
| `src/auth.ts` | Auth.js config, Credentials `authorize()` (พิสูจน์ตัวตนจริงทั้งหมดอยู่ที่นี่) |
| `src/lib/db.ts` | raw `pg` Pool (ใช้แทน `@prisma/client` เหมือนทั้งโปรเจกต์) |
| `src/lib/password.ts` | bcryptjs hash/verify + timing-safe dummy compare |
| `src/lib/login-security.ts` | login_lockouts (rate-limit/lockout counter+expiry) |
| `src/lib/login-audit.ts` | login_audit_logs (audit การ login ทุกครั้ง แบบ append-only) |
| `src/lib/auth-config.ts` | ค่าคงที่ session timeout / lockout จาก env var |
| `src/lib/auth-errors.ts` | CredentialsSignin subclasses (invalid/locked/inactive) |
| `src/lib/authz.ts` | permission-resolution layer (getCurrentUser/requireUser/requireRole) |
| `src/lib/domain-types.ts` | UserRole/UserStatus mirror ของ schema.prisma (ไม่มี @prisma/client) |
| `src/proxy.ts` | optimistic route-protection redirect |
| `src/app/api/auth/[...nextauth]/route.ts` | Auth.js route handler |
| `src/app/actions/auth.ts` | Server Actions: `loginAction`, `logoutAction` |
| `src/app/login/page.tsx` + `login-form.tsx` | หน้า login |
| `src/app/dashboard/page.tsx` + `logout-button.tsx` | protected page ขั้นต่ำสำหรับพิสูจน์ session |
| `prisma/migrations/20260923150512_auth_credentials_and_login_security/migration.sql` | `users.passwordHash` + `login_lockouts` + `login_audit_logs` |
| `prisma/test-auth-login.mjs` | ทดสอบจริงผ่าน HTTP: login/logout/lockout/inactive/authz |
| `prisma/test-auth-session-expiry.mjs` | ทดสอบจริง: session หมดอายุจริง (ต้องรัน dev server ด้วย `AUTH_SESSION_MAX_AGE_SECONDS` สั้นๆ) |

## 3. การตัดสินใจเชิงวิศวกรรม (โปร่งใสตามรูปแบบเดิมของโปรเจกต์)

1. **Credentials เท่านั้น ไม่รวม OAuth ในงานนี้** — โจทย์ระบุ "Credentials/OAuth
   ตามที่เลือก" ให้เลือกได้ เลือก Credentials-first เพราะ (ก) ไม่มี OAuth
   provider client secret จริงให้ทดสอบในสภาพแวดล้อม sandbox นี้ (ข)
   requirements.md §8 ตัวอย่าง Login และ user-flows.md F5.4 อธิบายเฉพาะ
   email+password (ค) โครงสร้าง Auth.js รองรับเพิ่ม OAuth provider ในอนาคตโดย
   ไม่กระทบโค้ดที่มีอยู่ (เพิ่ม provider ใหม่ใน `providers: []`)
2. **bcryptjs แทน `bcrypt`/`argon2`** — ทั้งสองต้อง compile native addon ซึ่งมี
   ความเสี่ยงในสภาพแวดล้อมนี้ (บทเรียนเดียวกับที่ Prisma engine ถูกบล็อกเพราะ
   ต้องดาวน์โหลด native binary) bcryptjs (pure JS) ช้ากว่าเล็กน้อยแต่ทำงานได้แน่นอน
3. **Session timeout = 8 ชั่วโมง (ค่าเริ่มต้น, ปรับได้ผ่าน `AUTH_SESSION_MAX_AGE_SECONDS`)**
   — dev-rules.md §10 เลื่อนการตัดสินใจนี้มาที่เฟสนี้โดยตั้งใจ ("ตั้งค่า session
   timeout ตามนโยบายความปลอดภัยที่จะกำหนดใน P2") เลือก 8 ชม. เพราะใกล้เคียง 1
   วันทำการของเจ้าหน้าที่สำนักงาน/ทะเบียน โดยไม่ยาวเกินไปจนเป็นความเสี่ยงหาก
   อุปกรณ์สูญหาย — F6.5 (Super-Admin ตั้งค่าระบบ) จะย้ายค่านี้เป็น
   configurable ในอนาคต (นอกขอบเขตงานนี้)
4. **Lockout: 5 ครั้งติดต่อกัน (ตามที่ requirements.md §8 AC2 ระบุไว้ชัดเจน),
   ระยะเวลาล็อก = 15 นาที (ค่าเริ่มต้น, ปรับได้ผ่าน `AUTH_LOGIN_LOCKOUT_MINUTES`)**
   — จำนวนครั้งมีระบุในเอกสารอยู่แล้ว แต่ "ระยะเวลา" ไม่ได้ถูกระบุไว้ที่ใดเลย
   (architecture.md §3.4, ADR-0004, user-flows.md F5.1/F6.5 ระบุกลไกแต่ไม่ระบุ
   ตัวเลข) — 15 นาทีเป็นค่าที่สมเหตุสมผลตามมาตรฐานทั่วไป บันทึกไว้อย่างชัดเจนว่า
   เป็นการตัดสินใจของทีมพัฒนา ไม่ใช่ค่าที่มาจากสเปก
5. **Lockout เป็น per-account ไม่ใช่ per-IP** — requirements.md §8 AC2 ระบุ "ผู้ใช้
   ที่กรอกรหัสผ่านผิด 5 ครั้งติดต่อกัน" (ต่อบัญชี) ส่วน "Validation" line ของสเปก
   เดียวกันพูดถึง "rate limit ต่อ IP/account" อย่างกว้างๆ — เลือก implement
   เฉพาะ per-account ในงานนี้ (ตรงกับ AC ที่วัดผลได้ชัดเจน) ส่วน rate-limit ต่อ IP
   (ป้องกัน credential stuffing ข้ามบัญชีจาก IP เดียว) บันทึกเป็นงานเสริมในอนาคต
   ที่ยังไม่ทำ (ดูขอบเขตที่ตัดออก ข้อ 3)
6. **`login_audit_logs` เป็นตารางแยกจาก `AuditLog` ทั่วไป** — `AuditLog` ผูก
   `entityType`/`entityId`/CRUD action และต้องการ `actorId` ที่อ้างอิง User จริง
   แต่ login attempt ที่พิมพ์ email ผิด/ไม่มีอยู่จริงไม่มี User row ให้ actorId
   อ้างอิง และความหมายเป็น "authentication event" ไม่ใช่ CRUD บน entity — จึงแยก
   ตารางเฉพาะ (เป็น append-only เหมือนกัน บังคับด้วย DB trigger เหมือน `AuditLog`)
7. **Deny-by-default เฉพาะระดับ role ในงานนี้ ยังไม่ทำ resource-scope**
   — `src/lib/authz.ts` (`requireRole`) ตรวจสอบเฉพาะว่า role อยู่ใน allowlist
   หรือไม่ ยังไม่ implement ขอบเขตแบบละเอียดตาม requirements.md §6 permission
   matrix (เช่น REGIONAL_ADMIN เห็นเฉพาะเขตของตน) — เป็นงาน RBAC เต็มรูปแบบ
   (แนวโน้มจะเป็น M9) แยกต่างหาก ผลลัพธ์ที่ต้องส่งของงานนี้คือ "auth config,
   login/logout" เท่านั้น
8. **สถานะบัญชี (role/status) ตรวจสอบสดจากฐานข้อมูลทุกครั้งใน `getCurrentUser()`
   ไม่ใช้ค่าจาก JWT ตรงๆ** — เพราะ JWT strategy ไม่มี "database session" ให้
   invalidate ทันทีเมื่อ Admin ระงับ/เปลี่ยนบทบาทผู้ใช้ระหว่างที่ session ยัง
   ไม่หมดอายุ `getCurrentUser()` (ที่ทุก Server Action/protected page ต้องเรียก)
   จึง re-query สถานะบัญชีปัจจุบันเสมอ — ทดสอบจริงแล้วว่าบัญชีที่ถูกเปลี่ยนเป็น
   SUSPENDED ระหว่าง session ถูกปฏิเสธทันทีในการเรียกครั้งถัดไป (ดูผลทดสอบข้อ
   7 ด้านล่าง) แม้ JWT cookie จะยังไม่หมดอายุจริงก็ตาม — นี่คือ "expired
   session" ที่มีความหมายทางธุรกิจจริง (ไม่ใช่แค่ JWT timestamp)

## 4. Function Spec

### Function: เข้าสู่ระบบด้วยอีเมลและรหัสผ่าน (Login)
- **Actor**: Guest (ผู้ใช้ที่ยังไม่ login) — ทุกบทบาทที่ลงทะเบียนแล้วใช้ endpoint นี้ร่วมกัน
- **Input**: `email` (string, required, valid email format), `password` (string, required)
- **Process**:
  1. ตรวจรูปแบบ input เบื้องต้น (email ต้องมี `@`, ทั้งสองฟิลด์ต้องไม่ว่าง)
  2. ค้นหาผู้ใช้จาก email (raw SQL, `deletedAt IS NULL`)
  3. หากไม่พบผู้ใช้ หรือยังไม่มี `passwordHash` (บัญชีที่ยังไม่ตั้งรหัสผ่าน) → รัน
     bcrypt compare กับ dummy hash คงที่ (timing-safe) แล้วปฏิเสธแบบ generic
  4. ตรวจสอบ `login_lockouts` — ถ้าถูกล็อกอยู่ (`lockedUntil` ในอนาคต) → ปฏิเสธ
     พร้อมแจ้งเวลาที่เหลือ โดยไม่ตรวจรหัสผ่านต่อ
  5. เทียบรหัสผ่านด้วย bcrypt — ผิด → เพิ่มตัวนับ `login_lockouts` แบบ atomic
     (ใน transaction, ใช้ `INSERT ... ON CONFLICT DO UPDATE SET x = x + 1`) ถ้า
     ถึง 5 ครั้ง → ตั้ง `lockedUntil` = now + 15 นาที และรีเซ็ตตัวนับ
  6. ถูกต้อง → รีเซ็ตตัวนับ lockout เสมอ (พิสูจน์ตัวตนสำเร็จแล้ว) จากนั้นตรวจ
     `status` — ไม่ใช่ `ACTIVE` → ปฏิเสธพร้อมข้อความสถานะที่ชัดเจน (F5.4)
  7. ผ่านทุกขั้นตอน → คืน user object ให้ Auth.js สร้าง JWT/session
- **Output**: session token (httpOnly, `SameSite=Lax` cookie, จัดการโดย
  Auth.js) + redirect ไป `/dashboard`
- **Permission**: Guest เท่านั้น (ผู้ที่ login อยู่แล้วถูก `/login` เอง redirect
  ออกก่อนเห็นฟอร์ม — ดู `src/app/login/page.tsx`)
- **Validation**: email รูปแบบถูกต้อง, password ไม่ว่าง, rate limit ต่อ account
  (5 ครั้ง/15 นาที)
- **Error State**:
  - Invalid credentials (ไม่ว่าจะ email ไม่มีอยู่จริง หรือรหัสผ่านผิด) →
    "อีเมลหรือรหัสผ่านไม่ถูกต้อง" เท่านั้น (ไม่ระบุว่าฝั่งใดผิด)
  - Account locked → แจ้งจำนวนนาทีที่ต้องรอ
  - Account inactive (PENDING_VERIFICATION/PENDING_APPROVAL/SUSPENDED/REJECTED)
    → ข้อความอธิบายสถานะที่ชัดเจนตามสถานะจริง (ต่างจาก invalid credentials เพราะ
    ผู้ใช้พิสูจน์ตัวตนถูกต้องแล้ว ไม่ใช่ความเสี่ยง account enumeration)
  - Server error (เช่น database ล่ม) → "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่อีกครั้ง"
    เท่านั้น, log รายละเอียดเต็มฝั่ง server (`console.error`) เท่านั้น
- **Audit**: บันทึกทุกครั้งที่ login สำเร็จ/ล้มเหลวลง `login_audit_logs` พร้อม
  timestamp, IP (`x-forwarded-for`), user-agent, `failureReason` (diagnostics
  ฝั่ง server เท่านั้น ไม่ส่งให้ client)
- **Acceptance Criteria**:
  - AC1: ผู้ใช้ที่กรอกถูกต้อง (บัญชี ACTIVE) เข้าสู่ระบบสำเร็จและได้รับ session ที่มี role ถูกต้อง — **ทดสอบจริงแล้ว (ผ่าน)**
  - AC2: ผู้ใช้ที่กรอกรหัสผ่านผิด 5 ครั้งติดต่อกันถูกล็อกบัญชีชั่วคราว — **ทดสอบจริงแล้ว (ผ่าน)**
  - AC3: ไม่มีข้อมูล credential รั่วไหลผ่าน error message หรือ log ที่ไม่ได้ mask — **ทดสอบจริงแล้ว (ผ่าน — unknown-email และ wrong-password ให้ error code เดียวกันทุกประการ)**

### Function: ออกจากระบบ (Logout)
- **Actor**: Member ที่ login อยู่
- **Input**: none
- **Process**: `signOut()` ของ Auth.js — ลบ session cookie (JWT strategy ไม่มี database session ให้ลบเพิ่ม)
- **Output**: redirect ไป `/login`
- **Permission**: ผู้ที่ login อยู่แล้ว (ปุ่มแสดงเฉพาะในหน้า protected)
- **Validation**: none
- **Error State**: ไม่มีกรณีที่คาดไว้ — ล้มเหลวจะ throw ให้ Next.js จัดการเป็น 500 ตามปกติ
- **Audit**: ไม่ได้บันทึกลง `login_audit_logs` ในงานนี้ (ตารางนี้ตาม
  requirements.md §8 ครอบคลุมเฉพาะเหตุการณ์ login — บันทึกไว้เป็นขอบเขตที่ตัดออก
  อย่างโปร่งใส ข้อ 6 ด้านล่าง)
- **Acceptance Criteria**:
  - AC1: หลัง logout, session cookie ถูกลบ และเข้าหน้า protected route ใดๆ ถูก redirect กลับไป `/login` — **ทดสอบจริงแล้ว (ผ่าน)**

### Function: ตรวจสอบ session/สิทธิ์ (getCurrentUser / requireUser / requireRole)
- **Actor**: internal — เรียกจาก Server Action/Route Handler/protected Server Component อื่นทุกจุด
- **Input**: none (อ่าน cookie ผ่าน `auth()`)
- **Process**: ถอดรหัส JWT จาก cookie → ถ้าไม่มี คืนไม่มีสิทธิ์ทันที → ถ้ามี
  query สถานะบัญชี**ปัจจุบัน**จากฐานข้อมูลจริง (ไม่เชื่อค่าที่ฝังอยู่ใน JWT) →
  บัญชีถูกลบ/ไม่ใช่ ACTIVE → ถือว่าไม่มีสิทธิ์ (แม้ JWT จะยังไม่หมดอายุ)
- **Output**: `CurrentUser | null` (getCurrentUser), หรือ redirect ไป `/login`
  (requireUser/requireRole เมื่อไม่ผ่าน)
- **Permission**: n/a (เป็นฟังก์ชันตรวจสอบเอง, deny-by-default)
- **Validation**: n/a
- **Error State**: database error → throw (fail-closed — ไม่ปล่อยผ่านเมื่อตรวจสอบไม่ได้)
- **Audit**: ไม่ใช่หน้าที่ของเลเยอร์นี้ (ผู้เรียกที่เป็นเจ้าของ resource บันทึกเอง)
- **Acceptance Criteria**:
  - AC1: session ของบัญชีที่ถูกเปลี่ยนเป็น SUSPENDED ระหว่างที่ JWT ยังไม่หมดอายุ ถูกปฏิเสธในการเรียกครั้งถัดไป — **ทดสอบจริงแล้ว (ผ่าน)**
  - AC2: ไม่มี session เลย (ไม่เคย login) เข้าหน้า protected ถูก redirect ไป `/login` — **ทดสอบจริงแล้ว (ผ่าน)**

## 5. คำสั่ง/การทดสอบที่รันจริง และผล

ทุกคำสั่งด้านล่างรันจริงกับ PostgreSQL จริง (`sangha_dev`/`sangha_system_dev`
บน localhost) และ `next dev` จริงบน `:3000` ในสภาพแวดล้อมพัฒนานี้ — ไม่มีข้อใด
เป็นการอ้างโดยไม่ได้รันจริง (ตามข้อบังคับของโปรเจกต์)

```
$ node prisma/dev-migrate-verify.mjs --reset
--reset: dropping and recreating public schema...
  [PASSED] schema reset
Replaying 7 migration(s) from scratch:
  [PASSED] applied 20260914100207_init
  [PASSED] applied 20260914100307_add_user_phone
  [PASSED] applied 20260914100407_rollback_add_user_phone
  [PASSED] applied 20260923135937_sangha_org_domain
  [PASSED] applied 20260923141654_education_domain
  [PASSED] applied 20260923143443_exam_document_domain
  [PASSED] applied 20260923150512_auth_credentials_and_login_security
Reset + full replay: PASSED
```

```
$ npm run db:seed        # รันสองครั้งติดต่อกัน — ยืนยัน idempotent (8 users คงที่ ไม่ซ้ำ)
... Seeded successfully ...
$ psql ... "SELECT count(*) FROM users;"   =>  8   (เท่าเดิมหลังรันซ้ำ)
```

```
$ node prisma/test-exam-document-domain.mjs     # regression: schema เดิมยังไม่พัง
23 passed, 0 failed
```

```
$ npx tsc --noEmit -p tsconfig.json
(no output — clean)

$ npm run lint
(no output — clean)

$ npm run build
✓ Compiled successfully in 9.5s
✓ Generating static pages using 1 worker (7/7)
Route (app): /, /_not-found, /api/auth/[...nextauth], /api/health, /dashboard, /login
ƒ Proxy (Middleware)
```

```
$ npm run dev  &   # server จริงบน :3000
$ node prisma/test-auth-login.mjs
Running Auth.js login/logout/session tests against http://localhost:3000

  [PASSED] correct credentials: no error in the redirect location
  [PASSED] session() returns the logged-in user's email
  [PASSED] session() carries the correct role
  [PASSED] a session-token cookie was set
  [PASSED] GET /dashboard with valid session returns 200 (not a redirect)
  [PASSED] successful login recorded in login_audit_logs (success=true)
  [PASSED] wrong password: CredentialsSignin error surfaced
  [PASSED] wrong password: error code is the generic invalid_credentials (no field-specific hint)
  [PASSED] no session created after failed login
  [PASSED] unknown email: same generic invalid_credentials code as wrong-password case
  [PASSED] 5th consecutive wrong password locks the account (code=account_locked:<minutes>)
  [PASSED] correct password is still rejected while account is locked
  [PASSED] login_lockouts row has a non-null lockedUntil
  [PASSED] failedAttempts counter reset to 0 once locked (fresh window after expiry)
  [PASSED] after the lock's expiry timestamp passes, correct password logs in successfully again
  [PASSED] correct password but PENDING_APPROVAL status -> account_inactive:PENDING_APPROVAL (distinct from invalid_credentials)
  [PASSED] no session created for a correctly-authenticated-but-inactive account
  [PASSED] GET /dashboard with no session cookie at all returns a redirect
  [PASSED] the redirect target is /login (proxy.ts optimistic check)
  [PASSED] logged in before testing logout
  [PASSED] session cleared after /api/auth/signout
  [PASSED] protected route no longer reachable after logout
  [PASSED] auditor session works normally before suspension
  [PASSED] same still-valid JWT is rejected by /dashboard once the account is SUSPENDED in the database (secure check, not just cookie presence)

24 passed, 0 failed
```

```
$ AUTH_SESSION_MAX_AGE_SECONDS=3 npm run dev  &   # server แยกต่างหากด้วย session อายุสั้นมาก
$ node prisma/test-auth-session-expiry.mjs
  [PASSED] session is valid immediately after login
  ... waiting 8s for the 3s session to actually expire ...
  [PASSED] session() returns no user once the JWT's real maxAge has elapsed

2 passed, 0 failed
```

**ข้อสังเกตจากการทดสอบ (พฤติกรรมจริงของ Auth.js v5 ที่ตรวจสอบแล้ว ไม่ใช่แค่
อ่านจากเอกสาร)**: `GET /api/auth/session` ของ Auth.js v5 ออก Set-Cookie ใหม่
(rotate) ทุกครั้งที่เรียก โดยเลื่อน `Expires` ออกไปอีก `session.maxAge` จาก
เวลาที่เรียกเสมอ (ไม่ใช่แค่เมื่อถึง `updateAge`) กลไกหมดอายุจริงจึงทำงานแบบ
"sliding/rolling" ที่บังคับใช้ฝั่ง client (เบราว์เซอร์เลิกส่ง cookie ที่หมดอายุ
ตาม `Expires` attribute) มากกว่าการปฏิเสธ token ที่หมดอายุแล้วแบบ hard-reject
ฝั่ง server เมื่อถูกส่งมาซ้ำ — script ทดสอบจึงเขียน cookie jar ให้เคารพ
`Expires`/`Max-Age` เหมือนเบราว์เซอร์จริง/`curl -c` แทนการเก็บ cookie แบบไม่มี
วันหมดอายุ ถึงจะสังเกตพฤติกรรมหมดอายุที่แท้จริงได้ (ดูคอมเมนต์ใน
`prisma/test-auth-session-expiry.mjs`) — ผลกระทบเชิงปฏิบัติ: ผู้ใช้ที่มี
กิจกรรมต่อเนื่อง (browser ยังเปิดหน้าที่เรียก session อยู่เรื่อยๆ) จะไม่ถูก
บังคับ logout ที่ 8 ชั่วโมงพอดีนับจาก login ครั้งแรก แต่จะนับจากกิจกรรมล่าสุด
แทน (sliding expiration) — เป็นพฤติกรรมที่ยอมรับได้และตรงกับ UX ทั่วไป
(ผู้ใช้ active ไม่ควรถูกเตะออกกลางคัน) แต่บันทึกไว้ให้ชัดเจนเผื่อการตรวจสอบ
security ในอนาคตต้องการ hard absolute timeout แทน

## 6. รหัสผ่านทดสอบ (dev/test เท่านั้น)

ทุกบัญชีจำลองใน `prisma/seed.ts` ใช้รหัสผ่านเดียวกัน: `SanghaDev#2568`
(ค่าคงที่ `MOCK_USER_PASSWORD` ใน `prisma/seed-constants.mjs`) — **ไม่ใช่ secret
จริง เป็นข้อมูลสมมติสำหรับ dev/test เท่านั้น** ห้ามใช้ค่านี้ใน staging/production
โดยเด็ดขาด

## 7. ขอบเขตที่ตัดออก (Out of Scope — โปร่งใสตามรูปแบบเดิมของโปรเจกต์)

1. **OAuth provider จริง** — โครงสร้างรองรับแล้ว (เพิ่มใน `providers: []`) แต่
   ยังไม่ผูก provider จริงเพราะไม่มี client secret ให้ทดสอบในสภาพแวดล้อมนี้
2. **การสมัครสมาชิก/ยืนยันอีเมล/อนุมัติบัญชี (F5.1-F5.3)** — งานนี้ระบุผลลัพธ์
   "auth config, login/logout" เท่านั้น ไม่รวม registration pipeline เต็มรูปแบบ
   บัญชีทั้งหมดในงานนี้มาจาก `prisma/seed.ts` (ข้อมูลจำลอง) — F5.4 (login ครั้ง
   แรกของ Member ที่บัญชี ACTIVE แล้ว) ครอบคลุมอยู่แล้วเพราะเป็นส่วนหนึ่งของ
   Login มาตรฐาน
3. **Rate-limit ต่อ IP address** — ทำเฉพาะ per-account lockout (ตรงกับ AC ที่
   วัดผลได้ใน requirements.md §8) ยังไม่ทำการจำกัดจำนวนครั้งต่อ IP แยกต่างหาก
4. **RBAC แบบเต็ม/resource-scope** (requirements.md §6 permission matrix) —
   `src/lib/authz.ts` ให้เฉพาะ deny-by-default ระดับ role เท่านั้น
5. **หน้า Admin ตั้งค่าระบบ (F6.5)** — session timeout/lockout เป็น env var
   คงที่ในงานนี้ ยังไม่ใช่ Super-Admin-configurable UI
6. **Audit การ logout** — บันทึกเฉพาะ login attempts ตามที่ requirements.md §8 ระบุ
7. **หน้า UI ตามบทบาท (per-role dashboard)** — `/dashboard` เป็นหน้า demo
   เดียวสำหรับทุกบทบาท (แสดงชื่อ/อีเมล/บทบาท) หน้าจริงตามบทบาทเป็นงาน Admin
   Console (M6) ในอนาคต
8. **ลืมรหัสผ่าน (`/forgot-password`)** — มีอยู่ใน sitemap.md แต่ไม่อยู่ใน
   ผลลัพธ์ที่ต้องส่งของงานนี้ ("auth config, login/logout")

## 8. Failure mode และ Recovery

- **Database ไม่พร้อมใช้งานระหว่าง login** → `authorize()` throw exception ที่ไม่ใช่
  `AuthError` → `loginAction` จับไว้ แสดง "เกิดข้อผิดพลาดในระบบ" ทั่วไปแก่ผู้ใช้
  และ log รายละเอียดเต็มด้วย `console.error` ฝั่ง server เท่านั้น (ไม่มีข้อมูล
  Restricted/Secret รั่วไหลไปยัง client) — ไม่มีผลกระทบต่อความถูกต้องของข้อมูล
  เพราะไม่มีการเขียนข้อมูลใดๆ เกิดขึ้นก่อนเช็ค credentials สำเร็จ
- **AUTH_SECRET หาย/เปลี่ยนโดยไม่ตั้งใจ** → JWT ที่เข้ารหัสด้วย secret เดิมถอดรหัส
  ไม่ได้อีกต่อไป → ผู้ใช้ทุกคน "session invalid" พร้อมกัน (mass logout) — ไม่มี
  ผลกระทบด้าน data-integrity เพราะ session ไม่ใช่แหล่งความจริงของข้อมูล (ตาม
  ADR-0003) การกู้คืน: ผู้ใช้ login ใหม่ตามปกติ ไม่ต้องทำอะไรเพิ่มเติมฝั่ง DB
- **การเพิ่มตัวนับ lockout ล้มเหลวกลางทาง (เช่น connection หลุดระหว่าง
  transaction)** → transaction ทั้งหมด ROLLBACK อัตโนมัติ (ไม่มีตัวนับค้างครึ่งๆ
  กลางๆ) → `authorize()` จะ throw ขึ้นไปเป็น server error ทั่วไป (fail-closed —
  ไม่ปล่อยให้ login ผ่านเมื่อไม่สามารถตรวจสอบ/บันทึก lockout ได้จริง)
- **ผู้ใช้ถูกล็อกโดยไม่ได้ตั้งใจ (เช่น พิมพ์ผิดหลายครั้ง)** → ล็อกหมดอายุเองใน
  15 นาที ไม่ต้องมีการแทรกแซงจาก Admin — หากต้องการปลดล็อกทันที Admin ลบ/แก้แถว
  ที่ตรงกันใน `login_lockouts` ได้โดยตรง (ยังไม่มี UI สำหรับสิ่งนี้ในงานนี้ —
  เป็นการดำเนินการทาง DB โดยตรงในกรณีฉุกเฉินเท่านั้น)
