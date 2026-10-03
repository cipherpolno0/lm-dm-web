# ADR-0001: ใช้ Next.js App Router เวอร์ชัน 16.x แทน 14/15 ที่ระบุในสเปกเดิม

**สถานะ:** Accepted (ต้องขอ Owner ยืนยันซ้ำ — ดูหัวข้อ "ผลกระทบ")
**วันที่:** 2026-09-14
**ผู้ตัดสินใจ:** Principal Software Architect / QA-Security Engineer (งาน P1 Project Foundation)
**อ้างอิงคู่กับ:** `sangha-system/README.md` (หัวข้อ "หมายเหตุสำคัญ" ข้อ 1), `architecture.md` ข้อ 3.1

## บริบท (Context)

สเปกเดิมของโครงการระบุให้ใช้ "Next.js 14/15 App Router" ระหว่างการ scaffold โปรเจกต์จริงใน P1 Project
Foundation ได้ตรวจสอบด้วย `npm audit` พบว่า:

- Next.js 14.2.35 (เวอร์ชันเสถียรล่าสุดของสาย 14) มีช่องโหว่ระดับ **critical**: Unauthenticated Remote Code
  Execution บนเซิร์ฟเวอร์ที่รัน Windows, และช่องโหว่ high/moderate อื่นอีกหลายรายการ (cache poisoning,
  middleware bypass, SSRF, DoS)
- Next.js 15.5.25 (เวอร์ชัน backport ล่าสุดของสาย 15 ตาม npm dist-tag `backport`) ยังมีช่องโหว่ระดับ **high**:
  PostCSS XSS ผ่าน unescaped `</style>` และ path traversal ผ่าน sourceMappingURL — เป็นช่องโหว่ในไลบรารีที่
  Next.js 15.x ฝังไว้ภายใน (`node_modules/next/node_modules/postcss`) **ไม่มี patch ในสาย 15** แก้ได้เฉพาะ
  การอัปเกรดเป็น Next.js 16.x เท่านั้น
- Next.js 16.3.5 (เวอร์ชัน stable ล่าสุด ณ วันที่ตัดสินใจ) ตรวจสอบด้วย `npm audit` แล้วพบ **0 vulnerabilities**

## การตัดสินใจ (Decision)

ใช้ **Next.js 16.3.5** (เวอร์ชัน stable ล่าสุด) เป็นฐานของโปรเจกต์ แทนเวอร์ชัน 14/15 ที่ระบุในสเปกเดิม

## ทางเลือกที่พิจารณา (Alternatives Considered)

1. **ใช้ Next.js 15.5.25 ตามสเปกเดิม** — ปฏิเสธ เพราะมีช่องโหว่ high severity ที่ไม่มี patch
2. **ใช้ Next.js 14.2.35** — ปฏิเสธ เพราะมีช่องโหว่ critical (RCE) ซึ่งร้ายแรงกว่ามาก
3. **Pin เวอร์ชัน 15.x แล้วรอ patch ในอนาคต** — ปฏิเสธ เพราะไม่มีกำหนดเวลาที่แน่นอนว่าจะมี patch สำหรับสาย 15
   (postcss เป็น dependency ที่ฝังอยู่ใน next เอง ไม่ใช่สิ่งที่ override ได้อย่างปลอดภัยด้วย `npm overrides`
   โดยไม่เสี่ยง breaking change)
4. **ใช้ Next.js 16.x (ตัวเลือกที่เลือก)** — ยอมรับความเสี่ยงจาก breaking change ของ major version ใหม่
   (Next.js เองระบุชัดว่า "This is NOT the Next.js you know" ใน `AGENTS.md` ที่ generate อัตโนมัติ) แลกกับ
   การไม่มีช่องโหว่ความปลอดภัยที่ทราบอยู่แล้ว — สอดคล้องกับหลักการ "security first" ใน `data-policy.md`/`dev-rules.md`

## ผลกระทบ (Consequences)

**ด้านบวก:**
- ไม่มีช่องโหว่ความปลอดภัยที่ทราบอยู่แล้วในเฟรมเวิร์กหลักของระบบ ณ วันที่ตัดสินใจ
- สถาปัตยกรรม App Router เหมือนเดิม ไม่กระทบขอบเขต/โมดูลที่ออกแบบไว้ใน P0 (`sitemap.md`, `user-flows.md`)

**ด้านลบ / ความเสี่ยงที่ต้องติดตาม:**
- Next.js 16.x มี breaking change จากสาย 14/15 ที่ทีมพัฒนาอาจคุ้นเคยน้อยกว่า — ต้องอ่านเอกสารใน
  `node_modules/next/dist/docs/` ก่อนเขียนโค้ดที่พึ่งพา API ที่อาจเปลี่ยน (ตามที่ `AGENTS.md` ของ Next.js เตือนไว้)
- **ต้องขอ Owner ยืนยันการเบี่ยงจากสเปกเดิมอย่างเป็นทางการ** ก่อนเดินหน้าเฟสถัดไป หาก Owner มีเหตุผลจำเป็นต้องใช้
  14/15 (เช่น ข้อจำกัดจาก hosting platform หรือ dependency อื่นที่ยังไม่รองรับ 16.x) ต้องกลับมาทบทวน ADR นี้ และ
  รับความเสี่ยงด้านความปลอดภัยที่ระบุไว้ข้างต้นแทน พร้อมแผน compensating control (เช่น WAF, network isolation)

## Failure Mode & Recovery ที่เกี่ยวข้อง

หากพบว่า Next.js 16.x มี regression หรือ breaking change ที่กระทบการทำงานจริงระหว่างพัฒนา: rollback กลับไปใช้
เวอร์ชัน 15.5.25 ชั่วคราวได้ (โค้ดฐานยังเป็น App Router เดียวกัน) แต่ต้องเพิ่ม compensating control สำหรับช่องโหว่
PostCSS ที่ระบุไว้ (เช่น จำกัดสิทธิ์การเข้าถึง build pipeline, ไม่เปิด source map ใน production) และบันทึกเป็น ADR
ฉบับใหม่แทนการแก้ ADR นี้โดยตรง
