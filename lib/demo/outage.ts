/**
 * The "simulate an outage" control on the bulk-approve dialog. A batch created
 * with `outageAfter = N` runs normally for N items, then:
 *
 *   stage 0 -> 1  the next chunk request fails outright, the way a dropped
 *                 connection would. Nothing is lost: the batch stays "running"
 *                 in Postgres and the UI offers Resume.
 *   stage 1 -> 2  after Resume, the next few items hit 503s, exhaust their
 *                 retries and are recorded as retryable failures. The UI offers
 *                 Retry.
 *   stage 2       the outage is over; Retry succeeds.
 */
export const DEMO_OUTAGE_CHOICES = [0, 10, 25, 40] as const;
export const DEMO_OUTAGE_FAILED_ITEMS = 5;

export function sanitizeOutageAfter(raw: unknown): number | null {
  const n = typeof raw === "number" ? Math.floor(raw) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, 200);
}

export type OutagePlan =
  | { kind: "none" }
  /** Claim at most this many, so the run stops exactly at the outage point. */
  | { kind: "limit"; claimLimit: number }
  | { kind: "drop" }
  | { kind: "fail"; items: number };

/** Pure: what the simulated outage does to the NEXT chunk of a batch. */
export function planOutage(
  b: { outageAfter: number | null; outageStage: number; processed: number },
  chunk: number,
): OutagePlan {
  if (b.outageAfter == null || b.outageStage >= 2) return { kind: "none" };
  if (b.outageStage === 1) return { kind: "fail", items: DEMO_OUTAGE_FAILED_ITEMS };
  const left = b.outageAfter - b.processed;
  if (left <= 0) return { kind: "drop" };
  return left < chunk ? { kind: "limit", claimLimit: left } : { kind: "none" };
}
