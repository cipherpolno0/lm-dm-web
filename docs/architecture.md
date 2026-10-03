# Architecture & Environment

**โครงการ:** ระบบฐานข้อมูลคณะสงฆ์และการศึกษาพระปริยัติธรรม (นักธรรม / ธรรมศึกษา / บาลี) พร้อมคลังข้อสอบ ระบบแบบทดสอบ ระบบสมาชิก และระบบผู้ดูแลระบบ
**เฟส:** P1 — Project Foundation
**อ้างอิงคู่กับ:** `project-charter.md`, `requirements.md`, `data-policy.md`, `dev-rules.md`, `sitemap.md`, `user-flows.md`, `sangha-system/README.md` (P1 source project), และ `adr/0001`–`0007`
**สถานะ:** ร่างสำหรับ Owner Review — เป็นเอกสารออกแบบ (blueprint) ยังไม่มีการ provision infrastructure จริง
**เวอร์ชัน:** 0.1 | **วันที่:** 2026-09-14

> เอกสารนี้ใช้ข้อมูลสมมติเท่านั้น ไม่มีชื่อบุคคล วัด หรือหน่วยงานจริงปรากฏอยู่ ชื่อ provider/บริการที่ยังไม่ตัดสินใจระบุว่า "รอตัดสินใจ" อย่างชัดเจน

---

## 1. วัตถุประสงค์

วางสถาปัตยกรรมระดับระบบ (web/app/database/object storage/cache/background jobs/logging/monitoring) และกลยุทธ์แยก
environment (dev/staging/prod) ให้เพียงพอสำหรับเริ่มพัฒนาโมดูลจริงในเฟสถัดไป การตัดสินใจสำคัญแต่ละข้อบันทึกเป็น
Architecture Decision Record (ADR) แยกไฟล์ในโฟลเดอร์ `adr/` เพื่อให้ตรวจสอบเหตุผลย้อนหลังได้

## 2. ภาพรวมสถาปัตยกรรม (Layered View)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ผู้ใช้ (Browser)                                                     │
└───────────────────────────────┬───────────────────────────────────────┘
                                 │ HTTPS
┌───────────────────────────────▼───────────────────────────────────────┐
│  Web/App Layer — Next.js App Router (TypeScript)                      │
│  - Server Components (อ่านข้อมูล) + Server Actions/Route Handlers        │
│    (เขียนข้อมูล) — ตรวจสิทธิ์ทุกจุดฝั่งนี้ (deny-by-default)                │
│  - Tailwind CSS + shadcn/ui (UI layer)                                 │
│  - Auth.js (session/JWT) — ดู ADR-0003                                 │
│  - Deploy เป็น container (Docker) เพื่อความพกพาข้าม hosting — ดู ADR-0006 │
└──────┬───────────────┬───────────────┬───────────────┬────────────────┘
       │               │               │               │
       ▼               ▼               ▼               ▼
┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────────────┐
│ PostgreSQL  │ │ Object      │ │ Background  │ │ Logging/Monitoring   │
│ (Prisma)    │ │ Storage     │ │ Jobs        │ │ - pino (JSON logs)   │
│ ระบบข้อมูล   │ │ (S3-        │ │ (pg-boss    │ │ - /api/health        │
│ หลัก        │ │ compatible) │ │ บน Postgres │ │ - error tracking     │
│ ดู ADR-0002 │ │ ดู ADR-0005 │ │ เดียวกัน)   │ │   (ดู ADR-0007)      │
│             │ │             │ │ ดู ADR-0004 │ │                      │
└─────────────┘ └─────────────┘ └─────────────┘ └─────────────────────┘
```

**หมายเหตุการอ่านแผนภาพ:** Background Jobs ใช้ PostgreSQL เดียวกับระบบข้อมูลหลัก (ผ่านไลบรารี pg-boss) แทนการเพิ่ม
Redis/message broker แยกต่างหาก — เหตุผลเต็มอยู่ใน ADR-0004 เพื่อลดจำนวนบริการที่ต้องดูแลในช่วงเริ่มโครงการ

## 3. องค์ประกอบระบบ (Components)

### 3.1 Web/App Layer — Next.js App Router

- Rendering: Server Components เป็นค่าเริ่มต้น (ตรงกับ `dev-rules.md` ข้อ 10), Client Components เฉพาะส่วนที่ต้องมี interactivity
- Mutation: Server Actions/Route Handlers เท่านั้น — ทุกจุดตรวจสิทธิ์ฝั่ง server (`dev-rules.md` ข้อ 4)
- Deploy target: container image เดียว รันด้วย Node.js runtime — เลือก platform hosting ภายหลัง (dependency ที่ยังไม่ตัดสินใจ ดูข้อ 8) แต่ไม่ผูกกับ platform-specific API ใด ๆ ที่ทำให้ portability เสียไป
- อ้างอิงโครงสร้างจริงที่ scaffold ไว้แล้วใน P1: `sangha-system/` (ดู README ของโปรเจกต์นั้น)

### 3.2 Database — PostgreSQL + Prisma (ดู ADR-0002)

- ระบบข้อมูลหลัก (system of record) สำหรับทุกโมดูล M1–M9
- Prisma เป็น ORM + migration tool; migration ทุกครั้งต้อง review ก่อน apply กับ staging/prod (`dev-rules.md` ข้อ 10)
- Connection pooling: ใช้ Prisma's connection pool ในเบื้องต้น (ปรับเป็น PgBouncer ภายนอกหากจำนวน concurrent connection เกิน ที่ Postgres instance รองรับ — ตัดสินใจเมื่อมีข้อมูล load จริง)
- Audit/history table คู่กับตารางข้อมูลสำคัญทุกตาราง ตาม `data-policy.md` ข้อ 7 / `dev-rules.md` ข้อ 6
- Backup: automated daily backup + point-in-time recovery (PITR) — ผู้ให้บริการยังไม่ตัดสินใจ (ต้องยืนยันก่อนผ่าน Real-data Readiness Gate ตาม `data-policy.md` ข้อ 4)

### 3.3 Object Storage — S3-compatible (ดู ADR-0005)

- ใช้สำหรับไฟล์แนบ, ใบประกาศนียบัตร PDF, ไฟล์ข้อสอบ (M8)
- เข้าถึงผ่าน signed URL ที่สร้างจาก Web/App layer หลังตรวจสิทธิ์แล้วเท่านั้น — ไม่มี public URL แบบเดาได้ (`user-flows.md` F4.2)
- แยก bucket/prefix ต่อ environment (`data-policy.md` ข้อ 8)
- ผู้ให้บริการยังไม่ตัดสินใจ — เกณฑ์เลือก: รองรับ S3 API, ตั้งค่า bucket policy/prefix แยกสิทธิ์ได้, มี region ที่เหมาะสมด้านความหน่วง

### 3.4 Cache — ไม่มีเลเยอร์ cache แยกต่างหากในเฟสนี้ (ดู ADR-0004)

- หน้าที่อ่านบ่อย (หลักสูตร, ตารางสอบ) ใช้ Next.js Data Cache / React `cache()` ระดับ request-level และ Postgres query
  ที่ทำ index ให้เหมาะสมแทน
- Rate limiting (เช่น จำกัดจำนวนครั้ง login ผิดตาม `user-flows.md` F5.1) ทำผ่านตาราง Postgres (counter + expiry) ไม่ใช้ Redis
- จุดตัดสินใจทบทวน: หากพบว่า query ที่อ่านบ่อยกระทบ performance ของ Postgres จริง (มีข้อมูลวัดจริง) จึงพิจารณาเพิ่ม Redis

### 3.5 Background Jobs — pg-boss บน PostgreSQL (ดู ADR-0004)

งานที่ต้องประมวลผลแบบ asynchronous:

| งาน | ใช้ในโมดูล | เหตุผลที่ต้องเป็น background job |
|---|---|---|
| นำเข้าข้อมูล Excel แบบชุดใหญ่ | M7 | หลีกเลี่ยง HTTP request timeout เมื่อไฟล์มีหลายพันแถว |
| สร้างใบประกาศนียบัตร PDF เป็นชุด | M8 | สร้างไฟล์จำนวนมากพร้อมกันหลังประกาศผลสอบ (`user-flows.md` F4.3) |
| ส่งอีเมลยืนยัน/แจ้งเตือน | M5 | ไม่ให้ผู้ใช้รอ SMTP/email provider ตอบกลับ |
| Retention/cleanup ตามนโยบายเก็บรักษาข้อมูล | ทุกโมดูล (เมื่อ `data-policy.md` ข้อ 9 สมบูรณ์) | รันตามรอบเวลา ไม่ผูกกับ user request |

ทุก job ต้อง **idempotent** (รันซ้ำได้โดยไม่สร้างผลข้างเคียงซ้ำ) และบันทึกผลลัพธ์ (สำเร็จ/ล้มเหลว/retry count)
เพื่อรองรับ failure mode ในข้อ 7

### 3.6 Logging — pino (JSON structured logs) (ดู ADR-0007)

- ทุก log เป็น JSON เดียวต่อบรรทัด พร้อม `requestId`/`correlationId` เพื่อสืบย้อน request ข้ามชั้น (app → job)
- **ห้าม log ค่า Restricted/Secret แบบเต็ม** — ใช้ scrub/mask ก่อนเขียน log เสมอ (`data-policy.md` ข้อ 5)
- ปลายทาง log: เขียนออก stdout ให้ platform รวบรวม (คอนเทนเนอร์แพลตฟอร์มส่วนใหญ่รองรับ) — บริการรวม log ระยะยาว (log aggregation) ยังไม่ตัดสินใจ (dependency)

### 3.7 Monitoring — Health check + Error tracking (ดู ADR-0007)

- `/api/health` (มีอยู่แล้วใน P1 source project) จะขยายให้ตรวจสอบการเชื่อมต่อ PostgreSQL/Object Storage เมื่อเชื่อมต่อจริงในเฟสถัดไป
- Uptime monitor ภายนอก (provider ยังไม่ตัดสินใจ) ping `/api/health` เป็นระยะ
- Error tracking (เช่น Sentry หรือเทียบเท่า) — **เปิดใช้เฉพาะหลังตั้งค่า scrub rule ป้องกันข้อมูล Restricted หลุดออกนอกระบบแล้วเท่านั้น** (`data-policy.md` ข้อ 5) — ไม่เปิดใช้แบบ default config

## 4. กลยุทธ์แยก Environment (Dev / Staging / Prod)

| ประเด็น | Dev | Staging | Prod |
|---|---|---|---|
| ข้อมูล | Mock only (`data-policy.md` ข้อ 3) | Mock only จนผ่าน Gate | ข้อมูลจริง (หลังผ่าน Real-data Readiness Gate เท่านั้น) |
| Database | Instance แยก | Instance แยก | Instance แยก + backup/PITR |
| Object Storage | Bucket/prefix แยก | Bucket/prefix แยก | Bucket/prefix แยก + lifecycle policy |
| Secret | ชุดแยกต่อ environment | ชุดแยกต่อ environment | ชุดแยกต่อ environment, จำกัดผู้เข้าถึงสูงสุด |
| Deploy trigger | Push ขึ้น branch dev/feature (auto) | Merge เข้า `main` (auto) | Manual approval หลัง staging ผ่าน (ดู ข้อ 5) |
| การเข้าถึง | นักพัฒนาในทีม | นักพัฒนา + QA + Owner (สำหรับ UAT) | จำกัดเฉพาะผู้ที่จำเป็น (least privilege) |
| Error tracking/monitoring | เปิด (ไม่มีข้อมูลจริงให้รั่วไหล) | เปิด | เปิดเฉพาะหลังตั้งค่า scrub rule แล้ว |

Hosting platform ที่แท้จริง (self-host VM, PaaS ฯลฯ) **ยังไม่ตัดสินใจ** — สถาปัตยกรรมนี้ตั้งใจให้ portable
(container-based) เพื่อไม่ผูกกับ platform ใดโดยเฉพาะ จนกว่า Owner จะยืนยัน (`project-charter.md` ข้อ 8)

## 5. CI/CD Pipeline (แนวทาง)

```
feature branch → PR → CI (lint + typecheck + test + build) → review (dev-rules.md ข้อ 2.5)
   → merge main → auto-deploy staging → smoke test staging
   → manual approval (Owner/Tech lead) → deploy prod → post-deploy health check
```

- CI ต้องรัน `npm run lint` และ `npm run build` เป็นอย่างน้อย (ตรงกับเกณฑ์ตรวจสอบของเฟส P1 Project Foundation ก่อนหน้า) และจะเพิ่ม automated test เมื่อเริ่มมี business logic จริง
- Secret scan (`data-policy.md` ข้อ 3.3, ข้อ 6) เป็นส่วนหนึ่งของ CI ทุก pipeline
- Deploy prod ต้องมี manual approval เสมอ ไม่ auto-deploy ตรงจาก merge

## 6. ตัวอย่าง Data Flow ที่ใช้สถาปัตยกรรมนี้ครบทุกชั้น

### 6.1 นำเข้าข้อมูล Excel (M7 — อ้างอิง `user-flows.md` F6.3)
Web/App รับไฟล์ → validate เบื้องต้น (ชนิด/ขนาด) → เก็บไฟล์ต้นฉบับใน Object Storage ชั่วคราว → สร้าง job ใน pg-boss →
Worker อ่านไฟล์ → dry-run validation ทีละแถว → เขียนรายงานกลับ (ผ่านตาราง job result หรือแจ้งผ่าน in-app notification) →
ผู้ใช้ยืนยัน → Worker เขียนข้อมูลจริงภายใน Postgres transaction → บันทึก audit

### 6.2 ออกใบประกาศนียบัตร (M8 — อ้างอิง `user-flows.md` F4.3)
Central Officer สั่งออกใบประกาศ → สร้าง job ต่อผู้เข้าสอบที่ผ่านเกณฑ์ → Worker render PDF → อัปโหลดเข้า Object Storage →
บันทึก metadata + สิทธิ์เข้าถึงใน Postgres → บันทึก audit → รายงานผลสำเร็จ/ล้มเหลวกลับ Admin

## 7. Failure Mode & Recovery ต่อ Component สำคัญ

ตามข้อกำหนดใน `data-policy.md` ข้อ 11 (ทุกงานที่กระทบข้อมูลต้องระบุ failure mode/recovery) ตารางนี้ครอบคลุมระดับ
component ของสถาปัตยกรรม (รายละเอียดระดับฟีเจอร์ดูใน `user-flows.md`)

| Component | Failure Mode | ผลกระทบ | การตรวจจับ (Detection) | แนวทาง Recovery |
|---|---|---|---|---|
| **Web/App (Next.js)** | Process ล่ม/deploy ผิดพลาด | ผู้ใช้เข้าเว็บไม่ได้ | Health check ล้มเหลว, uptime monitor แจ้งเตือน | Container orchestrator restart อัตโนมัติ; หาก deploy ใหม่พัง ทำ rollback ไปเวอร์ชันก่อนหน้าทันที (image เดิมยังอยู่) |
| **PostgreSQL** | Connection pool หมด/DB ไม่ตอบสนอง | Request ทั้งหมดที่ต้องใช้ข้อมูลล้มเหลว | Error rate พุ่งขึ้น, health check ที่ตรวจ DB (เมื่อเพิ่มในเฟสถัดไป) ล้มเหลว | Auto-retry ด้วย exponential backoff ระดับ connection; หาก DB เสียหายจริง กู้คืนจาก backup/PITR (ต้องทดสอบ restore จริงก่อนผ่าน Gate ตาม `data-policy.md` ข้อ 4) |
| **PostgreSQL — data corruption/partial write** | Transaction ล้มเหลวกลางทาง | ข้อมูลไม่สมบูรณ์ | Constraint violation, application error log | Transaction rollback อัตโนมัติ (ทุก atomic operation ใช้ `$transaction` ตาม `dev-rules.md` ข้อ 5) — ไม่มีข้อมูลค้างสถานะไม่สมบูรณ์โดยดีไซน์ |
| **Object Storage** | อัปโหลดล้มเหลวกลางทาง/ไฟล์กำพร้า | ไฟล์เสียหายหรือไม่มี metadata อ้างอิง | ตรวจสอบ orphan file job (เปรียบเทียบ storage กับ metadata ใน DB เป็นระยะ) | ลบไฟล์กำพร้าอัตโนมัติหรือแจ้งเตือนให้ตรวจสอบด้วยมือ; retry อัปโหลดแบบ idempotent (`user-flows.md` F4.1) |
| **Object Storage** | Provider ล่ม/เข้าถึงไม่ได้ | ดาวน์โหลด/อัปโหลดไฟล์ไม่ได้ทั้งระบบ | Signed URL request ล้มเหลว, error rate จาก storage SDK | แสดงข้อความชัดเจนแก่ผู้ใช้ (ไม่ error ดิบ); เมื่อ provider กลับมา ระบบทำงานต่อได้ทันทีโดยไม่ต้อง manual fix (ไม่มี state ค้างฝั่ง app) |
| **Background Jobs (pg-boss)** | Worker ล่มระหว่างประมวลผล | Job ค้างสถานะ "กำลังทำ" ตลอดไป | pg-boss มี job timeout ในตัว | Job ที่เกิน timeout ถูก mark ล้มเหลวและ retry อัตโนมัติ (จำกัดจำนวนครั้ง); ต้องออกแบบทุก job ให้ idempotent เพื่อ retry ปลอดภัย |
| **Background Jobs** | Retry ครบจำนวนแล้วยังล้มเหลว | งาน (เช่น import/ออกใบประกาศ) ไม่เสร็จ | Job เข้าสถานะ "failed" ถาวร มี alert | แจ้งเตือนผู้ดูแลระบบ (Central Officer/Super Admin) พร้อมเหตุผลที่ล้มเหลว ให้สั่ง retry ด้วยมือได้หลังแก้ต้นเหตุ |
| **Auth.js / Session** | Session store เสียหาย/หมดอายุกะทันหัน | ผู้ใช้ถูก log out หมดพร้อมกัน | อัตราการ login พุ่งขึ้นผิดปกติ | ผู้ใช้ล็อกอินใหม่ได้ตามปกติ (ไม่มีข้อมูลสูญหาย เพราะ session ไม่ใช่ source of truth ของข้อมูลธุรกิจ); ตรวจสอบสาเหตุที่ทำให้ session เสียหายเป็นวงกว้าง |
| **CI/CD Pipeline** | Deploy prod ล้มเหลวกลางทาง | เวอร์ชันใหม่ใช้งานไม่ได้บางส่วน | Deploy pipeline รายงานล้มเหลว, post-deploy health check ไม่ผ่าน | Pipeline หยุดอัตโนมัติก่อน traffic switch (หรือ rollback ทันทีหากใช้ rolling/blue-green deploy) — ไม่ปล่อยเวอร์ชันพังสู่ผู้ใช้ |
| **Logging/Monitoring** | ระบบ log/monitoring เองล่ม | มองไม่เห็นปัญหาที่เกิดขึ้นจริงในระบบหลัก | Monitoring ของ monitoring เอง (meta-alert) หรือพบทีหลังจาก log หาย | ระบบหลักต้องทำงานต่อได้แม้ logging ล่ม (fail-open สำหรับ logging, ไม่ fail-open สำหรับ authorization); กู้คืน logging โดยไม่กระทบ availability ของแอปหลัก |
| **Build-time external dependency** (เช่น Google Fonts, npm registry) | เครือข่ายภายนอกไม่พร้อมใช้งานตอน build | Build ล้มเหลว deploy ไม่ได้ | CI build step ล้มเหลว | หลีกเลี่ยง dependency ที่ต้องพึ่งเครือข่ายภายนอกตอน build เมื่อเป็นไปได้ (บทเรียนจาก P1: เปลี่ยนจาก `next/font/google` เป็น system font ในสภาพแวดล้อมที่เครือข่ายถูกจำกัด — ดู `sangha-system/README.md`) |

## 8. Dependencies ที่ยังไม่ตัดสินใจ (สืบเนื่องจาก `project-charter.md` ข้อ 8)

- Hosting platform สำหรับ container ของ Web/App layer
- ผู้ให้บริการ PostgreSQL (self-host / managed service) พร้อมแผน backup/PITR
- ผู้ให้บริการ Object Storage (S3-compatible)
- บริการรวม log ระยะยาว (log aggregation service)
- บริการ error tracking (เช่น Sentry) — ต้องตั้งค่า scrub rule ก่อนเปิดใช้จริง

## 9. ตัวอย่างสเปกฟังก์ชันระดับ Infrastructure (ตามรูปแบบใน `requirements.md` ข้อ 8)

### 9.1 Excel Import Worker (ประมวลผล job ที่สร้างจาก `user-flows.md` F6.3)

- Actor: System Job (ทำงานภายใต้ service account แยกจากผู้ใช้)
- Input: jobId, path ไฟล์ Excel ใน Object Storage, ผู้สั่งงานเดิม (สำหรับ audit)
- Process: ดึงไฟล์จาก Object Storage → parse และ validate ทีละแถว (ตามที่ระบุใน `requirements.md` ข้อ 8 ตัวอย่างที่ 2) → เขียนผลลัพธ์ภายใน transaction → อัปเดตสถานะ job
- Output: สถานะ job (สำเร็จ/ล้มเหลวบางส่วน/ล้มเหลวทั้งหมด) + รายงานต่อแถว
- Permission: รันเฉพาะ job ที่ถูกสร้างโดยผู้ใช้ที่มีสิทธิ์ตามที่ตรวจสอบไว้แล้วตอนสร้าง job (ไม่ตรวจสิทธิ์ซ้ำที่ตัว worker แต่ต้องเชื่อ scope ที่บันทึกไว้ตอนสร้าง job เท่านั้น ไม่รับ scope จากภายนอกใหม่)
- Validation: ตรวจสอบว่าไฟล์ยังอยู่ใน Object Storage และยังไม่ถูกประมวลผลไปแล้ว (ป้องกัน duplicate run)
- Error State: ไฟล์หาย/เสียหาย → mark job ล้มเหลว พร้อมเหตุผล; timeout → retry ตามนโยบาย pg-boss (ข้อ 7)
- Audit: บันทึกการเริ่ม/จบ job, ผลลัพธ์, จำนวนแถวสำเร็จ/ล้มเหลว
- Acceptance Criteria: AC1 รัน job ซ้ำ (เช่น retry อัตโนมัติ) ไม่ทำให้ข้อมูลถูกนำเข้าซ้ำซ้อน (idempotent); AC2 job ที่ล้มเหลวไม่ทิ้งข้อมูลค้างสถานะไม่สมบูรณ์

### 9.2 Certificate Generation Worker (M8 — อ้างอิง `user-flows.md` F4.3)

- Actor: System Job
- Input: jobId, รายชื่อผู้เข้าสอบที่ผ่านเกณฑ์ (จาก sessionId ที่ประกาศผลแล้ว)
- Process: render PDF ต่อคนจาก template → อัปโหลดเข้า Object Storage → บันทึก metadata ผูกกับทะเบียนบุคคล
- Output: ไฟล์ PDF ต่อผู้สอบผ่าน + สถานะ job
- Permission: รันเฉพาะ job ที่สร้างโดย Central Officer/Super Admin ตามที่ตรวจสอบไว้แล้วตอนสั่งงาน (`user-flows.md` F4.3)
- Validation: ออกใบประกาศเฉพาะผู้ที่ผลสอบ = ผ่านเกณฑ์และประกาศผลแล้วเท่านั้น (ตรวจซ้ำที่ worker ไม่เชื่อ input ที่ส่งมาเฉย ๆ)
- Error State: render ล้มเหลวบางราย → รายงานแยกจากที่สำเร็จ, สั่งสร้างซ้ำเฉพาะรายที่ล้มเหลวได้โดยไม่ซ้ำซ้อนกับรายที่สำเร็จแล้ว (idempotent ต่อรายบุคคล ไม่ใช่ต่อทั้ง batch)
- Audit: บันทึกผู้สั่งงาน, เวลา, รายชื่อที่สำเร็จ/ล้มเหลว
- Acceptance Criteria: AC1 ไม่ออกใบประกาศให้ผู้ที่ไม่ผ่านเกณฑ์แม้ input ของ job จะระบุผิดมา; AC2 สั่งสร้างซ้ำเฉพาะรายที่ล้มเหลวได้จริงโดยไม่สร้างไฟล์ซ้ำสำหรับรายที่สำเร็จแล้ว

## 10. เงื่อนไขการตรวจรับเอกสารนี้

- [ ] Owner ยืนยันสถาปัตยกรรมภาพรวม (ข้อ 2-3) และกลยุทธ์ environment (ข้อ 4)
- [ ] Owner ตัดสินใจ dependencies ที่ค้างอยู่ (ข้อ 8) หรือมอบหมายให้ทีมเสนอตัวเลือกเปรียบเทียบในเฟสถัดไป
- [ ] ทุก component สำคัญมี failure mode + recovery ระบุไว้ครบ (ตรวจสอบอัตโนมัติในรายงานสรุป)
- [ ] อ่าน ADR-0001 ถึง ADR-0007 ประกอบเอกสารนี้ครบทุกฉบับ
- [ ] ยืนยันว่าเอกสารนี้ไม่มีข้อมูลบุคคล/หน่วยงานจริงปรากฏ

---
*รายละเอียดเหตุผลของแต่ละการตัดสินใจสถาปัตยกรรมอยู่ใน `adr/0001-*.md` ถึง `adr/0007-*.md`*
