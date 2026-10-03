import { NextResponse } from "next/server";

/**
 * Health-check endpoint — foundation scaffold (P1).
 *
 * Function Specification (per requirements.md ข้อ 8 / dev-rules.md ข้อ 3):
 * - Actor: System/monitoring tooling, Guest (public, unauthenticated on purpose —
 *   load balancers / uptime monitors must reach it without a session)
 * - Input: none (GET, no params/body)
 * - Process: return a static status payload; no database/external calls in this
 *   foundation phase (P2+ will extend this to check DB/storage connectivity)
 * - Output: JSON { status, phase, environment, timestamp }
 * - Permission: Public — deliberately exposes no Restricted/Secret data
 *   (see data-policy.md ข้อ 2 data classification)
 * - Validation: none required (no input to validate)
 * - Error State: none expected; any unhandled exception falls through to
 *   Next.js's default 500 response, which — per dev-rules.md ข้อ 7 — must never
 *   leak stack traces to the client in production
 * - Audit: not logged — read-only, no data access, carries no PII (consistent
 *   with the "no audit needed" read-only pattern used for F1.1 in user-flows.md)
 * - Acceptance Criteria:
 *   AC1: GET /api/health returns HTTP 200 with `{ status: "ok" }`
 *   AC2: response body never contains secret/PII values, only non-sensitive
 *        static fields
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    phase: "P1 — Project Foundation",
    environment: process.env.NODE_ENV ?? "unknown",
    timestamp: new Date().toISOString(),
  });
}
