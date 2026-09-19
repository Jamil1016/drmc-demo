import { approveTaskInPmApi, type PmApiHttpLite } from "./approve";
import type { PmApiSession } from "./login";
import { isTransientPmApiFailure } from "@/lib/hr/domain/bulk-approve";

export const MAX_APPROVE_ATTEMPTS = 3;
export const APPROVE_BACKOFFS_MS = [250, 500];

export type PmApiSessionProvider = {
  get: () => PmApiSession;
  refresh: () => Promise<PmApiSession>;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Approve one report, retrying transient failures up to MAX_APPROVE_ATTEMPTS.
 * A 401 refreshes the session and retries; other transient errors back off;
 * terminal errors stop immediately. Returns the final outcome plus attempt count.
 */
export async function approveWithRetry(
  http: PmApiHttpLite,
  provider: PmApiSessionProvider,
  taskDid: string,
  sleep: (ms: number) => Promise<void> = defaultSleep,
): Promise<{ ok: boolean; alreadyApproved?: true; httpStatus?: number; reason?: string; attempts: number }> {
  let attempts = 0;
  for (;;) {
    attempts++;
    const r = await approveTaskInPmApi(http, provider.get(), taskDid);
    if (r.ok) return { ok: true, alreadyApproved: r.alreadyApproved, attempts };

    const retryable = r.httpStatus === 401 || isTransientPmApiFailure(r.httpStatus);
    if (!retryable || attempts >= MAX_APPROVE_ATTEMPTS) {
      return { ok: false, httpStatus: r.httpStatus, reason: r.reason, attempts };
    }
    if (r.httpStatus === 401) {
      await provider.refresh();
    } else {
      await sleep(APPROVE_BACKOFFS_MS[Math.min(attempts - 1, APPROVE_BACKOFFS_MS.length - 1)]);
    }
  }
}
