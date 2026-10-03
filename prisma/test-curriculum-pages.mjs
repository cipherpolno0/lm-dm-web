#!/usr/bin/env node
/**
 * test-curriculum-pages.mjs — real end-to-end tests against a RUNNING
 * `next dev` server (http://localhost:3000) for the "สร้างหน้า นักธรรม/
 * ธรรมศึกษา/บาลี" task (F2.1 ขยาย: browse program → level → subject → year,
 * + F2.2 ตารางสอบผูกกับวิชา — user-flows.md Flow 2) — ไม่ mock ฐานข้อมูล/HTTP
 * ใดๆ ใช้ `fetch` จริงกับ next dev + PostgreSQL จริงที่ seed ไว้ (ดู
 * prisma/education-domain migration seed + prisma/seed.ts seedEducationExtensions/
 * seedExamLogistics สำหรับข้อมูลอ้างอิงที่ทดสอบนี้พึ่งพา)
 *
 * Prerequisites: `npm run dev` running on :3000, database migrated + seeded
 * (`node prisma/dev-migrate-verify.mjs && npm run db:seed`).
 *
 * Usage: node prisma/test-curriculum-pages.mjs
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

async function main() {
  console.log(`Testing curriculum pages against ${BASE_URL}\n`);

  // --- F2.1a: program list -----------------------------------------------
  {
    const { status, body } = await get("/curriculum");
    assert(status === 200, "/curriculum ตอบ 200");
    assert(
      body.includes("นักธรรม") && body.includes("ธรรมศึกษา") && body.includes("บาลี"),
      "/curriculum แสดงสายการศึกษาทั้ง 3 สาย",
    );
    assert(body.includes('href="/curriculum/nak-tham"'), "ลิงก์ไปหน้าระดับชั้นของนักธรรมถูกต้อง (slug ที่แปลงจาก code ถูกต้อง)");
  }

  // --- F2.1b: program not found -> 404 ------------------------------------
  {
    const { status } = await get("/curriculum/this-program-does-not-exist");
    assert(status === 404, "สายการศึกษาที่ไม่มีอยู่จริง: /curriculum/[program] ตอบ 404");
  }

  // --- F2.1b: level list for a real program -------------------------------
  {
    const { status, body } = await get("/curriculum/nak-tham");
    assert(status === 200, "/curriculum/nak-tham ตอบ 200");
    assert(
      body.includes("นักธรรมชั้นตรี") && body.includes("นักธรรมชั้นโท") && body.includes("นักธรรมชั้นเอก"),
      "/curriculum/nak-tham แสดงระดับชั้นทั้ง 3 ระดับ",
    );
    assert(
      body.includes("หลักสูตรปัจจุบัน") && body.includes("2567"),
      "/curriculum/nak-tham แสดงชื่อ+ปีเริ่มใช้ของหลักสูตรปัจจุบันถูกต้อง",
    );

    const missingLevel = await get("/curriculum/nak-tham/this-level-does-not-exist");
    assert(missingLevel.status === 404, "ระดับชั้นที่ไม่มีอยู่จริงในสายการศึกษานี้: ตอบ 404");
  }

  // --- F2.1c: subject list for a level with real curriculum content -------
  {
    const { status, body } = await get("/curriculum/nak-tham/tri");
    assert(status === 200, "/curriculum/nak-tham/tri ตอบ 200");
    assert(
      body.includes("ธรรมวิภาค") && body.includes("เรียงความแก้กระทู้ธรรม"),
      "นักธรรมชั้นตรีแสดงวิชาทั้ง 2 วิชาตามหลักสูตรที่ seed ไว้ (F2.1 AC1)",
    );
    assert(
      body.includes('href="/curriculum/nak-tham/tri/dhammavibhaga"'),
      "ลิงก์ไปหน้ารายละเอียดวิชาถูกต้อง",
    );
  }

  // --- F2.1c: subject list for a level with NO curriculum content yet -----
  // (นักธรรมชั้นโท/เอก มีระดับชั้นจริง แต่ยังไม่มีวิชาในหลักสูตรปัจจุบัน)
  {
    const { status, body } = await get("/curriculum/nak-tham/tho");
    assert(status === 200, "ระดับชั้นที่มีอยู่จริงแต่ยังไม่มีวิชาในหลักสูตร: ตอบ 200 ไม่ error");
    assert(
      body.includes("ยังไม่มีรายวิชาที่ตรงเงื่อนไข"),
      "แสดง EmptyState แทนหน้าว่างเปล่า/error (ไม่มี orphan page)",
    );
    assert(
      body.includes('href="/curriculum/nak-tham"') || body.includes('href="/curriculum"'),
      "หน้า EmptyState ยังมี breadcrumb กลับไปหน้าก่อนหน้าได้ (ไม่ orphan จริง)",
    );
  }

  // --- F2.1c: program with NO curriculum published at all (Pali) ----------
  {
    const { status, body } = await get("/curriculum/pali/pt1-2");
    assert(status === 200, "สายการศึกษาที่ยังไม่มีหลักสูตรเผยแพร่เลย (บาลี): ตอบ 200 ไม่ error");
    assert(
      body.includes("ยังไม่มีหลักสูตรที่เผยแพร่ในระบบ"),
      "แสดงข้อความชัดเจนว่ายังไม่มีหลักสูตร ไม่ใช่ error ทั่วไป",
    );
  }

  // --- F2.1c: examType filter ----------------------------------------------
  {
    const essayOnly = await get("/curriculum/nak-tham/tri?examType=ESSAY");
    assert(essayOnly.status === 200, "กรอง examType=ESSAY: ตอบ 200");
    assert(
      essayOnly.body.includes("ธรรมวิภาค") && essayOnly.body.includes("เรียงความแก้กระทู้ธรรม"),
      "กรอง examType=ESSAY: เห็นวิชาที่เป็นอัตนัยทั้งสองวิชา (ทั้งคู่ seed เป็น ESSAY)",
    );

    const mcOnly = await get("/curriculum/nak-tham/tri?examType=MULTIPLE_CHOICE");
    assert(mcOnly.status === 200, "กรอง examType=MULTIPLE_CHOICE: ไม่ error (ไม่มี operator/enum-cast error)");
    assert(
      mcOnly.body.includes("ยังไม่มีรายวิชาที่ตรงเงื่อนไข"),
      "กรอง examType=MULTIPLE_CHOICE: ไม่มีวิชาตรงเงื่อนไข (ทั้งคู่เป็น ESSAY) แสดง EmptyState",
    );

    const invalidType = await get("/curriculum/nak-tham/tri?examType=' OR '1'='1");
    assert(
      invalidType.status === 200 && invalidType.body.includes("ธรรมวิภาค"),
      "SQL injection / ค่า examType ที่ไม่รู้จัก: ไม่ error, ถือว่าไม่ได้กรอง (allowlist ปฏิเสธค่าแปลกก่อนถึง SQL)",
    );
  }

  // --- F2.1d subject detail + deny-by-default scoping ----------------------
  {
    const { status, body } = await get("/curriculum/nak-tham/tri/dhammavibhaga");
    assert(status === 200, "/curriculum/nak-tham/tri/dhammavibhaga ตอบ 200");
    assert(body.includes("คะแนนเต็ม") && body.includes("100"), "แสดงคะแนนเต็มถูกต้อง");
    assert(body.includes("50"), "แสดงคะแนนผ่านถูกต้อง");

    const missingSubject = await get("/curriculum/nak-tham/tri/this-subject-does-not-exist");
    assert(missingSubject.status === 404, "รายวิชาที่ไม่มีอยู่จริง: ตอบ 404");

    // subj_dhammavibhaga มีอยู่จริงในระบบ แต่ไม่ได้อยู่ในหลักสูตรของ ds-tri —
    // ต้อง 404 เหมือนกัน (deny-by-default ป้องกันวิชาข้ามระดับชั้น/หลักสูตร)
    const wrongScope = await get("/curriculum/dhamma-studies/ds-tri/dhammavibhaga");
    assert(
      wrongScope.status === 404,
      "วิชาที่มีอยู่จริงแต่ไม่ได้อยู่ในระดับชั้น/หลักสูตรที่ระบุใน URL: ตอบ 404 (deny-by-default, ป้องกัน URL เดาข้าม scope)",
    );
  }

  // --- F2.2 exam schedule + year filter (ผูกกับวิชา) -----------------------
  {
    const allYears = await get("/curriculum/dhamma-studies/ds-tri/essay-dhamma");
    assert(allYears.status === 200, "หน้าตารางสอบของวิชา (ไม่กรองปี): ตอบ 200");
    assert(
      allYears.body.includes("สอบธรรมศึกษาสนามหลวง 2568"),
      "ไม่กรองปี: เห็นรอบสอบที่ seed ไว้ (ปีการศึกษา 2568)",
    );
    assert(
      allYears.body.includes("สนามสอบวัดมือกทดสอบหนึ่ง") && allYears.body.includes("สนามสอบชั่วคราวมือกทดสอบ"),
      "แสดงรายชื่อสนามสอบทั้ง 2 แห่งที่ผูกกับรอบสอบนี้ถูกต้อง",
    );

    const year2568 = await get("/curriculum/dhamma-studies/ds-tri/essay-dhamma?year=2568");
    assert(year2568.status === 200, "กรอง year=2568 (ปีที่มีรอบสอบจริง): ตอบ 200");
    assert(
      year2568.body.includes("สอบธรรมศึกษาสนามหลวง 2568"),
      "กรอง year=2568: เห็นรอบสอบปีนี้ (F2.2 AC1)",
    );

    const year2567 = await get("/curriculum/dhamma-studies/ds-tri/essay-dhamma?year=2567");
    assert(year2567.status === 200, "กรอง year=2567 (ปีที่ไม่มีรอบสอบวิชานี้): ตอบ 200 ไม่ error");
    assert(
      year2567.body.includes("ไม่มีรอบสอบตรงเงื่อนไข"),
      "กรอง year=2567: แสดง EmptyState เฉพาะส่วนตารางสอบ ไม่ error ทั้งหน้า",
    );
    assert(
      year2567.body.includes("คะแนนเต็ม"),
      "กรอง year=2567: ส่วนรายละเอียดวิชา (คะแนนเต็ม/ผ่าน) ยังแสดงตามปกติ ไม่ถูกกระทบจากตัวกรองปี",
    );

    const invalidYear = await get("/curriculum/dhamma-studies/ds-tri/essay-dhamma?year=not-a-year");
    assert(
      invalidYear.status === 200 && invalidYear.body.includes("สอบธรรมศึกษาสนามหลวง 2568"),
      "year query ผิดรูปแบบ (ไม่ใช่ตัวเลข): ไม่ error — ถือว่าไม่ได้กรอง แสดงทุกปี (เหมือน parsePageParam ของ news.ts)",
    );

    const outOfRangeYear = await get("/curriculum/dhamma-studies/ds-tri/essay-dhamma?year=99999");
    assert(
      outOfRangeYear.status === 200,
      "year query นอกช่วงที่สมเหตุสมผล (99999): ไม่ error — ถือว่าไม่ได้กรอง",
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
