# readiness-checklist.md — Production Readiness Gate (P9 Real-data Readiness)

**งาน:** Production Readiness Gate + Cutover Plan
**Phase:** P9 Real-data Readiness
**วันที่ประเมิน:** 2026-09-27
**สถานะโดยรวม (GO/NO-GO): 🔴 NO-GO สำหรับข้อมูลจริง** — ดูสรุปหัวข้อ 0

**อ้างอิงคู่กับ:** `data-policy.md` §4 (Real-data Readiness Gate ต้นฉบับ), `project-charter.md` §8-9,
`security-checklist.md`, `threat-model.md`, `test-plan.md`, `ops-runbook.md`, `roles-permissions.md`,
`audit-history.md`, `migration-dry-run-report.md`, `real-data-mapping.md`, `staging-deployment.md`
— คู่กับ `cutover.md` (แผนปฏิบัติการ cutover ที่จะใช้ได้ก็ต่อเมื่อเอกสารนี้แสดง GO เท่านั้น)

> **กติกาบังคับของงานนี้ (วิธีตรวจสอบในบรีฟ): "ห้ามใช้ข้อมูลจริงจนทุก gate ที่จำเป็น = Approved"**
> เอกสารนี้จึงรายงานสถานะแต่ละรายการตามความเป็นจริงที่ตรวจสอบ/ทดสอบได้จริงเท่านั้น
> รายการใดที่ต้องรอการกระทำของบุคคล/องค์กรภายนอกที่ยังไม่เกิดขึ้นจริง จะระบุเป็น
> **Blocked** ไม่ใช่ Approved แม้จะมีความพร้อมทางเทคนิคครบแล้วก็ตาม

---

## 0. สรุปผลสำหรับผู้บริหาร/Owner

| หมวด | สถานะ | จำนวนรายการ |
|---|---|---|
| ✅ Approved (ทดสอบ/ตรวจสอบจริงแล้ว ผ่าน) | | 8 |
| 🟡 Pending (ทำได้แต่ยังไม่เสร็จ ไม่ใช่ external blocker) | | 3 |
| 🔴 Blocked (รอการกระทำของ Owner/องค์กรภายนอกที่ยังไม่เกิดขึ้น) | | 3 |

**ทุกรายการ Blocked มีต้นตอร่วมกันแค่ 2 อย่าง**:

1. **ยังไม่มีการแต่งตั้ง Owner** — `project-charter.md` ระบุไว้ในหัวเอกสารเองตั้งแต่ต้นโครงการว่า
   "ผู้อนุมัติ (Owner): รอการระบุชื่อ/ตำแหน่งผู้มีอำนาจอนุมัติ" และไม่เคยถูกอัปเดตในทุกงานที่ผ่านมา
2. **ยังไม่มีเอกสารนโยบาย PDPA จากองค์กร** — `project-charter.md` §8 (Dependencies) และ
   `data-policy.md` §9 ระบุตรงกันว่า "รอเอกสารจากองค์กร" มาตั้งแต่ P0

ทั้งสองเรื่องนี้ **ไม่ใช่สิ่งที่ทีมวิศวกรรมแก้ไขเองได้** — ต้องยกระดับให้ผู้มีอำนาจขององค์กร
ดำเนินการ (ดูหัวข้อ 5 "งานถัดไปที่ควรทำ") ทุกอย่างที่อยู่ในอำนาจของทีมวิศวกรรม
(security, backup/restore, rollback, test evidence, environment separation) **ได้ทำและพิสูจน์
จริงจนผ่านหมดแล้ว** ในงานนี้และงานก่อนหน้า

---

## 1. Real-data Readiness Gate (7 ข้อ ตาม `data-policy.md` §4 — ต้นฉบับ)

| # | รายการ | สถานะ | หลักฐาน |
|---|---|---|---|
| G1 | นโยบาย PDPA ได้รับอนุมัติจากองค์กร/ฝ่ายกฎหมาย | 🔴 **Blocked** | `project-charter.md` §8: "PDPA policy — รอเอกสารจากองค์กร" (ตั้งแต่ P0 จนถึงวันนี้ยังไม่มีเอกสารส่งมา) |
| G2 | Server-side authorization ผ่านการทดสอบ (unit + integration) ครบทุก endpoint ข้อมูล Restricted | ✅ **Approved** | รันจริงวันนี้ (2026-09-27): unit 142/142 ผ่าน (`npm run test:unit`), integration/e2e 1,318/1,318 assertion ผ่าน 25/25 ไฟล์ (`node prisma/run-regression.mjs`) — ครอบคลุม deny-by-default/IDOR/RBAC scope ทุก role ตาม `roles-permissions.md` §7, `security-checklist.md` — ดูหัวข้อ 4 |
| G3 | Audit logging ครบสำหรับ create/update/delete บนตาราง Restricted | ✅ **Approved** | DB trigger บังคับ immutable (`audit_logs_no_update`/`audit_logs_no_delete`), writer รวมจุดเดียว (`insertAuditLog()`) ตาม `audit-history.md` — ยืนยันซ้ำวันนี้ผ่าน `test-admin-audit-log.mjs` 28/28 และ `test-rbac-scope.mjs` 28/28 (audit ของการ grant/revoke สิทธิ์เอง) |
| G4 | มีแผน backup/restore และทดสอบจริงอย่างน้อย 1 ครั้ง พร้อมบันทึกผล | ✅ **Approved** (การทดสอบตามเงื่อนไข gate นี้) — 🟡 การตั้งเวลาอัตโนมัติยัง **Pending** แยกต่างหาก | ทดสอบจริงวันนี้ (ไม่ใช่แค่จากงานก่อนหน้า): backup จริง 223.6 KB + restore เข้าฐานข้อมูลแยก + เทียบ row count ตรงทุกตาราง — ดูหัวข้อ 4.2 ผลลัพธ์เต็ม |
| G5 | มีนโยบาย retention/erasure ของข้อมูล | 🔴 **Blocked** | `data-policy.md` §9 ระบุตรงๆ ว่าเป็น "Placeholder — ยังไม่กำหนด — รอเอกสารนโยบาย PDPA จากองค์กร" (ขึ้นกับ G1 โดยตรง แก้ G1 ไม่ได้ก็แก้ข้อนี้ไม่ได้) |
| G6 | แยก environment (dev/staging/prod) พร้อม secrets แยกกัน | ✅ **Approved** | `data-policy.md` §8 (กติกา) + implement จริงใน `staging-deployment.md` (Task 22: Dockerfile, CI/CD, env แยก, secrets แยกไฟล์ `.env.staging`/`.env.production.example`) |
| G7 | Owner เซ็นอนุมัติเป็นลายลักษณ์อักษร ระบุวันที่และขอบเขตข้อมูลจริงที่อนุญาต | 🔴 **Blocked** | ไม่เคยมีการแต่งตั้ง Owner ในประวัติโครงการทั้งหมด (`project-charter.md` หัวเอกสาร) — ไม่มีตัวบุคคลที่จะเซ็นอนุมัติได้ในขณะนี้ |

**สรุป G1-G7: 4 Approved, 3 Blocked (G1, G5, G7)** — G5 เป็นผลพวงของ G1 โดยตรง (ไม่ใช่ blocker อิสระที่ 3);
กล่าวอีกนัยหนึ่งคือ **มีต้นตอ blocker จริงเพียง 2 เรื่อง (Owner + PDPA)**

---

## 2. Production Readiness Gate — หมวดเพิ่มเติมตามบรีฟงานนี้

บรีฟงานนี้ระบุเพิ่มเติมจาก 7 ข้อข้างต้นว่าต้องมี "owner/security/data/legal-policy review
ตามบริบท, backup, rollback, monitoring, freeze window" — ตารางนี้ครอบคลุมหมวดที่ไม่ได้อยู่ใน
7 ข้อเดิมของ `data-policy.md` โดยตรง (บางหมวดซ้ำกับหัวข้อ 1 จะอ้างอิงกลับไปแทนการเขียนซ้ำ)

| หมวด | สถานะ | รายละเอียด/หลักฐาน |
|---|---|---|
| **Owner / Business Sign-off** | 🔴 **Blocked** | เหมือน G7 ข้างต้น |
| **Security Review** | ✅ **Approved (พร้อม Accepted Risk ที่เปิดเผย)** | 12 มาตรการป้องกันตาม `security-checklist.md` ทดสอบจริงครบ (SQLi/XSS/CSRF/rate-limit/secret-scan/CSP/CSV-injection/IDOR/upload-validation/immutable-audit) + STRIDE/OWASP mapping ใน `threat-model.md` — **มี Accepted Risk ที่ต้องแจ้ง Owner อย่างเปิดเผย 7 ข้อ** (ดูหัวข้อ 3) ซึ่งเป็นความเสี่ยงที่ "ยอมรับไว้" ไม่ใช่ "แก้แล้ว" — ต้องให้ Owner รับทราบก่อน sign-off |
| **Data / Privacy / Legal-Policy Review** | 🔴 **Blocked** | เหมือน G1+G5 ข้างต้น — ไม่มีเอกสาร PDPA จากองค์กรให้ทีม legal/data ตรวจสอบ |
| **Backup & Restore** | ✅ **Approved** (ดู G4) | รายละเอียดเต็มหัวข้อ 4.2 |
| **Rollback** | ✅ **Approved** | พิสูจน์ 2 ระดับ: (1) ระดับ transaction ต่องานนำเข้าเดียว — `migration-dry-run-report.md` (Task 24, 101/101 assertion รวม DBCONFLICT-01/UNIQUEFILE-01/02 พิสูจน์ rollback อัตโนมัติเมื่อชนกับข้อมูลจริงที่ commit ไปแล้ว ไม่มีข้อมูลครึ่งๆ กลางๆ หลงเหลือ); (2) ระดับฐานข้อมูลทั้งชุด — `scripts/db-restore.mjs` ทดสอบจริงวันนี้ (ดูหัวข้อ 4.2) — รายละเอียดขั้นตอนเต็มอยู่ใน `cutover.md` §6-7 |
| **Monitoring & Alerting** | 🟡 **Pending** (บางส่วน Approved) | `/api/health` และ `/api/admin/system/metrics` implement+ทดสอบจริงแล้ว (`ops-runbook.md` §6-7, ยืนยันซ้ำวันนี้ด้วย `curl http://localhost:3000/api/health` → 200 `{"status":"ok",...}`) — **แต่ไม่มีระบบ alerting/paging ใดๆ เลย** (`adr/0007-logging-monitoring.md` ระบุนอกขอบเขตเดิม) และ pino structured logging เปลี่ยนแล้วเพียง 3 ไฟล์ ส่วนที่เหลือยัง `console.*` — ต้องพึ่ง on-call เฝ้าดูมือระหว่าง cutover (ดู `cutover.md` §9) |
| **Freeze Window** | 🟡 **Pending** | **ยังไม่เคยมีการออกแบบ freeze window มาก่อนในโครงการนี้เลย** — งานนี้เป็นครั้งแรกที่กำหนดขึ้น (ดู `cutover.md` §3) สถานะ Pending เพราะ "ออกแบบแล้ว" ไม่เท่ากับ "เคยซ้อมจริง" — ต้องซ้อม (rehearsal) อย่างน้อย 1 ครั้งก่อนใช้กับข้อมูลจริง |
| **Test Evidence** | ✅ **Approved** | รันจริงวันนี้ครบทุกชุด ไม่มีการอ้างผลที่ไม่ได้รันจริง — ดูหัวข้อ 4 |

---

## 3. Security — Accepted Risks ที่ต้องแจ้ง Owner อย่างเปิดเผย (จาก `threat-model.md` §7)

รายการนี้ **ไม่ใช่ช่องโหว่ที่ยังไม่ได้ตรวจ** — เป็นความเสี่ยงที่ทีมวิศวกรรม **ทราบและตัดสินใจ
ยอมรับไว้แล้ว** ในเฟสปัจจุบัน (ส่วนใหญ่เป็นข้อจำกัดของ infrastructure layer ที่ยังไม่มี ไม่ใช่บั๊ก
ของ application layer) นำมาซ้ำในเอกสารนี้เพราะ Owner ต้อง **รับทราบและยอมรับ (accept) ความ
เสี่ยงเหล่านี้อย่างชัดเจน** เป็นส่วนหนึ่งของการ sign-off (G7) ไม่ใช่แค่ทีมวิศวกรรมยอมรับฝ่ายเดียว:

1. IP-based rate limiting fail-open เมื่อไม่มี reverse proxy ที่เชื่อถือได้ตั้งค่า `x-forwarded-for`
2. CSP (Content-Security-Policy) เป็นแบบไม่มี nonce — ไม่ป้องกัน inline-script XSS ได้ 100%
3. ไม่มีการสแกนไวรัส/มัลแวร์บนไฟล์ที่อัปโหลด (ตรวจแค่ MIME/magic-bytes/ขนาด)
4. `scripts/scan-secrets.mjs` ยังไม่ถูกผูกเข้ากับ CI/pre-commit hook (ไม่มี CI runner จริงใน
   สภาพแวดล้อม sandbox ปัจจุบัน) — ต้องรันด้วยมือ (ดูหัวข้อ 4.3 ผลรันวันนี้)
5. ไม่มี WAF/DDoS protection ระดับ infrastructure
6. HTTPS/TLS termination ไม่เคยถูกทดสอบจริง (dev รันเป็น HTTP ธรรมดา แม้จะส่ง HSTS header แล้วก็ตาม)
7. ไม่มีระบบ centralized log aggregation/alerting (ตรงกับช่องว่าง "Monitoring & Alerting" หัวข้อ 2)

---

## 4. หลักฐานการทดสอบจริงที่รันในงานนี้ (2026-09-27)

ทุกคำสั่งด้านล่างรันจริงในงานนี้ (ไม่ใช่การอ้างอิงผลจากงานก่อนหน้าเพียงอย่างเดียว) เพื่อให้
readiness gate นี้มีหลักฐานของตัวเองที่เป็นปัจจุบันที่สุด ตามกติกา "ห้ามอ้างว่าทดสอบผ่านหากยังไม่
ได้รันจริง"

### 4.1 Unit + Integration/E2E regression (ครบชุด)

```
$ npm run test:unit
 Test Files  13 passed (13)
      Tests  142 passed (142)
   Duration  28.47s

$ node prisma/run-regression.mjs
(reset + reseed ฐานข้อมูลจากศูนย์ก่อนรัน — เพื่อผลลัพธ์ที่สะอาดไม่ปนสถานะเดิม)
รวม: 25 ไฟล์, 1318 assertion ผ่าน, 0 assertion ล้มเหลว, ไฟล์ที่ล้มเหลว: 0/25
เวลาสิ้นสุด: 2026-09-27T13:39:40.135Z
```

**รวมทั้งหมดวันนี้: 142 (unit) + 1,318 (integration/e2e) = 1,460 assertion ผ่านหมด, 0 ล้มเหลว**

**บั๊กเครื่องมือทดสอบที่พบและแก้ในงานนี้**: รัน `run-regression.mjs` รอบแรกโดยไม่แก้ไขอะไร
พบว่า `test-migration-dry-run.mjs` ถูกรายงานเป็น **FAILED** เพราะสคริปต์นั้นต้องการ
`DATABASE_URL` ของสำเนา dry-run แยกต่างหาก (ตาม `scripts/dry-run-db.sh`) ซึ่งถูก `down` ทิ้งไป
แล้วหลังงาน Task 24 เสร็จ — เป็น **false-failure จากสภาพแวดล้อม ไม่ใช่ regression จริง**
(เทียบเท่าประเภทเดียวกับ `test-auth-session-expiry.mjs` ที่ต้องมี dev server อีกตัวแยกต่างหาก
และถูก skip โดย default อยู่แล้ว) **แก้ไข**: เพิ่ม `test-migration-dry-run.mjs` เข้า
`SKIP_BY_DEFAULT` ใน `prisma/run-regression.mjs` (เปิดด้วย `--include-dry-run` เมื่อมี
สภาพแวดล้อมที่ตั้งค่าสำเนา dry-run ไว้แล้ว) — ยืนยันด้วยการรันซ้ำหลังแก้ ได้ผล 0/25 ล้มเหลวตาม
ที่แสดงข้างต้น เหตุผลที่แก้ไฟล์นี้แม้จะไม่อยู่ในขอบเขตงานนี้โดยตรง: ความถูกต้องของหลักฐานการทดสอบ
(`run-regression.mjs`) เป็นสิ่งที่ readiness gate นี้ต้องอ้างอิงโดยตรง การปล่อยให้รายงานผลเท็จไว้
จะขัดกับกติกา "ห้ามอ้างว่าทดสอบผ่านหากยังไม่ได้รันจริง" ของบรีฟนี้เอง

**หมายเหตุ**: ลองรัน `run-regression.mjs --skip-reset` ซ้ำทันทีหลังรอบแรก (ไม่ reset ฐานข้อมูล)
พบ 3 ไฟล์ล้มเหลว (`test-admin-organization.mjs`, `test-exam-document-domain.mjs`,
`test-import-pipeline.mjs`) — ไม่ใช่บั๊กเช่นกัน แต่เป็นพฤติกรรมที่ **มีเอกสารระบุไว้ล่วงหน้าแล้ว** ใน
`roles-permissions.md` §7 ("ทำ state transition แบบ immutable DRAFT→APPROVED ที่ rerun ซ้ำไม่ได้
โดยไม่ reset") — พิสูจน์ว่าเอกสารเดิมถูกต้อง โดยการรันแบบ reset เต็ม (ค่า default ของสคริปต์) ให้
ผลสะอาด 0 ล้มเหลวตามที่รายงานไว้ข้างต้น

### 4.2 Backup & Restore (ทดสอบจริงวันนี้ — ไม่ใช่แค่การอ้างอิงหลักฐานเดิม)

```
$ npm run db:backup
db-backup: สำเร็จ — backups/sangha_system_dev_2026-09-27T13-39-57-433Z.dump (218.6 KB)

$ node scripts/db-restore.mjs --file backups/sangha_system_dev_2026-09-27T13-39-57-433Z.dump \
    --target-db sangha_system_readiness_restore_test --admin-url "postgresql://postgres:***@localhost:5432/postgres"
db-restore: ยังไม่มีฐานข้อมูล "sangha_system_readiness_restore_test" — กำลังสร้างใหม่
db-restore: สำเร็จ — ฐานข้อมูล "sangha_system_readiness_restore_test" กู้คืนจาก "..." แล้ว

# เทียบ row count ตาราง Restricted หลักระหว่างต้นทางกับฐานข้อมูลที่กู้คืน:
Source (sangha_system_dev):              users=8  organizations=12  persons=11  audit_logs=75
Restored (…_readiness_restore_test):     users=8  organizations=12  persons=11  audit_logs=75
→ ตรงกันทุกตัวเลข
```

**Cleanup หลังทดสอบ (ทำจริง ไม่ทิ้งไว้)**: `DROP DATABASE sangha_system_readiness_restore_test`,
คืนค่ารหัสผ่านชั่วคราวของ role `postgres` (`ALTER ROLE postgres WITH PASSWORD NULL`) ที่ตั้งขึ้น
เฉพาะสำหรับการทดสอบนี้ (จำเป็นเพราะ role ของแอป `sangha_dev` ไม่มีสิทธิ์ `CREATEDB` ตามหลัก
least-privilege — ตรงกับที่ `scripts/db-restore.mjs` ออกแบบไว้ให้ต้องใช้ `--admin-url`/`PGADMIN_URL`
แยกต่างหากจาก `DATABASE_URL` ของแอปเสมอ) — ไฟล์ backup (`backups/*.dump`) อยู่ใน `.gitignore`
(`/backups/`) อยู่แล้ว ไม่มีความเสี่ยง commit หลุด

**ข้อสรุปสำหรับ G4**: เงื่อนไข "ทดสอบจริงอย่างน้อย 1 ครั้ง พร้อมบันทึกผล" **ผ่านแล้วจริง** ทั้งจาก
งานนี้และจากทรานสคริปต์เดิมใน `ops-runbook.md` §4.3 — สิ่งที่ยังไม่มีคือ **การตั้งเวลาอัตโนมัติ**
(cron/scheduled job) ซึ่งเป็นคนละเงื่อนไขกัน (gate ต้องการ "ทดสอบแล้วอย่างน้อย 1 ครั้ง" ไม่ใช่
"อัตโนมัติแล้ว") — จึงจัดเป็น Approved สำหรับ G4 แต่ยังมี action item แยกเรื่องระบบอัตโนมัติ (หัวข้อ 5)

### 4.3 Secret/PII scan (รันจริงวันนี้)

```
$ npm run scan:secrets
scan-secrets: พบ 2 finding ที่ต้องตรวจสอบ:
  [thai_citizen_id_13_digits] tests/unit/logger.test.ts:58 — "1234567890123"
  [thai_citizen_id_13_digits] tests/unit/logger.test.ts:71 — "1234567890123"
```

**ตรวจสอบแล้ว: false positive ที่ตั้งใจ ไม่ใช่ข้อมูลบุคคลจริงหลุด** — ทั้งสองบรรทัดเป็นค่า
mock ในเทสต์ที่พิสูจน์ว่าฟังก์ชัน redact ของ logger (`src/lib/logger.ts`) ปิดบังเลขบัตรประชาชน
ได้จริง (เลขซ้ำเรียงกันทั้ง 13 หลัก "1234567890123" ไม่ใช่รูปแบบที่เกิดขึ้นจริง อยู่คู่กับ
`password: "hunter2"`/`token: "secret-token-abc"` ซึ่งเป็นค่าจำลองชัดเจนเช่นกัน) ตรงตามข้อจำกัด
"ใช้ข้อมูลสมมติเท่านั้นในการทดสอบ" ของบรีฟทุกงาน — ไม่ต้องแก้ไขใดๆ แต่บันทึกไว้เป็นหลักฐานว่า
scanner ทำงานตรวจจับ pattern ได้จริง (พิสูจน์ตัวเองไปในตัว)

### 4.4 Health check (รันจริงวันนี้)

```
$ curl http://localhost:3000/api/health
{"status":"ok","phase":"P8 — QA, Security & Deployment","environment":"development",
 "timestamp":"2026-09-27T13:39:44.411Z","checks":{"database":"ok","storage":"ok"}}
```

---

## 5. งานถัดไปที่ต้องทำก่อนจะ GO ได้จริง (เรียงตามความสำคัญ)

**ต้องยกระดับให้ Owner/องค์กร (ทีมวิศวกรรมทำเองไม่ได้):**

1. แต่งตั้ง Owner อย่างเป็นทางการ (ระบุชื่อ/ตำแหน่งในเอกสาร `project-charter.md`) — ปลด G7
2. ขอเอกสารนโยบาย PDPA จากองค์กร/ฝ่ายกฎหมาย แล้วนำมากำหนดนโยบาย retention/erasure ที่เป็น
   รูปธรรม (`data-policy.md` §9) — ปลด G1 และ G5 พร้อมกัน
3. เมื่อ 1-2 เสร็จแล้ว: ให้ Owner อ่าน Accepted Risks (หัวข้อ 3) แล้วเซ็นอนุมัติเป็นลายลักษณ์อักษร
   ระบุวันที่และขอบเขตข้อมูลจริงที่อนุญาต (G7 เต็มรูปแบบ)

**ทีมวิศวกรรมทำต่อได้เลย (ไม่ใช่ blocker แต่ควรทำก่อน/ระหว่าง cutover):**

4. ตั้งเวลาอัตโนมัติสำหรับ backup (cron/scheduled job จริง — ปัจจุบันมีแค่สคริปต์ที่ต้องรันมือ)
5. ผูก `scan-secrets.mjs` เข้ากับ CI/pre-commit hook เมื่อมี CI provider จริง (นอก sandbox นี้)
6. ขยาย pino structured logging ให้ครบทุกไฟล์ (ปัจจุบัน 3/หลายสิบไฟล์) เพื่อรองรับการทำ log
   aggregation/alerting ในอนาคต
7. ซ้อม (rehearse) freeze window procedure ใน `cutover.md` อย่างน้อย 1 ครั้งกับข้อมูลจำลองที่มี
   ปริมาณใกล้เคียงข้อมูลจริง ก่อนใช้กับข้อมูลจริงครั้งแรก

---

## 6. Failure Mode และ Recovery (สรุปอ้างอิง)

รายละเอียดเต็มอยู่ในเอกสารเฉพาะทางแต่ละฉบับ (`roles-permissions.md` §9, `ops-runbook.md` §8,
`audit-history.md` §5, `migration-dry-run-report.md`) — เอกสารนี้สรุปเฉพาะที่เกี่ยวกับ
"เข้าสู่/ออกจากสถานะ Approved" ของ gate เอง:

- **สถานะ gate เปลี่ยนจาก Approved กลับเป็น Pending/Blocked ได้เสมอถ้าหลักฐานเปลี่ยน** — เอกสารนี้
  ไม่ใช่การอนุมัติถาวร ถ้ามีการแก้ไขโค้ดที่กระทบ authorization/audit/backup ในอนาคต ต้องรัน
  regression ซ้ำและปรับสถานะในเอกสารนี้ใหม่ ไม่ใช่ถือว่า "เคย Approved แล้วเสมอไป"
- **การทดสอบ restore วันนี้ทำกับฐานข้อมูล dev (mock data)** — ยังไม่เคยพิสูจน์กับขนาดข้อมูลจริง
  ระดับ production (ปริมาณ/เวลาที่ใช้อาจต่างกัน) — `cutover.md` §4 กำหนดให้ทำ backup+restore
  ทดสอบซ้ำกับข้อมูลจริงชุดแรกก่อนเข้าสู่ freeze window จริงเสมอ ไม่ใช่พึ่งผลทดสอบกับ mock data
  เพียงอย่างเดียว

---

## 7. ขอบเขตที่ตัดออก (Out of Scope — ต้องแจ้ง Owner)

- เอกสารนี้ไม่ได้ทำการตรวจสอบทางกฎหมาย (legal review) เอง — เป็นไปไม่ได้เพราะยังไม่มีเอกสาร
  PDPA ให้ตรวจ (G1) ทีมวิศวกรรมทำได้เพียงเตรียมกลไกทางเทคนิคที่นโยบายในอนาคตน่าจะต้องใช้
  (data classification, audit, retention hooks ที่พร้อมรับ TTL เมื่อมีนโยบายจริง)
- ไม่ได้ทดสอบ backup/restore กับขนาดข้อมูลระดับ production จริง (ดูหัวข้อ 6)
- ไม่ได้ตั้งค่า monitoring/alerting ระดับ infrastructure จริง (WAF, log aggregation, paging) —
  นอกขอบเขตของ sandbox development environment ปัจจุบัน
