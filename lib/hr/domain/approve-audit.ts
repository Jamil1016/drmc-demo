/** Summarize per-report approve outcomes into an audit detail. */
export function summarizeApproveResults(results: { ok: boolean }[]): { count: number; failed: number } {
  let count = 0;
  let failed = 0;
  for (const r of results) { if (r.ok) count++; else failed++; }
  return { count, failed };
}
