-- AlterTable
-- ทดสอบ workflow วิวัฒนาการ schema แบบ forward migration (เพิ่มฟิลด์ใหม่)
-- หมายเหตุ: migration นี้ถูก rollback แล้วโดย migration ถัดไป
-- (20260914100407_rollback_add_user_phone) — คงไฟล์นี้ไว้เป็นประวัติจริงของ
-- migration history ตามธรรมชาติของ Prisma Migrate (ไม่ลบไฟล์ migration เก่าทิ้ง
-- แม้จะถูก revert ในภายหลัง) ดูรายละเอียดการทดสอบใน prisma/MIGRATIONS.md
ALTER TABLE "users" ADD COLUMN "phone" TEXT;
