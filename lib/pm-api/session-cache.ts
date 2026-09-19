import type { PmApiSession } from "./login";
import { decodeExpMs } from "./jwt";

// Best-effort, in-process cache of a user's the PM API session so a bulk approve
// (which the client sends as many 25-report chunks) logs in to the PM API ONCE
// instead of once per chunk. This is module-level memory: on a warm serverless
// instance the sequential chunks of one bulk run reuse the same session; on a
// cold/scaled-out instance it simply logs in again (correct, just not cached).
// The idToken lives only in memory, never persisted.

type Entry = { session: PmApiSession; expMs: number };
const cache = new Map<string, Entry>();

// Re-login when a cached token has less than this much life left, so a token
// never expires mid-chunk.
export const SESSION_SAFETY_MS = 2 * 60 * 1000;

// Assumed lifetime for a token that carries no exp claim, so it is still reused
// across the chunks of one bulk run. Must exceed SESSION_SAFETY_MS.
export const SESSION_FALLBACK_TTL_MS = 10 * 60 * 1000;

/** Drop a user's cached session (e.g. after the PM API rejects it with a 401). */
export function invalidatePmApiSession(email: string): void {
  cache.delete(email);
}

/** Test-only: clear the whole cache so tests don't leak state into each other. */
export function _resetPmApiSessionCache(): void {
  cache.clear();
}

/**
 * Return a still-valid cached the PM API session for `email`, or call `login()` to
 * obtain and cache a fresh one. `nowMs` is injectable for tests. A cached
 * session is reused only while it has more than SESSION_SAFETY_MS of life left;
 * a token with no exp claim is cached for SESSION_SAFETY_MS from now.
 */
export async function getPmApiSession(
  email: string,
  login: () => Promise<PmApiSession>,
  nowMs: number = Date.now(),
): Promise<PmApiSession> {
  const hit = cache.get(email);
  if (hit && hit.expMs - SESSION_SAFETY_MS > nowMs) return hit.session;

  const session = await login();
  const exp = decodeExpMs(session.idToken);
  cache.set(email, { session, expMs: exp ?? nowMs + SESSION_FALLBACK_TTL_MS });
  return session;
}
