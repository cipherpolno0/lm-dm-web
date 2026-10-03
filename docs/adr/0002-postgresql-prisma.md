# ADR-0002: ใช้ PostgreSQL เป็นระบบข้อมูลหลัก เข้าถึงผ่าน Prisma ORM

**สถานะ:** Accepted
**วันที่:** 2026-09-14
**ผู้ตัดสินใจ:** Database Architect / Principal Software Architect
**อ้างอิงคู่กับ:** `requirements.md` ข้อ 2, `data-policy.md` ข้อ 7/10, `architecture.md` ข้อ 3.2

## บริบท (Context)

ระบบต้องเก็บข้อมูลเชิงสัมพันธ์ที่ซับซ้อน (ทะเบียนคณะสงฆ์ตามลำดับชั้นการปกครอง, หลักสูตร/ระดับการศึกษา, คลังข้อสอบ,
ผลสอบ, สิทธิ์ผู้ใช้) ที่ต้องการ referential integrity ที่เข้มงวด, transaction ที่ atomic, และความสามารถเก็บ
audit/history โดยไม่เขียนทับข้อมูลเดิม (`data-policy.md` ข้อ 7, 10) — เทคโนโลยีฐานข้อมูลถูกกำหนดไว้แล้วใน
tech stack ของโครงการ (PostgreSQL + Prisma) ตั้งแต่ต้น

## การตัดสินใจ (Decision)

ใช้ **PostgreSQL** เป็นระบบข้อมูลหลัก (system of record) เพียงระบบเดียวสำหรับทุกโมดูล M1–M9 เข้าถึงผ่าน
**Prisma ORM** สำหรับ query, migration, และ type-safe schema ในฝั่ง TypeScript

## ทางเลือกที่พิจารณา (Alternatives Considered)

1. **NoSQL (เช่น MongoDB)** — ปฏิเสธ เพราะข้อมูลของระบบเป็นเชิงสัมพันธ์สูง (โครงสร้างการปกครองแบบลำดับชั้น,
   ความสัมพันธ์ระหว่างบุคคล/วัด/ผลสอบ/ข้อสอบ) และต้องการ referential integrity/transaction ที่ relational
   database รองรับได้ดีกว่า
2. **Prisma vs. Query Builder อื่น (Drizzle, Kysely)** — พิจารณา Drizzle เป็นทางเลือก (type-safe, เบากว่า)
   แต่เลือก Prisma เพราะ (ก) ระบุไว้แล้วใน tech stack ของโครงการ (ข) migration tooling และ Prisma Studio
   ช่วยงาน admin/debugging ในทีมขนาดเล็กได้ดี (ค) ecosystem/เอกสารที่กว้างกว่าในช่วงเริ่มโครงการ
3. **แยกฐานข้อมูลตามโมดูล (database per module/microservice)** — ปฏิเสธในเฟสนี้ เพราะเพิ่มความซับซ้อนด้าน
   operations โดยไม่จำเป็นสำหรับขนาดทีม/ขนาดระบบปัจจุบัน (ทบทวนใหม่ได้หากระบบเติบโตมากในอนาคต)

## ผลกระทบ (Consequences)

**ด้านบวก:**
- Transaction/constraint ระดับฐานข้อมูลรองรับกติกา `data-policy.md` ข้อ 7 (no-overwrite/history) และข้อ 10
  (atomic operation) ได้โดยตรง
- Type-safety ระหว่าง schema กับโค้ด TypeScript ลดข้อผิดพลาดจาก mismatch

**ด้านลบ / ข้อควรระวัง:**
- Prisma migration ต้อง review ก่อน apply กับ staging/prod เสมอ (breaking migration อาจทำให้ deploy ล้มเหลว)
- Connection pool ของ Prisma อาจไม่พอสำหรับ serverless/high-concurrency ในอนาคต — มีแผนเพิ่ม PgBouncer ถ้าจำเป็น
  (ดู `architecture.md` ข้อ 3.2)

## Failure Mode & Recovery ที่เกี่ยวข้อง

ดูตาราง Failure Mode & Recovery ใน `architecture.md` ข้อ 7 แถว "PostgreSQL" และ "PostgreSQL — data
corruption/partial write" — สรุปสั้น: transaction rollback อัตโนมัติสำหรับ partial write, backup/PITR
สำหรับความเสียหายระดับ instance (ต้องทดสอบ restore จริงก่อนผ่าน Real-data Readiness Gate)
