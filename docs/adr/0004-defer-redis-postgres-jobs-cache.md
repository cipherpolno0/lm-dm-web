# ADR-0004: เลื่อนการใช้ Redis ออกไป — ใช้ PostgreSQL (pg-boss) สำหรับ Background Jobs และ Cache ระดับ Request แทน

**สถานะ:** Accepted (ทบทวนใหม่ได้เมื่อมีข้อมูล load จริง)
**วันที่:** 2026-09-14
**ผู้ตัดสินใจ:** Principal Software Architect
**อ้างอิงคู่กับ:** `architecture.md` ข้อ 3.4, 3.5

## บริบท (Context)

ระบบต้องการ (1) background job สำหรับงานที่ใช้เวลานาน (นำเข้า Excel, สร้างใบประกาศนียบัตร PDF เป็นชุด, ส่งอีเมล)
และ (2) กลไก rate-limiting สำหรับป้องกันการ login ผิดซ้ำ ๆ (`user-flows.md` F5.1) สถาปัตยกรรมทั่วไปมักแก้ปัญหานี้
ด้วย Redis (เป็นทั้ง cache และ message broker สำหรับ job queue เช่น BullMQ) แต่การเพิ่ม Redis หมายถึงต้องดูแล
บริการเพิ่มอีกหนึ่งตัว (provisioning, backup, monitoring, secret แยกต่างหาก) ตั้งแต่ช่วงเริ่มโครงการที่ยังไม่มี
หลักฐานด้าน load จริงว่าจำเป็น

## การตัดสินใจ (Decision)

1. ใช้ **pg-boss** (job queue library ที่ทำงานบน PostgreSQL โดยตรง ไม่ต้องมี broker แยก) สำหรับ background job
   ทั้งหมดในเฟสนี้
2. ใช้ **ตาราง PostgreSQL** (counter + expiry timestamp) สำหรับ rate-limiting การ login แทน Redis
3. ใช้ **Next.js Data Cache / React `cache()`** ระดับ request สำหรับข้อมูลอ่านบ่อย (หลักสูตร, ตารางสอบ) แทน
   การเพิ่ม cache layer แยก
4. **ไม่ปิดโอกาสเพิ่ม Redis ในอนาคต** — หากมีข้อมูลวัดจริง (เช่น PostgreSQL รับภาระ query/lock ไม่ไหว, ต้องการ
   pub/sub แบบ real-time) จะทบทวน ADR นี้ใหม่

## ทางเลือกที่พิจารณา (Alternatives Considered)

1. **BullMQ + Redis สำหรับ job queue, Redis สำหรับ cache/rate-limit** — ปฏิเสธในเฟสนี้ เพราะเพิ่ม operational
   overhead (บริการ, secret, monitoring เพิ่ม) โดยยังไม่มีหลักฐาน load ที่จำเป็นต้องใช้ ขนาดของระบบ
   (หน่วยงานคณะสงฆ์ ไม่ใช่ consumer internet scale) ไม่น่าต้องการ throughput ระดับที่ PostgreSQL รองรับไม่ไหว
   ในระยะแรก
2. **pg-boss บน PostgreSQL เดิม (ตัวเลือกที่เลือก)** — ลดจำนวนบริการที่ต้องดูแลเหลือ PostgreSQL ตัวเดียวสำหรับทั้ง
   OLTP และ job queue, ยังคงได้ retry/scheduling/dead-letter ที่ job queue ที่ดีควรมี
3. **ไม่มี background job เลย ทำทุกอย่างแบบ synchronous ใน HTTP request** — ปฏิเสธ เพราะงานอย่างนำเข้า Excel
   จำนวนมากหรือสร้าง PDF เป็นชุดจะทำให้ HTTP request timeout และ block UI ของผู้ใช้

## ผลกระทบ (Consequences)

**ด้านบวก:**
- ลดจำนวน infrastructure component ที่ต้อง provision/monitor/backup ในช่วงเริ่มโครงการ (มีแค่ PostgreSQL)
- Transaction ของ pg-boss ใช้ connection เดียวกับข้อมูลธุรกิจได้ ทำให้ "สร้าง record + enqueue job" เป็น
  atomic operation เดียวได้ง่ายกว่าเมื่อใช้ broker แยก

**ด้านลบ / ข้อควรระวัง:**
- Throughput ของ pg-boss ต่ำกว่า Redis-based queue โดยธรรมชาติ — ต้อง monitor job latency ตั้งแต่เริ่มใช้งานจริง
  เพื่อรู้ทันทีหากถึงขีดจำกัด
- Rate-limiting ผ่านตาราง Postgres มี latency สูงกว่า Redis (round-trip ไปฐานข้อมูลทุกครั้ง) — ยอมรับได้ในระยะแรก
  เพราะปริมาณ login attempt ของระบบนี้ไม่สูงมาก
- ต้องมี migration path ที่ชัดเจนหากภายหลังต้องย้ายไป Redis/BullMQ (ออกแบบ interface ของ job queue ให้ swap
  implementation ได้โดยไม่กระทบโค้ดฝั่งที่เรียกใช้)

## Failure Mode & Recovery ที่เกี่ยวข้อง

ดู `architecture.md` ข้อ 7 แถว "Background Jobs (pg-boss)" — สรุปสั้น: worker ล่มระหว่างทำงาน job จะถูก mark
ล้มเหลวและ retry อัตโนมัติผ่าน job timeout ในตัวของ pg-boss (ทุก job ต้อง idempotent); หาก retry ครบจำนวนแล้ว
ยังล้มเหลว ระบบแจ้งเตือนผู้ดูแลให้ตรวจสอบและสั่ง retry ด้วยมือได้
