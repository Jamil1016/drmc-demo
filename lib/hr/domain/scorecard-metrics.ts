import type { ScorecardRow } from "./types";

// On-time / late are measured against the approval window (2 days after submission). A report is
// "decided" once its outcome is known: approved (on time or late) or unapproved
// past the deadline (late). Reports still within their window, and reports the
// employee filed after their own deadline, are NOT in the denominator.

/** Reports whose approval-window outcome is decided: on time + late. */
export function decidedCount(r: ScorecardRow): number {
  return r.onTimeCount + r.lateCount;
}

/** On-time share of a group's DECIDED reports, 0-100, or null if none decided. */
export function onTimePct(r: ScorecardRow): number | null {
  const d = decidedCount(r);
  if (d === 0) return null;
  return Math.round((r.onTimeCount / d) * 100);
}

export type RateTier = "on_time" | "amber" | "red";

/** Group's compliance tier from its on-time rate. Null (nothing decided) reads
 *  as neutral/on_time so it doesn't shout red on no data. */
export function rateTier(pct: number | null): RateTier {
  if (pct === null || pct >= 90) return "on_time";
  if (pct >= 70) return "amber";
  return "red";
}

/** Decided reports split into on-time / late percentages (bar widths). Binary:
 *  the approval window is met or missed, there is no middle "amber" tier. */
export function distribution(r: ScorecardRow): { ok: number; late: number } {
  const total = decidedCount(r) || 1;
  return {
    ok: (r.onTimeCount / total) * 100,
    late: (r.lateCount / total) * 100,
  };
}

/** Below this on-time rate a group is flagged as missing the approval window. */
export const ONTIME_TARGET = 90;

/** Org-wide health tiles for the KPI band. On-time rate is volume-weighted over
 *  decided reports; avg lag is volume-weighted over approved reports. */
export function summarizeScorecard(rows: ScorecardRow[]) {
  let pending = 0, approved = 0, decided = 0, onTime = 0, filedLate = 0, weightedLag = 0, groupsBelowTarget = 0;
  for (const r of rows) {
    pending += r.pending;
    approved += r.approvedCount;
    onTime += r.onTimeCount;
    decided += decidedCount(r);
    filedLate += r.filedLateCount;
    if (r.avgLatencyDays != null) weightedLag += r.avgLatencyDays * r.approvedCount;
    const pct = onTimePct(r);
    if (pct != null && pct < ONTIME_TARGET) groupsBelowTarget++;
  }
  return {
    groups: rows.length,
    pending,
    onTimeRate: decided ? Math.round((onTime / decided) * 100) : null,
    groupsBelowTarget,
    filedLate,
    orgAvgLag: approved ? Math.round((weightedLag / approved) * 10) / 10 : null,
  };
}

/** Columns the scorecard table can be sorted by (interactive header sort). */
export type ScorecardSortKey = "group" | "employees" | "pending" | "approved" | "onTime" | "avgLag";
export type SortDir = "asc" | "desc";

/** The sortable value for a row on a given key. Null means "no data" and always
 *  sinks to the bottom (see sortScorecard). "group" is handled separately (string). */
function sortValue(r: ScorecardRow, key: Exclude<ScorecardSortKey, "group">): number | null {
  switch (key) {
    case "employees": return r.pendingEmployees;
    case "pending": return r.pending;
    case "approved": return r.approvedCount;
    case "onTime": return onTimePct(r);
    case "avgLag": return r.avgLatencyDays;
  }
}

/** Sort by a column. Nulls always sort last (both directions); ties break by
 *  group name for a stable, deterministic order. Does not mutate the input. */
export function sortScorecard(rows: ScorecardRow[], key: ScorecardSortKey, dir: SortDir): ScorecardRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    let cmp: number;
    if (key === "group") {
      cmp = sign * a.displayLabel.localeCompare(b.displayLabel);
    } else {
      const av = sortValue(a, key), bv = sortValue(b, key);
      if (av == null && bv == null) cmp = 0;
      else if (av == null) return 1;   // nulls last regardless of dir
      else if (bv == null) return -1;
      else cmp = sign * (av - bv);
    }
    return cmp !== 0 ? cmp : a.displayLabel.localeCompare(b.displayLabel);
  });
}

/** Worst-first: most reports that missed the approval window (late) at the top, so
 *  the biggest compliance problems lead; ties broken by lower on-time rate, then by
 *  approved volume. Groups with no late reports fall to the bottom. */
export function rankScorecard(rows: ScorecardRow[]): ScorecardRow[] {
  return [...rows].sort((a, b) => {
    if (b.lateCount !== a.lateCount) return b.lateCount - a.lateCount;
    const ap = onTimePct(a), bp = onTimePct(b);
    if (ap != null && bp != null && ap !== bp) return ap - bp; // lower rate first
    return b.approvedCount - a.approvedCount;
  });
}
