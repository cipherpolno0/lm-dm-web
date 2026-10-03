# Design System + Layout — P4 Public Front End

Phase: P4 — Public Front End
งาน: สร้าง Design System + Layout
อ้างอิงคู่กับ: `sitemap.md`, `user-flows.md`, `dev-rules.md`, `data-policy.md`, `README.md`
วันที่: 2026-09-14 (P4 เริ่มงานนี้เมื่อ 2026-09-23/24)

> เอกสารนี้ใช้ข้อมูลสมมติเท่านั้น ไม่มีชื่อบุคคล วัด หรือหน่วยงานจริงปรากฏอยู่

---

## 1. เหตุผลและขอบเขตงาน

งานนี้สร้าง component ระดับ Design System (`components/ui/`) และ Layout
(`components/layout/`) ที่ทุกหน้าในอนาคต (Public/Member/Admin ตาม `sitemap.md`)
จะเรียกใช้ร่วมกัน แทนที่จะให้แต่ละหน้าเขียน header/nav/table/form ของตัวเองซ้ำๆ
กัน — โฟกัสตามที่ระบุ: **Header, Nav, Breadcrumbs, Footer, Cards, Tables, Forms,
Empty/Loading/Error states**

**สิ่งที่งานนี้ไม่ทำ (ตั้งใจ):**

- ไม่แยก route group `(public)`/`(member)`/`(admin)` ตาม `sitemap.md` — ยังเป็นงาน
  "แทนที่หน้าแรกชั่วคราวด้วยหน้า Public จริงตาม sitemap.md" ที่ค้างอยู่ใน
  README.md งานถัดไป (มาก่อนงานนี้) การเปลี่ยนโครงสร้าง route ทั้งหมดจะทำพร้อมกับ
  งานนั้นเพื่อไม่ให้ต้อง refactor ซ้ำสองรอบ
- ไม่สร้างหน้าจริงตาม `sitemap.md` (เช่น `/news`, `/curriculum`) — เป็นแค่
  component + หน้าแรกที่ปรับปรุงเพื่อสาธิตการใช้งานจริง + หน้า `/design-system`
  อ้างอิง

---

## 2. รายการ Component

### 2.1 `src/components/ui/` (Design System primitives)

| Component | ไฟล์ | หมายเหตุ |
|---|---|---|
| Button | `button.tsx` | มีอยู่แล้วจาก P1 — ไม่แก้ |
| Card | `card.tsx` | มีอยู่แล้วจาก P1 — ไม่แก้ |
| Input | `input.tsx` | ใหม่ |
| Label | `label.tsx` | ใหม่ — ใช้ `@radix-ui/react-label` |
| Textarea | `textarea.tsx` | ใหม่ |
| Select | `select.tsx` | ใหม่ — native `<select>` ห่อสไตล์ (ดูข้อ 6.1) |
| Checkbox | `checkbox.tsx` | ใหม่ — ใช้ `@radix-ui/react-checkbox` |
| Badge | `badge.tsx` | ใหม่ — variant เพิ่ม `success`/`warning`/`info` |
| Table | `table.tsx` | ใหม่ — wrapper `overflow-x-auto` ในตัว (กันจอมือถือ) |
| Skeleton | `skeleton.tsx` | ใหม่ — Loading state |
| Alert | `alert.tsx` | ใหม่ — variant `default`/`destructive`/`success`/`warning`/`info` |
| Separator | `separator.tsx` | ใหม่ — hand-rolled (ดูข้อ 6.1) |
| Sheet | `sheet.tsx` | ใหม่ — ใช้ `@radix-ui/react-dialog`, ใช้เป็นเมนูมือถือ |
| FormField | `form-field.tsx` | ใหม่ — โครง label+control+description/error |
| EmptyState | `empty-state.tsx` | ใหม่ |
| ErrorState | `error-state.tsx` | ใหม่ |

### 2.2 `src/components/layout/` (Layout)

| Component | ไฟล์ | หมายเหตุ |
|---|---|---|
| Container | `container.tsx` | max-width + padding มาตรฐานทั้งเว็บ |
| SiteHeader | `site-header.tsx` | Client Component — nav, mobile menu (Sheet), auth-aware CTA |
| SiteFooter | `site-footer.tsx` | Server Component |
| Breadcrumbs | `breadcrumbs.tsx` | WAI-ARIA breadcrumb pattern |
| PageHeader | `page-header.tsx` | breadcrumbs + title + description + actions |
| nav-config | `nav-config.ts` | แหล่งเดียวของ path/label nav (ตรงกับ sitemap.md) |

### 2.3 Next.js file-convention pages (Empty/Loading/Error states)

| ไฟล์ | หน้าที่ |
|---|---|
| `src/app/not-found.tsx` | 404 (ตรงกับ `sitemap.md` ข้อ 6 `/404`) |
| `src/app/error.tsx` | Route-level error boundary (Client Component, ใช้ `retry` prop) |
| `src/app/global-error.tsx` | Error boundary ของ root layout เอง (ดู ADR ในโค้ด — ต้องมี `<html>/<body>` ของตัวเอง ไม่ได้รับ global CSS) |
| `src/app/design-system/page.tsx` | หน้าสาธิต component ทั้งหมด (ไม่อยู่ใน sitemap.md — ดูข้อ 6.2) |

**หมายเหตุสำคัญ — ไม่มี root `loading.tsx`:** ดูข้อ 6.3 (พบและแก้ bug จริงระหว่างทำงานนี้)

---

## 3. Design Tokens

ต่อยอดจาก token เดิมของ shadcn/ui (`new-york`/`neutral`, oklch) ใน `globals.css`
ที่มีอยู่แล้วตั้งแต่ P1 — เพิ่มเฉพาะ semantic status color 3 ชุด (`success`,
`warning`, `info` พร้อม `-foreground`) สำหรับ Badge/Alert ที่ใช้แสดงสถานะ
(อนุมัติแล้ว/รอตรวจทาน/ปฏิเสธ ฯลฯ ตาม `user-flows.md`) ทั้ง light และ dark mode
(dark mode token มีไว้ล่วงหน้า — ยังไม่มี UI สลับธีมจริงในงานนี้ ดูข้อ 6.4) และเพิ่ม
`.skip-link` utility class สำหรับ accessibility (WCAG 2.1 AA เป้าหมายตาม
`requirements.md` ข้อ 5)

---

## 4. Function Specification

ส่วนใหญ่ของ component ในงานนี้เป็น presentational primitive ล้วนๆ (Card, Badge,
Table, Skeleton, Alert ฯลฯ) — ไม่มี Actor/Permission/Audit ในความหมายของ
"ฟังก์ชันที่กระทำต่อข้อมูล" เพราะไม่ query/เขียนฐานข้อมูลเอง จึงระบุ spec เต็ม
รูปแบบเฉพาะ 2 พฤติกรรมที่มี logic จริงด้านล่าง ส่วนที่เหลือระบุแค่ Actor/Input/
Output/Error State ที่เกี่ยวข้องจริงในตารางท้ายข้อนี้

### 4.1 เปิด/ปิดเมนูมือถือ (Mobile Nav Toggle — `SiteHeader`)

- **Actor**: ผู้เยี่ยมชมเว็บทุกคน (Guest/Member ทุกบทบาท) ที่หน้าจอกว้าง < 768px
- **Input**: คลิก/แตะปุ่ม "เปิดเมนู" (hamburger icon)
- **Process**: `useState` สลับสถานะเปิด/ปิดของ `Sheet` (Radix Dialog) — ไม่มีการ
  เรียก server ใดๆ (client-side UI state ล้วนๆ) เมื่อคลิกลิงก์ใน mobile menu จะ
  ปิดเมนูอัตโนมัติก่อน navigate (`onNavigate` callback)
- **Output**: แผงเมนู (Sheet) เลื่อนเข้าจากขวา แสดงลิงก์ nav หลัก + ปุ่มเข้าสู่ระบบ/
  แดชบอร์ดตามสถานะ session
- **Permission**: n/a (UI ล้วนๆ ไม่มีการตรวจสิทธิ์ — ลิงก์ที่แสดงปลายทางยังคง
  บังคับสิทธิ์จริงที่ server เสมอ)
- **Validation**: n/a
- **Error State**: ไม่มี (ไม่มี async operation ที่ fail ได้)
- **Audit**: ไม่บันทึก (ไม่ใช่ operation ที่กระทบข้อมูล)
- **Acceptance Criteria**:
  - AC1: เปิดเมนูแล้วไม่ทำให้ทั้งหน้าเกิด horizontal overflow ที่ 375px —
    **ทดสอบจริงแล้ว (ผ่าน)** ดูข้อ 5
  - AC2: คลิกลิงก์ในเมนูมือถือแล้วเมนูปิดเองก่อน navigate — ตรวจด้วยตาจาก
    screenshot/โค้ด (ยังไม่มี assertion อัตโนมัติแยกเฉพาะจุดนี้ — ดูข้อ 8)

### 4.2 แสดงสถานะเข้าสู่ระบบใน Header (Auth-aware CTA)

- **Actor**: internal — `RootLayout` (Server Component)
- **Input**: ไม่มี (อ่าน session ผ่าน `getCurrentUser()` ที่มีอยู่แล้วจาก P3)
- **Process**: `RootLayout` เรียก `getCurrentUser()` แล้วส่งผลเป็น prop
  (`{name, email, role} | null`) ให้ `SiteHeader` (Client Component) ตัดสินใจ
  แสดงปุ่ม "เข้าสู่ระบบ" หรือ "แดชบอร์ด"
- **Output**: ปุ่ม CTA ที่ถูกต้องตามสถานะ session ปัจจุบัน
- **Permission**: **ไม่ใช่จุดตรวจสิทธิ์** — เป็นเพียง UX/การแสดงผล การตรวจสิทธิ์
  จริงยังคงอยู่ที่ `requireUser()`/`requirePermission()`/`guardRoute()` ของแต่ละ
  หน้า/endpoint เสมอ (deny-by-default ตาม `dev-rules.md` ข้อ 4) — ต่อให้ prop นี้
  ผิดพลาด/ถูกปลอมทาง client ก็ไม่มีผลต่อสิทธิ์จริงเพราะ Header ไม่ได้เรียก API
  ใดๆ ด้วยค่านี้
- **Validation**: n/a
- **Error State**: `getCurrentUser()` throw (เช่น database ล่ม) → เพราะเรียกใน
  root layout เอง จะกลายเป็น error ของ root layout ทั้งต้นไม้ ซึ่ง `error.tsx`
  ปกติ **ไม่ครอบคลุม** (ตามเอกสาร Next.js: error.js ไม่ครอบ layout.js ชั้นเดียวกัน
  ขึ้นไป) จึงต้องมี `global-error.tsx` แยกต่างหาก — **ทดสอบจริงแล้ว** (บังคับให้
  throw ชั่วคราวด้วย env var ทดสอบ แล้วยืนยันว่าได้ HTTP 500 จริง ไม่ใช่ 200 ที่มี
  เนื้อหาหลุดออกมา — ดูข้อ 5) ผลกระทบวงกว้างของการย้าย auth check ขึ้นไปที่ layout
  ถูกบันทึกไว้ในข้อ 7 (Failure Mode)
- **Audit**: ไม่บันทึก (read-only, ไม่ใช่ resource ที่ต้อง audit)
- **Acceptance Criteria**:
  - AC1: Guest เห็นปุ่ม "เข้าสู่ระบบ", Member ที่ login แล้วเห็นปุ่ม "แดชบอร์ด" —
    **ทดสอบจริงแล้ว (ผ่าน)** ผ่าน UI login จริงทั้ง desktop/mobile
  - AC2: database/getCurrentUser ล้มเหลว → ทั้งเว็บตอบ HTTP 500 (ไม่ใช่ 200 พร้อม
    หน้าเปล่า/ข้อมูลหลุด) — **ทดสอบจริงแล้ว (ผ่าน)**

### 4.3 ตารางสรุป component ที่เหลือ (presentational, ไม่มี Actor/Permission จริง)

| Component | Input | Output | Error State |
|---|---|---|---|
| Card/CardHeader/... | children/props | กรอบเนื้อหา | n/a |
| Table family | children/props | ตาราง + wrapper scroll แนวนอนอัตโนมัติ | n/a |
| Badge | variant, children | ป้ายสถานะสี | n/a |
| Alert | variant, children | กล่องแจ้งเตือน | n/a |
| Skeleton | className | กล่อง pulse animation | n/a |
| EmptyState | title/description/action | ข้อความ+ไอคอนเมื่อไม่มีข้อมูล | n/a |
| ErrorState | title/description/digest/onRetry | ข้อความ+ปุ่มลองใหม่เมื่อโหลดล้มเหลว | รับ `digest` เท่านั้น ไม่รับ `error.message` ดิบ (dev-rules.md ข้อ 7) |
| Breadcrumbs | items | breadcrumb trail พร้อม `aria-current` | n/a |
| FormField | label/error/description/children(render-prop) | label+control+description/error ผูก `aria-*` ให้อัตโนมัติ | แสดง `error` เป็นข้อความใต้ control พร้อม `role="alert"` |

---

## 5. ผลการทดสอบจริง

**`npx tsc --noEmit`** → ผ่าน (exit code 0), 0 errors
**`npm run lint`** → ผ่าน (exit code 0), 0 problems
**`npx next build`** → ผ่าน — routes ใหม่ `/design-system` ปรากฏใน build output,
ทุก route อื่นยังคง compile ผ่าน

**`node prisma/test-layout-responsive.mjs`** (ใหม่ — Playwright + Chromium จริง,
ไม่ใช่ mock) — ทดสอบ 4 ความกว้างจอ (375/768/1024/1440) × หน้า public 4 หน้า
(`/`, `/design-system`, `/login`, 404) + หน้า protected 1 หน้า (`/dashboard`
หลัง login จริงผ่าน UI form) รวม mobile menu (Sheet) เปิดอยู่:

```
66 passed, 0 failed
```

ตรวจ 2 มิติต่อหน้า: (1) `document.documentElement.scrollWidth <=
clientWidth` (2) ไม่มี element ใดล้นขวาของ viewport เกิน 1px ยกเว้น element ที่
อยู่ใน ancestor ที่ตั้งใจให้ scroll แนวนอนเอง (เช่น wrapper ของ `<Table>`)

**Regression (5 ชุดเดิมจากเฟสก่อนหน้า — รันซ้ำหลัง reset+reseed):**

```
test-exam-document-domain.mjs   23 passed, 0 failed
test-auth-login.mjs             24 passed, 0 failed
test-auth-session-expiry.mjs     2 passed, 0 failed  (รันแยกด้วย AUTH_SESSION_MAX_AGE_SECONDS=3)
test-rbac-scope.mjs             28 passed, 0 failed
test-authz-guard.mjs            23 passed, 0 failed
```

**รวมสะสมทั้งโปรเจกต์: 100 (เดิม) + 66 (ใหม่) = 166/166 PASSED**

ทุกคำสั่งรันจริงกับ PostgreSQL 16 ในเครื่องนี้และ `next dev` จริงบน `:3000` —
ไม่มีการอ้างผลโดยไม่ได้รันจริง

---

## 6. ขอบเขตที่ตัดออก (Out of Scope — ต้องแจ้ง Owner)

1. **Select เป็น native `<select>` ไม่ใช่ Radix Select** — ลด dependency ใหม่ที่
   ไม่จำเป็นในงานนี้ (ยังไม่มี requirement ที่ต้องการ custom listbox/multi-column
   option) เปลี่ยนเป็น `@radix-ui/react-select` ได้ในอนาคตหากต้องการ
   **Separator เขียนเองไม่ใช้ Radix** ด้วยเหตุผลเดียวกัน (ไม่มี interactive
   behavior ที่ต้องพึ่ง library)
2. **ฟอร์มยังไม่ผูก react-hook-form/zod หรือ submit จริง** — `FormField`/
   `Input`/`Select`/`Textarea`/`Checkbox` เป็นโครง UI presentation เท่านั้น
   เพราะยังไม่มีฟอร์มจริงที่ submit ข้อมูล (สมัครสมาชิก F5.1 ฯลฯ เป็นงานเฟส
   ถัดไป) — โครงสร้างที่วางไว้รองรับการห่อด้วย `<Controller>`/`register()` ได้
   โดยไม่ต้อง refactor UI
3. **ไม่มี root `loading.tsx`** — **พบ bug จริงระหว่างทำงานนี้**: การเพิ่ม root
   `loading.tsx` สร้าง Suspense boundary รอบทุก page segment โดยอัตโนมัติ
   (Next.js App Router streaming) ทำให้ Next.js เริ่มส่ง HTTP response (status
   200 พร้อม shell/skeleton) ไปก่อนที่ page component จะ render เสร็จ — ถ้า page
   นั้นเรียก `redirect()` ภายหลัง (เช่น `requireUser()` ของหน้า `/dashboard`
   เมื่อบัญชีถูก SUSPENDED) HTTP header ก็ถูกส่งไปแล้วเป็น 200 เปลี่ยนเป็น 307
   ไม่ได้อีก Next.js จึงเปลี่ยนไปฝัง redirect instruction ไว้ใน RSC payload ให้
   client-side JS จัดการแทน (ใช้ได้ปกติในเบราว์เซอร์จริงเพราะ JS ทำงาน แต่ทำให้
   HTTP status code ที่เห็นจริงกลายเป็น 200 แทนที่จะเป็น 307/302) — **ตรวจพบจาก
   regression test จริง** (`test-auth-login.mjs` ล้มเหลวหลังเพิ่ม `loading.tsx`)
   จึงตัดสินใจไม่ใส่ root `loading.tsx` ในงานนี้ เพื่อรักษาพฤติกรรม HTTP-level
   redirect ที่ deny-by-default ต้องพึ่งพา (dev-rules.md ข้อ 4) ให้ตรวจสอบได้ตรง
   ไปตรงมาผ่าน HTTP เสมอ — Loading state ยังคงส่งมอบครบผ่าน `Skeleton` component
   (สาธิตใน `/design-system`) เป็น pattern ที่หน้าจริงในอนาคตเลือกใช้เองต่อ
   segment เมื่อมี data fetching ที่ไม่เกี่ยวกับ auth redirect (เช่น หน้า list
   ในอนาคตของ M1/M2) — ควรทดสอบ interaction กับ redirect ซ้ำทุกครั้งก่อนเพิ่ม
   `loading.tsx` ในเส้นทางที่มี auth check
4. **หน้า `/design-system` ไม่ gate ด้วย permission และไม่อยู่ใน `sitemap.md`** —
   เป็นหน้าอ้างอิงสำหรับทีมพัฒนา ไม่มีข้อมูลจริง/action ที่กระทบข้อมูล แต่ควร
   พิจารณาลบหรือ gate ด้วยสิทธิ์ (เช่น Super Admin) ก่อนขึ้น production จริง
5. **ยังไม่มี UI สลับ light/dark mode** — token dark mode มีอยู่แล้วใน
   `globals.css` (สืบทอดจาก P1) แต่ไม่มีปุ่ม/state สลับธีมจริงในงานนี้
6. **ยังไม่แยก route group `(public)`/`(member)`/`(admin)` ตาม sitemap.md** —
   ดูข้อ 1 (เหตุผลและขอบเขตงาน)
7. **`SiteHeader`/`SiteFooter` ยังไม่มี assertion อัตโนมัติแยกสำหรับ "คลิกลิงก์
   ในเมนูมือถือแล้วปิดเมนูเอง"** (AC2 ของข้อ 4.1) — ตรวจด้วยการอ่านโค้ด/
   screenshot เท่านั้น

---

## 7. Failure Mode และ Recovery

- **`getCurrentUser()` throw ใน RootLayout (เช่น PostgreSQL ล่ม)** — เดิม (ก่อน
  งานนี้) มีแค่หน้า `/login`/`/dashboard` ที่เรียกฟังก์ชันนี้ หน้า public อื่นๆ
  ไม่กระทบ แต่เพราะงานนี้ย้าย auth-state read ขึ้นไปที่ root layout (เพื่อให้
  Header รู้สถานะ login) **ทุกหน้ารวมถึงหน้า public จะ throw พร้อมกันถ้า
  database ล่ม** — Recovery: `global-error.tsx` (ใหม่ในงานนี้) จับ error ระดับ
  root layout ได้ ส่งกลับ HTTP 500 พร้อม fallback UI ทั่วไป (ไม่ใช่หน้าขาว/ไม่
  รั่ว stack trace ใน production) — **ทดสอบจริงแล้ว** ด้วยการบังคับ throw
  ชั่วคราว ยืนยันว่าได้ 500 จริง คืนค่าปกติทันทีเมื่อ database กลับมาโดยไม่ต้อง
  manual fix (ไม่มี state ค้างฝั่ง app — สอดคล้องกับ pattern เดิมใน
  `architecture.md` ข้อ 7 แถว PostgreSQL)
- **Radix Dialog (Sheet) ไม่ mount/JS ไม่ทำงาน (เช่น JS ถูกปิด)** — ปุ่ม hamburger
  จะไม่ตอบสนอง (ไม่มี fallback แบบ CSS-only) ผู้ใช้ยังเข้าถึงทุกหน้าได้ผ่าน URL
  ตรง/nav บนเดสก์ท็อป (`md:flex` ยังแสดงปกติถ้า breakpoint ตรง) — ยอมรับความเสี่ยง
  นี้เพราะ noscript fallback สำหรับ nav ทั้งเว็บนอกขอบเขตงานนี้
- **`redirect()` ที่ throw ภายใน Suspense boundary (เช่น ถ้าเพิ่ม `loading.tsx`
  ในอนาคต)** — ดูข้อ 6.3 คำเตือนและวิธีตรวจสอบก่อนเพิ่ม

---

## 8. งานถัดไปที่ควรทำ (นอกขอบเขตงานนี้)

1. แทนที่หน้าแรกชั่วคราวด้วยหน้า Public จริงตาม `sitemap.md` พร้อมแยก route
   group `(public)`/`(member)`/`(admin)` — ใช้ Header/Footer/Container/
   PageHeader/Breadcrumbs ที่สร้างในงานนี้ได้ทันที
2. เพิ่ม react-hook-form + zod ผูกกับ `FormField`/`Input`/`Select`/`Textarea`/
   `Checkbox` เมื่อเริ่มสร้างฟอร์มจริงตัวแรก (เช่น F5.1 สมัครสมาชิก)
3. พิจารณา gate หรือลบหน้า `/design-system` ก่อน production (ข้อ 6.4)
4. เพิ่ม UI สลับ light/dark mode (token มีพร้อมแล้ว)
5. เพิ่ม `loading.tsx` เฉพาะ route/segment ที่มี data fetching จริงและไม่มี auth
   redirect อยู่ในเส้นทาง (เช่น หน้า list ในอนาคต) — ทดสอบ regression กับ
   auth redirect ทุกครั้งตามคำเตือนในข้อ 6.3
6. เพิ่ม assertion อัตโนมัติสำหรับ AC2 ของข้อ 4.1 (ปิดเมนูมือถือเองหลังคลิกลิงก์)
