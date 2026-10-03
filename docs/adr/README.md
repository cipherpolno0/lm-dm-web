# Architecture Decision Records (ADR)

ดัชนีการตัดสินใจด้านสถาปัตยกรรมของโครงการ ระบบฐานข้อมูลคณะสงฆ์และการศึกษาพระปริยัติธรรม
(นักธรรม/ธรรมศึกษา/บาลี) — อ้างอิงคู่กับ `../architecture.md`

| ADR | หัวข้อ | สถานะ |
|---|---|---|
| [0001](0001-nextjs-app-router-version.md) | ใช้ Next.js App Router เวอร์ชัน 16.x แทน 14/15 ที่ระบุในสเปกเดิม | Accepted (รอ Owner ยืนยันซ้ำ) |
| [0002](0002-postgresql-prisma.md) | ใช้ PostgreSQL เป็นระบบข้อมูลหลัก เข้าถึงผ่าน Prisma ORM | Accepted |
| [0003](0003-authjs-server-side-authorization.md) | ใช้ Auth.js สำหรับ Authentication + แยกเลเยอร์ Authorization ฝั่ง server | Accepted |
| [0004](0004-defer-redis-postgres-jobs-cache.md) | เลื่อนใช้ Redis — ใช้ PostgreSQL (pg-boss) สำหรับ jobs/cache | Accepted (ทบทวนได้เมื่อมีข้อมูล load จริง) |
| [0005](0005-object-storage-s3-compatible.md) | Object Storage แบบ S3-compatible ผ่าน Signed URL (provider รอตัดสินใจ) | Accepted บางส่วน |
| [0006](0006-containerized-deployment-env-separation.md) | Deploy แบบ Container (Docker), แยก 3 environment เต็มรูปแบบ | Accepted (hosting platform รอตัดสินใจ) |
| [0007](0007-logging-monitoring.md) | Structured logging (pino) + health-check monitoring, เลื่อน error tracking จนตั้ง scrub rule เสร็จ | Accepted |

## รูปแบบ ADR ที่ใช้

ทุกฉบับมีโครงสร้าง: สถานะ, วันที่, ผู้ตัดสินใจ, บริบท (Context), การตัดสินใจ (Decision), ทางเลือกที่พิจารณา
(Alternatives Considered), ผลกระทบ (Consequences — ด้านบวก/ด้านลบ), และ Failure Mode & Recovery ที่เกี่ยวข้อง
(อ้างอิงกลับไปยังตารางเต็มใน `../architecture.md` ข้อ 7)

## เมื่อไหร่ควรเขียน ADR ใหม่

เขียน ADR ฉบับใหม่ (ไม่ใช่แก้ฉบับเดิม) เมื่อมีการตัดสินใจสถาปัตยกรรมที่สำคัญเพิ่มเติม เช่น การเลือก hosting
platform จริง (สืบเนื่องจาก ADR-0006), การเลือกผู้ให้บริการ Object Storage จริง (สืบเนื่องจาก ADR-0005), หรือ
การเพิ่ม Redis ในอนาคตหากมีข้อมูล load สนับสนุน (สืบเนื่องจาก ADR-0004) — ฉบับเดิมคงอยู่เป็นประวัติการตัดสินใจ
ไม่ลบทิ้ง
