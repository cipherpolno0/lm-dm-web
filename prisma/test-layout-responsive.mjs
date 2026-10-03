// prisma/test-layout-responsive.mjs
//
// ทดสอบจริงผ่าน browser จริง (Playwright + Chromium) ว่า Design System + Layout
// (P4 — Header/Nav/Breadcrumbs/Footer/Cards/Tables/Forms/Empty/Loading/Error
// states) ไม่มี horizontal overflow ที่ความกว้างจอ 375/768/1024/1440px ตาม
// "วิธีตรวจสอบ" ที่ระบุในงานนี้ — รันจริงกับ `next dev` ที่ localhost:3000
//
// วิธีรัน: node prisma/test-layout-responsive.mjs
// Pre-requisite: `next dev` ต้องรันอยู่ที่ :3000 แล้ว (ดู README.md)

import { chromium } from "playwright";
import { MOCK_USER_PASSWORD } from "./seed-constants.mjs";

const BASE_URL = "http://localhost:3000";
const VIEWPORTS = [
  { width: 375, height: 812, label: "375 (มือถือ)" },
  { width: 768, height: 1024, label: "768 (แท็บเล็ต)" },
  { width: 1024, height: 768, label: "1024 (แท็บเล็ตแนวนอน/เดสก์ท็อปเล็ก)" },
  { width: 1440, height: 900, label: "1440 (เดสก์ท็อป)" },
];

let passed = 0;
let failed = 0;
const failures = [];

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.log(`  [FAIL] ${message}`);
  }
}

async function checkNoHorizontalOverflow(page, viewport, pageLabel) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  const overflow = scrollWidth - clientWidth;
  assert(
    overflow <= 0,
    `${pageLabel} @ ${viewport.label}: ไม่มี horizontal overflow (scrollWidth=${scrollWidth}, clientWidth=${clientWidth}, overflow=${overflow}px)`,
  );

  // ตรวจเพิ่มเติม: ไม่มี element ใดล้นขวาของ viewport เกิน 1px (ป้องกัน
  // เคสที่ document.scrollWidth บังเอิญพอดีแต่บาง element ยังล้นจริง) — ยกเว้น
  // element ที่อยู่ภายใน ancestor ที่ตั้งใจให้ scroll แนวนอนได้เอง (overflow-x:
  // auto/scroll เช่น wrapper ของ <Table>) เพราะนั่นคือ pattern ที่ถูกต้องสำหรับ
  // ตารางบนจอแคบ ไม่ใช่ horizontal overflow ของทั้งหน้า
  const widestOverflowingSelector = await page.evaluate((vw) => {
    function hasScrollableAncestor(el) {
      let node = el.parentElement;
      while (node && node !== document.body) {
        const style = getComputedStyle(node);
        if (style.overflowX === "auto" || style.overflowX === "scroll") return true;
        node = node.parentElement;
      }
      return false;
    }
    let worst = null;
    let worstRight = vw;
    for (const el of document.body.querySelectorAll("*")) {
      const rect = el.getBoundingClientRect();
      if (rect.right > worstRight + 1 && !hasScrollableAncestor(el)) {
        worstRight = rect.right;
        worst = el.tagName + (el.className ? "." + String(el.className).split(" ")[0] : "");
      }
    }
    return worst;
  }, viewport.width);
  assert(
    widestOverflowingSelector === null,
    `${pageLabel} @ ${viewport.label}: ไม่มี element ใดล้นขวาของ viewport เกิน 1px (element ที่ล้นมากสุดถ้ามี: ${widestOverflowingSelector})`,
  );
}

async function main() {
  console.log(`Testing against ${BASE_URL}\n`);

  // ไม่ระบุ executablePath ตรงๆ (เลข build ของ chromium-XXXX เปลี่ยนได้ตามเวอร์ชัน
  // Playwright) — PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers (ตั้งไว้ใน environment
  // นี้แล้ว) ทำให้ chromium.launch() หา browser ที่ preinstall ไว้เจอเองอัตโนมัติ
  const browser = await chromium.launch();

  try {
    // --- Part 1: หน้า public/guest (ไม่ต้องล็อกอิน) ---
    console.log("--- Part 1: Public pages (Header/Nav/Footer/Cards/Table/EmptyState) ---");
    const publicPages = [
      { path: "/", label: "หน้าแรก (/)" },
      { path: "/design-system", label: "Design System (/design-system)" },
      { path: "/login", label: "เข้าสู่ระบบ (/login)" },
      // เพิ่มจากงาน "สร้างหน้า Home + ข่าว/บทความ" (P4) — พิสูจน์ว่า Card grid ของ
      // รายการข่าว, search form, category badges (ที่อาจมีจำนวนมาก wrap หลาย
      // บรรทัด) และเนื้อหาข่าวยาวๆ ในหน้ารายละเอียด ไม่ทำให้เกิด horizontal
      // overflow เช่นเดียวกับหน้า public อื่น — ดู prisma/news-articles.md
      { path: "/news", label: "ข่าวและประกาศ (/news)" },
      { path: "/news?category=exam-notice", label: "ข่าวและประกาศ กรองหมวดหมู่ (/news?category=exam-notice)" },
      { path: "/news/exam-registration-2568", label: "รายละเอียดข่าว (/news/exam-registration-2568)" },
      { path: "/news/this-slug-does-not-exist", label: "404 ข่าวไม่พบ (/news/[slug])", expectedStatus: 404 },
      // เพิ่มจากงาน "สร้างหน้า นักธรรม/ธรรมศึกษา/บาลี" (P4) — พิสูจน์ว่า
      // breadcrumb trail ที่ยาวขึ้นตามความลึกของการ browse (หน้าแรก > หลักสูตร >
      // สาย > ระดับชั้น > วิชา), Card grid ของระดับชั้น/วิชา, ตัวกรอง examType/
      // year (Badge แถวยาว), และ EmptyState ของระดับชั้น/สายที่ยังไม่มีหลักสูตร
      // ไม่ทำให้เกิด horizontal overflow เช่นเดียวกับหน้า public อื่น — ดู
      // prisma/curriculum-pages.md
      { path: "/curriculum", label: "หลักสูตร (/curriculum)" },
      { path: "/curriculum/nak-tham", label: "ระดับชั้นของนักธรรม (/curriculum/nak-tham)" },
      { path: "/curriculum/nak-tham/tri", label: "รายวิชาของนักธรรมชั้นตรี (/curriculum/nak-tham/tri)" },
      {
        path: "/curriculum/nak-tham/tri/dhammavibhaga",
        label: "รายละเอียดวิชาธรรมวิภาค (breadcrumb ลึก 4 ชั้น)",
      },
      {
        path: "/curriculum/dhamma-studies/ds-tri/essay-dhamma?year=2568",
        label: "ตารางสอบวิชาเรียงความ กรองปี 2568 (มีรอบสอบ+สนามสอบจริง)",
      },
      {
        path: "/curriculum/nak-tham/tho",
        label: "EmptyState ระดับชั้นที่ยังไม่มีวิชาในหลักสูตร (/curriculum/nak-tham/tho)",
      },
      {
        path: "/curriculum/this-program-does-not-exist",
        label: "404 สายการศึกษาไม่พบ (/curriculum/[program])",
        expectedStatus: 404,
      },
      // เพิ่มจากงาน "สร้างคลังข้อสอบ + Search" (P4) — พิสูจน์ว่าฟอร์มตัวกรอง 5 มิติ
      // (หลักสูตร/ชั้น/วิชา/ปี/ประเภทเอกสาร ในแถว grid เดียว) + search box, Card
      // grid ของผลลัพธ์ (Badge ประเภทเอกสาร/ปีการศึกษาต่อใบ), และหน้ารายละเอียด
      // เอกสาร ไม่ทำให้เกิด horizontal overflow เช่นเดียวกับหน้า public อื่น — ดู
      // prisma/exam-bank-pages.md
      { path: "/exam-bank", label: "คลังข้อสอบ (/exam-bank)" },
      {
        path: "/exam-bank?program=nak-tham&level=tri&documentType=EXAM_PAPER_PRINT",
        label: "คลังข้อสอบ กรองหลายมิติพร้อมกัน (/exam-bank?program=...&level=...&documentType=...)",
      },
      {
        path: `/exam-bank/${"seed_doc_exampaper_dhammavibhaga_tri_2567"}`,
        label: "รายละเอียดเอกสารในคลังข้อสอบ (/exam-bank/[id])",
      },
      {
        path: `/exam-bank?q=${encodeURIComponent("ไม่มีเอกสารใดตรงคำนี้แน่นอน")}`,
        label: "EmptyState คลังข้อสอบเมื่อค้นหาไม่พบ (/exam-bank?q=...)",
      },
      {
        path: "/exam-bank/this-document-id-does-not-exist",
        label: "404 เอกสารไม่พบ (/exam-bank/[id])",
        expectedStatus: 404,
      },
      // เพิ่มจากงาน "สร้างห้องสมุด PDF/Download" (P4) — พิสูจน์ว่าฟอร์มตัวกรอง 3 มิติ
      // (หมวดหมู่/แท็ก/ประเภทเอกสาร) + Badge สถานะ public/private ต่อใบ และหน้า
      // รายละเอียดที่มีรายการ "ประวัติเวอร์ชัน" (อาจมีมากกว่า 1 แถว) ไม่ทำให้เกิด
      // horizontal overflow เช่นเดียวกับหน้า public อื่น — ดู prisma/library-pages.md
      { path: "/library", label: "ห้องสมุด (/library)" },
      {
        path: `/library?category=seed_cat_general_knowledge&documentType=STUDY_MATERIAL`,
        label: "ห้องสมุด กรองหลายมิติพร้อมกัน (/library?category=...&documentType=...)",
      },
      {
        path: `/library/${"seed_doc_library_guide_multi_version"}`,
        label: "รายละเอียดเอกสารในห้องสมุด พร้อมประวัติ 2 เวอร์ชัน (/library/[id])",
      },
      {
        path: `/library?q=${encodeURIComponent("ไม่มีเอกสารใดตรงคำนี้แน่นอน")}`,
        label: "EmptyState ห้องสมุดเมื่อค้นหาไม่พบ (/library?q=...)",
      },
      {
        path: "/library/this-document-id-does-not-exist",
        label: "404 เอกสารไม่พบ (/library/[id])",
        expectedStatus: 404,
      },
      { path: "/this-page-does-not-exist", label: "404 (not-found.tsx)", expectedStatus: 404 },
    ];

    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();
      for (const p of publicPages) {
        const response = await page.goto(`${BASE_URL}${p.path}`, { waitUntil: "networkidle" });
        const expected = p.expectedStatus ?? 200;
        assert(
          response.status() === expected,
          `${p.label} @ ${viewport.label}: ตอบ HTTP ${expected} จริง`,
        );
        await checkNoHorizontalOverflow(page, viewport, p.label);
      }
      await context.close();
    }

    // --- Part 2: หน้า protected (/dashboard) หลังล็อกอินจริงผ่าน UI form ---
    console.log("\n--- Part 2: Protected page after real UI login (/dashboard) ---");
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();

      await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
      await page.getByLabel("อีเมล").fill("mock.student@sangha-system.invalid");
      await page.getByLabel("รหัสผ่าน").fill(MOCK_USER_PASSWORD);
      await Promise.all([
        page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 10_000 }),
        page.getByRole("button", { name: "เข้าสู่ระบบ" }).click(),
      ]);

      assert(page.url() === `${BASE_URL}/dashboard`, `เข้าสู่ระบบจริงผ่าน UI form สำเร็จ แล้ว redirect ไป /dashboard @ ${viewport.label}`);
      await checkNoHorizontalOverflow(page, viewport, "แดชบอร์ด (/dashboard, หลังล็อกอินจริง)");

      // ตรวจว่า Header เปลี่ยนเป็นสถานะ "ล็อกอินแล้ว" จริง (ปุ่มแดชบอร์ดแทนปุ่มเข้าสู่ระบบ)
      // — mobile viewport ปุ่มอยู่ใน Sheet (ต้องเปิดเมนูก่อน), desktop เห็นตรงๆ
      if (viewport.width < 768) {
        await page.getByRole("button", { name: "เปิดเมนู" }).click();
        // รอ transition ของ Sheet (slide-in, data-[state=open]:duration-500) ให้
        // นิ่งก่อนวัด — วัดกลางคันขณะ translateX ยังไม่ถึง 0 จะเจอ false positive
        // (element ดูเหมือนล้นขวา ทั้งที่ตำแหน่งสุดท้ายหลัง animation จบถูกต้อง)
        await page.waitForTimeout(600);
        const loggedInLink = page.getByRole("link", { name: /แดชบอร์ด/ });
        assert(await loggedInLink.count() > 0, `Header (มือถือ, เมนูเปิด) แสดงลิงก์ "แดชบอร์ด" หลังล็อกอิน @ ${viewport.label}`);
        await checkNoHorizontalOverflow(page, viewport, "แดชบอร์ด (เมนูมือถือเปิดอยู่)");
      } else {
        const loggedInLink = page.getByRole("link", { name: "แดชบอร์ด" });
        assert(await loggedInLink.count() > 0, `Header (เดสก์ท็อป) แสดงลิงก์ "แดชบอร์ด" หลังล็อกอิน @ ${viewport.label}`);
      }

      await context.close();
    }

    // --- Part 3: Admin Zone (/admin) หลังล็อกอินจริงผ่าน UI form (งาน "สร้าง Admin
    // Dashboard Shell", Phase P5 Admin & CMS) — พิสูจน์ว่า sidebar สองคอลัมน์บน
    // เดสก์ท็อป, แถบบน+Sheet drawer บนมือถือ, grid การ์ด KPI (1/2/3 คอลัมน์ตามความ
    // กว้างจอ), และรายการ "กิจกรรมล่าสุด" ไม่ทำให้เกิด horizontal overflow เช่นเดียวกับ
    // หน้าอื่น — ใช้ mock.super.admin (ต่างจาก Part 2 ที่ใช้ mock.student เพราะ /admin
    // ต้องมี ADMIN:read ซึ่ง STUDENT ไม่มี — ดู prisma/admin-dashboard.md)
    console.log("\n--- Part 3: Admin Zone (/admin) after real UI login as SUPER_ADMIN ---");
    for (const viewport of VIEWPORTS) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
      const page = await context.newPage();

      await page.goto(`${BASE_URL}/login`, { waitUntil: "networkidle" });
      await page.getByLabel("อีเมล").fill("mock.super.admin@sangha-system.invalid");
      await page.getByLabel("รหัสผ่าน").fill(MOCK_USER_PASSWORD);
      await Promise.all([
        page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 10_000 }),
        page.getByRole("button", { name: "เข้าสู่ระบบ" }).click(),
      ]);

      await page.goto(`${BASE_URL}/admin`, { waitUntil: "networkidle" });
      assert(page.url() === `${BASE_URL}/admin`, `SUPER_ADMIN เข้า /admin ได้จริง (ไม่ถูก redirect) @ ${viewport.label}`);
      await checkNoHorizontalOverflow(page, viewport, "Admin Dashboard (/admin)");

      // sidebar: มือถือ/แท็บเล็ตอยู่ใน Sheet (ต้องเปิดเมนูผู้ดูแลระบบก่อนถึงจะเห็นลิงก์),
      // เดสก์ท็อปเห็น sidebar คอลัมน์ซ้ายตรงๆ โดยไม่ต้องเปิดอะไร
      if (viewport.width < 768) {
        await page.getByRole("button", { name: "เปิดเมนูผู้ดูแลระบบ" }).click();
        await page.waitForTimeout(600);
        const registryLink = page.getByRole("link", { name: "ทะเบียนคณะสงฆ์" });
        assert(await registryLink.count() > 0, `Admin Sidebar (มือถือ, เมนูเปิด) แสดงลิงก์ module "ทะเบียนคณะสงฆ์" @ ${viewport.label}`);
        await checkNoHorizontalOverflow(page, viewport, "Admin Dashboard (เมนูผู้ดูแลระบบเปิดอยู่)");
      } else {
        const registryLink = page.getByRole("link", { name: "ทะเบียนคณะสงฆ์" });
        assert(await registryLink.count() > 0, `Admin Sidebar (เดสก์ท็อป) แสดงลิงก์ module "ทะเบียนคณะสงฆ์" ตรงๆ โดยไม่ต้องเปิดเมนู @ ${viewport.label}`);
      }

      // KPI mock cards + recent activity — เนื้อหาหลักของหน้า ต้องไม่ล้นเช่นกัน
      assert(
        (await page.getByText("ข้อมูลตัวอย่าง").count()) > 0,
        `แสดง badge "ข้อมูลตัวอย่าง" บนการ์ด KPI mock อย่างน้อยหนึ่งใบ @ ${viewport.label}`,
      );
      assert(
        (await page.getByText("กิจกรรมล่าสุด").count()) > 0,
        `แสดงหัวข้อ "กิจกรรมล่าสุด" (recent activity, ข้อมูลจริงจาก audit_logs) @ ${viewport.label}`,
      );

      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log("\nFailures:");
    for (const f of failures) console.log(`  - ${f}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("Test run crashed:", err);
  process.exit(1);
});
