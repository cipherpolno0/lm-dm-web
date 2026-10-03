# Development Rules

**โครงการ:** ระบบฐานข้อมูลคณะสงฆ์และการศึกษาพระปริยัติธรรม (นักธรรม / ธรรมศึกษา / บาลี) พร้อมคลังข้อสอบ ระบบแบบทดสอบ ระบบสมาชิก และระบบผู้ดูแลระบบ
**เฟส:** P0 — Orientation & Safety
**อ้างอิงคู่กับ:** `project-charter.md`, `requirements.md`, `data-policy.md`
**สถานะ:** ร่างสำหรับ Owner Review
**เวอร์ชัน:** 0.1 | **วันที่:** 2026-09-14
**Stack:** Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui + PostgreSQL + Prisma + Auth.js

---

## 1. วัตถุประสงค์

เอกสารนี้กำหนด**กติกาการพัฒนา (engineering rules)** ที่บังคับใช้กับทุกฟีเจอร์/ทุก PR ในโครงการ เพื่อให้มาตรฐานงานสม่ำเสมอ ตรวจสอบย้อนหลังได้ และสอดคล้องกับ `data-policy.md` ทุกหัวข้อเขียนเป็น checklist ที่ใช้ตรวจสอบได้จริงระหว่าง review

## 2. Workflow มาตรฐาน (บังคับทุกงาน)

```
วิเคราะห์ (Analyze) → ออกแบบ (Design) → ลงมือทำ (Implement) → ทดสอบ (Test)
   → review → แก้ (Fix) → regression test → commit
```

### 2.1 Analyze (วิเคราะห์)
- [ ] เข้าใจ requirement ที่เกี่ยวข้องจาก `requirements.md` (module + actor ที่เกี่ยวข้อง)
- [ ] ระบุผลกระทบต่อข้อมูล (data-impacting หรือไม่) — ถ้าใช่ ต้องเตรียม failure mode/recovery ตาม `data-policy.md` ข้อ 11
- [ ] ระบุ dependency ที่ยังไม่ยืนยัน (ถ้ามี) และแจ้งก่อนเริ่ม ไม่เดาเอง

### 2.2 Design (ออกแบบ)
- [ ] กรอก **Function Specification** ครบ 9 องค์ประกอบก่อนเริ่มเขียนโค้ด (ดูข้อ 3) — ถือเป็น **Definition of Ready**
- [ ] ระบุ schema/field ที่เกี่ยวข้องพร้อม data classification ตาม `data-policy.md` ข้อ 2
- [ ] ระบุว่าต้องใช้ transaction หรือไม่ (ดูข้อ 5)

### 2.3 Implement (ลงมือทำ)
- [ ] แก้ไข**เฉพาะไฟล์ที่เกี่ยวข้องกับงานนี้เท่านั้น** — ห้าม refactor ไฟล์อื่นที่ไม่เกี่ยวข้องในคราวเดียวกัน (แยกเป็นงาน/PR อื่น)
- [ ] Authorization ตรวจสอบฝั่ง server ทุกจุดตามข้อ 4
- [ ] ไม่ commit secret ใด ๆ (ตรวจตาม `data-policy.md` ข้อ 6)

### 2.4 Test (ทดสอบ)
- [ ] รันการทดสอบจริง (unit/integration ตามความเหมาะสม) — **ห้ามอ้างว่าผ่านหากยังไม่ได้รันจริง**
- [ ] บันทึกคำสั่งที่ใช้รันและผลลัพธ์ Passed/Failed ไว้ใน PR description หรือรายงานประกอบ
- [ ] ทดสอบด้วย mock data เท่านั้น ตาม `data-policy.md` ข้อ 3

### 2.5 Review
- [ ] ตรวจตาม Definition of Done (ข้อ 9) และ checklist ของ `data-policy.md` ข้อ 13
- [ ] ผู้ review ต้องไม่ใช่ผู้เขียนโค้ดเดียวกัน (เมื่อทีมมีมากกว่า 1 คน)

### 2.6 Fix (แก้)
- [ ] แก้ไขตามข้อเสนอแนะจาก review เฉพาะไฟล์ที่เกี่ยวข้อง
- [ ] หากแก้ไข logic สำคัญ ต้องรัน test ซ้ำ (ไม่ใช่แค่แก้แล้วจบ)

### 2.7 Regression Test
- [ ] รัน test suite ที่มีอยู่ทั้งหมด (ไม่ใช่แค่ test ของฟีเจอร์ใหม่) ก่อน commit สุดท้าย
- [ ] บันทึกผลลัพธ์จริง พร้อมระบุ test ที่ล้มเหลว (ถ้ามี) และการแก้ไข

### 2.8 Commit
- [ ] Commit message อธิบายสิ่งที่เปลี่ยนแปลงและเหตุผลอย่างชัดเจน
- [ ] ไม่ commit ไฟล์ที่ไม่เกี่ยวข้อง (เช่น ไฟล์ config เครื่อง local, `.env`)
- [ ] อ้างอิง requirement/issue ที่เกี่ยวข้องใน commit message (ถ้ามีระบบติดตามงาน)

## 3. ข้อกำหนด Function Specification (บังคับก่อนเริ่มพัฒนา)

ทุกฟังก์ชัน/endpoint/feature ต้องระบุครบ 9 หัวข้อต่อไปนี้ก่อนเริ่ม implement (รูปแบบเต็มและตัวอย่างอยู่ใน `requirements.md` ข้อ 8):

1. **Actor** — ใครเรียกใช้ได้
2. **Input** — ข้อมูลนำเข้าและชนิดข้อมูล
3. **Process** — ลำดับการประมวลผล
4. **Output** — ผลลัพธ์ที่ส่งคืน
5. **Permission** — บทบาท + ขอบเขต (scope) ที่มีสิทธิ์
6. **Validation** — กฎตรวจสอบข้อมูลนำเข้า
7. **Error State** — กรณีผิดพลาดที่เป็นไปได้และการตอบสนอง
8. **Audit** — เหตุการณ์ที่ต้องบันทึกลง audit log
9. **Acceptance Criteria** — เงื่อนไขที่ถือว่าผ่าน

**กติกา:** ฟังก์ชันใดไม่มี spec ครบ 9 ข้อ **ห้ามเริ่ม implement** — ถือเป็นงานที่ยังไม่พร้อม (not ready)

## 4. กติกา Server-Side Authorization (Deny-by-Default)

- [ ] ทุก request ที่แตะข้อมูลต้องผ่านการตรวจสอบสิทธิ์ **ฝั่ง server** เสมอ — ห้ามพึ่งพาการซ่อน UI ฝั่ง client เพียงอย่างเดียว
- [ ] ค่าเริ่มต้นของทุก route/endpoint คือ **ปฏิเสธ (deny)** จนกว่าจะมีกฎอนุญาตระบุไว้ชัดเจนสำหรับ role/scope นั้น
- [ ] ตรวจสอบ **scope ตามลำดับชั้นการปกครอง** ทุกครั้ง (เช่น Regional Admin ระดับจังหวัด ต้องถูกปฏิเสธหากพยายามเข้าถึงข้อมูลจังหวัดอื่น แม้จะแก้ไข request จาก client ก็ตาม)
- [ ] ใน Next.js App Router: ตรวจสิทธิ์ใน Server Action / Route Handler / server component ที่ดึงข้อมูลจริง — ห้ามตรวจเฉพาะใน middleware อย่างเดียว (middleware ใช้เป็นด่านแรกเสริม ไม่ใช่ด่านเดียว)
- [ ] Session/JWT จาก Auth.js ต้องเป็นแหล่งความจริง (source of truth) ของ role/scope — ไม่เชื่อค่า role ที่ client ส่งมาผ่าน request body/query
- [ ] Endpoint ที่ไม่มีการระบุ permission ใน function spec (ข้อ 3) ถือว่า **ปฏิเสธทุกคนโดย default** จนกว่าจะระบุ

## 5. กติกา Transaction / Atomicity

- [ ] Operation ที่แก้ไขมากกว่า 1 ตาราง/มากกว่า 1 แถวและต้องสำเร็จ-ล้มเหลวพร้อมกัน ต้องใช้ `prisma.$transaction` เสมอ
- [ ] ห้ามแยก operation ที่สัมพันธ์กันออกเป็นหลาย call แยกอิสระ (เสี่ยง partial write) — ตัวอย่าง: การนำเข้าข้อมูล Excel, การบันทึกผลสอบพร้อมอัปเดตสถานะ, การย้ายสังกัด
- [ ] ทดสอบกรณี transaction ล้มเหลวกลางทาง (เช่น จำลอง error ที่ operation ที่ 2 ของ 3) และยืนยันว่า rollback ครบ ไม่มีข้อมูลค้าง

## 6. กติกาการทำ Audit/History (ระดับ Implementation)

- [ ] ทุกตารางที่เก็บข้อมูลสำคัญ (ตาม `data-policy.md` ข้อ 2 ระดับ Restricted และ Internal ที่สำคัญ) มีตาราง audit/history คู่กัน หรือ pattern versioning ที่ตกลงร่วมกัน
- [ ] Audit record บันทึก: `actorId`, `action` (create/update/delete), `timestamp`, `before`, `after`, `entityId`, `entityType`
- [ ] เขียน audit record ภายใน transaction เดียวกับการเปลี่ยนแปลงข้อมูลจริง (ไม่ใช่ fire-and-forget แยกต่างหากที่อาจไม่สำเร็จ)
- [ ] ห้าม update/delete แถวใน audit table หลังบันทึกแล้ว (immutable — ดู `data-policy.md` ข้อ 7)

## 7. กติกา Secret ในโค้ด

- [ ] อ่าน secret ผ่าน environment variable เท่านั้น (`process.env.*`) ห้าม hardcode
- [ ] ทุกตัวแปรใหม่ใน `.env` ต้องเพิ่มลง `.env.example` พร้อม placeholder ในคอมมิตเดียวกัน
- [ ] ก่อน push ตรวจว่าไม่มี pattern secret หลุดไป (ตาม `data-policy.md` ข้อ 6) — แนะนำใช้ pre-commit hook อัตโนมัติ
- [ ] Error message ที่ส่งกลับ client ต้องไม่มี stack trace หรือ connection string หลุดออกไป (โดยเฉพาะใน production)

## 8. หลักฐานการทดสอบ (Test Evidence)

- [ ] ห้ามระบุในรายงาน/PR ว่า "ทดสอบผ่านแล้ว" โดยไม่มีคำสั่งและผลลัพธ์จริงแนบมาด้วย
- [ ] รูปแบบการบันทึกที่ยอมรับ: คำสั่งที่รัน + ผลลัพธ์ดิบ (หรือสรุปที่ตรวจสอบย้อนกลับได้) + สถานะ Passed/Failed ต่อรายการ
- [ ] หากมี test ที่ Failed ต้องระบุสาเหตุและแนวทางแก้ไข ไม่ปิดงานจนกว่าจะแก้หรือได้รับอนุมัติให้ knowingly ยอมรับความเสี่ยงจาก Owner
- [ ] Regression suite ทั้งหมดต้องรันผ่านก่อน commit สุดท้ายของงาน (ไม่ใช่แค่ test ของฟีเจอร์ใหม่)

## 9. Definition of Done (สรุปรวม)

งานหนึ่งชิ้นถือว่า "เสร็จ" เมื่อครบทุกข้อ:

- [ ] Function specification ครบ 9 องค์ประกอบ (ข้อ 3) ตรงกับสิ่งที่ implement จริง
- [ ] Server-side authorization ตรวจสอบครบ ยึด deny-by-default (ข้อ 4)
- [ ] Transaction ใช้ครบตามที่ต้อง (ข้อ 5)
- [ ] Audit/history บันทึกครบสำหรับข้อมูลสำคัญ (ข้อ 6)
- [ ] ไม่มี secret หรือ PII จริงหลุดเข้าโค้ด/log/seed (ข้อ 7, และ `data-policy.md`)
- [ ] Test รันจริงพร้อมหลักฐาน Passed/Failed (ข้อ 8)
- [ ] Regression test ผ่านทั้งหมด
- [ ] Failure mode/recoveryระบุไว้แล้วสำหรับงานที่กระทบข้อมูล (`data-policy.md` ข้อ 11)
- [ ] แก้ไขเฉพาะไฟล์ที่เกี่ยวข้องกับงานนี้ ไม่มีการเปลี่ยนแปลงนอกขอบเขต
- [ ] Review ผ่านและ commit message ชัดเจน

## 10. แนวทาง Stack เฉพาะ (สรุปสั้น — ขยายรายละเอียดใน P1)

| ส่วน | แนวทาง |
|---|---|
| Next.js App Router | ใช้ Server Components เป็นค่าเริ่มต้น, ใช้ Server Actions/Route Handlers สำหรับ mutation ที่ต้องตรวจสิทธิ์ |
| TypeScript | เปิด `strict` mode, ห้ามใช้ `any` โดยไม่มีเหตุผลระบุ (comment อธิบาย) |
| Prisma | Schema ระบุ relation และ constraint ชัดเจน, migration ทุกครั้งต้อง review ก่อน apply กับ staging/prod |
| Auth.js | Session เป็นแหล่งความจริงของ role/scope (ข้อ 4), ตั้งค่า session timeout ตามนโยบายความปลอดภัยที่จะกำหนดใน P2 |
| Tailwind + shadcn/ui | ใช้ component ที่มีอยู่ก่อนสร้างใหม่ซ้ำซ้อน, คงความสม่ำเสมอของ design token |

รายละเอียด coding convention เต็มรูปแบบ (naming, folder structure, lint rule) จะจัดทำเป็นเอกสารเสริมเมื่อเริ่ม P1/P2 เมื่อโครงสร้างโปรเจกต์เริ่มเป็นรูปเป็นร่าง

## 11. เงื่อนไขการตรวจรับเอกสารนี้

- [ ] Owner ยืนยันว่า workflow และ Definition of Done ใช้งานได้จริงกับทีม
- [ ] Owner ยืนยันว่ากติกา authorization/transaction/audit สอดคล้องกับ `data-policy.md`
- [ ] ยืนยันว่าเอกสารนี้ไม่มีข้อมูลบุคคล/หน่วยงานจริงปรากฏ (ดูผลตรวจสอบในรายงานสรุป)

---
*เอกสารนี้เป็นกติกาบังคับ ใช้ประกอบการ review ทุก PR ร่วมกับ `data-policy.md`*
