# ADR-0003: ใช้ Auth.js สำหรับ Authentication และบังคับ Authorization ฝั่ง Server แยกเป็นเลเยอร์ต่างหาก

**สถานะ:** Accepted
**วันที่:** 2026-09-14
**ผู้ตัดสินใจ:** Principal Software Architect / QA-Security Engineer
**อ้างอิงคู่กับ:** `dev-rules.md` ข้อ 4, `requirements.md` ข้อ 6 (permission matrix), `sitemap.md` ข้อ 2

## บริบท (Context)

ระบบมี Actor 10 ประเภท (`requirements.md` ข้อ 3) ที่มีสิทธิ์เข้าถึงข้อมูลตามบทบาท **และ** ตามลำดับชั้นการปกครอง
คณะสงฆ์ (scope-based) เช่น ผู้บริหารระดับจังหวัดเห็นเฉพาะข้อมูลจังหวัดตน — ความซับซ้อนนี้มากกว่าที่ session/JWT
มาตรฐานของไลบรารี authentication ทั่วไปจะจัดการให้ได้ครบในตัวเอง

## การตัดสินใจ (Decision)

1. ใช้ **Auth.js** สำหรับ **authentication** เท่านั้น (ยืนยันตัวตน, จัดการ session/JWT, credential provider)
2. **Authorization (การตรวจสิทธิ์ตามบทบาท+scope) แยกเป็นเลเยอร์ของแอปพลิเคชันเอง** ไม่ผูกกับ Auth.js โดยตรง —
   ทุก Server Action/Route Handler เรียกฟังก์ชันตรวจสิทธิ์กลาง (permission-resolution layer) ที่อ่าน role/scope
   จาก session แล้วเทียบกับ resource ที่ร้องขอ ก่อนดำเนินการใด ๆ เสมอ (deny-by-default ตาม `dev-rules.md` ข้อ 4)
3. Session เป็นแหล่งความจริง (source of truth) ของ role/scope เท่านั้น — **ไม่เชื่อค่าที่ client ส่งมาผ่าน
   request body/query ไม่ว่ากรณีใด**

## ทางเลือกที่พิจารณา (Alternatives Considered)

1. **ใช้ Auth.js เพียงอย่างเดียวโดยฝาก authorization ไว้ใน middleware** — ปฏิเสธ เพราะ middleware ของ Next.js
   ไม่เหมาะเป็นด่านตรวจสิทธิ์เดียว (ตรวจ scope ระดับลำดับชั้นการปกครองที่ซับซ้อนได้ยากใน middleware, และ
   `dev-rules.md` ข้อ 4 ระบุชัดว่าต้องตรวจซ้ำใน Server Action/Route Handler เสมอ)
2. **สร้างระบบ Authentication เอง (custom)** — ปฏิเสธ เพราะเพิ่มความเสี่ยงด้านความปลอดภัย (session management,
   password hashing, CSRF ฯลฯ) โดยไม่จำเป็น เมื่อมีไลบรารีที่ผ่านการตรวจสอบมาแล้วอย่าง Auth.js
3. **ใช้ third-party authorization service (เช่น OPA, Casbin แบบ external service)** — พิจารณาแล้วเกินความจำเป็น
   สำหรับขนาดระบบปัจจุบัน เพิ่ม operational overhead โดยยังไม่มีหลักฐานว่าจำเป็น ทบทวนใหม่ได้หาก permission model
   ซับซ้อนขึ้นมากในอนาคต (เช่น ต้องการ policy ที่เปลี่ยนบ่อยโดยไม่ deploy โค้ดใหม่)

## ผลกระทบ (Consequences)

**ด้านบวก:**
- แยกความรับผิดชอบชัดเจน: Auth.js ดูแล "คุณคือใคร" ส่วน permission-resolution layer ของแอปดูแล "คุณทำสิ่งนี้ได้
  หรือไม่" — ทดสอบแยกส่วนได้ง่ายกว่า
- รองรับ permission matrix ที่ซับซ้อนตาม `requirements.md` ข้อ 6 ได้เต็มที่ ไม่ถูกจำกัดด้วยโมเดลสิทธิ์ของ
  ไลบรารี authentication

**ด้านลบ / ข้อควรระวัง:**
- ต้องพัฒนา permission-resolution layer เอง (ไม่ใช่ของสำเร็จรูป) — ต้องมี test coverage สูงเป็นพิเศษ เพราะเป็น
  จุดที่ deny-by-default ต้องทำงานถูกต้อง 100%
- Session ต้อง invalidate/refresh ให้ถูกต้องเมื่อ role/scope ของผู้ใช้เปลี่ยน (เช่น ถูกเปลี่ยนบทบาทระหว่าง
  session ยังไม่หมดอายุ) — ต้องออกแบบกลไก session invalidation ในเฟส implementation จริง

## Failure Mode & Recovery ที่เกี่ยวข้อง

ดู `architecture.md` ข้อ 7 แถว "Auth.js / Session" — สรุปสั้น: session store เสียหาย/หมดอายุกะทันหันทำให้ผู้ใช้
ถูก log out แต่ไม่กระทบความถูกต้องของข้อมูลธุรกิจ (session ไม่ใช่ source of truth ของข้อมูล) ผู้ใช้ล็อกอินใหม่ได้
ตามปกติ; หากพบว่า permission-resolution layer อนุญาตสิทธิ์ผิดพลาด (false positive) ต้องถือเป็น incident
ความปลอดภัยระดับสูงสุด หยุดใช้งาน endpoint ที่เกี่ยวข้องทันทีจนกว่าจะแก้ไขและเพิ่ม test case ป้องกันไม่ให้เกิดซ้ำ
