export const APPROVE_CHUNK = 25;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Only reports still awaiting approval (task_status "submitted") can be approved. */
export function pickApprovableTaskDids(rows: { taskStatus: string; taskDid: string }[]): string[] {
  return rows.filter((r) => r.taskStatus.toLowerCase() === "submitted").map((r) => r.taskDid);
}

/** Transient = worth an automatic retry. Transport error (no status), 5xx, 408, 429. */
export function isTransientPmApiFailure(httpStatus?: number): boolean {
  if (httpStatus === undefined) return true;
  return httpStatus >= 500 || httpStatus === 408 || httpStatus === 429;
}

/** Plain-English message for a failed approval, shown to the approver. */
export function describeFailure(httpStatus: number | undefined, _rawReason?: string): string {
  if (httpStatus === undefined) return "Couldn't reach the PM API. Try again in a moment.";
  if (httpStatus === 403) return "Your PM API account can't approve this report.";
  if (isTransientPmApiFailure(httpStatus)) return "The PM API is temporarily unavailable. Try again in a moment.";
  return `The PM API rejected this report (${httpStatus}).`;
}

/** Tag label next to a failed row. */
export function failureTag(retryable: boolean): string {
  return retryable ? "Retried 3x" : "Won't retry";
}

/** Percent complete (0-100) for a batch; 0 when there is nothing to do. */
export function batchProgress(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((done / total) * 100);
}
