import { DB } from "@/lib/db/schemas";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { withDbRetry } from "@/lib/hr/db-retry";
import { fetchAllPagesParallel } from "@/lib/paged-all";
import { sanitizeBrowseSort, type BrowseSort } from "../domain/browse-sort";
import { statedNetToRawBounds } from "../domain/stated-hours-filter";
import type { QueueRow } from "../domain/approval-metrics";
// Row shapes live in the domain layer; import to type return values, re-export for callers.
import type { ScorecardRow, BrowseRow, PendingRow } from "../domain/types";
export type { ScorecardRow, BrowseRow, PendingRow };

export type ApprovalFilters = {
  carrierGroup?: string;
  /** Multi-select Division values; wins over the single carrierGroup. */
  carrierGroups?: string[];
  division?: string;
  search?: string;
  dateFrom?: string;
  dateTo?: string;
};

const QUEUE_COLS =
  "emp_id, employee_name, carrier_group, division, work_date, task_did, submitted_on_et, pending_wait_days, assigned_approver, no_approver_flag, total_hours, clock_in_et";

// PostgREST caps a single response at 1000 rows. The awaiting backlog is far
// larger (thousands), so page through with Range until a short page returns,
// otherwise every KPI computed from this set is silently truncated at 1000.
const PAGE_SIZE = 1000;
const MAX_PAGES = 30; // safety stop (~30k rows) against a runaway loop

export async function getApprovalQueue(f: ApprovalFilters = {}): Promise<QueueRow[]> {
  const svc = createServiceClient();
  const out: QueueRow[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    let q = svc
      .schema(DB.analytics)
      .from("v_daily_report_approvals")
      .select(QUEUE_COLS)
      .eq("is_awaiting_approval", true)
      .order("pending_wait_days", { ascending: false })
      .order("task_did", { ascending: true }) // stable tiebreak across pages
      .range(from, from + PAGE_SIZE - 1);
    if (f.carrierGroups?.length) q = q.in("carrier_group", f.carrierGroups);
    else if (f.carrierGroup) q = q.eq("carrier_group", f.carrierGroup);
    if (f.division) q = q.eq("division", f.division);
    if (f.search) q = q.or(searchOr(f.search));
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = data ?? [];
    out.push(
      ...batch.map((r) => ({
        empId: r.emp_id,
        employeeName: r.employee_name,
        carrierGroup: r.carrier_group,
        division: r.division,
        workDate: r.work_date,
        taskDid: r.task_did,
        submittedOnEt: r.submitted_on_et,
        pendingWaitDays: r.pending_wait_days,
        assignedApprover: r.assigned_approver,
        noApproverFlag: r.no_approver_flag,
        totalHours: r.total_hours,
        clockInEt: r.clock_in_et,
      })),
    );
    if (batch.length < PAGE_SIZE) break;
  }
  return out;
}

export type QueueKpis = { awaiting: number; amber: number; red: number; oldestWaitDays: number; noApprover: number };
export type BacklogGroup = { group: string; waiting: number; amber: number; red: number };

// Cached 45s under the "approvals" tag: this RPC summary is re-fetched on the
// approvals page load AND by the 60s LiveRefresh poll, so a short TTL absorbs
// most of those. On a successful approve the actions bust this tag via
// updateTag("approvals") (see approvals/actions.ts) so the count tracks the
// serving view's approval overlay instead of trailing it by up to the TTL; the
// 45s TTL remains as the fallback.
export const getApprovalQueueSummary = unstable_cache(
  getApprovalQueueSummaryUncached, ["approval-queue-summary"], { revalidate: 45, tags: ["approvals"] },
);

async function getApprovalQueueSummaryUncached(f: ApprovalFilters = {}): Promise<{ kpis: QueueKpis; backlog: BacklogGroup[] }> {
  const svc = createServiceClient();
  const data = await withDbRetry(async () => {
    const { data: summary, error } = await svc.schema(DB.analytics).rpc("approval_queue_summary", {
      p_carrier_group: f.carrierGroup ?? null,
      p_carrier_groups: f.carrierGroups?.length ? f.carrierGroups : null,
      p_division: f.division ?? null,
      // Sanitize identically to the row query (searchOr -> sanitizeSearch) so the
      // KPI/backlog counts and the displayed rows always describe the same set;
      // otherwise a term with % / punctuation would be a wildcard here but stripped there.
      p_search: f.search ? (sanitizeSearch(f.search) || null) : null,
    });
    if (error) throw new Error(error.message);
    return summary;
  });
  const d = data as { kpis: { awaiting: number; amber: number; red: number; oldest_wait_days: number; no_approver: number }; backlog: BacklogGroup[] };
  return {
    kpis: { awaiting: d.kpis.awaiting, amber: d.kpis.amber, red: d.kpis.red, oldestWaitDays: d.kpis.oldest_wait_days, noApprover: d.kpis.no_approver },
    backlog: d.backlog,
  };
}

export async function getApprovalQueuePage(f: ApprovalFilters = {}, limit: number): Promise<QueueRow[]> {
  const svc = createServiceClient();
  // Runs uncached on every /approvals render + 60s poll, so it gets the same
  // transient-failure guard as the other per-tick reads. retry(false) turns
  // off postgrest-js's own GET retry ladder (3 attempts, 1s/2s/4s backoff) so
  // withDbRetry is the single retry authority.
  const data = await withDbRetry(async () => {
    let q = svc.schema(DB.analytics).from("v_daily_report_approvals").select(QUEUE_COLS)
      .eq("is_awaiting_approval", true)
      .order("pending_wait_days", { ascending: false })
      .order("task_did", { ascending: true })
      .range(0, limit - 1)
      .retry(false);
    if (f.carrierGroups?.length) q = q.in("carrier_group", f.carrierGroups);
    else if (f.carrierGroup) q = q.eq("carrier_group", f.carrierGroup);
    if (f.division) q = q.eq("division", f.division);
    if (f.search) q = q.or(searchOr(f.search));
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows;
  });
  return (data ?? []).map((r) => ({
    empId: r.emp_id, employeeName: r.employee_name, carrierGroup: r.carrier_group, division: r.division,
    workDate: r.work_date, taskDid: r.task_did, submittedOnEt: r.submitted_on_et, pendingWaitDays: r.pending_wait_days,
    assignedApprover: r.assigned_approver, noApproverFlag: r.no_approver_flag, totalHours: r.total_hours, clockInEt: r.clock_in_et,
  }));
}

type ScorecardSelectRow = {
  group_label: string;
  display_label: string;
  carrier_group: string | null;
  employees: number | null;
  pending: number;
  pending_employees: number;
  approvers: number;
  approved_count: number;
  on_time_count: number;
  late_count: number;
  filed_late_count: number;
  avg_latency_days: number | null;
};

// Group-grain approver scorecard via the analytics RPC. from/to are yyyy-MM-dd
// (or undefined = all time). Every date-sensitive metric windows on the report
// WORK DATE (consistent with the Browse tab); employees (headcount) is a current
// snapshot. on_time/late are measured against the approval window (2 days after
// submission); filed_late (submitted past the filing window) is excluded from
// both. See approver_scorecard in supabase/schema.sql.
// Cached 45s under "approvals": group-grain scorecard read on the scorecard page
// load + 60s poll. TTL-bounded (self-corrects within 45s after an approve).
export const getApproverScorecard = unstable_cache(
  getApproverScorecardUncached, ["approver-scorecard"], { revalidate: 45, tags: ["approvals"] },
);

async function getApproverScorecardUncached(from?: string, to?: string): Promise<ScorecardRow[]> {
  const svc = createServiceClient();
  const data = await withDbRetry(async () => {
    const { data: rows, error } = await svc
      .schema(DB.analytics)
      .rpc("approver_scorecard", { p_from: from ?? null, p_to: to ?? null });
    if (error) throw new Error(error.message);
    return rows;
  });
  return ((data ?? []) as ScorecardSelectRow[]).map((r) => ({
    groupLabel: r.group_label,
    displayLabel: r.display_label,
    carrierGroup: r.carrier_group,
    employees: r.employees,
    pending: r.pending,
    pendingEmployees: r.pending_employees,
    approvers: r.approvers,
    approvedCount: r.approved_count,
    onTimeCount: r.on_time_count,
    lateCount: r.late_count,
    filedLateCount: r.filed_late_count,
    avgLatencyDays: r.avg_latency_days,
  }));
}

export type BrowseFilters = ApprovalFilters & {
  status?: string;
  /** Multi-select Status values; wins over the single status (old deep links).
   *  carrierGroups comes from ApprovalFilters. */
  statuses?: string[];
  assignedApprover?: string[];
  /** Days of week to keep, Postgres extract(dow) numbering: 0=Sun..6=Sat.
   *  Empty/undefined = all days. Filters on the view's work_dow column. */
  dows?: number[];
  /** Stated-hours range, NET of the 1h break (the value the column shows). The
   *  view only has RAW total_hours, so predicates offset by the break via
   *  statedNetToRawBounds. Either side null = unbounded; either set excludes
   *  rows with no stated hours. */
  statedMin?: number | null;
  statedMax?: number | null;
};

const BROWSE_COLS =
  "emp_id, employee_name, email, carrier_group, division, work_date, task_status, clock_in_et, submitted_on_et, approved_on_et, total_hours, assigned_approver, approved_by, approval_latency_days, task_did, shift_time_in_pht, timed_hours, open_timer_count, has_timer_history, variance_hours, coverage_pct";

type BrowseSelectRow = {
  emp_id: string; employee_name: string | null; email: string | null; carrier_group: string | null; division: string | null;
  work_date: string; task_status: string; clock_in_et: string | null; submitted_on_et: string | null;
  approved_on_et: string | null; total_hours: number | null; assigned_approver: string | null;
  approved_by: string | null; approval_latency_days: number | null; task_did: string;
  shift_time_in_pht: string | null;
  timed_hours: number | null; open_timer_count: number; has_timer_history: boolean;
  variance_hours: number | null; coverage_pct: number | null;
};

function mapBrowseRow(r: BrowseSelectRow): BrowseRow {
  return {
    empId: r.emp_id,
    employeeName: r.employee_name,
    email: r.email,
    carrierGroup: r.carrier_group,
    division: r.division,
    workDate: r.work_date,
    taskStatus: r.task_status,
    clockInEt: r.clock_in_et,
    submittedOnEt: r.submitted_on_et,
    approvedOnEt: r.approved_on_et,
    totalHours: r.total_hours,
    assignedApprover: r.assigned_approver,
    approvedBy: r.approved_by,
    approvalLatencyDays: r.approval_latency_days,
    taskDid: r.task_did,
    shiftTimeInPht: r.shift_time_in_pht,
    timedHours: r.timed_hours,
    openTimerCount: r.open_timer_count,
    hasTimerHistory: r.has_timer_history,
    varianceHours: r.variance_hours,
    coveragePct: r.coverage_pct,
  };
}

// Build a filtered query against the browse view. Generic over the supabase
// builder type so both the limited list and the paginated export can reuse it.
// Strip PostgREST or()-filter metacharacters (, ( ) * : . \ etc.) so a user's
// search term can't inject extra filter clauses. Keeps name/ID-safe chars only.
function sanitizeSearch(s: string): string {
  return s.replace(/[^\w '-]/g, "").trim();
}

// Employee search matches name OR employee ID (or() uses * wildcards).
function searchOr(s: string): string {
  const safe = sanitizeSearch(s);
  return `employee_name.ilike.*${safe}*,emp_id.ilike.*${safe}*`;
}

function applyBrowseFilters<T extends { eq: (c: string, v: string) => T; or: (f: string) => T; gte: (c: string, v: string | number) => T; lte: (c: string, v: string | number) => T; in: (c: string, v: (string | number)[]) => T; not: (c: string, op: string, v: unknown) => T }>(q: T, f: BrowseFilters): T {
  if (f.carrierGroups?.length) q = q.in("carrier_group", f.carrierGroups);
  else if (f.carrierGroup) q = q.eq("carrier_group", f.carrierGroup);
  if (f.division) q = q.eq("division", f.division);
  if (f.statuses?.length) q = q.in("task_status", f.statuses);
  else if (f.status) q = q.eq("task_status", f.status);
  if (f.search) q = q.or(searchOr(f.search));
  if (f.dateFrom) q = q.gte("work_date", f.dateFrom);
  if (f.dateTo) q = q.lte("work_date", f.dateTo);
  if (f.dows?.length) q = q.in("work_dow", f.dows);
  if (f.assignedApprover && f.assignedApprover.length) q = q.in("assigned_approver", f.assignedApprover);
  if (f.statedMin != null || f.statedMax != null) {
    const b = statedNetToRawBounds({ min: f.statedMin ?? null, max: f.statedMax ?? null });
    if (b.rawMin != null) q = q.gte("total_hours", b.rawMin);
    if (b.rawMax != null) q = q.lte("total_hours", b.rawMax);
    // min = 0 has no raw lower bound; the range still means "has stated hours".
    if (b.requireStated && b.rawMin == null) q = q.not("total_hours", "is", null);
  }
  return q;
}

/** Ordering for the browse list: the active sort column first (nulls last, so a
 *  column of mostly-null values never buries the data), then the default
 *  work_date desc + task_did asc — a stable total order across Range pages.
 *  Re-sanitizes the sort because it is reachable from a server action. */
function applyBrowseOrder<T extends { order: (c: string, o: { ascending: boolean; nullsFirst?: boolean }) => T }>(q: T, sortIn?: BrowseSort): T {
  const sort = sortIn ? sanitizeBrowseSort(sortIn.key, sortIn.dir) : undefined;
  if (sort) q = q.order(sort.key, { ascending: sort.dir === "asc", nullsFirst: false });
  if (!sort || sort.key !== "work_date") q = q.order("work_date", { ascending: false });
  return q.order("task_did", { ascending: true });
}

/** One page of the browse list, ordered most-recent first (for infinite scroll)
 *  or by the active header sort. */
export async function getEntryBrowsePage(f: BrowseFilters, offset: number, limit: number, sort?: BrowseSort): Promise<BrowseRow[]> {
  const svc = createServiceClient();
  // Query built inside the retry closure: PostgREST builders are single-shot,
  // so the retry attempt needs a fresh one.
  return withDbRetry(async () => {
    const q = applyBrowseFilters(
      applyBrowseOrder(svc.schema(DB.analytics).from("v_daily_report_approvals").select(BROWSE_COLS), sort)
        .range(offset, offset + limit - 1)
        .retry(false), // withDbRetry owns the retry; no internal GET ladder
      f,
    );
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return ((data ?? []) as BrowseSelectRow[]).map(mapBrowseRow);
  });
}

/**
 * Exact count of rows matching the filter (for the header + "X of N").
 *
 * Kept EXACT deliberately (measured): a PostgREST `count: "planned"`
 * estimate is unusable here. The view's carrier_group/division/employee filters
 * sit behind a LATERAL ref_employees join, so the planner has no selectivity
 * stats for them and falls back to ~the unfiltered row count: e.g. a
 * carrier_group='Group A' filter estimated 14,723 rows vs an exact 0, and even the
 * unfiltered estimate (~14,723) was ~35% off the exact 22,570. The exact count
 * costs ~114 ms server-side; accuracy wins over that here.
 */
// Cached 45s under "approvals": this is the ~114ms exact count run on every
// /approvals/browse load and every 60s poll, keyed by the active filter. The
// total self-corrects within the 45s TTL after a bulk approve.
export const getEntryBrowseCount = unstable_cache(
  getEntryBrowseCountUncached, ["entry-browse-count"], { revalidate: 45, tags: ["approvals"] },
);

// Minimal filter-chain shape for applyBrowseFilters call sites whose full
// supabase-js builder type trips TS2589 (excessively deep instantiation) —
// the head/count builder does. The cast is shape-safe: applyBrowseFilters
// only ever calls these six methods.
type BrowseFilterable = {
  eq: (c: string, v: string) => BrowseFilterable;
  or: (f: string) => BrowseFilterable;
  gte: (c: string, v: string | number) => BrowseFilterable;
  lte: (c: string, v: string | number) => BrowseFilterable;
  in: (c: string, v: (string | number)[]) => BrowseFilterable;
  not: (c: string, op: string, v: unknown) => BrowseFilterable;
};

async function getEntryBrowseCountUncached(f: BrowseFilters = {}): Promise<number> {
  const svc = createServiceClient();
  return withDbRetry(async () => {
    const base = svc.schema(DB.analytics).from("v_daily_report_approvals").select("task_did", { count: "exact", head: true }).retry(false);
    const q = applyBrowseFilters(base as unknown as BrowseFilterable, f) as unknown as typeof base;
    const { count, error } = await q;
    if (error) throw new Error(error.message);
    return count ?? 0;
  });
}

// The export must return EVERYTHING matching the filter, so it gets a far
// higher page ceiling than the interactive queries (200k rows of headroom).
const EXPORT_MAX_PAGES = 200;

/** Full filtered browse set (paginated past the 1000-row cap) for CSV export.
 *  Honors the active sort so the export reads like the on-screen table. */
export async function getEntryBrowseAll(f: BrowseFilters = {}, sort?: BrowseSort): Promise<BrowseRow[]> {
  const svc = createServiceClient();
  // Pages go out 4 at a time (stable total order via the task_did tiebreak in
  // applyBrowseOrder, so concurrent Range windows never overlap). A 22k-row
  // export drops from ~23 sequential round trips to ~7 waves.
  // Each page retries independently: a long export spanning an ETL write
  // window survives one transient timeout instead of failing the whole run.
  return fetchAllPagesParallel(
    (page) => withDbRetry(async () => {
      const from = page * PAGE_SIZE;
      const q = applyBrowseFilters(
        applyBrowseOrder(svc.schema(DB.analytics).from("v_daily_report_approvals").select(BROWSE_COLS), sort)
          .range(from, from + PAGE_SIZE - 1),
        f,
      );
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return ((data ?? []) as BrowseSelectRow[]).map(mapBrowseRow);
    }),
    { pageSize: PAGE_SIZE, maxPages: EXPORT_MAX_PAGES, concurrency: 4 },
  );
}

export type ApproverGroupOption = { value: string; label: string };

/** The approver queues offered by the Daily Reports "Approver" filter: the
 *  distinct assigned_approver values actually present in the data, including
 *  individual-lead NAME queues (e.g. "Aiko Tamura") that reports get
 *  assigned to but that have no reference.ref_approver_group row. Curated groups
 *  keep their clean display label; junk / duplicate labels stay excluded
 *  (ref_approver_group.include=false) and "(no approver assigned)" is omitted.
 *  Sourced from the v_approver_options view. */
async function listApproverGroupsUncached(): Promise<ApproverGroupOption[]> {
  const svc = createServiceClient();
  return withDbRetry(async () => {
    const { data, error } = await svc
      .schema(DB.analytics)
      .from("v_approver_options")
      .select("value, label")
      .order("label", { ascending: true });
    if (error) throw new Error(error.message);
    return ((data ?? []) as { value: string; label: string }[]).map((r) => ({
      value: r.value,
      label: r.label,
    }));
  });
}

// Cached 300s like listGroups: a small, near-static reference table that was
// the one uncached query on every /approvals/browse load and 60s poll tick.
// The cached read THROWS on failure (so an error is never cached for the TTL);
// the exported wrapper degrades to [] — the Approver filter just offers no
// options for that render instead of crashing the page.
const readApproverGroups = unstable_cache(
  listApproverGroupsUncached, ["approver-group-options"], { revalidate: 300, tags: ["reference-data"] },
);

export async function listApproverGroups(): Promise<ApproverGroupOption[]> {
  try {
    return await readApproverGroups();
  } catch (e) {
    console.error("listApproverGroups: degraded to []:", e);
    return [];
  }
}

/**
 * Just the task_dids of the submitted (approvable) reports matching a browse
 * filter, paginated past the 1000-row cap. This backs "Select all", which only
 * needs identifiers, so it selects a single column and pushes the "submitted"
 * test into Postgres (case-insensitive `ilike`, matching pickApprovableTaskDids)
 * instead of pulling all ~14 browse columns of every matching row into Node just
 * to read one field and re-filter.
 */
export async function getApprovableTaskDids(f: BrowseFilters = {}): Promise<string[]> {
  const svc = createServiceClient();
  const out: string[] = [];
  for (let page = 0; page < EXPORT_MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const q = applyBrowseFilters(
      svc.schema(DB.analytics).from("v_daily_report_approvals").select("task_did")
        .ilike("task_status", "submitted")
        .order("work_date", { ascending: false }).order("task_did", { ascending: true })
        .range(from, from + PAGE_SIZE - 1),
      f,
    );
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as { task_did: string }[];
    for (const r of batch) out.push(r.task_did);
    if (batch.length < PAGE_SIZE) break;
  }
  return out;
}

// All reports AWAITING approval for one approver group, oldest submission first.
// Matches the scorecard Pending card: filters the same is_awaiting_approval set and,
// when a range is given, windows on WORK DATE (same dimension as the scorecard RPC).
// The "(no approver assigned)" group maps to assigned_approver IS NULL.
// Paginated past the 1000-row cap. Returns BrowseRow + pendingWaitDays so the panel
// can show wait time and reuse the report detail body.
export async function getGroupPending(groupLabel: string, from?: string, to?: string): Promise<PendingRow[]> {
  const svc = createServiceClient();
  const out: PendingRow[] = [];
  const noApprover = groupLabel === "(no approver assigned)";
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * PAGE_SIZE;
    let q = svc
      .schema(DB.analytics)
      .from("v_daily_report_approvals")
      .select(BROWSE_COLS + ", pending_wait_days")
      .eq("is_awaiting_approval", true)
      .order("submitted_on_et", { ascending: true })
      .order("task_did", { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);
    q = noApprover ? q.is("assigned_approver", null) : q.eq("assigned_approver", groupLabel);
    if (from) q = q.gte("work_date", from);
    if (to) q = q.lte("work_date", to); // work_date is a date, so inclusive lte covers the whole `to` day
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const batch = ((data ?? []) as unknown) as (BrowseSelectRow & { pending_wait_days: number | null })[];
    out.push(...batch.map((r) => ({ ...mapBrowseRow(r), pendingWaitDays: r.pending_wait_days })));
    if (batch.length < PAGE_SIZE) break;
  }
  return out;
}

/**
 * One report as a PendingRow by task_did, for opening the report detail drawer
 * OUTSIDE the browse grid (the Home "Missing approver" panel has slim rows and
 * no BrowseRow to hand the drawer). Reuses BROWSE_COLS + mapBrowseRow so the
 * drawer receives an identical row shape to a browse click. Null if not found.
 */
export async function getBrowseRowByTaskDid(taskDid: string): Promise<PendingRow | null> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .schema(DB.analytics)
    .from("v_daily_report_approvals")
    .select(BROWSE_COLS + ", pending_wait_days")
    .eq("task_did", taskDid)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const r = (data as unknown) as BrowseSelectRow & { pending_wait_days: number | null };
  return { ...mapBrowseRow(r), pendingWaitDays: r.pending_wait_days };
}

/**
 * Returns which of the given task_dids currently have task_status = "submitted"
 * (case-insensitive, since casing from the PM API is not guaranteed). The guard is
 * checked server-side inside approveReports before any PATCH is issued.
 * Short-circuits to an empty Set when the input array is empty (no DB call).
 */
/** Serving-view status per task_did (lowercased), for the given reports. */
export async function fetchTaskStatuses(taskDids: string[]): Promise<Map<string, string>> {
  if (taskDids.length === 0) return new Map();
  const svc = createServiceClient();
  const { data, error } = await svc
    .schema(DB.analytics)
    .from("v_daily_report_approvals")
    .select("task_did, task_status")
    .in("task_did", taskDids);
  if (error) throw new Error(error.message);
  const result = new Map<string, string>();
  for (const row of data ?? []) {
    if (typeof row.task_status === "string") result.set(row.task_did, row.task_status.toLowerCase());
  }
  return result;
}

export async function fetchSubmittedTaskDids(taskDids: string[]): Promise<Set<string>> {
  const statuses = await fetchTaskStatuses(taskDids);
  return new Set([...statuses.entries()].filter(([, s]) => s === "submitted").map(([d]) => d));
}

export type GroupApprover = { name: string; count: number };

// The individuals who approve for one approver group (all-time), most-active first.
// Backed by the analytics.group_approvers RPC so we don't pull thousands of rows.
export async function getGroupApprovers(groupLabel: string): Promise<GroupApprover[]> {
  const svc = createServiceClient();
  const { data, error } = await svc.schema(DB.analytics).rpc("group_approvers", { p_group: groupLabel });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { approver: string; approved_count: number }[]).map((r) => ({
    name: r.approver,
    count: r.approved_count,
  }));
}
