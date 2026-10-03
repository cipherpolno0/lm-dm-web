-- Rollback of 20260914100307_add_user_phone
--
-- Prisma Migrate ไม่มีกลไก "down migration" อัตโนมัติ (ต่างจากเครื่องมือ migration
-- บางตัว) แนวทางที่ Prisma แนะนำอย่างเป็นทางการสำหรับ staging/prod คือเขียน
-- migration ใหม่ที่ "forward" แต่ทำหน้าที่ย้อนกลับการเปลี่ยนแปลงเดิม — ไฟล์นี้คือ
-- ตัวอย่างและแบบทดสอบจริงของแนวทางนั้น (ดูผลการทดสอบใน prisma/MIGRATIONS.md)
ALTER TABLE "users" DROP COLUMN "phone";
