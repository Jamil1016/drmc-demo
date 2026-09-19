import type { ReportRequirement } from "./types";

/** Raw stg_daily_report_hours row shape returned by the batch requirements query. */
export type RequirementRow = {
  task_did: string;
  req_id: string | null;
  work_description: string | null;
  hours_worked: number | null;
  req_status: string | null;
  file_uploaded_count: number | null;
};

/**
 * Group a batch query's rows by task_did. Every requested did gets an entry —
 * [] when the report has no requirement rows — so the hover cache can tell
 * "fetched, no requirements" apart from "not fetched yet".
 */
export function groupRequirementsByTask(
  taskDids: string[],
  rows: RequirementRow[],
): Record<string, ReportRequirement[]> {
  const out: Record<string, ReportRequirement[]> = {};
  for (const did of taskDids) out[did] = [];
  for (const r of rows) {
    const bucket = out[r.task_did];
    if (!bucket) continue; // not requested (shouldn't happen; the query filters)
    bucket.push({
      reqId: r.req_id,
      description: r.work_description,
      hours: r.hours_worked,
      status: r.req_status,
      fileCount: r.file_uploaded_count ?? 0,
    });
  }
  return out;
}

/**
 * Split dids into fixed-size chunks so one PostgREST `.in()` URL stays short
 * and each response stays well under the 1000-row cap.
 */
export function chunkDids(dids: string[], size: number): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < dids.length; i += size) chunks.push(dids.slice(i, i + size));
  return chunks;
}
