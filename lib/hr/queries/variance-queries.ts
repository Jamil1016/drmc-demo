import { DB } from "@/lib/db/schemas";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { withDbRetry } from "@/lib/hr/db-retry";
import { PRODUCTION_CARRIER_GROUPS, displayGroupForCarrier } from "@/lib/hr/domain/production-scope";
import { variancePctOf, isBreach, type VarianceRow } from "@/lib/hr/domain/variance-agg";

const VARIANCE_COLS =
  "emp_id, employee_name, email, carrier_group, work_date, task_did, clock_in_et, stated_hours, stated_hours_net, timed_hours, variance_hours, coverage_pct";

type VarianceSelectRow = {
  emp_id: string;
  employee_name: string | null;
  email: string | null;
  carrier_group: string | null;
  work_date: string;
  task_did: string;
  clock_in_et: string | null;
  stated_hours: number | null;
  stated_hours_net: number | null;
  timed_hours: number | null;
  variance_hours: number | null;
  coverage_pct: number | null;
};

/**
 * Production-team daily reports with computable coverage over [from, to],
 * one row per (emp, work_date). Scoped to the 4 production carrier groups and
 * coverage_pct IS NOT NULL (weekends / unfiled days are excluded at the source).
 *
 * Cached 60s under "hr-review" (same freshness contract as the other review
 * reads; new data lands ~every 10 min, so a 60s TTL is invisible,
 * and a bulk approve's tag invalidation refreshes it too).
 */
export const getVarianceRows = unstable_cache(
  getVarianceRowsUncached,
  ["variance-rows"],
  { revalidate: 60, tags: ["hr-review"] },
);

async function getVarianceRowsUncached(from: string, to: string): Promise<VarianceRow[]> {
  const svc = createServiceClient();
  const PAGE = 1000;
  const MAX_PAGES = 20;
  const raw: VarianceSelectRow[] = [];
  let capped = false;
  await withDbRetry(async () => {
    raw.length = 0; // retry restarts cleanly
    for (let page = 0; page < MAX_PAGES; page++) {
      const { data, error } = await svc
        .schema(DB.analytics)
        .from("v_hr_report_review")
        .select(VARIANCE_COLS)
        .in("carrier_group", [...PRODUCTION_CARRIER_GROUPS])
        .gte("work_date", from)
        .lte("work_date", to)
        .not("coverage_pct", "is", null)
        .order("work_date")
        .order("task_did")
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as VarianceSelectRow[];
      raw.push(...rows);
      if (rows.length < PAGE) break;
      if (page === MAX_PAGES - 1) capped = true;
    }
  });
  if (capped) console.warn(`getVarianceRows: hit the ${MAX_PAGES * PAGE}-row cap for ${from}..${to}; results may be truncated (oldest rows kept, newest dropped).`);

  // Roster lookup (active status + job position) so members can be filtered by
  // employment status and by position. Keyed by emp_id (verified 1:1 against
  // v_hr_report_review). Unknown emp_ids (not in the directory) default to
  // active / null position so we never silently drop data we can't classify.
  const rosterById = new Map<string, { isActive: boolean; position: string | null }>();
  const empIds = [...new Set(raw.map((r) => r.emp_id))];
  if (empIds.length > 0) {
    const data = await withDbRetry(async () => {
      const { data: dir, error } = await svc
        .schema(DB.analytics)
        .from("v_employee_directory")
        .select("emp_id, is_active, position")
        .in("emp_id", empIds);
      if (error) throw new Error(error.message);
      return dir;
    });
    for (const d of (data ?? []) as { emp_id: string; is_active: boolean; position: string | null }[]) {
      rosterById.set(d.emp_id, { isActive: d.is_active, position: d.position ?? null });
    }
  }

  const out: VarianceRow[] = [];
  for (const r of raw) {
    const displayGroup = displayGroupForCarrier(r.carrier_group);
    // Defensive: skip anything the scope filter shouldn't have returned, and any
    // row missing the numerics coverage-non-null is supposed to guarantee.
    if (
      displayGroup == null ||
      r.coverage_pct == null ||
      r.stated_hours_net == null ||
      r.timed_hours == null ||
      r.variance_hours == null
    ) {
      continue;
    }
    out.push({
      empId: r.emp_id,
      employeeName: r.employee_name ?? r.emp_id,
      email: r.email,
      carrierGroup: r.carrier_group as string,
      displayGroup,
      workDate: r.work_date,
      taskDid: r.task_did,
      clockInEt: r.clock_in_et,
      statedHours: r.stated_hours,
      statedHoursNet: r.stated_hours_net,
      timedHours: r.timed_hours,
      varianceHours: r.variance_hours,
      coveragePct: r.coverage_pct,
      variancePct: variancePctOf(r.coverage_pct),
      breach: isBreach(r.coverage_pct),
      isActive: rosterById.get(r.emp_id)?.isActive ?? true,
      position: rosterById.get(r.emp_id)?.position ?? null,
    });
  }
  return out;
}
