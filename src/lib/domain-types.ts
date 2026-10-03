/**
 * Hand-maintained mirrors of `prisma/schema.prisma` enums, needed because
 * `@prisma/client` cannot be generated in this environment (see src/lib/db.ts).
 * Keep these in sync with schema.prisma by hand whenever an enum changes.
 */

export const USER_ROLES = [
  "SUPER_ADMIN",
  "CENTRAL_OFFICER",
  "REGIONAL_ADMIN",
  "REGISTRAR_STAFF",
  "TEACHER",
  "EXAMINER",
  "STUDENT",
  "AUDITOR",
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = [
  "PENDING_VERIFICATION",
  "PENDING_APPROVAL",
  "ACTIVE",
  "SUSPENDED",
  "REJECTED",
] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

// ตรงกับ enum `exam_type` ใน prisma/education-schema.md — ใช้ตรวจ query param
// ?examType= ในหน้า /curriculum/[program]/[level] (src/lib/curriculum.ts) ก่อน
// นำไปต่อ SQL (allowlist แทนการเชื่อ input ดิบ แม้จะ parameterized อยู่แล้วก็ตาม)
export const EXAM_TYPES = ["MULTIPLE_CHOICE", "ESSAY", "MIXED"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];

// ตรงกับ enum `exam_session_status` ใน prisma/education-schema.md
export const EXAM_SESSION_STATUSES = [
  "PLANNED",
  "REGISTRATION_OPEN",
  "REGISTRATION_CLOSED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export type ExamSessionStatus = (typeof EXAM_SESSION_STATUSES)[number];

// ตรงกับ enum `document_type` ใน prisma/exam-document-schema.md — ใช้ตรวจ query
// param ?documentType= ในหน้า /exam-bank (src/lib/exam-bank.ts) ก่อนนำไปต่อ SQL
// (allowlist แทนการเชื่อ input ดิบ แม้จะ parameterized อยู่แล้วก็ตาม)
export const DOCUMENT_TYPES = [
  "EXAM_PAPER_PRINT",
  "ANSWER_SHEET_TEMPLATE",
  "CIRCULAR",
  "STUDY_MATERIAL",
  "OTHER",
] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
