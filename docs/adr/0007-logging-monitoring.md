# ADR-0007: Structured JSON Logging (pino) + Health-check Monitoring; เลื่อนเปิด Error Tracking จนกว่าจะตั้ง Scrub Rule

**สถานะ:** Accepted
**วันที่:** 2026-09-14
**ผู้ตัดสินใจ:** QA-Security Engineer / Principal Software Architect
**อ้างอิงคู่กับ:** `data-policy.md` ข้อ 5, `dev-rules.md` ข้อ 7, `sangha-system/README.md` (`/api/health`)

## บริบท (Context)

`data-policy.md` ข้อ 5 บังคับว่า application log ห้ามมีค่า Restricted/Secret แบบเต็ม และ `dev-rules.md` ข้อ 7
บังคับว่า error message ที่ส่งกลับ client ต้องไม่มี stack trace/connection string หลุดออกไป ระบบยังไม่มีเครื่องมือ
logging/monitoring ที่ตั้งค่าไว้ในเฟส P1 Project Foundation (มีเพียง `/api/health` endpoint พื้นฐาน)

## การตัดสินใจ (Decision)

1. ใช้ **pino** เป็น logging library หลักของ Web/App layer และ background jobs — log ทุกบรรทัดเป็น JSON
   พร้อม `requestId`/`correlationId` เพื่อสืบย้อนข้ามชั้น (request → job)
2. ทุก log ผ่าน **scrub/mask ฟิลด์ที่จัดเป็น Restricted/Secret ก่อนเขียนเสมอ** (เช่น password, token, เลขบัตร
   ประชาชนเต็ม — แสดงเฉพาะบางส่วนเมื่อจำเป็นต้อง debug) ตาม `data-policy.md` ข้อ 5
3. ปลายทาง log คือ **stdout** ให้ container platform รวบรวม — ยังไม่ผูกกับบริการรวม log ระยะยาวเฉพาะเจ้าใด
   (dependency ที่รอตัดสินใจ)
4. Monitoring เบื้องต้นคือ **`/api/health`** (มีอยู่แล้ว) + uptime monitor ภายนอก (provider รอตัดสินใจ) ที่ ping
   endpoint นี้เป็นระยะ
5. **Error tracking (เช่น Sentry) จะไม่เปิดใช้งานจนกว่าจะตั้งค่า scrub rule ป้องกันข้อมูล Restricted หลุดออก
   นอกระบบเสร็จสมบูรณ์และทดสอบแล้ว** — ไม่เปิดใช้ด้วย default configuration ของเครื่องมือใด ๆ

## ทางเลือกที่พิจารณา (Alternatives Considered)

1. **เปิดใช้ error tracking (Sentry ฯลฯ) ทันทีด้วยค่าเริ่มต้นของเครื่องมือ** — ปฏิเสธ เพราะเครื่องมือเหล่านี้
   มักส่ง request/response payload ทั้งหมดออกนอกระบบโดย default ซึ่งเสี่ยงข้อมูล Restricted รั่วไหลไปยัง
   third-party service ก่อนตั้งค่า scrub rule — ขัดกับ `data-policy.md` ข้อ 5 โดยตรง
2. **ไม่มี structured logging ใช้ `console.log` ธรรมดา** — ปฏิเสธ เพราะสืบย้อนปัญหาข้าม request/job ได้ยาก
   ไม่มี correlation ID และไม่มีรูปแบบที่ parse ได้ง่ายเมื่อต้องส่งเข้าเครื่องมือ log aggregation ในอนาคต
3. **pino (ตัวเลือกที่เลือก) เทียบกับ winston** — เลือก pino เพราะ performance สูงกว่า (overhead ต่ำ สำคัญเมื่อ
   log ทุก request) และรูปแบบ JSON output เป็นค่าเริ่มต้นอยู่แล้ว

## ผลกระทบ (Consequences)

**ด้านบวก:**
- สืบย้อนปัญหาข้าม Web/App layer และ background job ได้ผ่าน correlation ID
- ไม่มีความเสี่ยงข้อมูล Restricted รั่วไหลผ่าน error tracking โดยไม่ตั้งใจ เพราะเปิดใช้เฉพาะหลังตั้ง scrub rule แล้ว

**ด้านลบ / ข้อควรระวัง:**
- ในช่วงที่ยังไม่เปิด error tracking ทีมต้องพึ่งพา log (stdout) เป็นหลักในการ debug production issue — ควร
  เร่งตั้งค่า scrub rule และเปิด error tracking ให้เร็วที่สุดเท่าที่ปลอดภัย ไม่ใช่เลื่อนไปเรื่อย ๆ
- ยังไม่มีบริการรวม log ระยะยาว — log ที่อยู่บน container ชั่วคราวอาจหายเมื่อ container ถูก restart/replace
  ก่อนที่จะตัดสินใจ provider (ความเสี่ยงที่ต้องแจ้ง Owner เพื่อเร่งตัดสินใจ)

## Failure Mode & Recovery ที่เกี่ยวข้อง

ดู `architecture.md` ข้อ 7 แถว "Logging/Monitoring" — สรุปสั้น: ระบบหลักต้องทำงานต่อได้แม้ระบบ logging เองล่ม
(fail-open เฉพาะสำหรับ logging เท่านั้น ไม่ใช่สำหรับ authorization ซึ่งต้อง fail-closed เสมอ); ต้องมี meta-alert
หรือการตรวจสอบเป็นระยะว่า logging pipeline เองยังทำงานอยู่ เพื่อไม่ให้ปัญหาจริงถูกมองข้ามเพราะคิดว่า "ไม่มี log
แปลว่าไม่มีปัญหา"
