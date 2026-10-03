# docs — เอกสารโครงการที่อยู่นอก repository เดิม

เอกสารในโฟลเดอร์นี้มาจากไฟล์ที่วางรวมอยู่กับสำเนาโปรเจกต์ (ไม่ได้อยู่ใน repository เดิม)
รวบรวมไว้ที่นี่เพื่อให้อ้างอิงได้จากที่เดียว เนื้อหาไม่ได้ถูกแก้ไข

- เอกสาร P0: `project-charter.md`, `requirements.md`, `data-policy.md`, `dev-rules.md`,
  `sitemap.md`, `user-flows.md`
- สถาปัตยกรรม: `architecture.md` และ `adr/`
- **เอกสารของเฟสที่ใหม่กว่าโค้ดในโปรเจกต์นี้:** `import-spec.md`, `migration-dry-run-report.md`,
  `cutover.md`, `readiness-checklist.md` และไฟล์ `.xlsx` ทั้งสาม อ้างถึง migration 20 ไฟล์,
  `src/lib/import-pipeline.ts`, `scripts/` และโมดูลนำเข้า Excel ซึ่ง**ไม่มีอยู่ในโค้ดชุดนี้**
  (โค้ดชุดนี้มี migration 11 ไฟล์ ถึงงาน admin dashboard) ใช้อ้างอิงการออกแบบได้ แต่คำสั่ง
  และชื่อไฟล์ในเอกสารเหล่านั้นจะรันกับโค้ดชุดนี้ไม่ได้

เอกสารสคีมาและผลทดสอบของโค้ดชุดนี้เองอยู่ใน `prisma/*.md`
