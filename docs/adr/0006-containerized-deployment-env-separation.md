# ADR-0006: Deploy เป็น Container (Docker) แบบ Platform-agnostic พร้อมแยก 3 Environment เต็มรูปแบบ

**สถานะ:** Accepted (การเลือก hosting platform เฉพาะยังรอ Owner ตัดสินใจ — เป็น ADR แยกในอนาคต)
**วันที่:** 2026-09-14
**ผู้ตัดสินใจ:** Principal Software Architect
**อ้างอิงคู่กับ:** `data-policy.md` ข้อ 8, `architecture.md` ข้อ 4-5, `project-charter.md` ข้อ 8

## บริบท (Context)

Hosting platform ที่แท้จริงสำหรับรันระบบยังไม่ถูกตัดสินใจ (dependency ที่ค้างมาตั้งแต่ `project-charter.md`
ข้อ 8) ในระหว่างที่รอการตัดสินใจนั้น สถาปัตยกรรมของ Web/App layer ควรถูกออกแบบให้ไม่ผูกติดกับ platform ใด
platform หนึ่งจนเกินไป เพื่อไม่ต้อง rewrite ส่วนสำคัญเมื่อ Owner เลือก platform ในภายหลัง

## การตัดสินใจ (Decision)

1. Deploy Web/App layer เป็น **container image เดียว (Docker)** ที่รันด้วย Node.js runtime มาตรฐาน ไม่ใช้
   platform-specific API ที่ทำให้ portability เสียไป (หลีกเลี่ยง vendor lock-in ระดับโค้ด)
2. แยก **3 environment เต็มรูปแบบ: dev, staging, prod** — แต่ละ environment มี database instance, object
   storage bucket/prefix, และชุด secret ของตัวเอง ไม่ใช้ร่วมกันข้าม environment (`data-policy.md` ข้อ 8)
3. Deploy prod ต้องผ่าน **manual approval** เสมอ หลังจาก staging ผ่าน smoke test แล้วเท่านั้น (ไม่ auto-deploy
   ตรงจาก merge ไป prod)

## ทางเลือกที่พิจารณา (Alternatives Considered)

1. **ผูกกับ Platform-as-a-Service เฉพาะเจ้า (เช่น deploy แบบ platform-specific ตั้งแต่ต้น)** — ปฏิเสธในตอนนี้
   เพราะยังไม่มีการตัดสินใจ hosting platform จาก Owner การผูกกับ platform ใดไปก่อนอาจต้อง rewrite ถ้า Owner
   เลือก platform อื่นภายหลัง
2. **Container-based, platform-agnostic (ตัวเลือกที่เลือก)** — เพิ่มความยืดหยุ่นในการย้าย/เลือก hosting
   ภายหลังได้โดยกระทบโค้ดน้อยที่สุด แลกกับต้องดูแลเรื่อง container image/orchestration เอง
3. **แชร์ database/secret ระหว่าง staging กับ prod เพื่อประหยัดต้นทุนช่วงแรก** — ปฏิเสธทันที เพราะขัดกับ
   `data-policy.md` ข้อ 8 โดยตรง (ความเสี่ยงข้อมูลจริงรั่วไหลเข้า staging หรือข้อมูลทดสอบปนกับข้อมูลจริง)

## ผลกระทบ (Consequences)

**ด้านบวก:**
- เลือก/เปลี่ยน hosting platform ในอนาคตได้โดยไม่ต้องออกแบบสถาปัตยกรรม Web/App layer ใหม่
- แยก environment เต็มรูปแบบลดความเสี่ยงข้อมูลทดสอบ/ข้อมูลจริงปนกัน ตรงตามข้อบังคับใน `data-policy.md`

**ด้านลบ / ข้อควรระวัง:**
- ต้นทุนดำเนินการ (3 ชุด infrastructure) สูงกว่าการใช้ environment เดียวหรือสองระดับ — ยอมรับได้เพราะเป็น
  ข้อบังคับด้านความปลอดภัยข้อมูลของโครงการ ไม่ใช่ทางเลือก
- ยังต้องมี ADR แยกในอนาคตเมื่อ Owner ตัดสินใจ hosting platform จริง (ระบุรายละเอียด provider-specific
  configuration ที่ ADR นี้จงใจไม่ระบุ)

## Failure Mode & Recovery ที่เกี่ยวข้อง

ดู `architecture.md` ข้อ 7 แถว "Web/App (Next.js)" และ "CI/CD Pipeline" — สรุปสั้น: container orchestrator
restart อัตโนมัติเมื่อ process ล่ม; deploy prod ที่ล้มเหลวกลางทางต้องหยุด pipeline ก่อน traffic switch หรือ
rollback ทันทีหากใช้ rolling/blue-green deploy ไม่ปล่อยเวอร์ชันที่พังไปสู่ผู้ใช้จริง
