#!/usr/bin/env node
/**
 * test-news-pages.mjs — real end-to-end tests against a RUNNING `next dev`
 * server (http://localhost:3000) for the "สร้างหน้า Home + ข่าว/บทความ" task
 * (F1.1 ดูรายการข่าว, F1.2 ดูรายละเอียดข่าว — user-flows.md Flow 1) — ไม่ mock
 * ฐานข้อมูล/HTTP ใดๆ ใช้ `fetch` จริงกับ next dev + PostgreSQL จริงที่ seed ไว้
 * (ดู prisma/seed.ts ฟังก์ชัน seedNews สำหรับข้อมูลอ้างอิงที่ทดสอบนี้พึ่งพา:
 * 8 ข่าว PUBLISHED, 1 DRAFT, 1 UNPUBLISHED, 4 หมวดหมู่)
 *
 * Prerequisites: `npm run dev` running on :3000, database migrated + seeded
 * (`node prisma/dev-migrate-verify.mjs && npm run db:seed`).
 *
 * Usage: node prisma/test-news-pages.mjs
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
  return { status: res.status, body, headers: res.headers };
}

async function main() {
  console.log(`Testing news/home pages against ${BASE_URL}\n`);

  // --- F1.2 deny-by-default: draft/unpublished/nonexistent all 404 ---------
  {
    const draft = await get("/news/draft-online-exam-system-proposal");
    assert(draft.status === 404, "DRAFT article: /news/[slug] ตรงๆ ตอบ 404 (F1.2 AC1)");

    const unpublished = await get("/news/retracted-exam-postponement-notice");
    assert(unpublished.status === 404, "UNPUBLISHED (ถอดแล้ว) article: /news/[slug] ตรงๆ ตอบ 404 เหมือน DRAFT");

    const missing = await get("/news/this-slug-does-not-exist-at-all");
    assert(missing.status === 404, "slug ที่ไม่มีอยู่จริง: ตอบ 404");
  }

  // --- F1.2 published article renders + SEO metadata ------------------------
  {
    const { status, body } = await get("/news/exam-registration-2568");
    assert(status === 200, "PUBLISHED article: /news/[slug] ตอบ 200");
    assert(
      body.includes("เปิดรับสมัครสอบธรรมศึกษา ประจำปี 2568"),
      "เนื้อหาบทความ (title) ปรากฏใน HTML จริง",
    );
    assert(
      /<title>เปิดรับสมัครสอบธรรมศึกษา ประจำปี 2568[^<]*<\/title>/.test(body),
      "SEO: <title> ตรงกับหัวข้อข่าวจริง (ไม่ใช่ title เริ่มต้นของทั้งเว็บ)",
    );
    assert(
      body.includes('<meta name="description"') && body.includes("สำนักงานแม่กองธรรมสนามหลวง"),
      "SEO: <meta name=\"description\"> มีเนื้อหาสรุปของข่าวจริง",
    );
    assert(
      body.includes('property="og:title"') && body.includes('property="og:image"'),
      "SEO: Open Graph title/image ถูกสร้างจริง",
    );
    assert(
      !body.includes("ร่างข้อเสนอระบบสอบออนไลน์") && !body.includes("ประกาศเลื่อนสอบชั่วคราว"),
      "หน้ารายละเอียดข่าวที่เผยแพร่แล้ว ไม่รั่วเนื้อหาข่าว DRAFT/UNPUBLISHED อื่นมาปนด้วย",
    );
  }

  // --- F1.1 listing: only PUBLISHED, correct pagination ----------------------
  {
    const { status, body } = await get("/news");
    assert(status === 200, "/news ตอบ 200");
    assert(!body.includes("ร่างข้อเสนอระบบสอบออนไลน์"), "/news ไม่แสดงข่าว DRAFT (F1.1 AC1)");
    assert(!body.includes("ประกาศเลื่อนสอบชั่วคราว"), "/news ไม่แสดงข่าว UNPUBLISHED (ถอดแล้ว)");
    assert(body.includes("เปิดรับสมัครสอบธรรมศึกษา ประจำปี 2568"), "/news แสดงข่าว PUBLISHED ล่าสุดอันดับต้นๆ");
    assert(body.includes("หน้า") && body.includes("จาก"), "/news แสดงตัวเลขหน้า (มีมากกว่า 1 หน้าจาก 8 ข่าว/pageSize 6) (F1.1 AC2)");

    const page2 = await get("/news?page=2");
    assert(page2.status === 200, "/news?page=2 ตอบ 200");
    assert(
      page2.body.includes("อบรมเจ้าหน้าที่ทะเบียนสำนักเรียนทั่วประเทศ") ||
        page2.body.includes("ประกาศทุนการศึกษาพระภิกษุสามเณร"),
      "/news?page=2 แสดงข่าวหน้า 2 จริง (คนละชุดจากหน้า 1) (F1.1 AC2)",
    );

    const invalidPage = await get("/news?page=not-a-number");
    assert(invalidPage.status === 200, "/news?page=not-a-number (query ผิดรูปแบบ) ไม่ error — ใช้ค่าเริ่มต้นแทน");

    const outOfRangePage = await get("/news?page=999");
    assert(outOfRangePage.status === 200, "/news?page=999 (เกินหน้าสุดท้าย) ไม่ error — clamp กลับมาหน้าสุดท้าย");
  }

  // --- F1.1 category filter ---------------------------------------------------
  {
    const { status, body } = await get("/news?category=exam-notice");
    assert(status === 200, "/news?category=exam-notice ตอบ 200");
    assert(body.includes("เปิดรับสมัครสอบธรรมศึกษา"), "กรองหมวดหมู่ exam-notice: เห็นข่าวที่อยู่ในหมวดนี้");
    assert(
      !body.includes("อบรมเจ้าหน้าที่ทะเบียนสำนักเรียนทั่วประเทศ"),
      "กรองหมวดหมู่ exam-notice: ไม่เห็นข่าวหมวดอื่นที่ไม่เกี่ยวข้อง (activity/education เท่านั้น)",
    );

    const emptyCategory = await get("/news?category=this-category-does-not-exist");
    assert(emptyCategory.status === 200, "หมวดหมู่ที่ไม่มีอยู่จริง: ไม่ error (ตอบ 200 พร้อม EmptyState)");
    assert(
      emptyCategory.body.includes("ไม่พบข่าวที่ค้นหา"),
      "หมวดหมู่ที่ไม่มีอยู่จริง: แสดง EmptyState แทน error",
    );
  }

  // --- search preview (เพิ่มเติมนอกเหนือสเปกเดิม ตามรายละเอียดงานนี้) -----------
  {
    const match = await get(`/news?q=${encodeURIComponent("หลักสูตร")}`);
    assert(match.status === 200, "ค้นหาคำที่มีอยู่จริง: ตอบ 200");
    assert(
      match.body.includes("แนวทางการปรับปรุงหลักสูตรธรรมศึกษาชั้นตรีฉบับใหม่"),
      "ค้นหาคำที่มีอยู่จริง: เจอข่าวที่ชื่อ/สรุปมีคำนั้นจริง",
    );

    const noMatch = await get(`/news?q=${encodeURIComponent("xyzไม่มีข่าวนี้แน่นอน999")}`);
    assert(noMatch.status === 200, "ค้นหาคำที่ไม่มีผลลัพธ์: ไม่ error");
    assert(noMatch.body.includes("ไม่พบข่าวที่ค้นหา"), "ค้นหาคำที่ไม่มีผลลัพธ์: แสดง EmptyState");

    // ป้องกัน SQL injection ผ่านช่องค้นหา — ต้องไม่ error (parameterized query)
    // และต้องไม่คืนข่าว DRAFT/UNPUBLISHED มาแม้ payload จะพยายามปิด quote ของ SQL
    const injection = await get(`/news?q=${encodeURIComponent("' OR '1'='1")}`);
    assert(injection.status === 200, "SQL injection payload ในช่องค้นหา: ไม่ error (parameterized query)");
    assert(
      !injection.body.includes("ร่างข้อเสนอระบบสอบออนไลน์") && !injection.body.includes("ประกาศเลื่อนสอบชั่วคราว"),
      "SQL injection payload: ยังคงไม่รั่วข่าว DRAFT/UNPUBLISHED ออกมา",
    );
  }

  // --- Home page: latest news + categories -----------------------------------
  {
    const { status, body } = await get("/");
    assert(status === 200, "หน้าแรก (/) ตอบ 200");
    assert(body.includes("ข่าวล่าสุด"), "หน้าแรกมีหัวข้อ \"ข่าวล่าสุด\"");
    assert(body.includes("เปิดรับสมัครสอบธรรมศึกษา ประจำปี 2568"), "หน้าแรกแสดงข่าวล่าสุดอันดับ 1 จริง");
    assert(
      !body.includes("ร่างข้อเสนอระบบสอบออนไลน์") && !body.includes("ประกาศเลื่อนสอบชั่วคราว"),
      "หน้าแรกไม่แสดงข่าว DRAFT/UNPUBLISHED ปนมาใน \"ข่าวล่าสุด\"",
    );
    assert(body.includes("หมวดหมู่ข่าว"), "หน้าแรกมีส่วน \"หมวดหมู่ข่าว\"");
    assert(body.includes("news?category=exam-notice"), "หน้าแรกมีลิงก์หมวดหมู่ที่ชี้ไปหน้า /news?category=... ถูกต้อง");
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
