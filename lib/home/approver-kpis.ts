import type { ScorecardRow } from "@/lib/hr/domain/types";
import { decidedCount } from "@/lib/hr/domain/scorecard-metrics";
import type { AppRole } from "@/lib/auth/roles";

export type HomeApproverKpis = {
  scope: "own" | "org" | "none";
  pending: number;
  onTimePct: number | null;
};

function aggregate(rows: ScorecardRow[]): { pending: number; onTime: number; decided: number } {
  return rows.reduce(
    (acc, r) => ({
      pending: acc.pending + r.pending,
      onTime: acc.onTime + r.onTimeCount,
      decided: acc.decided + decidedCount(r),
    }),
    { pending: 0, onTime: 0, decided: 0 },
  );
}

/**
 * Home approval KPIs. If the user owns groups (from approval history) we scope to
 * them ("own"). Otherwise super_admin sees org-wide totals ("org"); any other
 * role sees nothing ("none") since an all-groups view is noise for them.
 */
export function aggregateApproverKpis(rows: ScorecardRow[], groups: string[], role: AppRole): HomeApproverKpis {
  if (groups.length > 0) {
    const set = new Set(groups);
    const a = aggregate(rows.filter((r) => set.has(r.groupLabel)));
    return { scope: "own", pending: a.pending, onTimePct: a.decided ? Math.round((a.onTime / a.decided) * 100) : null };
  }
  if (role === "super_admin") {
    const a = aggregate(rows);
    return { scope: "org", pending: a.pending, onTimePct: a.decided ? Math.round((a.onTime / a.decided) * 100) : null };
  }
  return { scope: "none", pending: 0, onTimePct: null };
}
