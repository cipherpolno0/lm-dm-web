# Database Migrations — PostgreSQL + Prisma

สถานะ: P1 Project Foundation ("ตั้งค่า PostgreSQL + Prisma") + P2 Database & Sangha
Domain ("ออกแบบฐานข้อมูลคณะสงฆ์" — เพิ่ม migration `20260923135937_sangha_org_domain`
ดูผลทดสอบใน §5; "ออกแบบโดเมนนักธรรม/ธรรมศึกษา/บาลี" — เพิ่ม migration
`20260923141654_education_domain` ดูผลทดสอบใน §6; "ออกแบบคลังข้อสอบและเอกสาร" — เพิ่ม
migration `20260923143443_exam_document_domain` ดูผลทดสอบใน §7; "สร้าง Seed Data
แบบสมมติ" — เพิ่ม `prisma/seed.ts` ดูผลทดสอบใน §9 ด้านล่าง; รายละเอียด schema/data
dictionary เต็มอยู่ใน `prisma/data-dictionary.md`, `prisma/erd.md`,
`prisma/education-schema.md`, `prisma/exam-document-schema.md`)

เอกสารนี้บันทึก (1) ข้อจำกัดของเครื่องมือที่พบจริงในสภาพแวดล้อมที่ใช้พัฒนา (2)
แนวทางที่ใช้แก้ปัญหาแทน และ (3) ผลการทดสอบจริง (Passed/Failed) ของ migration
workflow ทั้งหมด ตามข้อกำหนด "ห้ามอ้างว่าทดสอบผ่านหากยังไม่ได้รันจริง"
(dev-rules.md) — ทุกคำสั่งในเอกสารนี้ถูกรันจริงกับ PostgreSQL 16 ที่รันอยู่ในสภาพแวดล้อมนี้
(ไม่ใช่ค่าที่เขียนขึ้นจากความจำ)

## 1. ข้อจำกัดของเครื่องมือ (Tooling Limitation)

Prisma CLI (`npx prisma init/generate/validate/format/migrate ...`) ไม่สามารถรันได้เลย
ในสภาพแวดล้อมนี้ เพราะทุกคำสั่ง — แม้แต่คำสั่งที่ไม่แตะฐานข้อมูล เช่น `prisma format` —
พยายามดาวน์โหลด schema-engine binary จาก `binaries.prisma.sh` โดยไม่มีทางเลี่ยง และ
โดเมนนี้ถูกบล็อกโดยนโยบายเครือข่ายของสภาพแวดล้อม (403 Forbidden ผ่าน egress proxy)
ตัวอย่าง error จริงที่พบ:

```
Error: Failed to fetch sha256 checksum at
https://binaries.prisma.sh/all_commits/0edf323efd1d98336f3f0a68684b56f689b900d3/
debian-openssl-3.0.x/schema-engine.gz.sha256 - 403 Forbidden
```

สิ่งที่ตรวจสอบและยืนยันแล้ว:

- `PRISMA_ENGINES_CHECKSUM_IGNORE_MISSING=1` ข้าม checksum check ได้ แต่การดาวน์โหลด
  ตัว `.gz` binary จริงยังคง 403 เหมือนเดิม
- Prisma npm package (`prisma@7.10.0`) มี WASM engine ไฟล์ฝังมาด้วยจริง
  (`node_modules/prisma/build/schema_engine_bg.wasm` ฯลฯ) แต่ตรวจสอบ CLI source แล้ว
  ไม่มี env var หรือ flag ใดๆ ที่บังคับให้ CLI ใช้ WASM engine เหล่านี้แทนการ fetch
  binary ของเครื่อง — มีเพียง `PRISMA_SCHEMA_ENGINE_BINARY` /
  `PRISMA_MIGRATION_ENGINE_BINARY` / `PRISMA_ENGINES_MIRROR` ซึ่งต้องมี binary
  ทางเลือกอยู่แล้วจึงจะใช้ได้ (ไม่มีในสภาพแวดล้อมนี้)
- `@prisma/engines@7.10.0` (ดาวน์โหลดตรงจาก registry.npmjs.org) มีแต่ postinstall
  script ที่ fetch จาก binaries.prisma.sh เช่นกัน ไม่มี binary ฝังมาให้ใช้ทันที
- ตรวจสอบ GitHub เป็นแหล่งสำรอง — `github.com`/`api.github.com` ถูกบล็อกเช่นกัน
  (ข้อความชัดเจนว่า repo access ไม่ได้เปิดสำหรับ session นี้) จึงไม่สามารถดึง source
  ของ prisma-engines มา build เองได้ในเวลาที่มี

**สรุป**: ไม่มีทางรัน Prisma CLI จริงในสภาพแวดล้อมนี้ได้ ไม่ว่าจะด้วยวิธีใด ณ ตอนที่ทำงานนี้

## 2. แนวทางที่ใช้แทน (ไม่ปลอมแปลงผลทดสอบ)

แทนที่จะอ้างว่า `prisma migrate dev` ทำงานได้ (ซึ่งจะเป็นการโกหก) หรือปลอมแปลงโครงสร้าง
ตาราง `_prisma_migrations` ภายในของ Prisma จากความจำ (ซึ่งไม่ได้ตรวจสอบจริงว่าตรงกับ
เวอร์ชัน 7.10.0 จริงหรือไม่) ได้เลือกวิธีนี้แทน:

1. เขียน `prisma/schema.prisma` ตาม convention ของ Prisma จริง (ตรวจสอบ syntax ด้วยมือ)
2. เขียนโฟลเดอร์ migration ตาม convention ของ Prisma จริง
   (`prisma/migrations/<14-digit-timestamp>_<name>/migration.sql` +
   `migration_lock.toml`) พร้อม SQL DDL ที่ถูกต้องตาม PostgreSQL จริง
3. เขียนสคริปต์ทดสอบชั่วคราว `prisma/dev-migrate-verify.mjs` (ใช้ `pg` client ตรงๆ
   ไม่ผ่าน Prisma) เพื่อ **รัน SQL ของทุก migration จริงกับ PostgreSQL ที่รันอยู่จริง**
   ในเครื่องนี้ (`sangha_system_dev` บน localhost:5432) และบันทึกผลจริงในเอกสารนี้
4. สคริปต์นี้ใช้ตารางติดตามชื่อ `_migration_verification_log` ซึ่ง**ตั้งใจตั้งชื่อให้
   ต่างจากตาราง `_prisma_migrations` จริงของ Prisma อย่างชัดเจน** เพื่อไม่ให้เข้าใจผิดว่า
   นี่คือ Prisma migration history ตัวจริง — เป็นเพียงเครื่องมือทดสอบชั่วคราวเท่านั้น

### ขั้นตอน remediation เมื่อมีเครือข่ายปกติ (สำหรับ future work)

เมื่อ deploy ไปยัง environment ที่เข้าถึง `binaries.prisma.sh` ได้จริง (เช่น staging/prod
หรือเครื่อง dev ที่ไม่ได้ถูกบล็อก):

1. รัน `npx prisma generate` เพื่อสร้าง Prisma Client จาก schema.prisma (ยังไม่เคยรันได้
   ในสภาพแวดล้อมนี้ — ต้องรันครั้งแรกที่ environment ใหม่)
2. รัน `npx prisma migrate resolve --applied <migration_name>` สำหรับ migration ทั้ง 3
   รายการตามลำดับ (`20260914100207_init`, `20260914100307_add_user_phone`,
   `20260914100407_rollback_add_user_phone`) เพื่อ baseline ฐานข้อมูลที่มีอยู่แล้วเข้าสู่
   การติดตามของ Prisma Migrate อย่างเป็นทางการ (ตาราง `_prisma_migrations` จริง)
3. ลบตาราง `_migration_verification_log` และไฟล์ `prisma/dev-migrate-verify.mjs` ทิ้ง —
   ไม่จำเป็นอีกต่อไปเมื่อ Prisma CLI ใช้งานได้จริง
4. ตรวจสอบด้วย `npx prisma migrate status` ว่าไม่มี migration ค้าง (pending) หรือ drift

## 3. ผลการทดสอบจริง (รันเมื่อ 2026-09-14)

สภาพแวดล้อมทดสอบ: PostgreSQL 16 (local), database `sangha_system_dev`,
role `sangha_dev` — ไม่มีข้อมูลบุคคลจริงใดๆ ถูกใช้ (ทุกแถวทดสอบเป็น mock/synthetic
เช่น `mock.user@example.test`) ตาม data-policy.md ข้อ 1–2

| # | คำสั่งที่รันจริง | ผลลัพธ์จริง | สถานะ |
|---|---|---|---|
| 1 | `node prisma/dev-migrate-verify.mjs --status` (ก่อนเริ่ม) | `Applied: [] / Pending: [3 migrations]` | PASSED |
| 2 | `node prisma/dev-migrate-verify.mjs` (apply เฉพาะ `20260914100207_init`) | `[PASSED] applied 20260914100207_init` | PASSED |
| 3 | `psql \dt` / `\d users` / `\d audit_logs` / `\dT+` / ตรวจ trigger ผ่าน `pg_trigger` | ตาราง `users`, `audit_logs` ครบทุกคอลัมน์/type ตรงกับ schema.prisma, enum 3 ตัวถูกสร้างครบ, FK `audit_logs.actorId → users.id` ถูกต้อง, trigger `audit_logs_no_update`/`audit_logs_no_delete` มีอยู่จริง | PASSED |
| 4 | INSERT ผู้ใช้ mock (`test_user_001`) และ audit log mock (`audit_001`) ผ่าน psql | `INSERT 0 1` ทั้งสองคำสั่ง | PASSED |
| 5 | `UPDATE audit_logs SET after = ... WHERE id='audit_001'` | `ERROR: audit_logs is append-only: UPDATE is not permitted on this table` (ตามที่ตั้งใจออกแบบ) | PASSED (ปฏิเสธถูกต้อง) |
| 6 | `DELETE FROM audit_logs WHERE id='audit_001'` | `ERROR: audit_logs is append-only: DELETE is not permitted on this table` (ตามที่ตั้งใจออกแบบ) | PASSED (ปฏิเสธถูกต้อง) |
| 7 | ตรวจสอบแถว audit_001 หลังพยายาม UPDATE/DELETE | แถวข้อมูลไม่เปลี่ยนแปลง (`after` ยังเป็นค่าเดิม) | PASSED |
| 8 | Apply `20260914100307_add_user_phone` (forward evolution) | `[PASSED] applied 20260914100307_add_user_phone`; `\d users` ยืนยันคอลัมน์ `phone` (text, nullable) ถูกเพิ่มจริง | PASSED |
| 9 | Apply `20260914100407_rollback_add_user_phone` (compensating rollback) | `[PASSED] applied 20260914100407_rollback_add_user_phone`; `\d users` ยืนยันคอลัมน์ `phone` หายไปแล้ว, ข้อมูลแถวเดิม (`test_user_001`, `audit_001`) ยังอยู่ครบ (ALTER TABLE ไม่กระทบข้อมูลแถวอื่น) | PASSED |
| 10 | `node prisma/dev-migrate-verify.mjs --status` (หลัง apply ครบ 3 migration) | `Applied: [3 migrations] / Pending: []` | PASSED |
| 11 | `node prisma/dev-migrate-verify.mjs --reset` (จำลอง `prisma migrate reset`: drop schema public ทั้งหมด แล้ว replay migration ทั้ง 3 ไฟล์จากศูนย์) | `[PASSED] schema reset` → `[PASSED]` ทั้ง 3 migration ตามลำดับ → `Reset + full replay: PASSED` | PASSED |
| 12 | ตรวจสอบโครงสร้างหลัง reset (`\dt`, `\d users`) | ตารางและ schema ตรงกับที่คาดไว้ (ไม่มีคอลัมน์ `phone` เพราะ migration ที่ 3 คือ rollback ของมัน); ข้อมูลแถวเก่าถูกล้างจริงตามธรรมชาติของ `DROP SCHEMA ... CASCADE` (คาดไว้แล้ว — เทียบเท่าพฤติกรรมจริงของ `prisma migrate reset` ที่เป็น destructive) | PASSED |
| 13 | INSERT ผู้ใช้/audit log ใหม่ (`test_user_002`/`audit_002`) แล้วลองสั่ง `DELETE` บน audit_logs อีกครั้งหลัง reset | `ERROR: audit_logs is append-only: DELETE is not permitted` — trigger ยังทำงานถูกต้องหลัง replay จากศูนย์ | PASSED |
| 14 | `node prisma/dev-migrate-verify.mjs` (รันซ้ำเมื่อไม่มี migration ค้าง) | `No pending migrations. Database is up to date.` (idempotent, ไม่พยายาม apply ซ้ำ) | PASSED |
| 15 | ทดสอบ failure scenario: migration ปลอมที่มี SQL ผิดพลาด (`ADD COLUMN ... NONEXISTENT_TYPE`) รันผ่าน transaction เดียวกับที่ `dev-migrate-verify.mjs` ใช้ | `ERROR: type "nonexistent_type" does not exist` → `ROLLBACK` สำเร็จ → ตรวจสอบว่าคอลัมน์ไม่ถูกสร้าง (0 rows) และตาราง `_migration_verification_log` ไม่ถูกบันทึกรายการที่ fail (ไม่ corrupt) | PASSED (transaction rollback ทำงานถูกต้อง — migration ที่ fail จะไม่ถูกบันทึกว่า applied และฐานข้อมูลไม่ถูกทิ้งไว้ในสถานะครึ่งๆ กลางๆ) |
| 16 | รีเซ็ตฐานข้อมูลให้อยู่ในสถานะสะอาด (`--reset`) เพื่อส่งมอบ | ครบ 3 migration ตามลำดับ, ไม่มีข้อมูลทดสอบตกค้าง | PASSED |

**สรุปผล: 16/16 การทดสอบผ่าน (PASSED)** — ไม่มีการทดสอบใดถูกข้าม หรืออ้างผลโดยไม่ได้รันจริง

## 4. Rollback Plan (บันทึกและทดสอบแล้วตามที่ verification ต้องการ)

- **Dev environment**: ใช้ `node prisma/dev-migrate-verify.mjs --reset` (ปัจจุบัน) หรือ
  `npx prisma migrate reset` (เมื่อ CLI ใช้งานได้) — destructive, drop ทั้ง schema แล้ว
  replay migration ทั้งหมดจากศูนย์ เหมาะเฉพาะ dev/test ที่ใช้ mock data เท่านั้น
  (ตาม data-policy.md ข้อ 1)
- **Staging/Production**: Prisma Migrate ไม่มี "down migration" อัตโนมัติ (เป็นข้อจำกัด
  ที่ตั้งใจของตัวเครื่องมือเอง ไม่ใช่ข้อจำกัดของสภาพแวดล้อมนี้) แนวทางที่ถูกต้องและได้
  ทดสอบจริงแล้วคือ **เขียน migration ใหม่ที่ forward แต่ทำหน้าที่ย้อนกลับ** (compensating
  migration) — ตัวอย่างจริงคือ `20260914100407_rollback_add_user_phone` ที่ย้อนกลับ
  `20260914100307_add_user_phone` และได้ทดสอบแล้วว่าทำงานถูกต้อง (ดูตาราง #9 ด้านบน)
  วิธีนี้ปลอดภัยกว่าการ "ลบ" migration ประวัติเดิม เพราะรักษาประวัติการเปลี่ยนแปลงไว้ครบ
  ตาม dev-rules.md ข้อ 6 (ไม่ overwrite ประวัติ)
- **Failure ระหว่าง apply migration**: แต่ละ migration ถูกรันอยู่ใน PostgreSQL
  transaction เดียว (`BEGIN`/`COMMIT`/`ROLLBACK` ใน `dev-migrate-verify.mjs`) — หาก SQL
  ใดๆ ใน migration.sql ล้มเหลว ทั้ง transaction จะ rollback อัตโนมัติ ฐานข้อมูลจะไม่ถูก
  ทิ้งไว้ในสถานะครึ่งๆ กลางๆ และ migration นั้นจะไม่ถูกบันทึกว่า applied (ทดสอบจริงแล้ว
  ในตาราง #15) — เมื่อใช้ Prisma CLI จริง กลไกนี้เทียบเท่ากับที่ schema-engine ทำเองอยู่แล้ว

## 5. P2 Database & Sangha Domain — ผลการทดสอบจริง (รันเมื่อ 2026-09-23)

Migration ใหม่: `20260923135937_sangha_org_domain` (organizations, organization_hierarchy_rules,
organization_status_history, addresses, contacts, positions, persons, appointments)
ทดสอบด้วยวิธีเดียวกับ §3 (raw SQL ผ่าน `dev-migrate-verify.mjs` + psql) เพราะ Prisma
CLI ยังใช้งานไม่ได้ในสภาพแวดล้อมนี้เหมือนเดิม (ดู §1) — รายละเอียด schema เต็มอยู่ใน
`prisma/data-dictionary.md`

| # | คำสั่ง/การทดสอบที่รันจริง | ผลลัพธ์จริง | สถานะ |
|---|---|---|---|
| 1 | `node prisma/dev-migrate-verify.mjs` (apply migration ใหม่) | `[PASSED] applied 20260923135937_sangha_org_domain` | PASSED |
| 2 | `psql \d organizations` / `\d organization_hierarchy_rules` / `\d organization_status_history` / `\d addresses` / `\d contacts` / `\d positions` / `\d persons` / `\d appointments` | ทุกตาราง คอลัมน์ type/nullable/default ตรงกับ schema.prisma; ทุก PK/FK/unique/partial-unique/index ที่ออกแบบไว้มีอยู่จริง | PASSED |
| 3 | ตรวจ seed `organization_hierarchy_rules` (`SELECT "childType","parentType" ...`) | มีครบ 10 แถวตามที่ seed ไว้ | PASSED |
| 4 | สร้างสายหน่วยงานจริงครบ 7 ชั้น (MAHATHERASAMAKHOM → SANGHA_ZONE → SANGHA_REGION → SANGHA_PROVINCE → SANGHA_DISTRICT → SANGHA_SUBDISTRICT → TEMPLE) ด้วย mock data | `INSERT 0 1` ทั้ง 7 คำสั่ง — trigger `organizations_validate_hierarchy_trigger` ยอมให้ผ่านเพราะทุกคู่ (child,parent) มี rule รองรับ | PASSED |
| 5 | พยายามสร้าง TEMPLE ที่มี parent เป็น SANGHA_PROVINCE โดยตรง (ข้ามชั้นอำเภอ/ตำบล) | `ERROR: organization type TEMPLE cannot have a parent of type SANGHA_PROVINCE — no matching rule in organization_hierarchy_rules` | PASSED (ปฏิเสธถูกต้อง) |
| 6 | พยายามสร้าง TEMPLE ที่ไม่มี parent เลย | `ERROR: organization type TEMPLE cannot be top-level (no parent) — no matching root rule` | PASSED (ปฏิเสธถูกต้อง) |
| 7 | พยายามตั้งหน่วยงานเป็น parent ของตัวเอง (`UPDATE ... SET "parentId" = ตัวเอง`) | `ERROR: organization cannot be its own parent` | PASSED (ปฏิเสธถูกต้อง) |
| 8 | Insert `organization_status_history` แถวแรก แล้วพยายาม UPDATE/DELETE | Insert สำเร็จ; UPDATE → `ERROR: organization_status_history is append-only: UPDATE is not permitted`; DELETE → `ERROR: ... DELETE is not permitted` | PASSED |
| 9 | Insert แถวประวัติสถานะแถวที่สอง (เปลี่ยนเป็น SUSPENDED) แบบ append ปกติ แล้วตรวจว่าทั้งสองแถวยังอยู่ครบ | ทั้งสองแถวอยู่ครบ ไม่มีแถวใดถูกแก้ไข | PASSED |
| 10 | Insert ที่อยู่ MAIN แถวแรก (`isCurrent=true`) แล้วพยายาม insert ที่อยู่ MAIN แถวที่สองขณะแถวแรกยัง current | แถวแรกสำเร็จ; แถวที่สอง → `ERROR: duplicate key value violates unique constraint "addresses_org_type_current_key"` | PASSED (ปฏิเสธถูกต้อง) |
| 11 | ปิดที่อยู่เก่า (`isCurrent=false`) แล้ว insert ที่อยู่ใหม่ (`isCurrent=true`) | ทั้งสองคำสั่งสำเร็จ — แสดงว่า partial unique index อนุญาตเมื่อทำตามลำดับที่ถูกต้อง | PASSED |
| 12 | Insert contact (เบอร์โทรมือกทดสอบ) | `INSERT 0 1` | PASSED |
| 13 | Insert position + person + appointment (เจ้าอาวาส/บุคคลมือกทดสอบ) แล้วพยายาม insert appointment ซ้ำเป๊ะ (org+position+person+startDate เดียวกัน) | Insert ชุดแรกสำเร็จ; ชุดซ้ำ → `ERROR: duplicate key value violates unique constraint "appointments_..._key"` | PASSED (ปฏิเสธถูกต้อง) |
| 14 | พยายามสร้าง appointment ที่ personId ไม่มีอยู่จริง | `ERROR: insert or update on table "appointments" violates foreign key constraint "appointments_personId_fkey"` | PASSED (ปฏิเสธถูกต้อง) |
| 15 | พยายามสร้าง organization ที่ `code` ซ้ำกับที่มีอยู่แล้ว | `ERROR: duplicate key value violates unique constraint "organizations_code_key"` | PASSED (ปฏิเสธถูกต้อง) |
| 16 | ปิดวาระ appointment ปกติ (`UPDATE ... SET "endDate"=now(), status='RESIGNED'`) | `UPDATE 1` — แถวเดิมถูกปิดวาระ ไม่ใช่ insert แถวใหม่ (ตามที่ออกแบบไว้ว่า appointment ปิดวาระด้วยการ update ในแถวเดิม) | PASSED |
| 17 | พยายาม insert กฎ root ซ้ำใน `organization_hierarchy_rules` (`childType='MAHATHERASAMAKHOM', parentType=NULL` อีกแถว) | `ERROR: duplicate key value violates unique constraint "organization_hierarchy_rules_root_key"` | PASSED (ปฏิเสธถูกต้อง) |
| 18 | `node prisma/dev-migrate-verify.mjs --status` หลัง apply | `Applied: [4 migrations] / Pending: []` | PASSED |
| 19 | `node prisma/dev-migrate-verify.mjs --reset` (full replay ทั้ง 4 migration จากศูนย์ รวม migration ใหม่) | ทั้ง 4 migration apply สำเร็จตามลำดับ, seed `organization_hierarchy_rules` มีครบ 10 แถวหลัง replay, trigger ยังทำงานถูกต้อง (ทดสอบซ้ำด้วยการสร้าง TEMPLE ผิดกฎหลัง reset → ถูกปฏิเสธเหมือนเดิม) | PASSED |
| 20 | เพิ่ม FK `organization_status_history.recordedByActorId → users.id` (พบระหว่างทบทวนว่าควรมี FK จริงแทนการปล่อยเป็น string เปล่า) แล้วรัน `--reset` ซ้ำเพื่อยืนยันว่ายังทำงานถูกต้อง | `Reset + full replay: PASSED`; `\d organization_status_history` ยืนยัน FK ใหม่ถูกสร้างจริง | PASSED |

**สรุปผล P2: 20/20 การทดสอบผ่าน (PASSED)** ฐานข้อมูลถูก reset ให้อยู่ในสถานะสะอาด
(เฉพาะ schema + seed reference data ไม่มี mock data ทดสอบตกค้าง) ก่อนส่งมอบ

## 6. P2 Education Domain (M2) — ผลการทดสอบจริง (รันเมื่อ 2026-09-23)

Migration ใหม่: `20260923141654_education_domain` (academic_years, programs,
education_levels, subjects, curricula, curriculum_level_subjects, exam_centers,
exam_sessions, exam_session_centers, exam_schedules) — รายละเอียด schema เต็มอยู่ใน
`prisma/education-schema.md`

| # | คำสั่ง/การทดสอบที่รันจริง | ผลลัพธ์จริง | สถานะ |
|---|---|---|---|
| 1 | `node prisma/dev-migrate-verify.mjs` (apply migration ใหม่ พร้อม seed มือกทดสอบ) | `[PASSED] applied 20260923141654_education_domain` | PASSED |
| 2 | `psql \d` ทุกตารางใหม่ทั้ง 10 ตาราง | คอลัมน์/type/nullable/default ตรงกับ schema.prisma ทุกตาราง; PK/FK/unique/index ครบตามที่ออกแบบ; trigger `curricula_no_update`/`curricula_no_delete` มีอยู่จริง | PASSED |
| 3 | ตรวจ seed (academic_years, programs, education_levels) | 2 ปีการศึกษา, 3 program (นักธรรม/ธรรมศึกษา/บาลี), 5 ระดับชั้น (จำนวนระดับชั้นต่างกันระหว่าง program — นักธรรม 3, บาลี 2 ในชุด mock) | PASSED |
| 4 | พยายาม UPDATE/DELETE บน `curricula` | `ERROR: curricula is append-only: UPDATE/DELETE is not permitted` ทั้งคู่ | PASSED (ปฏิเสธถูกต้อง) |
| 5 | **เพิ่มปีการศึกษาใหม่ (2569) ที่ไม่เคยมีมาก่อน แล้วสร้างรอบสอบปีนั้นโดยใช้ curriculum เดิม** — พิสูจน์ข้อกำหนด "รองรับหลายปีและไม่ hard-code ชั้น/ปี" | สร้างรอบสอบสำเร็จทั้ง 3 ปี (2567, 2568, 2569) อ้างอิง curriculum เดียวกัน โดยไม่ต้องแก้ schema หรือโค้ดใดๆ | PASSED |
| 6 | เพิ่ม curriculum เวอร์ชันที่ 2 (effectiveFromYear=2569) แล้ว query "หลักสูตรปัจจุบัน ณ ปี Y" ด้วย SQL pattern ที่ระบุใน `prisma/education-schema.md` ที่ Y=2568 และ Y=2569 | Y=2568 → ได้เวอร์ชัน NT-V1 (ถูกต้อง); Y=2569 → ได้เวอร์ชัน NT-V2 (ถูกต้อง) — ยืนยันว่า pattern ไม่ hard-code เวอร์ชันทำงานถูกต้องจริง | PASSED |
| 7 | พยายามสร้าง curriculum ซ้ำ (program+effectiveFromYear เดียวกัน) | `ERROR: duplicate key value violates unique constraint "curricula_programId_effectiveFromYearId_key"` | PASSED (ปฏิเสธถูกต้อง) |
| 8 | พยายามสร้างรอบสอบซ้ำ (program+year+round เดียวกัน) | `ERROR: duplicate key value violates unique constraint "exam_sessions_..._key"` | PASSED (ปฏิเสธถูกต้อง) |
| 9 | สร้าง exam_center, exam_session_center, exam_schedule (1 วิชา) | ทุกคำสั่งสำเร็จ | PASSED |
| 10 | พยายามกำหนดตารางสอบวิชาเดียวกันซ้ำในรอบสอบเดียวกัน | `ERROR: duplicate key value violates unique constraint "exam_schedules_..._key"` | PASSED (ปฏิเสธถูกต้อง) |
| 11 | ทดสอบ FK ข้าม migration: `exam_centers.organizationId → organizations.id` (ตารางจาก P2 org-domain migration ก่อนหน้า) — อ้างอิง org ที่ไม่มีอยู่จริงก่อน แล้วอ้างอิง org จริงที่สร้างขึ้น | อ้างอิง org ปลอม → `ERROR: foreign key constraint ... is not present`; อ้างอิง org จริง (สร้างผ่าน hierarchy trigger ของ P2 ที่ยังทำงานเป็นอิสระ) → สำเร็จ | PASSED |
| 12 | `node prisma/dev-migrate-verify.mjs --reset` (full replay ทั้ง 5 migration จากศูนย์ รวม migration ใหม่) | ทั้ง 5 migration apply สำเร็จตามลำดับ; seed ของทั้ง education-domain และ org-domain ครบหลัง replay; ทดสอบ `curricula` trigger ซ้ำหลัง reset → ยังปฏิเสธ UPDATE ถูกต้อง | PASSED |

**สรุปผล M2 Education Domain: 12/12 การทดสอบผ่าน (PASSED)** ฐานข้อมูลถูก reset ให้
อยู่ในสถานะสะอาด (เฉพาะ schema + seed reference data) ก่อนส่งมอบ

## 7. P2 Exam & Document Domain (M3) — ผลการทดสอบจริง (รันเมื่อ 2026-09-23)

Migration ใหม่: `20260923143443_exam_document_domain` (categories, tags, questions,
question_categories, question_tags, question_versions, question_choices,
answer_keys, documents, document_categories, document_tags, document_versions,
exam_sets, exam_set_items) — รายละเอียด schema เต็มอยู่ใน
`prisma/exam-document-schema.md` — ทดสอบด้วย harness เฉพาะทาง
`prisma/test-exam-document-domain.mjs` (นอกเหนือจาก `dev-migrate-verify.mjs`
ที่ใช้ตรวจ apply/reset ตามปกติ) เพราะงานนี้มี business logic เฉพาะ (conditional
immutability trigger) ที่ต้องทดสอบหลายสถานการณ์กว่าการ apply migration เฉยๆ

| # | คำสั่ง/การทดสอบที่รันจริง | ผลลัพธ์จริง | สถานะ |
|---|---|---|---|
| 1 | `node prisma/dev-migrate-verify.mjs` (apply migration ใหม่ พร้อม seed มือกทดสอบ) | `[PASSED] applied 20260923143443_exam_document_domain` | PASSED |
| 2 | `node prisma/dev-migrate-verify.mjs --reset` (full replay ทั้ง 6 migration จากศูนย์) | ทั้ง 6 migration apply สำเร็จตามลำดับ | PASSED |
| 3 | `node prisma/test-exam-document-domain.mjs` — ค้น exam_sets ตามหลักสูตร+ชั้น+วิชา (join curriculum_level_subjects) | คืน 2 แถวที่ seed ไว้ถูกต้อง | PASSED |
| 4 | ค้น exam_sets ตามปีการศึกษา (join exam_sessions → academic_years, yearBE=2568) | คืนเฉพาะชุดที่ผูกปี 2568 (1 แถว) ถูกต้อง | PASSED |
| 5 | ค้นรวมทั้งสี่เงื่อนไข (หลักสูตร+ชั้น+วิชา+ปี) ในคำสั่งเดียว | คืนทั้งชุดฝึกซ้อม (ปี=null) และชุดทางการ (ปี=2568) ถูกต้อง | PASSED |
| 6 | ตรวจ index มีอยู่จริงและ valid (`pg_index.indisvalid`) สำหรับ `exam_sets_curriculumLevelSubjectId_idx`, `exam_sets_examSessionId_idx`, `exam_sets_status_idx`, `questions_subjectId_levelId_idx` | ทั้ง 4 index มีอยู่และ valid | PASSED |
| 7 | `EXPLAIN` บนคำค้น `exam_sets WHERE curriculumLevelSubjectId = ...` | Postgres เลือก **Bitmap Index Scan** บน `exam_sets_curriculumLevelSubjectId_idx` จริง (ไม่ใช่ Seq Scan) | PASSED |
| 8 | แก้ไข content ของ `question_versions` ที่ status=DRAFT | แก้ไขสำเร็จ | PASSED |
| 9 | พยายาม UPDATE content ของ `question_versions` ที่ status=APPROVED | `ERROR: question_versions: row ... is locked (status=APPROVED) — UPDATE is not permitted once past DRAFT` | PASSED (ปฏิเสธถูกต้อง) |
| 10 | พยายาม DELETE `question_versions` ที่ status=APPROVED | `ERROR: ... is locked ... DELETE is not permitted ...` | PASSED (ปฏิเสธถูกต้อง) |
| 11 | พยายาม UPDATE `question_choices` ที่ parent question_version status=APPROVED | `ERROR: question_choices: parent question_version ... is locked (status=APPROVED) ...` | PASSED (ปฏิเสธถูกต้อง — ยืนยันว่า lock ผ่าน JOIN ไปยังแถวแม่ทำงานจริง) |
| 12 | พยายาม UPDATE `answer_keys` ที่ parent question_version status=APPROVED | `ERROR: answer_keys: parent question_version ... is locked ...` | PASSED (ปฏิเสธถูกต้อง) |
| 13 | แก้ไข name ของ `exam_sets` ที่ status=DRAFT | แก้ไขสำเร็จ | PASSED |
| 14 | พยายาม UPDATE `exam_sets` ที่ status=APPROVED | `ERROR: exam_sets: row ... is locked (status=APPROVED) ...` | PASSED (ปฏิเสธถูกต้อง) |
| 15 | พยายาม UPDATE `exam_set_items` ที่ parent exam_set status=APPROVED | `ERROR: exam_set_items: parent exam_set ... is locked ...` | PASSED (ปฏิเสธถูกต้อง) |
| 16 | เปลี่ยน `document_versions.status` จาก DRAFT → APPROVED (การ submit จริง) แล้วพยายามแก้ไข fileName ทันที | transition สำเร็จ (เพราะ OLD.status ตอน UPDATE ยังเป็น DRAFT); การแก้ไขครั้งถัดไปถูกปฏิเสธทันที `ERROR: document_versions: row ... is locked (status=APPROVED) ...` | PASSED (พิสูจน์ semantics "ล็อกทันทีที่พ้น DRAFT" ถูกต้องตรงตามที่ออกแบบ) |
| 17 | INSERT `question_versions` เวอร์ชันใหม่ (versionNo=2) ให้ question ที่ v1 ถูกล็อกแล้ว | สำเร็จ — นับจำนวนเวอร์ชันของ question นั้นได้ 2 แถว | PASSED (พิสูจน์ "แก้ไขต่อ = สร้างเวอร์ชันใหม่") |
| 18 | พยายามสร้าง `question_versions` ซ้ำ (questionId+versionNo เดียวกัน) | `ERROR: duplicate key value violates unique constraint "question_versions_questionId_versionNo_key"` | PASSED (ปฏิเสธถูกต้อง) |
| 19 | พยายามสร้าง `document_versions` ซ้ำ (documentId+versionNo เดียวกัน) | `ERROR: duplicate key value violates unique constraint "document_versions_documentId_versionNo_key"` | PASSED (ปฏิเสธถูกต้อง) |
| 20 | พยายามสร้าง `exam_sets` ที่อ้าง curriculumLevelSubjectId ปลอม | `ERROR: insert or update on table "exam_sets" violates foreign key constraint ...` | PASSED (ปฏิเสธถูกต้อง) |
| 21 | พยายามสร้าง `exam_set_items` ซ้ำ (examSetId+sortOrder เดียวกัน) | `ERROR: duplicate key value violates unique constraint "exam_set_items_examSetId_sortOrder_key"` | PASSED (ปฏิเสธถูกต้อง) |
| 22 | INSERT `categories` สอง row ที่ code=NULL ทั้งคู่ | สำเร็จทั้งคู่ (partial unique index อนุญาตหลาย NULL) | PASSED |
| 23 | พยายามสร้าง `categories` ที่ code ซ้ำกับ row ที่มีอยู่ (ไม่ใช่ NULL) | `ERROR: duplicate key value violates unique constraint "categories_code_key"` | PASSED (ปฏิเสธถูกต้อง) |

**สรุปผล M3 Exam & Document Domain: 23/23 การทดสอบผ่าน (PASSED)** รัน
`node prisma/dev-migrate-verify.mjs --reset` อีกครั้งหลังทดสอบเพื่อคืนฐานข้อมูลให้อยู่ใน
สถานะสะอาด (เฉพาะ schema + seed reference data ไม่มีแถวทดสอบเฉพาะกิจตกค้าง) ก่อนส่งมอบ

## 8. Seed Data แบบสมมติ (`prisma/seed.ts`) — ผลการทดสอบจริง (รันเมื่อ 2026-09-23)

`prisma/seed.ts` เขียนด้วย raw `pg` (เหตุผลเดียวกับ §1 — Prisma Client generate ไม่ได้)
รันผ่าน `npm run db:seed` (= `tsx prisma/seed.ts`) — เพิ่มข้อมูลจำลองที่ยังไม่มีมาก่อนใน
ทุก migration ก่อนหน้านี้: `users` (บัญชีจำลองครบทุก UserRole), `organizations` +
`organization_status_history` + `addresses` + `contacts` (สายการปกครองคณะสงฆ์จำลองครบ
7 ชั้น + สำนักเรียน + สำนักงานแม่กองธรรม), `positions`, `persons`, `appointments`
(รวมกรณีประวัติเจ้าอาวาสที่ลาออกแล้วมีผู้สืบตำแหน่งใหม่ — ไม่เขียนทับแถวเดิม) และต่อยอด
โดเมนการศึกษา/คลังข้อสอบด้วยหลักสูตรธรรมศึกษาชุดแรก, วิชา/ระดับชั้นใหม่, สนามสอบ,
รอบสอบ, ข้อสอบ/เอกสาร/ชุดข้อสอบเพิ่มเติม — รายละเอียดทั้งหมดอยู่ในความเห็นประกอบโค้ดใน
`prisma/seed.ts` เอง (ไฟล์เดียวที่ต้องส่งมอบตามที่ระบุ จึงไม่แยกเอกสารต่างหาก)

ทุกแถวใช้ id คงที่ที่กำหนดเอง (ขึ้นต้นด้วย `seed_`) และ upsert ด้วย
`ON CONFLICT (id) DO UPDATE` (ตารางที่แก้ไขได้ปกติ) หรือ `ON CONFLICT (id) DO NOTHING`
(ตารางที่ DB trigger บังคับ immutable/conditional-immutable) ทั้งหมดอยู่ใน transaction
เดียว (BEGIN...COMMIT พร้อม ROLLBACK อัตโนมัติเมื่อล้มเหลว)

| # | คำสั่ง/การทดสอบที่รันจริง | ผลลัพธ์จริง | สถานะ |
|---|---|---|---|
| 1 | `node prisma/dev-migrate-verify.mjs --reset` แล้ว `npx tsx prisma/seed.ts` (รันครั้งแรกบนฐานข้อมูลที่เพิ่ง reset ว่างเปล่า) | commit สำเร็จ พร้อมสรุปจำนวนแถวที่สร้าง (users:8, organizations:10, positions:8, persons:10, appointments:10, ฯลฯ) | PASSED |
| 2 | รัน `npx tsx prisma/seed.ts` ซ้ำทันที (ครั้งที่ 2 ติดกัน) แล้วเทียบจำนวนแถวทุกตาราง (30 ตาราง) ก่อน/หลัง | จำนวนแถวเท่าเดิมทุกตารางไม่มีผิดเพี้ยนแม้แต่ตารางเดียว (diff ว่างเปล่า) | PASSED (ไม่มี duplicate — ตรงตามวิธีตรวจสอบของงานนี้) |
| 3 | รัน `npx tsx prisma/seed.ts` ซ้ำเป็นครั้งที่ 3 แล้วเทียบกับผลครั้งที่ 2 อีกครั้ง | จำนวนแถวเท่าเดิมทุกตารางอีกครั้ง | PASSED |
| 4 | ตรวจแถวที่ถูกล็อกด้วย conditional-immutability trigger (`seed_qv_vinaya_001_v1` status=APPROVED, `seed_examset_ds_tri_essay_official_2568` status=APPROVED) หลัง reseed 2 ครั้ง | เนื้อหา/สถานะไม่เปลี่ยนแปลง (สคริปต์ไม่พยายาม UPDATE แถวเหล่านี้เลยเพราะใช้ `DO NOTHING` — ไม่ชน trigger) | PASSED |
| 5 | ตรวจ `organizations."updatedAt"` ของ `seed_org_temple_1` หลัง reseed ล่าสุด | ค่าถูก refresh จริง (อายุ < 60 วินาทีหลัง reseed) — ยืนยันว่า branch `ON CONFLICT DO UPDATE` ทำงานจริง ไม่ใช่ no-op โดยบังเอิญ | PASSED |
| 6 | ตรวจ `seed_qv_vinaya_002_v1` (ตั้งใจปล่อยเป็น DRAFT ถาวรในชุด seed) หลัง reseed หลายครั้ง | ยังคงเป็น DRAFT เสมอ (ไม่ auto-transition) | PASSED |
| 7 | ตรวจจำนวน `appointments` ที่ id ขึ้นต้นด้วย `seed_appt_` | ได้ 10 แถวพอดี ไม่มีแถวซ้ำ (รวมกรณีประวัติเจ้าอาวาสเดิมที่ลาออก + เจ้าอาวาสคนปัจจุบันเป็นคนละแถวกัน) | PASSED |
| 8 | ตรวจ FK/hierarchy trigger ของ `seed_org_temple_1` (parent ต้องเป็น SANGHA_SUBDISTRICT) หลัง reseed | ยังคงถูกต้องตาม `organization_hierarchy_rules` | PASSED |
| 9 | ตรวจว่า `seed_cls_ds_tri_essay` (หลักสูตรธรรมศึกษาใหม่) ใช้ subject **เดิม** (`subj_essay` จาก education-domain migration) จริงตามที่ตั้งใจออกแบบ (วิชา reuse ข้ามหลักสูตร/สายการศึกษา) | อ้างอิง `subj_essay` (code=ESSAY_DHAMMA) ถูกต้อง | PASSED |
| 10 | `node prisma/test-exam-document-domain.mjs` (test suite ของงานก่อนหน้า) หลังมี seed data ใหม่อยู่ร่วมกัน | พบ 1 เคสที่ต้องแก้: การค้นหาตามปี 2568 เดิมสมมติว่าเป็นแถวเดียวในทั้งตาราง (`rows.length === 1`) ซึ่งไม่จริงอีกต่อไปเมื่อ seed.ts เพิ่ม exam_set อื่นในปีเดียวกัน (โปรแกรมธรรมศึกษา) — **แก้โดยเปลี่ยนเงื่อนไขเป็น "ผลลัพธ์ต้องมีแถวที่คาดไว้รวมอยู่ด้วย" แทน "ต้องมีแถวเดียว"** (ไม่ใช่การลดความเข้มงวดของการทดสอบ แต่แก้ข้อสมมติฐาน test-isolation ที่ผิดไปแล้วจริง) — รันซ้ำหลังแก้ | 23/23 PASSED |
| 11 | `npm run lint` และ `npm run build` หลังเพิ่ม `prisma/seed.ts` (ไฟล์ `.ts` ถูก TypeScript ตรวจสอบจริงตอน build เพราะ tsconfig.json รวม `**/*.ts`) | ทั้งสองคำสั่งผ่าน (exit code 0) ไม่มี type error ใน seed.ts | PASSED |

**สรุปผล Seed Data: 11/11 การทดสอบผ่าน (PASSED)** ฐานข้อมูลสุดท้ายถูกปล่อยไว้ในสถานะ
**migrate + seed ครบ** (ต่างจากงานก่อนหน้าที่ปล่อยไว้แบบ schema-only) เพราะจุดประสงค์ของ
งานนี้คือให้มีข้อมูลจำลองพร้อมใช้งานจริงสำหรับพัฒนา/ทดสอบต่อ — ลำดับคำสั่งสุดท้ายที่รัน:
`dev-migrate-verify.mjs --reset` → `npx tsx prisma/seed.ts` → `npx tsx prisma/seed.ts`
(ยืนยัน idempotent อีกครั้งบนฐานข้อมูลที่เพิ่งสร้างสด)

## 9. P3 Authentication & RBAC — Auth.js (Credentials) + Session — ผลการทดสอบจริง (รันเมื่อ 2026-09-23)

Migration `20260923150512_auth_credentials_and_login_security` เพิ่ม `users.passwordHash`
(nullable), ตาราง `login_lockouts` (rate-limit counter+expiry ตาม architecture.md §3.4/
ADR-0004) และตาราง append-only `login_audit_logs` (+ enum `login_failure_reason`) —
รายละเอียด function spec, การตัดสินใจเชิงวิศวกรรม (session timeout, lockout threshold/
duration, ขอบเขตที่ตัดออก) และผลการทดสอบฉบับเต็มอยู่ใน **`prisma/AUTH.md`** (ไฟล์เดียวที่
ต้องส่งมอบของงานนี้ตาม "ผลลัพธ์ที่ต้องส่ง: auth config, login/logout" จึงไม่แยกซ้ำที่นี่)
สรุปสั้น:

| # | คำสั่ง/การทดสอบที่รันจริง | ผลลัพธ์ |
|---|---|---|
| 1 | `node prisma/dev-migrate-verify.mjs --reset` (replay ทั้ง 7 migrations จากศูนย์) | PASSED ทุก migration รวมของ auth |
| 2 | `npm run db:seed` x2 ติดกัน (8 users ทุกคนมี passwordHash) | idempotent เหมือนเดิม (8 users คงที่) |
| 3 | `node prisma/test-exam-document-domain.mjs` (regression หลังมี `passwordHash` เพิ่มใน `users`) | 23/23 PASSED |
| 4 | `npx tsc --noEmit`, `npm run lint`, `npm run build` | ผ่านทั้งหมด (0 error) — build แสดง route `/login`, `/dashboard`, `/api/auth/[...nextauth]` และ `ƒ Proxy (Middleware)` |
| 5 | `node prisma/test-auth-login.mjs` กับ `next dev` จริงบน `:3000` (login สำเร็จ/ผิดรหัส/unknown email/lockout 5 ครั้ง/ปลดล็อกหลังหมดเวลา/บัญชี PENDING_APPROVAL/logout/unauthenticated redirect/secure re-check เมื่อบัญชีถูก SUSPENDED กลาง session) | **24/24 PASSED** |
| 6 | `node prisma/test-auth-session-expiry.mjs` กับ `next dev` ที่ตั้ง `AUTH_SESSION_MAX_AGE_SECONDS=3` (ทดสอบ session หมดอายุจริงตามเวลา ไม่ใช่ mock) | **2/2 PASSED** |

**สรุปผล P3 Auth: 6/6 รายการในตารางข้างต้นผ่าน (PASSED)** — นับตามรูปแบบเดียวกับตาราง
ในหัวข้อ §8 (แต่ละแถวนับเป็น 1 รายการไม่ว่าจะมีจำนวน assertion ย่อยเท่าใด — แถวที่ 5 และ 6
ครอบคลุม 24 และ 2 assertion จริงตามลำดับ รวมเป็น 26 assertion ใหม่จากสอง test script ที่
เพิ่มในงานนี้ นอกเหนือจาก 23 assertion เดิมของ regression suite ที่ยังผ่านไม่มีเปลี่ยนแปลง)
ฐานข้อมูลสุดท้ายถูกปล่อยไว้ในสถานะ migrate + seed ครบ (เหมือนงานก่อนหน้า) — สังเกต
พฤติกรรมจริงที่น่าสนใจของ Auth.js v5:
session แบบ JWT เป็น "sliding/rolling" จริง (rotate cookie + เลื่อน `Expires` ทุกครั้งที่เรียก
`/api/auth/session`) ไม่ใช่ hard absolute timeout จาก login — รายละเอียดเต็มอยู่ใน
`prisma/AUTH.md` §5

## 10. P3 RBAC + Scope-based Permission — ผลการทดสอบจริง (รันเมื่อ 2026-09-23)

Migration `20260923215000_rbac_scope_permissions` เพิ่มตาราง append-only
`user_organization_scopes`/`user_program_scopes` (ขอบเขตตามลำดับชั้นการปกครอง/
สายการศึกษา ตรวจด้วย recursive CTE เดินขึ้นผ่าน `Organization.parentId`) และ
`users.personId` (เชื่อม User↔Person สำหรับ scope "เฉพาะของตน") — นี่คือ
permission matrix ฉบับเต็มที่ `requirements.md` §6 สัญญาไว้ว่าจะทำใน P2/P3
รายละเอียดครบทุกหัวข้อ (role mapping, scope model, function spec, ขอบเขตที่ตัดออก)
อยู่ใน **`prisma/roles-permissions.md`** (ผลลัพธ์ที่ต้องส่งของงานนี้) สรุปสั้น:

| # | คำสั่ง/การทดสอบที่รันจริง | ผลลัพธ์ |
|---|---|---|
| 1 | `node prisma/dev-migrate-verify.mjs --reset` (replay ทั้ง 8 migrations จากศูนย์ รวมของ RBAC) | PASSED ทุก migration |
| 2 | `npm run db:seed` x2 ติดกัน (รวม `seedRbacScopes()` ใหม่: personId link + 2 organization scope + 2 program scope) | idempotent — จำนวนเท่าเดิมทั้งสองครั้ง |
| 3 | `node prisma/test-exam-document-domain.mjs` (regression หลังเพิ่มคอลัมน์/ตารางใหม่ใน `users`/schema) | 23/23 PASSED |
| 4 | `node prisma/test-auth-login.mjs` (regression หลังเพิ่ม `CurrentUser.personId`) | 24/24 PASSED |
| 5 | `node prisma/test-auth-session-expiry.mjs` กับ `AUTH_SESSION_MAX_AGE_SECONDS=3` (regression) | 2/2 PASSED |
| 6 | `node prisma/test-rbac-scope.mjs` (ใหม่ — HTTP end-to-end deny-by-default/org-scope-cascade ผ่าน `GET /api/organizations/[id]` จริงบน `next dev` + append-only/uniqueness contract ระดับ SQL จริง) | **28/28 PASSED** |
| 7 | `npx next build`, `npm run lint`, `npx tsc --noEmit` | ผ่านทั้งหมด (0 error) — build แสดง route `/api/organizations/[id]` ใหม่ |

**สรุปผล P3 RBAC: 7/7 รายการในตารางข้างต้นผ่าน (PASSED)** — รายการที่ 6 ครอบคลุม
28 assertion จริงที่เป็นของใหม่จากงานนี้ทั้งหมด นอกเหนือจาก 23+24+2 = 49 assertion
เดิมของ regression suite ที่ยังผ่านไม่มีเปลี่ยนแปลง (รวมสะสมทั้งโปรเจกต์:
88 (เดิม) + 28 = **116/116 PASSED**)

## 11. P3 Authorization Guard ฝั่ง Server (IDOR/Privilege-escalation) — ผลการทดสอบจริง (รันเมื่อ 2026-09-23)

ไม่มี migration ใหม่ในงานนี้ (ใช้ schema เดิมจาก §10 ทั้งหมด) — งานนี้เพิ่ม guard utility กลาง
`src/lib/guard.ts` (`guardRoute()`/`authorizeOwnedRow()`/`notFoundOrForbidden()`) แล้วพิสูจน์
ด้วย endpoint จริง 4 ตัวใหม่ (`GET /api/persons/[id]`, `GET /api/question-versions/[id]`,
`POST`/`DELETE /api/admin/organization-scopes[/id]`) บวก refactor `GET /api/organizations/[id]`
เดิมให้ใช้ guard กลางนี้ — รายละเอียดครบทุกหัวข้อ (guard design, function spec, IDOR/privilege-
escalation checklist, ขอบเขตที่ตัดออก) อยู่ใน **`prisma/authz-guards.md`** (ผลลัพธ์ที่ต้องส่งของ
งานนี้: "authz utilities, middleware/policies") สรุปสั้น:

| # | คำสั่ง/การทดสอบที่รันจริง | ผลลัพธ์ |
|---|---|---|
| 1 | `node prisma/dev-migrate-verify.mjs --reset` (replay ทั้ง 8 migrations เดิม — ไม่มี migration ใหม่) | PASSED |
| 2 | `npm run db:seed` x2 ติดกัน (เพิ่ม 2 question_versions ใหม่สำหรับทดสอบ RESPONSIBLE_RECORD สองแขนง) | idempotent — จำนวนเท่าเดิมทั้งสองครั้ง |
| 3 | `node prisma/test-exam-document-domain.mjs` (regression) | 23/23 PASSED |
| 4 | `node prisma/test-auth-login.mjs` (regression) | 24/24 PASSED |
| 5 | `node prisma/test-rbac-scope.mjs` (regression — ยืนยัน refactor `/api/organizations/[id]` ไปใช้ `guardRoute()` ไม่เปลี่ยนพฤติกรรม HTTP) | 28/28 PASSED |
| 6 | `node prisma/test-authz-guard.mjs` (ใหม่ — IDOR ผ่าน `/api/persons/[id]`/`/api/question-versions/[id]` จริง + privilege escalation ผ่าน `/api/admin/organization-scopes*` จริง พร้อมตรวจนับแถวในฐานข้อมูลว่าไม่มีการเขียนเกิดขึ้นเมื่อถูกปฏิเสธ) | **23/23 PASSED** |
| 7 | `node prisma/test-auth-session-expiry.mjs` กับ `AUTH_SESSION_MAX_AGE_SECONDS=3` (regression) | 2/2 PASSED |
| 8 | `npx next build`, `npm run lint`, `npx tsc --noEmit` | ผ่านทั้งหมด (0 error) — build แสดง route ใหม่ 4 ตัว |

**สรุปผล P3 Authorization Guard: 8/8 รายการในตารางข้างต้นผ่าน (PASSED)** — รายการที่ 6 ครอบคลุม
23 assertion จริงที่เป็นของใหม่จากงานนี้ทั้งหมด นอกเหนือจาก 23+24+28+2 = 77 assertion เดิมของ
regression suite ที่ยังผ่านไม่มีเปลี่ยนแปลง (รวมสะสมทั้งโปรเจกต์: 116 (เดิม) + 23 = **139/139
PASSED**)

## 12. P4 Design System + Layout — ผลการทดสอบจริง (รันเมื่อ 2026-09-24)

ไม่มี migration ใหม่ในงานนี้ (ไม่แตะฐานข้อมูล) — งานนี้เพิ่ม component ระดับ
Design System (`src/components/ui/*`) และ Layout (`src/components/layout/*`)
ผูก Header/Footer เข้า Root Layout ครอบทุกหน้า — รายละเอียดครบทุกหัวข้อ (รายการ
component, function spec, ขอบเขตที่ตัดออก, failure mode) อยู่ใน
**`prisma/design-system.md`** (ผลลัพธ์ที่ต้องส่งของงานนี้: "components/ui,
layout") สรุปสั้น:

| # | คำสั่ง/การทดสอบที่รันจริง | ผลลัพธ์ |
|---|---|---|
| 1 | `node prisma/dev-migrate-verify.mjs --reset` (replay ทั้ง 8 migrations เดิม — ไม่มี migration ใหม่) | PASSED |
| 2 | `npm run db:seed` (ไม่มี fixture ใหม่ในงานนี้) | idempotent เหมือนเดิม |
| 3 | `node prisma/test-exam-document-domain.mjs` (regression) | 23/23 PASSED |
| 4 | `node prisma/test-auth-login.mjs` (regression — **จับ bug จริงได้**: หลังเพิ่ม root `loading.tsx` ชั่วคราว การทดสอบข้อ "SUSPENDED account ถูกปฏิเสธ" ล้มเหลว เพราะ `redirect()` กลายเป็น HTTP 200 แทน 307 — ถอด `loading.tsx` ออกแล้วผ่านใหม่) | 24/24 PASSED |
| 5 | `node prisma/test-auth-session-expiry.mjs` กับ `AUTH_SESSION_MAX_AGE_SECONDS=3` (regression) | 2/2 PASSED |
| 6 | `node prisma/test-rbac-scope.mjs` (regression) | 28/28 PASSED |
| 7 | `node prisma/test-authz-guard.mjs` (regression) | 23/23 PASSED |
| 8 | `node prisma/test-layout-responsive.mjs` (ใหม่ — Playwright + Chromium จริง: ไม่มี horizontal overflow ที่ 375/768/1024/1440px บนหน้า public 4 หน้า + หน้า `/dashboard` หลัง login จริงผ่าน UI form ทั้ง desktop และเมนูมือถือเปิดอยู่) | **66/66 PASSED** |
| 9 | `npx next build`, `npm run lint`, `npx tsc --noEmit` | ผ่านทั้งหมด (0 error) — build แสดง route ใหม่ `/design-system` |
| 10 | ทดสอบ failure mode: บังคับ `RootLayout` throw ชั่วคราวด้วย env var (`TEST_FORCE_LAYOUT_ERROR`) แล้วลบออกทันทีหลังยืนยัน | HTTP 500 จริง (ไม่ใช่ 200 ที่มีเนื้อหาหลุด) — `global-error.tsx` ทำงานถูกต้อง |

**สรุปผล P4 Design System + Layout: 10/10 รายการในตารางข้างต้นผ่าน (PASSED)** —
รายการที่ 8 ครอบคลุม 66 assertion จริงที่เป็นของใหม่จากงานนี้ทั้งหมด นอกเหนือจาก
23+24+2+28+23 = 100 assertion เดิมของ regression suite ที่ยังผ่านไม่มีเปลี่ยนแปลง
(รวมสะสมทั้งโปรเจกต์: 139 (เดิม) + 66 = **166/166 PASSED**)

## 13. P4 Home + ข่าว/บทความ — ผลการทดสอบจริง (รันเมื่อ 2026-09-24)

Migration ใหม่: `20260924080000_news_domain` (`news_categories`, `news_articles`,
`news_article_categories`) — งานนี้เพิ่มหน้า Public จริงตัวแรกที่ query ฐานข้อมูล
จริง (`/`, `/news`, `/news/[slug]`) แทนที่หน้าแรกชั่วคราวจากงาน Design System —
รายละเอียดครบทุกหัวข้อ (schema, function spec F1.1/F1.2, ขอบเขตที่ตัดออก, failure
mode) อยู่ใน **`prisma/news-articles.md`** (ผลลัพธ์ที่ต้องส่งของงานนี้: "home/news
pages") สรุปสั้น:

| # | คำสั่ง/การทดสอบที่รันจริง | ผลลัพธ์ |
|---|---|---|
| 1 | `npx next typegen` (ต้องรันหลังเพิ่ม dynamic route `/news/[slug]` ใหม่ ก่อน `tsc` จะรู้จัก `PageProps<'/news'>`/`PageProps<'/news/[slug]'>`) | สร้าง route types สำเร็จ |
| 2 | `node prisma/dev-migrate-verify.mjs --reset` (replay ทั้ง 9 migrations จากศูนย์ รวม `news_domain` ใหม่) | PASSED |
| 3 | `npx tsx prisma/seed.ts` x2 ติดต่อกัน (เพิ่ม `seedNews()`: 4 หมวดหมู่, 10 ข่าว — 8 PUBLISHED/1 DRAFT/1 UNPUBLISHED) | idempotent — จำนวนแถวเท่าเดิมทั้งสองครั้ง (articles=10, categories=4, category-links=9) |
| 4 | `node prisma/test-exam-document-domain.mjs` (regression) | 23/23 PASSED |
| 5 | `node prisma/test-auth-login.mjs` (regression) | 24/24 PASSED |
| 6 | `node prisma/test-rbac-scope.mjs` (regression) | 28/28 PASSED |
| 7 | `node prisma/test-authz-guard.mjs` (regression) | 23/23 PASSED |
| 8 | `node prisma/test-auth-session-expiry.mjs` กับ `AUTH_SESSION_MAX_AGE_SECONDS=3` (regression) | 2/2 PASSED |
| 9 | `node prisma/test-news-pages.mjs` (ใหม่ — HTTP end-to-end จริงผ่าน `next dev`: deny-by-default ต่อ DRAFT/UNPUBLISHED, pagination, category filter, search รวม SQL-injection-safety, SEO metadata, หน้าแรก) | **35/35 PASSED** |
| 10 | `node prisma/test-layout-responsive.mjs` (ขยายจากงานก่อนหน้า — เพิ่ม `/news`, `/news?category=...`, `/news/[slug]` จริง และ `/news/[slug]` ไม่พบ เข้าไปในรายการหน้า public ที่ตรวจ horizontal overflow) | **114/114 PASSED** (เดิม 66) |
| 11 | ทดสอบ error state จริง: เพิ่ม guard ชั่วคราวใน `src/lib/news.ts` (`TEST_FORCE_NEWS_ERROR`) แล้วเปิด `/`, `/news`, `/news/[slug]` ด้วย Playwright จริง (ไม่ใช่ curl เพราะ `error.tsx` render ฝั่ง client หลัง hydrate ในโหมด dev) แล้วลบ guard ออกทันทีหลังยืนยัน | ทั้ง 3 เส้นทางตอบ HTTP 500 จริง และแสดง UI ของ `ErrorState`/`error.tsx` ถูกต้อง |
| 12 | `npx next build`, `npm run lint`, `npx tsc --noEmit` | ผ่านทั้งหมด (0 error) — build แสดง route ใหม่ `/news`, `/news/[slug]` |

**สรุปผล P4 Home + ข่าว/บทความ: 12/12 รายการในตารางข้างต้นผ่าน (PASSED)** — รายการที่
9 และ 10 ครอบคลุม 35 + 48 (ส่วนเพิ่มจาก 66 เดิม) = 83 assertion จริงที่เป็นของใหม่จาก
งานนี้ นอกเหนือจาก 23+24+28+23+2+66 = 166 assertion เดิมของ regression suite ที่ยัง
ผ่านไม่มีเปลี่ยนแปลง (รวมสะสมทั้งโปรเจกต์: 166 (เดิม) + 35 + 48 = **249/249 PASSED**)
ฐานข้อมูลสุดท้ายถูกปล่อยไว้ในสถานะ migrate + seed ครบ (เหมือนงานก่อนหน้า)

## 14. P4 นักธรรม/ธรรมศึกษา/บาลี — Browse หลักสูตร — ผลการทดสอบจริง (รันเมื่อ 2026-09-24)

ไม่มี migration ใหม่ในงานนี้ (read-only, ใช้ schema เดิมทั้งหมดจาก
`20260923141654_education_domain`) งานนี้สร้างหน้า Public ใหม่ 4 หน้า
(`/curriculum`, `/curriculum/[program]`, `/curriculum/[program]/[level]`,
`/curriculum/[program]/[level]/[subject]`) ให้ browse โครงสร้างหลักสูตรที่ P2
ออกแบบไว้แล้ว พร้อม breadcrumbs และตัวกรอง (`?examType=`, `?year=`) —
รายละเอียดครบทุกหัวข้อ (URL/slug design, function spec F2.1 ขยาย/F2.2, ขอบเขตที่
ตัดออก, failure mode) อยู่ใน **`prisma/curriculum-pages.md`** (ผลลัพธ์ที่ต้อง
ส่งของงานนี้: "program/level/subject pages") สรุปสั้น:

| # | คำสั่ง/การทดสอบที่รันจริง | ผลลัพธ์ |
|---|---|---|
| 1 | `npx next typegen` (ต้องรันหลังเพิ่ม dynamic route ใหม่ 3 ระดับ) | สร้าง route types สำเร็จ |
| 2 | `node prisma/dev-migrate-verify.mjs --reset` (replay ทั้ง 9 migrations จากศูนย์ — ไม่มี migration ใหม่ในงานนี้) | PASSED |
| 3 | `npx tsx prisma/seed.ts` x2 ติดต่อกัน | idempotent — จำนวนแถวเท่าเดิมทั้งสองครั้ง (programs=3, education_levels=8, curricula=2, curriculum_level_subjects=4, academic_years=2, exam_sessions=1) |
| 4 | manual smoke test ด้วย `curl` ครอบคลุมทุกเส้นทางใหม่ก่อนเขียน automated suite | พบบั๊กจริง 1 จุด (ดูแถวถัดไป) แก้แล้วก่อนรัน suite |
| 5 | `node prisma/test-exam-document-domain.mjs` (regression) | 23/23 PASSED |
| 6 | `node prisma/test-auth-login.mjs` (regression) | 24/24 PASSED |
| 7 | `node prisma/test-rbac-scope.mjs` (regression) | 28/28 PASSED |
| 8 | `node prisma/test-authz-guard.mjs` (regression) | 23/23 PASSED |
| 9 | `node prisma/test-auth-session-expiry.mjs` กับ `AUTH_SESSION_MAX_AGE_SECONDS=3` (regression) | 2/2 PASSED |
| 10 | `node prisma/test-news-pages.mjs` (regression) | 35/35 PASSED |
| 11 | `node prisma/test-curriculum-pages.mjs` (ใหม่ — HTTP end-to-end จริงผ่าน `next dev`: browse program→level→subject→year, examType/year filter รวม SQL-injection-safety, deny-by-default ข้ามระดับชั้น/หลักสูตร, EmptyState แทน orphan page) | **36/36 PASSED** |
| 12 | `node prisma/test-layout-responsive.mjs` (ขยายจากงานก่อนหน้า — เพิ่ม 7 หน้า `/curriculum/...` ใหม่ รวม breadcrumb ลึก 4 ชั้น, EmptyState, และ 404) | **198/198 PASSED** (เดิม 114) |
| 13 | ทดสอบ error state จริง: เพิ่ม guard ชั่วคราวใน `src/lib/curriculum.ts` (`TEST_FORCE_CURRICULUM_ERROR`) แล้วเปิด `/curriculum` ด้วย Playwright จริง แล้วลบ guard ออกทันทีหลังยืนยัน | ตอบ HTTP 500 จริง และแสดง UI ของ `ErrorState`/`error.tsx` ถูกต้อง |
| 14 | `npx next build`, `npm run lint`, `npx tsc --noEmit` | ผ่านทั้งหมด (0 error) — build แสดง route ใหม่ 4 เส้นทาง |

**สรุปผล P4 นักธรรม/ธรรมศึกษา/บาลี: 14/14 รายการในตารางข้างต้นผ่าน (PASSED)** —
รายการที่ 11 และ 12 ครอบคลุม 36 + 84 (ส่วนเพิ่มจาก 114 เดิม) = 120 assertion
จริงที่เป็นของใหม่จากงานนี้ นอกเหนือจาก 249 assertion เดิมที่ยังผ่านไม่มี
เปลี่ยนแปลง (รวมสะสมทั้งโปรเจกต์: 249 (เดิม) + 36 + 84 = **369/369 PASSED**)
ฐานข้อมูลสุดท้ายถูกปล่อยไว้ในสถานะ migrate + seed ครบ (เหมือนงานก่อนหน้า)

**บั๊กที่พบระหว่างพัฒนา (แก้แล้วก่อนเขียน automated test)**: `cls."examType"`
เป็น PostgreSQL enum column (`exam_type`) เทียบกับ query-param string (`$3`)
ที่ผูก type เป็น `::text` โดยตรงไม่ได้ (`operator does not exist:
exam_type = text`) — แก้โดย cast คอลัมน์เป็น `::text` ก่อนเทียบ
(`cls."examType"::text = $3`) ใน `listSubjectsForLevel()`

## 15. P4 คลังข้อสอบ + Search — ผลการทดสอบจริง (รันเมื่อ 2026-09-24)

**มี migration ใหม่ในงานนี้**: `20260924090000_document_curriculum_link` (เพิ่ม
คอลัมน์ nullable `levelId`/`subjectId`/`academicYearId` ที่ `documents` — ดู
`prisma/exam-bank-pages.md` §2.1 สำหรับเหตุผลเต็ม) งานนี้สร้างหน้า Public ใหม่ 2
หน้า (`/exam-bank`, `/exam-bank/[id]`) ให้ค้นหา/กรองเอกสารในคลังข้อสอบ (ไฟล์แนบ
เท่านั้น — ไม่ใช่เนื้อหาข้อสอบจริง ดูเหตุผลด้านความปลอดภัยใน
`prisma/exam-bank-pages.md` §1) — รายละเอียดครบทุกหัวข้อ (schema extension,
URL design, function spec F4.1/F4.2, ขอบเขตที่ตัดออก, failure mode) อยู่ใน
**`prisma/exam-bank-pages.md`** (ผลลัพธ์ที่ต้องส่งของงานนี้: "exam bank
pages/search") สรุปสั้น:

| # | คำสั่ง/การทดสอบที่รันจริง | ผลลัพธ์ |
|---|---|---|
| 1 | `npx next typegen` (เพิ่ม dynamic route ใหม่ `/exam-bank/[id]`) | สร้าง route types สำเร็จ |
| 2 | `node prisma/dev-migrate-verify.mjs` (apply migration ใหม่กับฐานข้อมูลเดิมก่อน) | PASSED |
| 3 | `node prisma/dev-migrate-verify.mjs --reset` (replay ทั้ง 10 migrations จากศูนย์ รวม migration ใหม่) | PASSED |
| 4 | `npx tsx prisma/seed.ts` x2 ติดต่อกัน | idempotent — documents=7, documentVersions=7 คงที่ทั้งสองรอบ (ยืนยันด้วย SQL ตรงว่า FK ใหม่ทั้ง 3 ตรงตาม matrix ที่ตั้งใจ) |
| 5 | manual smoke test ด้วย `curl`/`psql` ครอบคลุมทุกเส้นทางใหม่ก่อนเขียน automated suite | ไม่พบบั๊กใหม่ (บั๊ก enum-cast ที่เคยเจอในงานก่อนหน้าถูกป้องกันไว้ล่วงหน้าแล้ว) |
| 6 | `node prisma/test-exam-document-domain.mjs` (regression) | 23/23 PASSED |
| 7 | `node prisma/test-auth-login.mjs` (regression) | 24/24 PASSED |
| 8 | `node prisma/test-rbac-scope.mjs` (regression) | 28/28 PASSED |
| 9 | `node prisma/test-authz-guard.mjs` (regression) | 23/23 PASSED |
| 10 | `node prisma/test-auth-session-expiry.mjs` กับ `AUTH_SESSION_MAX_AGE_SECONDS=3` (regression) | 2/2 PASSED |
| 11 | `node prisma/test-news-pages.mjs` (regression) | 35/35 PASSED |
| 12 | `node prisma/test-curriculum-pages.mjs` (regression) | 36/36 PASSED |
| 13 | `node prisma/test-exam-bank-pages.mjs` (ใหม่ — deny-by-default APPROVED-only, filter 5 มิติทั้งเดี่ยวและรวมกัน, ค้นหาภาษาไทยรวม SQL-injection-safety, pagination, EmptyState, 404) | **44/44 PASSED** |
| 14 | `node prisma/test-layout-responsive.mjs` (ขยาย — เพิ่ม 5 หน้า `/exam-bank...` ใหม่) | **258/258 PASSED** (เดิม 198) |
| 15 | ทดสอบ error state จริง: เพิ่ม guard ชั่วคราวใน `src/lib/exam-bank.ts` (`TEST_FORCE_EXAM_BANK_ERROR`) แล้วเปิด `/exam-bank` ด้วย Playwright จริง แล้วลบ guard ออกทันทีหลังยืนยัน | ตอบ HTTP 500 จริง และแสดง UI ของ `ErrorState`/`error.tsx` ถูกต้อง |
| 16 | `npx next build`, `npm run lint`, `npx tsc --noEmit` | ผ่านทั้งหมด (0 error) — build แสดง route ใหม่ 2 เส้นทาง |

**สรุปผล P4 คลังข้อสอบ + Search: 16/16 รายการในตารางข้างต้นผ่าน (PASSED)** —
รายการที่ 13 และ 14 ครอบคลุม 44 + 60 (ส่วนเพิ่มจาก 198 เดิม) = 104 assertion
จริงที่เป็นของใหม่จากงานนี้ นอกเหนือจาก 369 assertion เดิมที่ยังผ่านไม่มี
เปลี่ยนแปลง (รวมสะสมทั้งโปรเจกต์: 369 (เดิม) + 44 + 60 = **473/473 PASSED**)
ฐานข้อมูลสุดท้ายถูกปล่อยไว้ในสถานะ migrate + seed ครบ (เหมือนงานก่อนหน้า)

**ปัญหาที่พบระหว่างทำ**: ไม่พบบั๊กใหม่จากงานนี้เอง — พบเพียง document fixture
เก่า (`doc_answer_sheet_template`) ที่ `test-exam-document-domain.mjs` insert
ตรงไว้ทดสอบ trigger-lock ปนอยู่ในฐานข้อมูลระหว่าง manual smoke test (ก่อน
reset) ซึ่งเป็นพฤติกรรมที่รู้อยู่แล้ว ไม่ใช่บั๊ก — รายละเอียดเต็มอยู่ใน
`prisma/exam-bank-pages.md` §4

## 16. P4 ห้องสมุด PDF/Download — ผลการทดสอบจริง (รันเมื่อ 2026-09-24)

**มี migration ใหม่ในงานนี้**: `20260924110000_document_visibility` (เพิ่ม
คอลัมน์ `isPublic` (Boolean, NOT NULL, default false) ที่ `documents` — ดู
`prisma/library-pages.md` §2.1 สำหรับเหตุผลเต็ม) งานนี้สร้างหน้า Public ใหม่ 2
หน้า (`/library`, `/library/[id]`) พร้อม Route Handler ดาวน์โหลดจริง
(`GET /api/library/[id]/download`) ให้ค้นหา/กรองเอกสารในห้องสมุดตามหมวดหมู่/
แท็ก/ประเภทเอกสาร พร้อม public/private access (เอกสารภายในต้อง login — ทุก
บทบาทเหมือนกัน ดูเหตุผลที่ไม่ใช้ FILES-module scope ใน
`prisma/library-pages.md` §2.2) และปรับ `src/lib/exam-bank.ts` ให้กรอง
`isPublic=true` เพิ่มเติมเพื่อความสอดคล้อง — รายละเอียดครบทุกหัวข้อ (schema
extension, public/private access design, 404-vs-503 download design, function
spec F8.1/F8.2/F8.3, ขอบเขตที่ตัดออก, failure mode) อยู่ใน
**`prisma/library-pages.md`** (ผลลัพธ์ที่ต้องส่งของงานนี้: "library pages")
สรุปสั้น:

| # | คำสั่ง/การทดสอบที่รันจริง | ผลลัพธ์ |
|---|---|---|
| 1 | `npx next typegen` (เพิ่ม route ใหม่ `/library`, `/library/[id]`, `/api/library/[id]/download`) | สร้าง route types สำเร็จ |
| 2 | `node prisma/dev-migrate-verify.mjs` (apply migration ใหม่กับฐานข้อมูลเดิมก่อน) | PASSED |
| 3 | `node prisma/dev-migrate-verify.mjs --reset` (replay ทั้ง 11 migrations จากศูนย์ รวม migration ใหม่) | PASSED |
| 4 | `npx tsx prisma/seed.ts` x2 ติดต่อกัน | idempotent — documents=9, documentVersions=10, categoriesAndTags.categories=3 คงที่ทั้งสองรอบ |
| 5 | manual smoke test ด้วย `curl`/`psql` ครอบคลุมทุกเส้นทางใหม่ก่อนเขียน automated suite | ไม่พบบั๊กใหม่ (public/private access, download 404/503 ทำงานถูกต้องตั้งแต่รอบแรก) |
| 6 | `node prisma/test-exam-document-domain.mjs` (regression) | 23/23 PASSED |
| 7 | `node prisma/test-auth-login.mjs` (regression) | 24/24 PASSED |
| 8 | `node prisma/test-authz-guard.mjs` (regression) | 23/23 PASSED |
| 9 | `node prisma/test-rbac-scope.mjs` (regression) | 28/28 PASSED |
| 10 | `node prisma/test-curriculum-pages.mjs` (regression) | 36/36 PASSED |
| 11 | `node prisma/test-news-pages.mjs` (regression) | 35/35 PASSED |
| 12 | `node prisma/test-exam-bank-pages.mjs` (regression — ยืนยัน isPublic consistency fix ไม่ทำให้พฤติกรรมเดิมเปลี่ยน) | 44/44 PASSED |
| 13 | `node prisma/test-library-pages.mjs` (ใหม่ — public/private access ผ่าน Jar/`loginAs()` จริง, filter หมวดหมู่/แท็ก/ประเภทเอกสาร/คำค้นหารวม SQL-injection-safety, pagination, ประวัติเวอร์ชัน, download endpoint 404/503 ครบทุก combination) | **46/46 PASSED** |
| 14 | `node prisma/test-auth-session-expiry.mjs` กับ `AUTH_SESSION_MAX_AGE_SECONDS=3` (regression) | 2/2 PASSED |
| 15 | `node prisma/test-layout-responsive.mjs` (ขยาย — เพิ่ม 5 หน้า `/library...` ใหม่) | **318/318 PASSED** (เดิม 258) |
| 16 | ทดสอบ error state จริง: เพิ่ม guard ชั่วคราวใน `src/lib/library.ts` (`TEST_FORCE_LIBRARY_ERROR`) แล้วเปิด `/library` ด้วย Playwright จริง แล้วลบ guard ออกทันทีหลังยืนยัน | ตอบ HTTP 500 จริง และแสดง UI ของ `ErrorState`/`error.tsx` ถูกต้อง |
| 17 | `npx next build`, `npm run lint`, `npx tsc --noEmit` | ผ่านทั้งหมด (0 error) — build แสดง route ใหม่ 3 เส้นทาง |

**สรุปผล P4 ห้องสมุด PDF/Download: 17/17 รายการในตารางข้างต้นผ่าน (PASSED)** —
รายการที่ 13 และ 15 ครอบคลุม 46 + 60 (ส่วนเพิ่มจาก 258 เดิม) = 106 assertion
จริงที่เป็นของใหม่จากงานนี้ นอกเหนือจาก 473 assertion เดิมที่ยังผ่านไม่มี
เปลี่ยนแปลง (รวมสะสมทั้งโปรเจกต์: 473 (เดิม) + 46 + 60 = **579/579 PASSED**)
ฐานข้อมูลสุดท้ายถูกปล่อยไว้ในสถานะ migrate + seed ครบ (เหมือนงานก่อนหน้า)

**ปัญหาที่พบระหว่างทำ**: `npm run lint` พบ 2 warning เล็กน้อยจากไฟล์ใหม่ของงาน
นี้ (unused import `Link`, unused parameter `_fileKey`) แก้แล้วก่อน commit —
ไม่ใช่บั๊กเชิงตรรกะ รายละเอียดเต็มอยู่ใน `prisma/library-pages.md` §4

## 17. P5 Admin Dashboard Shell — ผลการทดสอบจริง (รันเมื่อ 2026-09-24)

**ไม่มี migration ใหม่ในงานนี้** — ใช้ permission matrix
(`src/lib/permissions.ts`) และตาราง `audit_logs` (P1) ที่มีอยู่แล้วทั้งหมด
งานนี้สร้าง `/admin` (layout ประตูเข้า Admin Zone + sidebar permission-aware,
dashboard page การ์ด KPI mock + recent activity จริง) — ประตูเข้าคือ
`requirePermission("ADMIN","read")` จุดเดียว (มีเพียง SUPER_ADMIN/
CENTRAL_OFFICER/AUDITOR ที่ผ่านได้ ตรงกับ `claude/sitemap.md` ข้อ 7) sidebar/
KPI derive จาก permission matrix จริงตรงกับ "วิธีตรวจสอบ" ที่ระบุ ("ผู้ใช้เห็น
เฉพาะ module ที่มีสิทธิ์") — รายละเอียดครบทุกหัวข้อ (การตัดสินใจเรื่อง
permission-aware navigation, ประตูเข้า Admin Zone, path ต่อ module, KPI mock
vs recent activity จริง, function spec F6.1/F6.3/F6.4, ขอบเขตที่ตัดออก,
failure mode) อยู่ใน **`prisma/admin-dashboard.md`** (ผลลัพธ์ที่ต้องส่งของงาน
นี้: "admin layout/dashboard") สรุปสั้น:

| # | คำสั่ง/การทดสอบที่รันจริง | ผลลัพธ์ |
|---|---|---|
| 1 | `node prisma/dev-migrate-verify.mjs --reset` (replay ทั้ง 11 migrations จากศูนย์ — ไม่มี migration ใหม่ในงานนี้) | PASSED |
| 2 | `npx tsx prisma/seed.ts` x2 ติดต่อกัน | idempotent — output เหมือนกันทุกประการทั้งสองรอบ |
| 3 | manual smoke test ด้วย `curl` (HTTP redirect/status ทุก role) + ตรวจ HTML ของ sidebar/KPI/recent-activity ก่อนเขียน automated suite | ไม่พบบั๊กใหม่ (deny-by-default, permission-aware nav, KPI, recent activity ทำงานถูกต้องตั้งแต่รอบแรก) |
| 4 | `node prisma/test-admin-dashboard.mjs` (ใหม่ — deny-by-default entry gate ครบทุก role, permission-aware sidebar, KPI mock cards, recent activity จริงจาก `audit_logs` รวม EmptyState ตอนว่างเปล่า + grant/revoke จริงผ่าน HTTP แล้วตรวจ ordering — รันก่อน test-rbac-scope.mjs/test-authz-guard.mjs โดยตั้งใจ) | **52/52 PASSED** |
| 5 | `node prisma/test-exam-document-domain.mjs` (regression) | 23/23 PASSED |
| 6 | `node prisma/test-auth-login.mjs` (regression) | 24/24 PASSED |
| 7 | `node prisma/test-rbac-scope.mjs` (regression) | 28/28 PASSED |
| 8 | `node prisma/test-authz-guard.mjs` (regression) | 23/23 PASSED |
| 9 | `node prisma/test-curriculum-pages.mjs` (regression) | 36/36 PASSED |
| 10 | `node prisma/test-news-pages.mjs` (regression) | 35/35 PASSED |
| 11 | `node prisma/test-exam-bank-pages.mjs` (regression) | 44/44 PASSED |
| 12 | `node prisma/test-library-pages.mjs` (regression) | 46/46 PASSED |
| 13 | `node prisma/test-auth-session-expiry.mjs` กับ `AUTH_SESSION_MAX_AGE_SECONDS=3` (regression) | 2/2 PASSED |
| 14 | `node prisma/test-layout-responsive.mjs` (ขยาย — เพิ่ม Part 3: `/admin` หลังล็อกอินจริงเป็น SUPER_ADMIN, 4 viewport) | **344/344 PASSED** (เดิม 318) |
| 15 | ทดสอบ error state จริง: เพิ่ม guard ชั่วคราวใน `src/lib/admin-dashboard.ts` (`TEST_FORCE_ADMIN_DASHBOARD_ERROR`) แล้วเปิด `/admin` ด้วย Playwright จริงในฐานะ SUPER_ADMIN แล้วลบ guard ออกทันทีหลังยืนยัน | ยืนยันเห็นข้อความ "เกิดข้อผิดพลาดบางอย่าง"/"ลองใหม่" จาก root `error.tsx` จริง |
| 16 | `npx next typegen`, `npx tsc --noEmit`, `npm run lint`, `npx next build` | ผ่านทั้งหมด (0 error, 0 warning) — build แสดง route ใหม่ `/admin` |

**สรุปผล P5 Admin Dashboard Shell: 16/16 รายการในตารางข้างต้นผ่าน (PASSED)** —
รายการที่ 4 และ 14 ครอบคลุม 52 + 26 (ส่วนเพิ่มจาก 318 เดิม) = 78 assertion
จริงที่เป็นของใหม่จากงานนี้ นอกเหนือจาก 579 assertion เดิมที่ยังผ่านไม่มี
เปลี่ยนแปลง (รวมสะสมทั้งโปรเจกต์: 579 (เดิม) + 52 + 26 = **657/657 PASSED**)
ฐานข้อมูลสุดท้ายถูกปล่อยไว้ในสถานะ migrate + seed + มี audit_logs 2 แถวจาก
การทดสอบ grant/revoke scope จริงใน `test-admin-dashboard.mjs` (ไม่ใช่ปัญหา —
เป็นข้อมูลทดสอบที่ตั้งใจ ไม่ใช่ข้อมูลบุคคลจริง)

**ปัญหาที่พบระหว่างทำ**: ไม่มี — ทุกการทดสอบผ่านตั้งแต่รอบแรกที่เขียน ไม่ต้อง
แก้ไข logic ระหว่างทาง (เหตุผลหลักคือไฟล์ใหม่ทั้งหมดเป็นเพียงตัวแสดงผลจาก
permission matrix/audit_logs ที่มีอยู่แล้วและทดสอบมาแล้วอย่างละเอียดตั้งแต่
งาน RBAC ก่อนหน้า ไม่ได้เขียน authorization logic ใหม่เลย)

## 18. ข้อจำกัดที่เหลืออยู่ (ต้องแก้ในอนาคต)

- Prisma Client ยังไม่เคยถูก generate จริงในสภาพแวดล้อมนี้ (`npx prisma generate` ใช้
  ไม่ได้ด้วยเหตุผลเดียวกับข้างต้น) จึงยังไม่มี application code ใดใน repo นี้ import
  `@prisma/client` — จะต้อง generate และทดสอบจริงในสภาพแวดล้อมที่มีเครือข่ายก่อนเริ่มเขียน
  โมดูลที่ query ฐานข้อมูลจริง (M1–M9)
- `_migration_verification_log` และ `dev-migrate-verify.mjs` เป็นของชั่วคราว ต้องลบทิ้ง
  ตามขั้นตอนใน §2 เมื่อ Prisma CLI ใช้งานได้จริง มิเช่นนั้นจะมีตารางติดตาม 2 ระบบซ้อนกัน
- ชุด seed ของ `organization_hierarchy_rules` (10 แถว) ยังไม่ผ่านการยืนยันกับผู้เชี่ยวชาญ
  ด้านการปกครองคณะสงฆ์ — ควรทบทวนก่อน Real-data Readiness Gate (ดูรายละเอียดใน
  `prisma/data-dictionary.md`)
- `Position.isUniquePerOrganization` และ `Position.applicableOrgType` เป็น advisory
  เท่านั้น ยังไม่มี DB constraint บังคับ — ต้อง implement เป็น application-layer
  validation ในเฟส backend ที่เขียน Appointment API จริง (ดูเหตุผลใน
  `prisma/data-dictionary.md` หัวข้อ "ข้อจำกัดที่ทราบและยอมรับ")
- การห้ามแก้ไข `curriculum_level_subjects` ของหลักสูตรที่มีรอบสอบดำเนินการไปแล้ว
  ไม่ได้บังคับด้วย DB constraint (ต้อง join ข้ามตาราง) — ต้อง implement เป็น
  application-layer validation เช่นกัน (ดูเหตุผลใน `prisma/education-schema.md`
  หัวข้อ "ข้อจำกัดที่ทราบและยอมรับ")
- `AnswerKey.correctChoiceId` ไม่มี DB constraint บังคับว่าต้องเป็นตัวเลือกที่ผูกกับ
  `QuestionVersion` เดียวกันกับ AnswerKey เอง และยังไม่มีสิทธิ์ SELECT ระดับ column
  ที่เข้มงวดกว่าตัวข้อสอบ (ทั้งสองข้อเป็นงานของ application layer / Auth-RBAC phase
  ตามลำดับ — ดูรายละเอียดใน `prisma/exam-document-schema.md` หัวข้อ "ข้อจำกัดที่ทราบ
  และยอมรับ") — การอัปโหลด/จัดเก็บไฟล์จริงของ `DocumentVersion.fileKey` ก็ยังไม่ผูกกับ
  object storage จริง (เป็นของ M8)
- `prisma/seed.ts` ครอบคลุมเฉพาะบัญชี `User` เป็น "สมาชิกจำลอง" — ยังไม่มีโมดูล
  "ระบบสมาชิก" (M5) ในสคีมาปัจจุบันให้ seed ข้อมูลการสมัครสอบ/ประวัติรายบุคคลจริง
  (ดูหัวข้อ "ขอบเขต" ท้ายไฟล์ `prisma/seed.ts`); สคริปต์นี้เขียนด้วย raw `pg` เหมือน
  harness ทดสอบอื่นๆ ในโปรเจกต์ ต้องเขียนใหม่ด้วย `@prisma/client` เมื่อ generate ได้
  จริง (ความหมาย/idempotency เดิมทุกประการ — ดูรายละเอียดในความเห็นหัวไฟล์)
- Auth.js/RBAC (P3): ยังไม่มี OAuth provider จริง, การสมัครสมาชิก/ยืนยันอีเมล/อนุมัติ
  บัญชี (F5.1-F5.3), rate-limit ต่อ IP address (ทำเฉพาะ per-account), หน้า Admin
  ตั้งค่าระบบ (F6.5 — session timeout/lockout เป็น env var คงที่ในตอนนี้), และหน้า
  `/forgot-password` — รายการเต็มพร้อมเหตุผลอยู่ใน `prisma/AUTH.md` หัวข้อ "ขอบเขตที่
  ตัดออก" (**RBAC แบบเต็ม/resource-scope ตาม permission matrix และ server-side
  authorization guard (IDOR/privilege-escalation ทดสอบจริงแล้ว) ถูก implement แล้ว
  ในงาน "ออกแบบ RBAC + Scope-based Permission" และ "สร้าง Authorization Guard ฝั่ง
  Server" — ดู `prisma/roles-permissions.md` และ `prisma/authz-guards.md` รวมทั้ง
  ช่องว่างที่ยังเหลือ เช่น `ASSIGNED_SESSION` ของ Examiner ที่รอ M4 และยังไม่มี rate
  limiting ระดับ endpoint สำหรับ resource เสี่ยง IDOR**)
- Design System + Layout (P4): ยังไม่แยก route group `(public)`/`(member)`/`(admin)`
  ตาม `sitemap.md`, ฟอร์มยังไม่ผูก react-hook-form/zod หรือ submit จริง, หน้า
  `/design-system` ยังไม่ gate ด้วยสิทธิ์, ยังไม่มี UI สลับ light/dark mode, และ
  **ห้ามเพิ่ม root `loading.tsx` โดยไม่ทดสอบ regression กับ auth redirect ก่อน**
  (พบ bug จริงว่าทำให้ `redirect()` กลายเป็น HTTP 200 แทน 307 — ดู §12 รายการที่ 4
  และ `prisma/design-system.md` หัวข้อ "ขอบเขตที่ตัดออก" ข้อ 3) — รายการเต็มพร้อม
  เหตุผลอยู่ใน `prisma/design-system.md` หัวข้อ 6 และ 8
- Home + ข่าว/บทความ (P4): ยังไม่มีหน้า Admin จัดการข่าว (`/admin/news`, F1.3/F1.4 —
  schema พร้อมรองรับแล้ว), "search preview" เป็น server-rendered GET form ธรรมดา
  ไม่ใช่ client-side type-ahead, ยังไม่เชื่อม Object Storage จริงสำหรับภาพปกข่าว
  (ใช้ `<img>` ธรรมดาแทน `next/image`), `generateMetadata()` ไม่ได้ห่อ query ด้วย
  React `cache()` (query ซ้ำ 1 ครั้งต่อ request แต่เบามาก), และ `content` เป็น plain
  text ยังไม่มี sanitization pipeline (ปลอดภัยเพราะเป็น seed data ที่ควบคุมเอง —
  ต้องเพิ่มก่อนรับ input จากผู้ใช้จริงในงาน admin news) — รายการเต็มพร้อมเหตุผลอยู่
  ใน `prisma/news-articles.md` หัวข้อ 6 และ 7
- นักธรรม/ธรรมศึกษา/บาลี — Browse หลักสูตร (P4): ยังไม่มีหน้า `/exam-schedule`
  ภาพรวมทั้งระบบตาม `sitemap.md` (งานนี้ทำเฉพาะตารางสอบผูกกับวิชาเดียว), ยังไม่มี
  หน้า Admin จัดการข้อมูลอ้างอิงหลักสูตร/ระดับชั้น/วิชา (F2.3), `exam_session_status`
  ยังไม่มีสถานะ "ร่าง" แยกจาก PLANNED อย่างชัดเจน (ตีความ PLANNED เป็นข้อมูล
  สาธารณะได้แล้วในตอนนี้), และยังไม่มี UI สำหรับดูหลักสูตรเวอร์ชันย้อนหลัง (ข้อมูล
  จริงปัจจุบันมีหลักสูตรเดียวต่อสายอยู่แล้ว) — รายการเต็มพร้อมเหตุผลอยู่ใน
  `prisma/curriculum-pages.md` หัวข้อ 6 และ 7
- คลังข้อสอบ + Search (P4): `/exam-bank/[id]` ใช้ Document.id แทน slug อ่านง่าย
  (ไม่มีคอลัมน์ที่เหมาะเป็น slug), ค้นหาด้วย ILIKE ไม่ใช่ PostgreSQL full-text
  search จริง (ภาษาไทยไม่มี text search config ในตัว), ยังไม่เชื่อมต่อ object
  storage จริง (ปุ่มดาวน์โหลด disabled — เป็นของ M8), ไม่มีหน้า Admin จัดการ/
  อนุมัติเอกสาร, ไม่มีการตรวจว่า "วิชานี้มีสอนในชั้น/หลักสูตรที่เลือกจริงหรือไม่"
  (ตัวกรองอิสระต่อกัน), และยังไม่ได้ทดสอบ pagination ข้ามหน้าจริง (ข้อมูลจำลอง
  ปัจจุบันมีเอกสาร APPROVED แค่ 4 รายการ น้อยกว่า `EXAM_BANK_PAGE_SIZE=9`) —
  รายการเต็มพร้อมเหตุผลอยู่ใน `prisma/exam-bank-pages.md` หัวข้อ 6 และ 7
