import { DB } from "@/lib/db/schemas";
import { createServiceClient } from "@/lib/supabase/service";
import { withDbRetry } from "@/lib/hr/db-retry";
import type { NormalizedActivityQuery } from "@/lib/hr/domain/activity-format";
import type { Group } from "@/lib/hr/domain/activity-dashboard";
import { zoneDayRangeUtc, type DisplayZone } from "@/lib/time";

export type ActivityRow = {
  id: number;
  actor_email: string;
  action: string;
  entity: string;
  entity_id: string | null;
  detail: unknown;
  created_at: string;
};

/**
 * Read drmc_app.hr_audit_log newest-first with optional filters. Keyset
 * pagination uses the identity PK (monotonic), so `before` = "id less than".
 * `zone` is the display zone the caller renders the "When" column in; the
 * from/to window follows it so the filter matches what the user sees.
 */
export async function queryActivityLog(f: NormalizedActivityQuery, zone: DisplayZone = "PHT"): Promise<ActivityRow[]> {
  const svc = createServiceClient();
  // Query built inside the retry closure: PostgREST builders are single-shot,
  // so the retry attempt needs a fresh one.
  return withDbRetry(async () => {
    let q = svc.schema(DB.app).from("hr_audit_log")
      .select("id, actor_email, action, entity, entity_id, detail, created_at")
      .order("id", { ascending: false })
      .limit(f.limit);

    if (f.actor) q = q.ilike("actor_email", `%${f.actor}%`);
    if (f.action) q = q.eq("action", f.action);
    // Window on the display zone's calendar days to match the "When" column
    // the page displays. Using raw UTC boundaries would include/exclude rows
    // near midnight that render as the adjacent day (half-open [start, nextDay)).
    if (f.from) q = q.gte("created_at", zoneDayRangeUtc(f.from, zone).startIso);
    if (f.to) q = q.lt("created_at", zoneDayRangeUtc(f.to, zone).endIso);
    if (f.before) q = q.lt("id", f.before);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as ActivityRow[];
  });
}

export type SeriesPoint = { bucket: string; n: number };
export type ApproverStat = { email: string; n: number };
export type FailureStat = { reason: string; http_status: number | null; n: number };
export type DashboardData = {
  kpis: { logins: number; active_users: number; approvals: number; failures: number };
  logins_series: SeriesPoint[];
  approvals_series: SeriesPoint[];
  top_approvers: ApproverStat[];
  top_failures: FailureStat[];
};

/** KPIs, bucketed series and the two leaderboards for one range, in one call. */
export async function getActivityDashboard(from: string, to: string, group: Group): Promise<DashboardData> {
  const svc = createServiceClient();
  return withDbRetry(async () => {
    const { data, error } = await svc.schema(DB.analytics).rpc("activity_dashboard", {
      p_from: from, p_to: to, p_group: group,
    });
    if (error) throw new Error(error.message);
    return data as DashboardData;
  });
}
