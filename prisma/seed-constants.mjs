/**
 * Shared constants between prisma/seed.ts and prisma/test-auth-login.mjs.
 * Plain .mjs (not .ts) so it can be imported without a TypeScript loader from
 * both the tsx-run seed script and the plain-Node test script.
 */

// รหัสผ่านทดสอบ/dev เท่านั้น — ไม่ใช่ secret จริง (ข้อมูลสมมติตาม data-policy.md
// ข้อ 3) ใช้ร่วมกันทุกบัญชีจำลองเพื่อให้ทดสอบ login ได้ง่ายในสภาพแวดล้อม dev/test
// ห้ามใช้ค่านี้ใน staging/prod โดยเด็ดขาด
export const MOCK_USER_PASSWORD = "SanghaDev#2568";
