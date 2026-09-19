// Header sorting for the Daily Reports browse table. The URL is the source of truth
// (`sort` + `dir` params); the whitelist protects PostgREST .order() —
// the sort key travels through a server action, so raw input is never
// trusted. Browse sorts directly on v_daily_report_approvals columns
// (no RPC), with the default ordering work_date desc, task_did asc.

import type { BrowseRow } from "./types";

export type SortDir = "asc" | "desc";

export type BrowseSortKey =
  | "employee_name"
  | "carrier_group"
  | "work_date"
  | "task_status"
  | "clock_in_et"
  | "submitted_on_et"
  | "approved_on_et"
  | "total_hours"
  | "timed_hours"
  | "variance_hours"
  | "assigned_approver"
  | "approved_by";

export type BrowseSort = { key: BrowseSortKey; dir: SortDir };

export const BROWSE_SORT_KEYS: readonly BrowseSortKey[] = [
  "employee_name",
  "carrier_group",
  "work_date",
  "task_status",
  "clock_in_et",
  "submitted_on_et",
  "approved_on_et",
  "total_hours",
  "timed_hours",
  "variance_hours",
  "assigned_approver",
  "approved_by",
];

// First-click direction per column: text columns read A->Z, dates and
// measures show the most recent / biggest signal first (same convention
// as the Approver Scorecard).
export const BROWSE_DEFAULT_DIR: Record<BrowseSortKey, SortDir> = {
  employee_name: "asc",
  carrier_group: "asc",
  work_date: "desc",
  task_status: "asc",
  clock_in_et: "desc",
  submitted_on_et: "desc",
  approved_on_et: "desc",
  total_hours: "desc",
  timed_hours: "desc",
  variance_hours: "desc",
  assigned_approver: "asc",
  approved_by: "asc",
};

/** Validate untrusted sort input (URL params, server-action args). Returns
 *  undefined for anything not whitelisted, which means the default ordering. */
export function sanitizeBrowseSort(key?: string, dir?: string): BrowseSort | undefined {
  if (!key || !(BROWSE_SORT_KEYS as readonly string[]).includes(key)) return undefined;
  return { key: key as BrowseSortKey, dir: dir === "asc" ? "asc" : "desc" };
}

// Sort key -> the (camelCase) BrowseRow field it orders by.
const FIELD: Record<BrowseSortKey, (r: BrowseRow) => string | number | null> = {
  employee_name: (r) => r.employeeName,
  carrier_group: (r) => r.carrierGroup,
  work_date: (r) => r.workDate,
  task_status: (r) => r.taskStatus,
  clock_in_et: (r) => r.clockInEt,
  submitted_on_et: (r) => r.submittedOnEt,
  approved_on_et: (r) => r.approvedOnEt,
  total_hours: (r) => r.totalHours,
  timed_hours: (r) => r.timedHours,
  variance_hours: (r) => r.varianceHours,
  assigned_approver: (r) => r.assignedApprover,
  approved_by: (r) => r.approvedBy,
};

function cmp(a: string | number, b: string | number): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Deterministic comparator mirroring the server ordering (applyBrowseOrder):
 * active sort column with nulls last regardless of direction, then work_date
 * descending, then task_did ascending as the stable tie-breaker. Lets the
 * client reorder already-loaded rows without a round trip when the whole
 * filtered set is on screen.
 */
export function compareBrowseRows(a: BrowseRow, b: BrowseRow, sort?: BrowseSort): number {
  if (sort) {
    const av = FIELD[sort.key](a);
    const bv = FIELD[sort.key](b);
    if (av == null || bv == null) {
      if (av != null) return -1; // nulls last
      if (bv != null) return 1;
    } else if (av !== bv) {
      return cmp(av, bv) * (sort.dir === "asc" ? 1 : -1);
    }
  }
  if (a.workDate !== b.workDate) return a.workDate < b.workDate ? 1 : -1;
  return cmp(a.taskDid, b.taskDid);
}
