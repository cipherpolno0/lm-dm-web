/**
 * Public zone navigation — path/label ตรงกับ sitemap.md ข้อ 3 (Public Zone) ทุก
 * ประการ เพื่อให้ Header/Footer อ้างอิงแหล่งเดียวกัน ไม่ hardcode ซ้ำ
 *
 * หมายเหตุสำคัญ (โปร่งใส — ดู prisma/design-system.md หัวข้อ "ขอบเขตที่ตัดออก"):
 * path ส่วนใหญ่ด้านล่างยังไม่มีหน้าเพจจริงรองรับ (งาน "แทนที่หน้าแรกชั่วคราวด้วย
 * หน้า Public จริงตาม sitemap.md" ยังไม่เริ่ม — ดู README.md งานถัดไป) การคลิกลิงก์
 * เหล่านี้ในตอนนี้จะเจอหน้า not-found.tsx ใหม่ของงานนี้ (ถือเป็นพฤติกรรมที่ถูกต้อง
 * ชั่วคราว ไม่ใช่ลิงก์เสีย/บั๊ก) เมื่อ P4 build หน้าเหล่านี้จริง nav นี้จะใช้ได้ทันที
 * โดยไม่ต้องแก้ไข
 */
export interface NavItem {
  href: string;
  label: string;
}

export const PUBLIC_NAV_ITEMS: NavItem[] = [
  { href: "/", label: "หน้าแรก" },
  { href: "/news", label: "ข่าว" },
  { href: "/curriculum", label: "หลักสูตร" },
  { href: "/exam-bank", label: "คลังข้อสอบ" },
  { href: "/library", label: "ห้องสมุด" },
  { href: "/exam-schedule", label: "ตารางสอบ" },
  { href: "/about", label: "เกี่ยวกับ" },
];

export const FOOTER_LINK_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: "ลิงก์ด่วน",
    items: PUBLIC_NAV_ITEMS,
  },
  {
    title: "นโยบาย",
    items: [
      { href: "/privacy", label: "นโยบายความเป็นส่วนตัว" },
      { href: "/terms", label: "ข้อกำหนดการใช้งาน" },
      { href: "/contact", label: "ติดต่อเรา" },
    ],
  },
];
