# Data Safety & Data Policy

**โครงการ:** ระบบฐานข้อมูลคณะสงฆ์และการศึกษาพระปริยัติธรรม (นักธรรม / ธรรมศึกษา / บาลี) พร้อมคลังข้อสอบ ระบบแบบทดสอบ ระบบสมาชิก และระบบผู้ดูแลระบบ
**เฟส:** P0 — Orientation & Safety
**อ้างอิงคู่กับ:** `project-charter.md`, `requirements.md`, `dev-rules.md`
**สถานะ:** ร่างสำหรับ Owner Review
**เวอร์ชัน:** 0.1 | **วันที่:** 2026-09-14

> เอกสารนี้ใช้ข้อมูลสมมติเท่านั้น ไม่มีชื่อบุคคล วัด หรือหน่วยงานจริงปรากฏอยู่

---

## 1. วัตถุประสงค์

เอกสารนี้เป็น**กติกาบังคับ (mandatory policy)** ว่าด้วยความปลอดภัยของข้อมูลในทุกเฟสของโครงการ ครอบคลุม: นโยบายใช้ข้อมูลสมมติ (mock-only), การจัดการ secret, การเก็บ history แทนการเขียนทับ, การตรวจสอบสิทธิ์ฝั่ง server, หลักฐานการทดสอบ และการแยกสภาพแวดล้อม dev/staging/prod ทุกหัวข้อเขียนเป็น checklist ที่ใช้ตรวจสอบได้จริงในทุก PR/ทุก release

**ขอบเขตบังคับใช้:** ทุก environment, ทุก branch, ทุกคนที่มีสิทธิ์เข้าถึงโค้ดหรือข้อมูลของโครงการ ไม่มีข้อยกเว้นรายบุคคล

## 2. การจัดประเภทข้อมูล (Data Classification)

| ระดับ | ตัวอย่าง | กติกา |
|---|---|---|
| **Public** | ประกาศทั่วไป, ระดับชั้นหลักสูตร, ตารางสอบที่เปิดเผยได้ | เผยแพร่ได้โดยไม่ต้องยืนยันตัวตน |
| **Internal** | โครงสร้างการปกครอง, ข้อมูลอ้างอิง (master data) ที่ไม่ผูกกับบุคคล | เข้าถึงได้เฉพาะผู้ใช้ที่ล็อกอินตามสิทธิ์ |
| **Restricted (บุคคล/PII)** | ทะเบียนพระภิกษุ/สามเณร รายบุคคล, ผลสอบรายบุคคล, เอกสารแนบ, ข้อมูลติดต่อ | เข้าถึงตาม RBAC + deny-by-default, ห้ามปรากฏในข้อมูลสมมติที่ไม่ mask |
| **Secret** | API key, DB credential, session secret, object storage key | ห้าม commit, เก็บใน secret manager/`.env` เท่านั้น (ไม่ commit `.env`) |

ทุกตาราง/ฟิลด์ในฐานข้อมูลต้องระบุระดับข้อมูลนี้ในเอกสารออกแบบ schema (P1 เป็นต้นไป)

## 3. นโยบายข้อมูลสมมติเท่านั้น (Mock-Only Data Policy)

**กฎหลัก:** Development และ Test environment ทุกแห่ง **ใช้ได้เฉพาะข้อมูลสมมติ (synthetic/fictitious data)** จนกว่าจะผ่าน Real-data Readiness Gate (ข้อ 4) — ไม่มีข้อยกเว้น แม้เพื่อ "debug เร็วขึ้น" หรือ "ข้อมูลจริงแค่ 1 แถว"

### 3.1 สิ่งที่อนุญาต
- [ ] ชื่อ-นามสกุลสมมติที่สร้างด้วย mock data generator หรือ prefix ชัดเจน เช่น `ทดสอบ กรณีศึกษา`, `Test User 01`
- [ ] เลขทะเบียน/รหัสอ้างอิงที่สร้างแบบสุ่มหรือใช้ prefix `TEST-`/`MOCK-`
- [ ] วัด/สำนักเรียนสมมติที่ระบุชัดว่าเป็นข้อมูลทดสอบ เช่น `วัดทดสอบ 01`
- [ ] ไฟล์แนบตัวอย่างที่สร้างขึ้นเอง (ไม่ใช่สแกนเอกสารจริงแม้จะ blur/mask แล้ว)

### 3.2 สิ่งที่ห้ามโดยเด็ดขาด
- [ ] ชื่อ-นามสกุลจริงของบุคคลใด ๆ (แม้จะเป็นเพื่อนร่วมทีมหรืออาสาสมัคร)
- [ ] เลขบัตรประชาชน เบอร์โทรศัพท์ อีเมลจริง หรือที่อยู่จริง
- [ ] ข้อมูลที่ export/copy มาจากระบบ production จริง (แม้บางส่วน หรือแม้ anonymize เองโดยไม่ผ่านกระบวนการอนุมัติ)
- [ ] ภาพถ่ายเอกสารจริง (ใบสุทธิ, บัตรประชาชน, ใบประกาศนียบัตรจริง) แม้เพื่อทดสอบ OCR/ระบบไฟล์แนบ
- [ ] Screenshot ของหน้าจอที่มีข้อมูลจริงติดอยู่ (รวมถึงใน PR, Slack, เอกสารประกอบการประชุม)

### 3.3 การบังคับใช้
- [ ] Seed script (`prisma/seed.ts` หรือเทียบเท่า) ต้องมี comment หัวไฟล์ระบุชัดว่า "MOCK DATA ONLY"
- [ ] Code review ต้องตรวจทุก PR ที่แตะ seed/fixture ว่าไม่มีรูปแบบข้อมูลจริงหลุดเข้ามา
- [ ] มี automated scan (regex-based) รันใน CI ตรวจ pattern เสี่ยง (เลข 13 หลัก, เบอร์โทร, อีเมล) ในไฟล์ seed/fixture/docs ก่อน merge

## 4. Real-data Readiness Gate

ห้ามมีข้อมูลบุคคลจริงใน environment ใด ๆ (รวม staging) จนกว่าจะผ่านเงื่อนไขทั้งหมดต่อไปนี้ และได้รับการอนุมัติเป็นลายลักษณ์อักษรจาก Owner:

- [ ] นโยบายคุ้มครองข้อมูลส่วนบุคคล (PDPA) ขององค์กรได้รับการอนุมัติและนำมาปรับใช้กับระบบนี้แล้ว
- [ ] Server-side authorization ผ่านการทดสอบ (unit + integration) ครบทุก endpoint ที่แตะข้อมูล Restricted
- [ ] Audit logging ทำงานครบถ้วนสำหรับ create/update/delete บนทุกตารางที่จัดเป็น Restricted
- [ ] มีแผนสำรอง/กู้คืนข้อมูล (backup & restore) และผ่านการทดสอบ restore จริงอย่างน้อย 1 ครั้ง พร้อมบันทึกผล
- [ ] กำหนดนโยบายเก็บรักษา/ลบข้อมูล (data retention/erasure policy) ชัดเจน (ดูข้อ 9)
- [ ] Environment แยกกันชัดเจนตามข้อ 8 (dev/staging/prod) พร้อม secret คนละชุด
- [ ] Owner ลงนามอนุมัติเป็นลายลักษณ์อักษร ระบุวันที่และขอบเขตข้อมูลจริงที่อนุญาต (เช่น เฉพาะ production เท่านั้น ไม่รวม staging)

**ผลของการฝ่าฝืน:** หากพบข้อมูลจริงใน environment ที่ยังไม่ผ่าน gate นี้ ถือเป็น incident ต้องหยุดงานที่เกี่ยวข้องทันที ลบข้อมูลออกจากทุกที่ที่ปรากฏ (รวม git history หากถูก commit) และรายงาน Owner

## 5. การจัดการ PII (Seed / Screenshot / Log / Fixture)

| แหล่งข้อมูล | กติกา |
|---|---|
| Seed script | ใช้ mock data generator เท่านั้น, ห้าม hardcode ข้อมูลจริง |
| Screenshot (สำหรับ PR/เอกสาร/รายงาน) | ถ่ายจาก environment ที่มีแต่ mock data เท่านั้น หากจำเป็นต้องถ่ายจาก environment ที่มีข้อมูลจริง (หลังผ่าน gate) ต้อง mask ฟิลด์ Restricted ทั้งหมดก่อนเผยแพร่ |
| Application log | ห้าม log ค่า Restricted/Secret แบบเต็ม (เช่น ห้าม log password, เลขบัตรประชาชนเต็ม) — ใช้ masking เช่น แสดงเฉพาะ 4 ตัวท้ายเมื่อจำเป็นต้อง debug |
| Test fixture | ต้องสร้างจาก generator หรือ template ที่ไม่มีข้อมูลจริง, เก็บแยก directory ชัดเจน เช่น `test/fixtures/mock/` |
| Error tracking/monitoring (เช่น Sentry) | ตั้งค่า scrub rule ป้องกัน field ที่จัดเป็น Restricted ไม่ให้ถูกส่งออกนอกระบบ |

## 6. การจัดการ Secret

- [ ] **ห้าม commit secret ทุกชนิดลง repository** (API key, DB connection string ที่มี credential, JWT/session secret, object storage access key)
- [ ] ทุก repository ต้องมี `.env.example` ที่ระบุชื่อตัวแปรครบถ้วนแต่**ไม่มีค่าจริง** (ใช้ placeholder เช่น `DATABASE_URL=postgresql://user:password@localhost:5432/dbname`)
- [ ] `.env`, `.env.local`, `.env.production` ต้องอยู่ใน `.gitignore` ตั้งแต่ commit แรกของ repository
- [ ] Secret ของแต่ละ environment (dev/staging/prod) เก็บแยกกันคนละชุด ไม่ใช้ secret เดียวกันข้าม environment
- [ ] ใช้ secret manager หรือ environment variable ของ platform deploy เท่านั้น (ไม่ฝัง secret ในโค้ดหรือ config ที่ commit)
- [ ] ตั้ง pre-commit hook หรือ CI job สแกนหา secret pattern (เช่น `AKIA[0-9A-Z]{16}`, `sk-[a-zA-Z0-9]{20,}`, `-----BEGIN PRIVATE KEY-----`) ก่อนอนุญาตให้ merge
- [ ] หาก secret รั่วไหลเข้า git history โดยไม่ตั้งใจ ต้อง **revoke/rotate secret นั้นทันที** และพิจารณาล้าง git history ร่วมกับ Owner

## 7. History แทนการ Overwrite (No-Overwrite Policy)

ข้อมูลสำคัญ (ทะเบียนพระภิกษุ/สามเณร, ผลสอบ, สิทธิ์ผู้ใช้, สถานะสังกัด) **ห้ามเขียนทับโดยไม่มีร่องรอย**

- [ ] ทุกการแก้ไขบันทึกเป็นแถวใหม่ในตาราง audit/history (append-only) พร้อม: ผู้กระทำ, timestamp, ค่าก่อนแก้, ค่าหลังแก้, เหตุผล/อ้างอิง (ถ้ามี)
- [ ] การลบข้อมูลใช้ **soft delete** (เช่น field `deletedAt`) ไม่ใช่ hard delete สำหรับข้อมูลที่จัดเป็นสำคัญ — hard delete อนุญาตเฉพาะกรณีที่กฎหมาย/นโยบายการเก็บรักษาข้อมูลกำหนดไว้ชัดเจนเท่านั้น (ดูข้อ 9)
- [ ] ค่าปัจจุบัน (current state) อ่านได้เร็วจากตารางหลัก ส่วนประวัติอ่านจากตาราง audit/history แยก ไม่ผสมกันจนกระทบ performance ของ query ปกติ
- [ ] Audit record เองต้อง**เขียนได้ครั้งเดียว ไม่แก้ไขย้อนหลัง** (immutable) — หากต้องแก้ไขข้อผิดพลาดใน audit log ให้เพิ่มระเบียนแก้ไขใหม่ ไม่ใช่ update ของเดิม

## 8. การแยก Environment (Dev / Staging / Prod)

| ประเด็น | กติกา |
|---|---|
| ฐานข้อมูล | คนละ instance/คนละ database ต่อ environment ห้ามใช้ connection string ร่วมกัน |
| Object storage | คนละ bucket หรืออย่างน้อยคนละ prefix ที่แยกสิทธิ์เข้าถึงชัดเจนต่อ environment |
| Secret/credential | คนละชุดต่อ environment (ข้อ 6) |
| ข้อมูล | **ห้ามคัดลอกข้อมูล production ลง dev/staging** แม้จะ anonymize เอง เว้นแต่ผ่านกระบวนการ anonymization ที่ได้รับอนุมัติอย่างเป็นทางการและบันทึกไว้ |
| Deployment | Pipeline แยกกันตาม environment, ต้องผ่าน CI (build + test) ก่อน deploy ทุกครั้ง ไม่ deploy ตรงจากเครื่อง local ไป staging/prod |
| การเข้าถึง | จำกัดผู้มีสิทธิ์เข้าถึง staging/prod ให้น้อยที่สุดเท่าที่จำเป็น (least privilege), เข้าถึง prod ต้องผ่านการยืนยันตัวตนที่รัดกุมกว่า dev |

## 9. การเก็บรักษา/ลบข้อมูล (Retention & Erasure) — Placeholder

รายละเอียดตัวเลขระยะเวลาเก็บรักษาข้อมูล (retention period) และกระบวนการลบข้อมูลตามคำขอ **ยังไม่กำหนด** — รอเอกสารนโยบาย PDPA จากองค์กร (dependency ที่ระบุใน `project-charter.md` ข้อ 8) เมื่อได้รับแล้วจะปรับปรุงหัวข้อนี้เป็นเงื่อนไขที่วัดได้และเป็นส่วนหนึ่งของ Real-data Readiness Gate อย่างเป็นทางการ

หลักการชั่วคราวระหว่างรอ: ข้อมูลที่จัดเป็น Restricted จะไม่ถูกลบถาวร (hard delete) โดยไม่มีการอนุมัติจาก Owner เป็นรายกรณี

## 10. Transaction สำหรับ Operation ที่ต้อง Atomic

- [ ] Operation ใดก็ตามที่แก้ไขมากกว่า 1 ตาราง/มากกว่า 1 แถวพร้อมกัน และต้องสำเร็จหรือล้มเหลวทั้งหมดพร้อมกัน **ต้องใช้ database transaction** (เช่น `prisma.$transaction`)
- [ ] ตัวอย่างที่ต้อง transaction เสมอ: การนำเข้าข้อมูล Excel แบบชุด, การบันทึกผลสอบพร้อมอัปเดตสถานะผู้เข้าสอบ, การย้ายสังกัดพระภิกษุพร้อมปิดประวัติเดิม/เปิดประวัติใหม่
- [ ] หาก transaction ล้มเหลวกลางทาง ต้อง rollback ทั้งหมด ไม่ปล่อยให้ข้อมูลอยู่ในสถานะไม่สมบูรณ์ (partial write)

## 11. Failure Mode & Recovery (สำหรับงานที่มีผลต่อข้อมูล)

ทุกงาน/ฟีเจอร์ที่แก้ไขหรือย้ายข้อมูลต้องระบุในเอกสารออกแบบของฟีเจอร์นั้น:

- [ ] **Failure mode ที่เป็นไปได้** (เช่น ไฟล์นำเข้าเสียหายกลางทาง, connection หลุดระหว่าง transaction, ผู้ใช้ปิดหน้าเว็บก่อนบันทึกเสร็จ)
- [ ] **ผลกระทบ** หากเกิด failure นั้น (ข้อมูลค้าง, ข้อมูลซ้ำ, ข้อมูลหาย)
- [ ] **แนวทาง recovery** ที่ชัดเจน (เช่น rollback อัตโนมัติผ่าน transaction, ปุ่ม retry ที่ idempotent, ขั้นตอน manual recovery พร้อมผู้รับผิดชอบ)
- [ ] แนวทาง recovery ต้อง**ทดสอบจริง**อย่างน้อย 1 ครั้งก่อนขึ้น production (ไม่ใช่แค่ออกแบบไว้เฉย ๆ)

## 12. การตรวจสอบและบังคับใช้ (Enforcement)

| กลไก | ความถี่ |
|---|---|
| Automated PII/secret pattern scan ใน CI | ทุก push/PR |
| Code review ตาม checklist เอกสารนี้ | ทุก PR ที่แตะ data model, seed, auth, หรือ logging |
| ทบทวนกติกาเอกสารนี้ | ทุกครั้งที่ขอบเขตโครงการเปลี่ยน หรืออย่างน้อยทุกเริ่มเฟสใหม่ |
| ตรวจสอบก่อนผ่าน Real-data Readiness Gate | ครั้งเดียวแบบเป็นทางการ ก่อนอนุญาตข้อมูลจริง |

## 13. Checklist สรุป (ใช้ตรวจก่อน Merge/Release)

- [ ] ไม่มีข้อมูลบุคคลจริงใน seed/fixture/screenshot/log ที่เพิ่ม/แก้ไขใน PR นี้
- [ ] ไม่มี secret ใด ๆ ถูก commit; `.env.example` อัปเดตตรงกับตัวแปรที่ใช้จริง
- [ ] การแก้ไขข้อมูลสำคัญ (ถ้ามี) บันทึกลง audit/history ไม่ใช่ overwrite
- [ ] Authorization ตรวจสอบฝั่ง server และยึด deny-by-default
- [ ] Operation ที่ต้อง atomic ใช้ transaction แล้ว
- [ ] มีการระบุ failure mode และแนวทาง recovery สำหรับงานที่กระทบข้อมูล
- [ ] Environment ที่ทดสอบเป็น dev/staging ที่มีแต่ mock data เท่านั้น

## 14. เงื่อนไขการตรวจรับเอกสารนี้

- [ ] Owner ยืนยันว่ากติกาในเอกสารนี้ครบถ้วนและใช้เป็น checklist บังคับได้จริง
- [ ] Owner ยืนยัน/เติมเงื่อนไข Real-data Readiness Gate ให้ตรงกับนโยบายองค์กร (โดยเฉพาะข้อ 9 ที่รอ PDPA policy)
- [ ] ยืนยันว่าเอกสารนี้ไม่มีข้อมูลบุคคล/หน่วยงานจริงปรากฏ (ดูผลตรวจสอบในรายงานสรุป)

---
*เอกสารนี้เป็นกติกาบังคับ (mandatory) ไม่ใช่คำแนะนำ — การฝ่าฝืนถือเป็นข้อบกพร่องที่ต้องแก้ไขก่อน merge เสมอ*
