/**
 * Decision policy for the LiveRefresh health-gated poll. A background
 * router.refresh() re-renders the whole server page, and if that render fails
 * Next.js replaces the page the user is reading with the error boundary. So
 * before each poll tick the client probes a cheap health endpoint and only
 * refreshes when the data service answers:
 *
 * - 2xx        → healthy: refresh as normal.
 * - 401 / 403  → the session is gone, not the DB: refresh anyway so the
 *                layout guard can route to /signin (skipping would silently
 *                freeze a signed-out tab forever).
 * - anything else (5xx, timeouts, network errors, weird proxy statuses) →
 *                fail safe: keep the current page, mark the badge stale, try
 *                again next tick. Never risk replacing a working page.
 */

export type ProbeDecision = { refresh: boolean; stale: boolean };

export type AuthProbeResult = "ok" | "signed_out" | "unavailable";

/**
 * Distinguish "the user is signed out" from "the auth service is having a
 * moment" on the probe's auth.getUser() result. The difference matters:
 * signed_out → the client refreshes so the layout can redirect to /signin;
 * unavailable → the client HOLDS the page (a GoTrue blip must never yank
 * every open tab of every valid user to /signin mid-shift).
 */
export function classifyAuthProbe(
  user: { id: string } | null,
  error: { name?: string; status?: number } | null,
): AuthProbeResult {
  if (user) return "ok";
  if (!error) return "signed_out";
  if (error.name === "AuthSessionMissingError") return "signed_out";
  // 400/401/403 = the token itself is missing/invalid/expired → signed out.
  // Everything else (5xx, network status 0, unknown) = service trouble.
  if (error.status === 400 || error.status === 401 || error.status === 403) return "signed_out";
  return "unavailable";
}

export function decideFromProbe(status: number | "network-error"): ProbeDecision {
  if (status === "network-error") return { refresh: false, stale: true };
  if (status >= 200 && status < 300) return { refresh: true, stale: false };
  if (status === 401 || status === 403) return { refresh: true, stale: false };
  return { refresh: false, stale: true };
}
