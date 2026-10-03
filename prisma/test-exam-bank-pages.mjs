#!/usr/bin/env node
/**
 * test-exam-bank-pages.mjs — real end-to-end tests against a RUNNING
 * `next dev` server (http://localhost:3000) for the "สร้างคลังข้อสอบ + Search"
 * task (F4.1 ค้นหา/รายการเอกสาร, F4.2 รายละเอียดเอกสาร — ดู
 * prisma/exam-bank-pages.md) — ไม่ mock ฐานข้อมูล/HTTP ใดๆ ใช้ `fetch` จริงกับ
 * next dev + PostgreSQL จริงที่ seed ไว้ (ดู prisma/seed.ts seedDocuments()
 * สำหรับ matrix เอกสาร/สถานะที่ทดสอบนี้พึ่งพา)
 *
 * หมายเหตุสำคัญเรื่อง assertion style: ทดสอบนี้ตรวจด้วย "มี/ไม่มีข้อความของ
 * เอกสารที่รู้จัก" เสมอ ไม่ตรวจจำนวนผลลัพธ์ทั้งหมดแบบเป๊ะ (exact count) เพราะ
 * test-exam-document-domain.mjs อาจ insert แถว document ทดสอบเพิ่มเติมที่ไม่ผ่าน
 * seed.ts (ดู comment ในไฟล์นั้น) หากรันคนละลำดับกับทดสอบนี้ — การตรวจแบบนี้ทำให้
 * ทดสอบไม่พังโดยไม่จำเป็นไม่ว่าจะรันตามลำดับใด (เหมือน pattern ที่ใช้แล้วใน
 * test-curriculum-pages.mjs/test-news-pages.mjs)
 *
 * Prerequisites: `npm run dev` running on :3000, database migrated + seeded
 * (`node prisma/dev-migrate-verify.mjs && npm run db:seed`).
 *
 * Usage: node prisma/test-exam-bank-pages.mjs
 */

const BASE_URL = process.env.TEST_BASE_URL ?? "http://localhost:3000";

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) {
    passed++;
    console.log(`  [PASSED] ${label}`);
  } else {
    failed++;
    console.log(`  [FAILED] ${label}`);
  }
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`, { redirect: "manual" });
  const body = await res.text();
  return { status: res.status, body };
}

// ชื่อเอกสารที่ seed ไว้ใน prisma/seed.ts seedDocuments() — ใช้ยืนยัน
// visible/ไม่ visible ตลอดไฟล์นี้
const TITLE = {
  examCircular2568: "ระเบียบการสอบธรรมศึกษาสนามหลวง 2568",
  vinayaStudyMaterial: "เอกสารประกอบการสอนวินัยมุข",
  dhammavibhaga2567: "ข้อสอบธรรมวิภาค นักธรรมชั้นตรี ปีการศึกษา 2567",
  essay2568: "ข้อสอบเรียงความแก้กระทู้ธรรม นักธรรมชั้นตรี ปีการศึกษา 2568",
  answerSheetTemplate: "แบบฟอร์มกระดาษคำตอบมาตรฐาน",
  dhammavibhaga2568Draft: "ข้อสอบธรรมวิภาค นักธรรมชั้นตรี ปีการศึกษา 2568 (ฉบับร่าง",
  essay2567Retired: "ข้อสอบเรียงความแก้กระทู้ธรรม นักธรรมชั้นตรี ปีการศึกษา 2567 (ถอนแล้ว",
};

const ID = {
  dhammavibhaga2567: "seed_doc_exampaper_dhammavibhaga_tri_2567",
  essay2568: "seed_doc_exampaper_essay_tri_2568",
  dhammavibhaga2568Draft: "seed_doc_exampaper_dhammavibhaga_tri_2568_draft",
  essay2567Retired: "seed_doc_exampaper_essay_tri_2567_retired",
  vinayaStudyMaterial: "seed_doc_vinaya_study_material",
  answerSheetTemplate: "seed_doc_answersheet_template",
  examCircular2568: "seed_doc_exam_circular_2568",
};

async function main() {
  console.log(`Testing exam-bank pages against ${BASE_URL}\n`);

  // --- F4.1: base list — deny-by-default (APPROVED only) -------------------
  {
    const { status, body } = await get("/exam-bank");
    assert(status === 200, "/exam-bank ตอบ 200");
    assert(
      body.includes(TITLE.examCircular2568) &&
        body.includes(TITLE.dhammavibhaga2567) &&
        body.includes(TITLE.essay2568) &&
        body.includes(TITLE.answerSheetTemplate),
      "แสดงเอกสารทั้ง 4 รายการที่มีเวอร์ชัน APPROVED (ทุกประเภทเอกสารที่ seed ไว้)",
    );
    assert(
      !body.includes(TITLE.vinayaStudyMaterial),
      "ไม่แสดงเอกสารที่มีแต่เวอร์ชัน DRAFT (deny-by-default) — F4.1 AC3",
    );
    assert(
      !body.includes(TITLE.dhammavibhaga2568Draft),
      "ไม่แสดงเอกสาร EXAM_PAPER_PRINT ที่ยังเป็น DRAFT แม้ชื่อจะคล้ายฉบับที่อนุมัติแล้ว (สำคัญด้านความปลอดภัย — ป้องกันข้อสอบรั่วก่อนอนุมัติ)",
    );
    assert(
      !body.includes(TITLE.essay2567Retired),
      "ไม่แสดงเอกสารที่ถูกถอดแล้ว (RETIRED, ไม่มีเวอร์ชัน APPROVED เลย) — F4.1 AC3",
    );
    assert(
      body.includes(`href="/exam-bank/${ID.dhammavibhaga2567}"`),
      "ลิงก์ไปหน้ารายละเอียดเอกสารถูกต้อง (ใช้ document id ตรงๆ)",
    );
  }

  // --- F4.1: documentType filter (allowlist + enum-cast safety) ------------
  {
    const examPapers = await get("/exam-bank?documentType=EXAM_PAPER_PRINT");
    assert(examPapers.status === 200, "กรอง documentType=EXAM_PAPER_PRINT: ตอบ 200 (ไม่ error จาก enum-cast)");
    assert(
      examPapers.body.includes(TITLE.dhammavibhaga2567) && examPapers.body.includes(TITLE.essay2568),
      "กรอง documentType=EXAM_PAPER_PRINT: เห็นข้อสอบเก่าที่อนุมัติแล้วทั้งสองฉบับ",
    );
    assert(
      !examPapers.body.includes(TITLE.answerSheetTemplate) && !examPapers.body.includes(TITLE.examCircular2568),
      "กรอง documentType=EXAM_PAPER_PRINT: ไม่เห็นเอกสารประเภทอื่น (ANSWER_SHEET_TEMPLATE/CIRCULAR)",
    );

    const circulars = await get("/exam-bank?documentType=CIRCULAR");
    assert(
      circulars.body.includes(TITLE.examCircular2568) && !circulars.body.includes(TITLE.dhammavibhaga2567),
      "กรอง documentType=CIRCULAR: เห็นเฉพาะระเบียบ/ประกาศ",
    );

    const invalidType = await get("/exam-bank?documentType=' OR '1'='1");
    assert(
      invalidType.status === 200 && invalidType.body.includes(TITLE.examCircular2568),
      "documentType ที่ไม่รู้จัก/SQL injection: ไม่ error, ถือว่าไม่ได้กรอง (allowlist ปฏิเสธก่อนถึง SQL)",
    );
  }

  // --- F4.1: program + level filter (ผ่าน level.programId join) -----------
  {
    const scoped = await get("/exam-bank?program=nak-tham&level=tri");
    assert(scoped.status === 200, "กรอง program=nak-tham&level=tri: ตอบ 200");
    assert(
      scoped.body.includes(TITLE.dhammavibhaga2567) && scoped.body.includes(TITLE.essay2568),
      "กรอง program=nak-tham&level=tri: เห็นเอกสารที่ผูกชั้นนี้ทั้งสองฉบับ",
    );
    assert(
      !scoped.body.includes(TITLE.examCircular2568),
      "กรอง program=nak-tham&level=tri: ไม่เห็นเอกสารที่ไม่ได้ผูกชั้นใดเลย (ระเบียบ/ประกาศ)",
    );

    // level ที่ไม่มี program กำกับ — ไม่สามารถ resolve levelId ได้ (code ไม่
    // unique ข้าม program) จึงถูกละเว้น ไม่ error ไม่กรองอะไรเลย
    const levelOnly = await get("/exam-bank?level=tri");
    assert(
      levelOnly.status === 200 &&
        levelOnly.body.includes(TITLE.examCircular2568) &&
        levelOnly.body.includes(TITLE.dhammavibhaga2567),
      "?level=tri โดยไม่มี program: ตัวกรอง level ถูกละเว้น (ไม่ error) เห็นเอกสารทุกประเภทเหมือนไม่ได้กรอง",
    );

    const invalidProgram = await get("/exam-bank?program=this-program-does-not-exist");
    assert(
      invalidProgram.status === 200 && invalidProgram.body.includes(TITLE.examCircular2568),
      "program slug ที่ไม่มีอยู่จริง: ไม่ error/ไม่ 404 (เป็นตัวกรอง ไม่ใช่ URL segment) ถือว่าไม่ได้กรอง",
    );
  }

  // --- F4.1: subject filter (global, ไม่ผูก level) --------------------------
  {
    const bySubject = await get("/exam-bank?subject=dhammavibhaga");
    assert(bySubject.status === 200, "กรอง subject=dhammavibhaga: ตอบ 200");
    assert(
      bySubject.body.includes(TITLE.dhammavibhaga2567) && !bySubject.body.includes(TITLE.essay2568),
      "กรอง subject=dhammavibhaga: เห็นเฉพาะเอกสารวิชาธรรมวิภาค",
    );

    const invalidSubject = await get("/exam-bank?subject=this-subject-does-not-exist");
    assert(
      invalidSubject.status === 200 && invalidSubject.body.includes(TITLE.dhammavibhaga2567),
      "subject slug ที่ไม่มีอยู่จริง: ไม่ error ถือว่าไม่ได้กรอง",
    );
  }

  // --- F4.1: year filter -----------------------------------------------------
  {
    const year2568 = await get("/exam-bank?year=2568");
    assert(
      year2568.body.includes(TITLE.examCircular2568) && year2568.body.includes(TITLE.essay2568),
      "กรอง year=2568: เห็นเอกสารทั้งสองที่ผูกปีนี้ (ระเบียบ + ข้อสอบเรียงความ)",
    );
    assert(
      !year2568.body.includes(TITLE.dhammavibhaga2567),
      "กรอง year=2568: ไม่เห็นเอกสารที่ผูกปีอื่น (ธรรมวิภาค 2567)",
    );

    const year2567 = await get("/exam-bank?year=2567");
    assert(
      year2567.body.includes(TITLE.dhammavibhaga2567) && !year2567.body.includes(TITLE.essay2568),
      "กรอง year=2567: เห็นเฉพาะเอกสารที่อนุมัติแล้วของปีนี้ (ไม่นับฉบับ RETIRED ปี 2567 ที่ไม่มี APPROVED)",
    );

    const invalidYear = await get("/exam-bank?year=not-a-year");
    assert(
      invalidYear.status === 200 && invalidYear.body.includes(TITLE.examCircular2568),
      "year query ผิดรูปแบบ: ไม่ error ถือว่าไม่ได้กรอง",
    );
  }

  // --- F4.1: full-text (ILIKE) search ด้วยคำภาษาไทย -------------------------
  {
    const thaiQuery = await get(`/exam-bank?q=${encodeURIComponent("ธรรม")}`);
    assert(thaiQuery.status === 200, "query ภาษาไทย 'ธรรม': ตอบ 200");
    assert(
      thaiQuery.body.includes(TITLE.examCircular2568) &&
        thaiQuery.body.includes(TITLE.dhammavibhaga2567) &&
        thaiQuery.body.includes(TITLE.essay2568),
      "query ภาษาไทย 'ธรรม': พบเอกสารที่อนุมัติแล้วทั้ง 3 รายการที่มีคำนี้ในชื่อเรื่อง",
    );
    assert(
      !thaiQuery.body.includes(TITLE.dhammavibhaga2568Draft) && !thaiQuery.body.includes(TITLE.essay2567Retired),
      "query ภาษาไทย 'ธรรม': ไม่พบเอกสาร DRAFT/RETIRED แม้ชื่อเรื่องจะมีคำนี้ตรงกันด้วย (deny-by-default ทำงานร่วมกับ search)",
    );

    const noMatch = await get(`/exam-bank?q=${encodeURIComponent("ไม่มีเอกสารใดตรงคำนี้แน่นอน")}`);
    assert(
      noMatch.status === 200 && noMatch.body.includes("ไม่พบเอกสารที่ตรงเงื่อนไข"),
      "query ที่ไม่ตรงเอกสารใดเลย: แสดง EmptyState ไม่ error (query ภาษาไทยและ empty state ผ่าน test cases)",
    );

    const injection = await get(`/exam-bank?q=${encodeURIComponent("'; DROP TABLE documents;--")}`);
    assert(
      injection.status === 200 && injection.body.includes("ไม่พบเอกสารที่ตรงเงื่อนไข"),
      "q แบบพยายาม SQL injection: ไม่ error, ปฏิบัติเหมือนคำค้นธรรมดาที่ไม่ตรงอะไร (parameterized query)",
    );
    const stillWorks = await get("/exam-bank");
    assert(
      stillWorks.body.includes(TITLE.examCircular2568),
      "หลังพยายาม SQL injection: ตาราง documents ยังอยู่ครบ ไม่ถูกกระทบ",
    );
  }

  // --- F4.1: combined filters (AND ทุกเงื่อนไข) ------------------------------
  {
    const combined = await get(
      `/exam-bank?program=nak-tham&level=tri&documentType=EXAM_PAPER_PRINT&year=2567&q=${encodeURIComponent("ธรรมวิภาค")}`,
    );
    assert(combined.status === 200, "รวมตัวกรองหลายมิติพร้อมกัน: ตอบ 200");
    assert(
      combined.body.includes(TITLE.dhammavibhaga2567) && !combined.body.includes(TITLE.essay2568),
      "รวมตัวกรองหลายมิติ: ได้เอกสารที่ตรงทุกเงื่อนไข (AND) เท่านั้น — F4.1 AC2",
    );

    const noOverlap = await get("/exam-bank?documentType=CIRCULAR&year=2567");
    assert(
      noOverlap.status === 200 && noOverlap.body.includes("ไม่พบเอกสารที่ตรงเงื่อนไข"),
      "รวมตัวกรองที่ไม่มีเอกสารใดตรงทุกเงื่อนไขพร้อมกัน: EmptyState ไม่ error",
    );
  }

  // --- F4.1: pagination (tolerant parsing — จำนวนเอกสารที่อนุมัติแล้วยังไม่พอ
  // ข้ามหน้าจริง ดู prisma/exam-bank-pages.md §6 สำหรับขอบเขตที่ยอมรับไว้) -----
  {
    const page0 = await get("/exam-bank?page=0");
    assert(page0.status === 200 && page0.body.includes(TITLE.examCircular2568), "page=0: ไม่ error ใช้ค่าเริ่มต้นหน้า 1");

    const negativePage = await get("/exam-bank?page=-5");
    assert(negativePage.status === 200, "page=-5: ไม่ error ใช้ค่าเริ่มต้นหน้า 1");

    const invalidPage = await get("/exam-bank?page=abc");
    assert(invalidPage.status === 200, "page=abc: ไม่ error ใช้ค่าเริ่มต้นหน้า 1");

    const farPage = await get("/exam-bank?page=999");
    assert(
      farPage.status === 200 && farPage.body.includes(TITLE.examCircular2568),
      "page=999 (เกินหน้าสุดท้ายมาก): clamp กลับมาหน้าสุดท้าย ไม่ error/ไม่หน้าว่างผิดปกติ",
    );
  }

  // --- F4.2: document detail page — deny-by-default -------------------------
  {
    const approved = await get(`/exam-bank/${ID.dhammavibhaga2567}`);
    assert(approved.status === 200, "หน้ารายละเอียดเอกสารที่อนุมัติแล้ว: ตอบ 200");
    assert(
      approved.body.includes(TITLE.dhammavibhaga2567) && approved.body.includes("นักธรรม"),
      "หน้ารายละเอียด: แสดงชื่อเรื่องและบริบทหลักสูตรถูกต้อง",
    );
    assert(approved.body.includes("2567"), "หน้ารายละเอียด: แสดงปีการศึกษาที่ผูกไว้ถูกต้อง");

    const draft = await get(`/exam-bank/${ID.dhammavibhaga2568Draft}`);
    assert(draft.status === 404, "หน้ารายละเอียดเอกสาร DRAFT: ตอบ 404 (F4.2 AC1 — ป้องกันข้อสอบรั่วก่อนอนุมัติ)");

    const retired = await get(`/exam-bank/${ID.essay2567Retired}`);
    assert(retired.status === 404, "หน้ารายละเอียดเอกสาร RETIRED (ไม่เคยมีเวอร์ชัน APPROVED): ตอบ 404");

    const missing = await get("/exam-bank/this-document-id-does-not-exist");
    assert(missing.status === 404, "หน้ารายละเอียดเอกสารที่ไม่มีอยู่จริง: ตอบ 404 (ผลลัพธ์เดียวกับ DRAFT/RETIRED — ไม่แยกข้อความ)");
  }

  // --- F4.2: detail page for a document with no level/subject/year ----------
  {
    const noScope = await get(`/exam-bank/${ID.examCircular2568}`);
    assert(noScope.status === 200, "หน้ารายละเอียดเอกสารที่ไม่ผูกชั้น/วิชาใดเลย (ระเบียบ/ประกาศ): ตอบ 200 ไม่ error");
    assert(noScope.body.includes(TITLE.examCircular2568), "แสดงชื่อเรื่องถูกต้องแม้ไม่มีชั้น/วิชาที่ผูกไว้");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
