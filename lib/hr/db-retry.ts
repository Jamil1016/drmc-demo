/**
 * Retry-once wrapper for page-critical reads. During heavy write or
 * materialized-view refresh windows a database can blow the PostgREST
 * statement timeout; the same query retried moments later succeeds. One retry absorbs
 * those blips instead of throwing the whole page to the error boundary.
 *
 * Only transient failures are retried — real query errors (bad column, RLS,
 * etc.) rethrow immediately so bugs stay loud.
 */

const TRANSIENT_DB_ERROR =
  /statement timeout|canceling statement|57014|fetch failed|socket hang up|ECONNRESET|ETIMEDOUT|PGRST002|schema cache/i;

export function isTransientDbError(message: unknown): boolean {
  return typeof message === "string" && TRANSIENT_DB_ERROR.test(message);
}

export async function withDbRetry<T>(fn: () => Promise<T>, retryDelayMs = 400): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (!isTransientDbError(message)) throw e;
    await new Promise((r) => setTimeout(r, retryDelayMs));
    return fn();
  }
}
