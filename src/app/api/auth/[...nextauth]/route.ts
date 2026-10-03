import { handlers } from "@/auth";

/**
 * Auth.js v5 catch-all route handler — handles /api/auth/signin,
 * /api/auth/callback/credentials, /api/auth/session, /api/auth/signout, etc.
 * All actual login logic lives in the Credentials provider's authorize()
 * callback in src/auth.ts; this file only wires Auth.js into the App Router.
 */
export const { GET, POST } = handlers;
