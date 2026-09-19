/**
 * DEMO MODE: this build only ever runs as a public demo (`DEMO_MODE=true`)
 * with invented data and NO external side effects. Everything demo-specific
 * lives in lib/demo/:
 *
 *   mode.ts       the switches (this file)
 *   guard.ts      the mutation allowlist every server action goes through
 *   pm-api.ts     the simulated project-management API (HTTP port + login)
 *   rate-limit.ts server-side limits on batch creation
 *   email.ts      the email gate, pinned to "off"
 *
 * What demo mode means:
 *   - Auth:   the sign-in page offers "Enter demo", which signs the seeded
 *             demo user in server-side. There is no other way in.
 *   - PM API: approvals go through the same HTTP port the real integration
 *             uses, but the implementation behind it is simulated. No network
 *             call to any project-management system exists in this codebase.
 *   - Email:  nothing is ever sent; there is no transport.
 *   - Writes: visitors share one account, so only approve / bulk approve /
 *             batch resume + retry (and their audit rows) can change data.
 */

type Env = Record<string, string | undefined>;

export const DEMO_USER_EMAIL = "demo@example.com";

export const DEMO_BANNER_TEXT =
  "Demo data. Every person, team, client and number here is invented. Nothing is sent and nothing reaches a real system. Data resets nightly.";

export function isDemoMode(env: Env = process.env): boolean {
  return (env.DEMO_MODE ?? "").trim().toLowerCase() === "true";
}

/**
 * DEMO_AUTH_BYPASS_FOR_LOCAL_TESTS lets the app run against a local Postgres +
 * PostgREST stack that has no Auth service, by treating every request as the
 * demo user. It is REFUSED whenever the process looks like a deployment:
 * NODE_ENV=production, or any VERCEL* variable in the environment.
 */
export function authBypassEnabled(env: Env = process.env): boolean {
  if (env.DEMO_AUTH_BYPASS_FOR_LOCAL_TESTS !== "true") return false;
  if (env.NODE_ENV === "production") return false;
  if (Object.keys(env).some((k) => k.startsWith("VERCEL") && env[k])) return false;
  return isDemoMode(env);
}

/** Why a requested bypass is being ignored, for a startup log line. */
export function bypassRefusedReason(env: Env = process.env): string | null {
  if (env.DEMO_AUTH_BYPASS_FOR_LOCAL_TESTS !== "true") return null;
  if (authBypassEnabled(env)) return null;
  if (env.NODE_ENV === "production") return "DEMO_AUTH_BYPASS_FOR_LOCAL_TESTS is ignored when NODE_ENV=production.";
  if (Object.keys(env).some((k) => k.startsWith("VERCEL") && env[k])) return "DEMO_AUTH_BYPASS_FOR_LOCAL_TESTS is ignored on Vercel.";
  return "DEMO_AUTH_BYPASS_FOR_LOCAL_TESTS only works together with DEMO_MODE=true.";
}
