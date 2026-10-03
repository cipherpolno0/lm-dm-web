#!/usr/bin/env node
/**
 * test-library-pages.mjs — real end-to-end tests against a RUNNING `next dev`
 * server (http://localhost:3000) for the "สร้างห้องสมุด PDF/Download" task
 * (F8.1 ค้นหา/รายการเอกสารในห้องสมุด, F8.2 รายละเอียด+ประวัติเวอร์ชัน, และ
 * GET /api/library/[id]/download — ดู prisma/library-pages.md) ไม่ mock
 * ฐานข้อมูล/HTTP ใดๆ ใช้ `fetch` จริงกับ next dev + PostgreSQL จริงที่ seed ไว้
 * (ดู prisma/seed.ts seedDocuments()/seedCategoriesAndTags() สำหรับข้อมูลที่
 * ทดสอบนี้พึ่งพา) ใช้ Jar/loginAs() แบบเดียวกับ test-rbac-scope.mjs/
 * test-authz-guard.mjs เพื่อทดสอบ public/private access จริงผ่าน Auth.js
 * Credentials flow
 *
 * หมายเหตุสำคัญเรื่อง assertion style: ทดสอบนี้ตรวจด้วย "มี/ไม่มีข้อความ/ชื่อไฟล์
 * ของเอกสารที่รู้จัก" เสมอ ไม่ตรวจจำนวนผลลัพธ์ทั้งหมดแบบเป๊ะ (exact count) —
 * เหตุผลเดียวกับ test-exam-bank-pages.mjs (test-exam-document-domain.mjs อาจ
 * insert แถว document ทดสอบเพิ่มเติมที่ไม่ผ่าน seed.ts ถ้ารันคนละลำดับ)
 *
 * เหตุผลที่ไม่ตรวจข้อความ "เวอร์ชัน #N" ตรงๆ ในหน้ารายละเอียด: React SSR แทรก
 * comment marker คั่นระหว่างข้อความคงที่กับตัวเลขที่เป็นตัวแปร (เช่น
 * `เวอร์ชัน #<!-- -->2`) ทำให้ substring ตรงๆ ไม่ match แม้ค่าจะถูกต้อง — ตรวจจาก
 * ชื่อไฟล์ (fileName) ของแต่ละเวอร์ชันแทน ซึ่งไม่ถูกแทรก comment marker คั่น
 *
 * Prerequisites: `npm run dev` running on :3000, database migrated + seeded
 * (`node prisma/dev-migrate-verify.mjs && npm run db:seed`).
 *
 * Usage: node prisma/test-library-pages.mjs
 */
import { MOCK_USER_PASSWORD } from "./seed-constants.mjs";

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

class Jar {
  constructor() {
    this.cookies = new Map();
  }
  capture(res) {
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(";");
      const idx = pair.indexOf("=");
      this.cookies.set(pair.slice(0, idx), pair.slice(idx + 1));
    }
  }
  header() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
}

async function getCsrfToken(jar) {
  const res = await fetch(`${BASE_URL}/api/auth/csrf`, { headers: { cookie: jar.header() } });
  jar.capture(res);
  return (await res.json()).csrfToken;
}

/** Log in as one of the seeded mock users and return a Jar carrying its session cookie. */
async function loginAs(email) {
  const jar = new Jar();
  const csrfToken = await getCsrfToken(jar);
  const res = await fetch(`${BASE_URL}/api/auth/callback/credentials`, {
    method: "POST",
    redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: jar.header() },
    body: new URLSearchParams({ email, password: MOCK_USER_PASSWORD, csrfToken, json: "true" }),
  });
  jar.capture(res);
  const location = res.headers.get("location") ?? "";
  if (location.includes("error=")) {
    throw new Error(`loginAs(${email}) failed: redirected to ${location}`);
  }
  return jar;
}

async function get(path, jar) {
  const res = await fetch(`${BASE_URL}${path}`, {
    redirect: "manual",
    headers: { cookie: jar?.header() ?? "" },
  });
  const body = await res.text();
  return { status: res.status, body };
}

async function head(path, jar) {
  const res = await fetch(`${BASE_URL}${path}`, {
    redirect: "manual",
    headers: { cookie: jar?.header() ?? "" },
  });
  // consume body to avoid leaking the connection, but we only need status here
  await res.text();
  return { status: res.status };
}

// ชื่อ/id เอกสารที่ seed ไว้ใน prisma/seed.ts seedDocuments() — ใช้ยืนยัน
// visible/ไม่ visible ตลอดไฟล์นี้ (ดู prisma/seed.ts DOCUMENT/CATEGORY_NEW/TAG_NEW)
const TITLE = {
  examCircular2568: "ระเบียบการสอบธรรมศึกษาสนามหลวง 2568",
  vinayaStudyMaterial: "เอกสารประกอบการสอนวินัยมุข",
  libraryGuideMultiVersion: "คู่มือการใช้งานระบบทะเบียน",
  internalCircularPrivate: "หนังสือเวียนภายใน สำหรับเจ้าหน้าที่เท่านั้น",
  essay2567Retired: "ข้อสอบเรียงความแก้กระทู้ธรรม นักธรรมชั้นตรี ปีการศึกษา 2567 (ถอนแล้ว",
};

const ID = {
  examCircular2568: "seed_doc_exam_circular_2568",
  vinayaStudyMaterial: "seed_doc_vinaya_study_material",
  libraryGuideMultiVersion: "seed_doc_library_guide_multi_version",
  internalCircularPrivate: "seed_doc_internal_circular_private",
  essay2567Retired: "seed_doc_exampaper_essay_tri_2567_retired",
};

const CATEGORY = {
  generalKnowledge: "seed_cat_general_knowledge",
  internalCirculars: "seed_cat_internal_circulars",
};

const TAG_DS2568 = "ธรรมศึกษา 2568";

async function main() {
  console.log(`Testing library pages against ${BASE_URL}\n`);

  const studentJar = await loginAs("mock.student@sangha-system.invalid");

  // --- F8.1: base list — Guest sees only public+APPROVED ---------------------
  {
    const { status, body } = await get("/library");
    assert(status === 200, "/library (Guest) ตอบ 200");
    assert(
      body.includes(TITLE.examCircular2568) && body.includes(TITLE.libraryGuideMultiVersion),
      "Guest เห็นเอกสารสาธารณะ (isPublic=true) ที่มีเวอร์ชัน APPROVED",
    );
    assert(
      !body.includes(TITLE.vinayaStudyMaterial),
      "Guest ไม่เห็นเอกสารที่มีแต่เวอร์ชัน DRAFT (deny-by-default) — เหมือน exam-bank",
    );
    assert(
      !body.includes(TITLE.essay2567Retired),
      "Guest ไม่เห็นเอกสารที่ถูกถอดแล้ว (RETIRED, ไม่มีเวอร์ชัน APPROVED เลย)",
    );
    assert(
      !body.includes(TITLE.internalCircularPrivate),
      "Guest ไม่เห็นเอกสารภายใน (isPublic=false) — F8 AC1: public/private access",
    );
  }

  // --- F8.1: authenticated user sees public + private -------------------------
  {
    const { status, body } = await get("/library", studentJar);
    assert(status === 200, "/library (STUDENT ที่ login แล้ว) ตอบ 200");
    assert(
      body.includes(TITLE.internalCircularPrivate),
      "ผู้ใช้ที่ login แล้ว (ทดสอบด้วย STUDENT ซึ่งมี FILES-module scope จำกัดสุด) เห็นเอกสารภายในด้วย — F8 AC1",
    );
    assert(
      body.includes(TITLE.examCircular2568),
      "ผู้ใช้ที่ login แล้วยังคงเห็นเอกสารสาธารณะตามปกติ",
    );
    assert(
      !body.includes(TITLE.vinayaStudyMaterial) && !body.includes(TITLE.essay2567Retired),
      "login แล้วก็ยังไม่เห็นเอกสาร DRAFT/RETIRED (public/private เป็นเงื่อนไข *เพิ่มเติม* จาก deny-by-default เดิม ไม่ใช่แทนที่)",
    );
  }

  // --- F8.1: category filter ----------------------------------------------
  {
    const guestFiltered = await get(`/library?category=${CATEGORY.internalCirculars}`);
    assert(
      guestFiltered.status === 200 && !guestFiltered.body.includes(TITLE.internalCircularPrivate),
      "Guest กรองหมวดหมู่ 'หนังสือเวียนภายใน': ไม่เห็นเอกสารในหมวดนี้ (ตัวเอกสารเป็น private)",
    );
    const authFiltered = await get(`/library?category=${CATEGORY.internalCirculars}`, studentJar);
    assert(
      authFiltered.status === 200 && authFiltered.body.includes(TITLE.internalCircularPrivate),
      "ผู้ใช้ที่ login แล้วกรองหมวดหมู่เดียวกัน: เห็นเอกสารนั้น",
    );
    const generalKnowledge = await get(`/library?category=${CATEGORY.generalKnowledge}`);
    assert(
      generalKnowledge.status === 200 && generalKnowledge.body.includes(TITLE.libraryGuideMultiVersion),
      "กรองหมวดหมู่ 'ความรู้ทั่วไป': เห็นคู่มือที่ผูกหมวดนี้ไว้",
    );
    const unknownCategory = await get("/library?category=does-not-exist");
    assert(unknownCategory.status === 200, "category id ที่ไม่มีอยู่จริง: ไม่ error ถือว่าไม่ได้กรอง");
  }

  // --- F8.1: tag filter (ภาษาไทยใน query param) -----------------------------
  {
    const { status, body } = await get(`/library?tag=${encodeURIComponent(TAG_DS2568)}`);
    assert(status === 200, `กรองแท็ก '${TAG_DS2568}': ตอบ 200`);
    assert(
      body.includes(TITLE.examCircular2568) && body.includes(TITLE.libraryGuideMultiVersion),
      "กรองแท็กภาษาไทย: เห็นเอกสารทั้งสองที่ผูกแท็กนี้ไว้",
    );
    const unknownTag = await get(`/library?tag=${encodeURIComponent("ไม่มีแท็กนี้จริง")}`);
    assert(unknownTag.status === 200, "tag ที่ไม่มีอยู่จริง: ไม่ error ถือว่าไม่ได้กรอง");
  }

  // --- F8.1: documentType filter --------------------------------------------
  {
    const { status, body } = await get("/library?documentType=STUDY_MATERIAL");
    assert(status === 200, "กรอง documentType=STUDY_MATERIAL: ตอบ 200 (ไม่ error จาก enum-cast)");
    assert(
      body.includes(TITLE.libraryGuideMultiVersion) && !body.includes(TITLE.vinayaStudyMaterial),
      "กรอง documentType=STUDY_MATERIAL: เห็นเฉพาะฉบับที่อนุมัติแล้ว ไม่เห็นฉบับ DRAFT",
    );
    const injection = await get("/library?documentType=%27%3B%20DROP%20TABLE%20documents%3B--");
    assert(injection.status === 200, "documentType แบบ SQL injection: ไม่ error (allowlist ปฏิเสธก่อนถึง SQL)");
  }

  // --- F8.1: full-text search (title ILIKE) ---------------------------------
  {
    const { status, body } = await get("/library?q=ธรรม");
    assert(status === 200, "query ภาษาไทย 'ธรรม': ตอบ 200");
    assert(
      body.includes(TITLE.examCircular2568),
      "query ภาษาไทย 'ธรรม': พบเอกสารสาธารณะที่มีคำนี้ในชื่อเรื่อง",
    );
    const noMatch = await get("/library?q=ไม่มีเอกสารใดตรงคำนี้แน่นอน");
    assert(
      noMatch.status === 200 && !noMatch.body.includes(TITLE.examCircular2568),
      "query ที่ไม่ตรงเอกสารใดเลย: แสดง EmptyState ไม่ error",
    );
    const sqlInjection = await get("/library?q=x%27%3B%20DROP%20TABLE%20documents%3B--");
    assert(sqlInjection.status === 200, "q แบบพยายาม SQL injection: ไม่ error (parameterized query)");
    const stillWorks = await get("/library");
    assert(
      stillWorks.status === 200 && stillWorks.body.includes(TITLE.examCircular2568),
      "หลังพยายาม SQL injection: ตาราง documents ยังอยู่ครบ ไม่ถูกกระทบ",
    );
  }

  // --- F8.1: pagination edge cases ------------------------------------------
  {
    const zero = await get("/library?page=0");
    assert(zero.status === 200, "page=0: ไม่ error ใช้ค่าเริ่มต้นหน้า 1");
    const negative = await get("/library?page=-5");
    assert(negative.status === 200, "page=-5: ไม่ error ใช้ค่าเริ่มต้นหน้า 1");
    const nonNumeric = await get("/library?page=abc");
    assert(nonNumeric.status === 200, "page=abc: ไม่ error ใช้ค่าเริ่มต้นหน้า 1");
    const tooFar = await get("/library?page=999");
    assert(tooFar.status === 200, "page=999 (เกินหน้าสุดท้ายมาก): clamp กลับมาหน้าสุดท้าย ไม่ error");
  }

  // --- F8.2: detail page — public/private access ----------------------------
  {
    const guestPublic = await get(`/library/${ID.libraryGuideMultiVersion}`);
    assert(guestPublic.status === 200, "Guest เปิดหน้ารายละเอียดเอกสารสาธารณะ: ตอบ 200");

    const guestPrivate = await get(`/library/${ID.internalCircularPrivate}`);
    assert(
      guestPrivate.status === 404,
      "Guest เปิดหน้ารายละเอียดเอกสารภายใน (isPublic=false): ตอบ 404 — F8 AC1",
    );

    const authPrivate = await get(`/library/${ID.internalCircularPrivate}`, studentJar);
    assert(
      authPrivate.status === 200 && authPrivate.body.includes(TITLE.internalCircularPrivate),
      "ผู้ใช้ที่ login แล้ว (STUDENT) เปิดหน้ารายละเอียดเอกสารภายในเดียวกัน: ตอบ 200",
    );

    const draftDetail = await get(`/library/${ID.vinayaStudyMaterial}`, studentJar);
    assert(
      draftDetail.status === 404,
      "เอกสาร DRAFT-only ไม่มีเวอร์ชัน APPROVED เลย: 404 แม้ login แล้วก็ตาม (deny-by-default เดิมไม่เปลี่ยน)",
    );

    const retiredDetail = await get(`/library/${ID.essay2567Retired}`, studentJar);
    assert(retiredDetail.status === 404, "เอกสาร RETIRED-only: 404 แม้ login แล้วก็ตาม");

    const notFoundDetail = await get("/library/does-not-exist-at-all");
    assert(notFoundDetail.status === 404, "id ที่ไม่มีอยู่จริงเลย: 404 (ผลลัพธ์เดียวกับ private/DRAFT/RETIRED)");
  }

  // --- F8.2: version history — แสดงทุกเวอร์ชันที่ APPROVED -------------------
  {
    const { status, body } = await get(`/library/${ID.libraryGuideMultiVersion}`);
    assert(status === 200, "หน้ารายละเอียดเอกสารที่มี 2 เวอร์ชัน APPROVED: ตอบ 200");
    assert(
      body.includes("library-guide-v1.pdf") && body.includes("library-guide-v2.pdf"),
      "แสดงประวัติเวอร์ชันครบทั้ง 2 เวอร์ชัน (ไม่ใช่แค่เวอร์ชันล่าสุดเหมือน exam-bank) — F8 AC2",
    );
    assert(
      body.includes("1 ตุลาคม 2567") && body.includes("1 มิถุนายน 2568"),
      "แสดงวันที่อนุมัติของแต่ละเวอร์ชันถูกต้องแยกกัน",
    );
  }

  // --- Download endpoint: GET /api/library/[id]/download ---------------------
  {
    const guestPrivateDownload = await head(`/api/library/${ID.internalCircularPrivate}/download`);
    assert(
      guestPrivateDownload.status === 404,
      "ดาวน์โหลดเอกสารภายในโดย Guest: 404 not_found (ป้องกันการรู้ว่ามีเอกสารนี้อยู่จริง) — F8 AC1",
    );

    const authPrivateDownload = await head(`/api/library/${ID.internalCircularPrivate}/download`, studentJar);
    assert(
      authPrivateDownload.status === 503,
      "ดาวน์โหลดเอกสารภายในโดยผู้ใช้ที่ login แล้ว: ผ่านสิทธิ์แล้วแต่ไฟล์ยังไม่พร้อม -> 503 file_unavailable ไม่ใช่ 404",
    );

    const guestPublicDownload = await head(`/api/library/${ID.libraryGuideMultiVersion}/download`);
    assert(
      guestPublicDownload.status === 503,
      "ดาวน์โหลดเอกสารสาธารณะโดย Guest: ผ่านสิทธิ์แล้วแต่ไฟล์ยังไม่พร้อม -> 503 file_unavailable",
    );

    const nonExistentDownload = await head("/api/library/does-not-exist-at-all/download");
    assert(nonExistentDownload.status === 404, "ดาวน์โหลด id ที่ไม่มีอยู่จริง: 404");

    const draftDownload = await head(`/api/library/${ID.vinayaStudyMaterial}/download`, studentJar);
    assert(
      draftDownload.status === 404,
      "ดาวน์โหลดเอกสาร DRAFT-only (ไม่มีเวอร์ชัน APPROVED เลย): 404 แม้ login แล้วก็ตาม",
    );

    // version query param — ระบุเวอร์ชันที่ APPROVED จริง
    const specificVersion = await head(`/api/library/${ID.libraryGuideMultiVersion}/download?version=1`);
    assert(
      specificVersion.status === 503,
      "ดาวน์โหลดเวอร์ชัน #1 ที่ระบุเจาะจง (APPROVED จริง): ผ่านสิทธิ์ -> 503 file_unavailable (ไม่ใช่ 404) — F8 AC3",
    );

    const nonExistentVersion = await head(`/api/library/${ID.libraryGuideMultiVersion}/download?version=999`);
    assert(
      nonExistentVersion.status === 404,
      "ดาวน์โหลดเวอร์ชันที่ไม่มีอยู่จริง (version=999): 404",
    );

    const invalidVersion = await head(`/api/library/${ID.libraryGuideMultiVersion}/download?version=abc`);
    assert(
      invalidVersion.status === 503,
      "version query param ที่ไม่ใช่ตัวเลข: ถือว่าไม่ได้ระบุ ใช้เวอร์ชันล่าสุดที่ APPROVED แทน (503 เหมือนไม่ระบุ version) — F8 AC4",
    );

    const negativeVersion = await head(`/api/library/${ID.libraryGuideMultiVersion}/download?version=-1`);
    assert(
      negativeVersion.status === 503,
      "version query param ติดลบ: ถือว่าไม่ได้ระบุ ใช้เวอร์ชันล่าสุดที่ APPROVED แทน",
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
