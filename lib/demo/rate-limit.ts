import { countBatchesSince } from "@/lib/hr/queries/approval-batch";

/**
 * Server-side limits on bulk approve. Visitors share one account and the demo
 * database is small, so batch creation is bounded: at most MAX_BATCH_ITEMS
 * reports per batch and MAX_BATCHES_PER_WINDOW batches per WINDOW_MS, counted
 * in Postgres (serverless instances share no memory, so an in-process counter
 * would not hold).
 */
export const MAX_BATCH_ITEMS = 200;
export const MAX_BATCHES_PER_WINDOW = 10;
export const WINDOW_MS = 10 * 60 * 1000;

export type LimitDecision = { ok: true } | { ok: false; message: string };

/** Pure: the decision for a given recent-batch count. */
export function decideBatchCreation(recentBatches: number): LimitDecision {
  if (recentBatches < MAX_BATCHES_PER_WINDOW) return { ok: true };
  return {
    ok: false,
    message: `The demo allows ${MAX_BATCHES_PER_WINDOW} bulk approvals per ${WINDOW_MS / 60000} minutes across all visitors. Try again in a few minutes.`,
  };
}

export async function checkBatchCreationLimit(now: Date = new Date()): Promise<LimitDecision> {
  const since = new Date(now.getTime() - WINDOW_MS).toISOString();
  return decideBatchCreation(await countBatchesSince(since));
}
