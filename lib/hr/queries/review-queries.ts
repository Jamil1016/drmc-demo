import { DB } from "@/lib/db/schemas";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { withDbRetry } from "@/lib/hr/db-retry";

// Query layer for the DR monitoring dashboard (/hr). Three RPCs, one round trip
// each, with the grading done in Postgres over drmc_analytics.v_filing_compliance
// (filing side) and v_daily_report_approvals (approver side). See
// supabase/schema.sql for the rules.

export type ReviewSummary = {
  kpis: {
    matured: number;
    late: number;
    onTimePct: number | null;
    missing: number;
    medianLagHours: number | null;
    p90LagHours: number | null;
    highVariance: number;
  };
  trend: {
    d: string;
    late: number;
    missing: number;
    filedN: number;
    onTime: number;
    /** False while any of the day's reports is still inside its filing window;
     *  null for a day with nothing due (a weekend). */
    matured: boolean | null;
  }[];
  groups: { carrierGroup: string | null; n: number; late: number; latePct: number }[];
};

type ReviewSummaryRpc = {
  kpis: {
    matured: number;
    late: number;
    on_time_pct: number | null;
    missing: number;
    median_lag_hours: number | null;
    p90_lag_hours: number | null;
    high_variance: number;
  };
  trend: { d: string; late: number; missing: number; filed_n: number; on_time: number; matured: boolean | null }[];
  groups: { carrier_group: string | null; n: number; late: number; late_pct: number }[];
};

// Dashboard aggregates: cached 60s under "hr-review". The data behind them only
// moves when a report is approved or the nightly reset runs, so a 60s TTL is
// invisible and bounds any post-approve staleness in the approver figures.
export const getReviewSummary = unstable_cache(
  getReviewSummaryUncached, ["review-summary"], { revalidate: 60, tags: ["hr-review"] },
);

async function getReviewSummaryUncached(from: string, to: string): Promise<ReviewSummary> {
  const svc = createServiceClient();
  const data = await withDbRetry(async () => {
    const { data: summary, error } = await svc.schema(DB.analytics).rpc("review_summary", { p_from: from, p_to: to });
    if (error) throw new Error(error.message);
    return summary;
  });
  const d = data as ReviewSummaryRpc;
  return {
    kpis: {
      matured: d.kpis.matured,
      late: d.kpis.late,
      onTimePct: d.kpis.on_time_pct,
      missing: d.kpis.missing,
      medianLagHours: d.kpis.median_lag_hours,
      p90LagHours: d.kpis.p90_lag_hours,
      highVariance: d.kpis.high_variance,
    },
    trend: d.trend.map((t) => ({
      d: t.d,
      late: t.late,
      missing: t.missing,
      filedN: t.filed_n,
      onTime: t.on_time,
      matured: t.matured,
    })),
    groups: d.groups.map((g) => ({ carrierGroup: g.carrier_group, n: g.n, late: g.late, latePct: g.late_pct })),
  };
}

export type ApprovalCompliance = {
  /** Today's calendar date (Eastern), the clock the grading runs on. */
  today: string;
  /** The last 8 work weeks, oldest first. */
  periods: {
    periodStart: string;
    periodEnd: string;
    /** The week is graded once this date has passed; until then it is in flight. */
    deadline: string;
    onTime: number;
    late: number;
    filedLate: number;
    pendingNotDue: number;
  }[];
  overdue: {
    total: number;
    oldestDays: number | null;
    b1_2: number;
    b3_5: number;
    b6_10: number;
    b11p: number;
    filedLatePending: number;
  };
  /** Waiting, still inside the 2-day approval window. */
  dueSoon: number;
};

type ApprovalComplianceRpc = {
  today: string;
  periods: {
    period_start: string; period_end: string; deadline: string;
    on_time: number; late: number; filed_late: number; pending_not_due: number;
  }[];
  overdue: {
    total: number; oldest_days: number | null;
    b1_2: number; b3_5: number; b6_10: number; b11p: number;
    filed_late_pending: number;
  };
  due_soon: number;
};

/** Approver compliance (per-week grading + overdue-now aging), one call. Tagged
 *  "approvals" too so a bulk approve (updateTag) refreshes the overdue card
 *  immediately. */
export const getApprovalCompliance = unstable_cache(
  getApprovalComplianceUncached, ["approval-compliance"], { revalidate: 60, tags: ["hr-review", "approvals"] },
);

async function getApprovalComplianceUncached(): Promise<ApprovalCompliance> {
  const svc = createServiceClient();
  const data = await withDbRetry(async () => {
    const { data: compliance, error } = await svc.schema(DB.analytics).rpc("approval_compliance");
    if (error) throw new Error(error.message);
    return compliance;
  });
  const d = data as ApprovalComplianceRpc;
  return {
    today: d.today,
    periods: (d.periods ?? []).map((p) => ({
      periodStart: p.period_start,
      periodEnd: p.period_end,
      deadline: p.deadline,
      onTime: p.on_time,
      late: p.late,
      filedLate: p.filed_late,
      pendingNotDue: p.pending_not_due,
    })),
    overdue: {
      total: d.overdue.total,
      oldestDays: d.overdue.oldest_days,
      b1_2: d.overdue.b1_2,
      b3_5: d.overdue.b3_5,
      b6_10: d.overdue.b6_10,
      b11p: d.overdue.b11p,
      filedLatePending: d.overdue.filed_late_pending,
    },
    dueSoon: d.due_soon,
  };
}

export type ReviewBacklog = {
  total: number;
  oldestDays: number | null;
  buckets: { label: string; n: number }[];
  /** The oldest few unfiled days, the ones to chase first. */
  oldest: { employeeName: string; carrierGroup: string | null; workDate: string; daysOverdue: number }[];
};

type ReviewBacklogRpc = {
  total: number;
  oldest_days: number | null;
  buckets: { label: string; n: number }[];
  oldest: { employee_name: string; carrier_group: string | null; work_date: string; days_overdue: number }[];
};

/** Current unfiled-report backlog (as of now), aged into buckets. Range-independent. */
export const getReviewBacklog = unstable_cache(
  getReviewBacklogUncached, ["review-backlog"], { revalidate: 60, tags: ["hr-review"] },
);

async function getReviewBacklogUncached(): Promise<ReviewBacklog> {
  const svc = createServiceClient();
  const data = await withDbRetry(async () => {
    const { data: backlog, error } = await svc.schema(DB.analytics).rpc("review_backlog");
    if (error) throw new Error(error.message);
    return backlog;
  });
  const d = data as ReviewBacklogRpc;
  return {
    total: d.total,
    oldestDays: d.oldest_days,
    buckets: d.buckets,
    oldest: (d.oldest ?? []).map((o) => ({
      employeeName: o.employee_name,
      carrierGroup: o.carrier_group,
      workDate: o.work_date,
      daysOverdue: o.days_overdue,
    })),
  };
}
