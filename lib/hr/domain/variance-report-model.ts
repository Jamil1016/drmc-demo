import {
  computeKpis, personStats, boxStats, dailyMedianSeries, basePosition, median,
  enumerateDayColumns,
  type VarianceRow, type BoxStats, type TrendPoint,
} from "./variance-agg";
import { DISPLAY_GROUPS, type DisplayGroup } from "./production-scope";
import type { VarianceParams } from "./variance-filters";

const MS_DAY = 86_400_000;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (s: string) => new Date(s + "T00:00:00Z");

/** The equal-length window ending the day before `from`. Inclusive dates. */
export function precedingWindow(from: string, to: string): { from: string; to: string } {
  const days = Math.round((utc(to).getTime() - utc(from).getTime()) / MS_DAY) + 1;
  const priorTo = new Date(utc(from).getTime() - MS_DAY);
  const priorFrom = new Date(priorTo.getTime() - (days - 1) * MS_DAY);
  return { from: iso(priorFrom), to: iso(priorTo) };
}

// --- types (see plan Interfaces block; copied here) ---
export type KpiSentiment = "good" | "bad" | "neutral";
export type ReportKpi = { value: number | null; prior: number | null; deltaLabel: string; sentiment: KpiSentiment };
export type ReportGroupRow = { group: DisplayGroup; inScope: boolean; reportCount: number; medianVariancePct: number | null; breachPct: number; unworkedHours: number; status: "red" | "amber" | "green" };
export type ConcentrationStat = { topN: number; topSharePct: number; segments: { label: string; pct: number }[] };
export type MoverRow = { empId: string; employeeName: string; displayGroup: DisplayGroup; medianVariancePct: number; deltaPts: number };
export type MoversBasis = "prior" | "half";
export type PositionRow = { position: string; members: number; breachPct: number };
export type DistributionRow = { group: DisplayGroup; box: BoxStats; memberVarPcts: number[]; n: number; med: number; breachCount: number };
export type WatchlistRow = { empId: string; employeeName: string; displayGroup: DisplayGroup; position: string | null; reportCount: number; medianVariancePct: number; breachPct: number; unworkedHours: number; trend: "up" | "down" | "flat"; breach: boolean };
export type MonthlyRow = { month: string; label: string; reportCount: number; avgVariancePct: number | null; varianceHours: number; partial: boolean };
export type VarianceReportModel = {
  scope: { from: string; to: string; groups: DisplayGroup[]; includeInactive: boolean; positions: string[]; generatedEt: string; workingDays: number };
  activeMembers: number;
  kpis: { unworkedHours: ReportKpi; productivity: ReportKpi; breachRate: ReportKpi; reportCount: ReportKpi };
  trend: TrendPoint[];
  monthly: MonthlyRow[];
  groups: ReportGroupRow[];
  concentration: ConcentrationStat;
  distribution: DistributionRow[];
  movers: { improved: MoverRow[]; regressed: MoverRow[]; basis: MoversBasis };
  positions: PositionRow[];
  watchlist: WatchlistRow[];
};

const BREACH_PCT = 15;

function makeKpi(value: number | null, prior: number | null, unit: "h" | "%" | "pts" | "count", higherIsBad: boolean): ReportKpi {
  if (value == null || prior == null) return { value, prior, deltaLabel: "n/a", sentiment: "neutral" };
  const diff = Math.round((value - prior) * 10) / 10;
  if (diff === 0) return { value, prior, deltaLabel: "steady", sentiment: "neutral" };
  const mag = Math.abs(diff);
  const unitLabel = unit === "h" ? "h" : unit === "count" ? "" : unit === "pts" ? " pts" : "%";
  const deltaLabel = `${diff > 0 ? "+" : "-"}${mag}${unitLabel} vs prior`;
  const worse = diff > 0 ? higherIsBad : !higherIsBad;
  return { value, prior, deltaLabel, sentiment: worse ? "bad" : "good" };
}

function sumUnworked(rows: VarianceRow[]): number {
  return Math.round(rows.reduce((s, r) => s + (r.varianceHours > 0 ? r.varianceHours : 0), 0));
}

/** One row per calendar month intersecting [from, to], chronological, months
 *  with no reports included. Average is the MEAN of per-report variance %
 *  (the report's other roll-ups are medians); variance hours stay
 *  positive-only like every other hours figure. */
function monthlyRows(current: VarianceRow[], from: string, to: string): MonthlyRow[] {
  const byMonth = new Map<string, VarianceRow[]>();
  for (const r of current) {
    const k = r.workDate.slice(0, 7);
    const list = byMonth.get(k) ?? [];
    list.push(r);
    byMonth.set(k, list);
  }
  const fromMs = utc(from).getTime();
  const toMs = utc(to).getTime();
  const rows: MonthlyRow[] = [];
  let cursor = new Date(Date.UTC(utc(from).getUTCFullYear(), utc(from).getUTCMonth(), 1));
  while (cursor.getTime() <= toMs) {
    const month = iso(cursor).slice(0, 7);
    const monthEnd = Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0);
    const mr = byMonth.get(month) ?? [];
    rows.push({
      month,
      label: new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(cursor),
      reportCount: mr.length,
      avgVariancePct: mr.length ? Math.round((mr.reduce((s, r) => s + r.variancePct, 0) / mr.length) * 10) / 10 : null,
      varianceHours: sumUnworked(mr),
      partial: fromMs > cursor.getTime() || toMs < monthEnd,
    });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return rows;
}

function breachRatePct(rows: VarianceRow[]): number {
  return rows.length ? Math.round((100 * rows.filter((r) => r.breach).length) / rows.length) : 0;
}

function statusFor(medianVar: number | null, breachPct: number): "red" | "amber" | "green" {
  if (medianVar == null) return "green";
  if (medianVar >= BREACH_PCT || breachPct >= 25) return "red";
  if (medianVar >= 10 || breachPct >= 12) return "amber";
  return "green";
}

export function buildVarianceReportModel(args: {
  current: VarianceRow[]; prior: VarianceRow[]; params: VarianceParams; generatedEt: string;
}): VarianceReportModel {
  const { current, prior, params, generatedEt } = args;
  const curKpi = computeKpis(current);
  const priKpi = computeKpis(prior);
  const curBreachRate = breachRatePct(current);
  const priBreachRate = breachRatePct(prior);
  // An empty prior window has no measured baseline: computeKpis/breachRatePct
  // both fall back to 0 for count-based fields, which would otherwise render
  // a phantom "+X vs prior" as if the metric climbed from a real zero. Treat
  // "no prior rows" as "no prior value" so every KPI shows a neutral/"n/a" delta.
  const hasPrior = prior.length > 0;

  const trend = dailyMedianSeries(current);
  const activeMembers = new Set(current.map((r) => r.empId)).size;

  // per-group rows for all three display groups; out-of-scope groups flagged
  const inScopeGroups = params.groups.length ? params.groups : [...DISPLAY_GROUPS];
  const groups: ReportGroupRow[] = DISPLAY_GROUPS.map((g) => {
    const gr = current.filter((r) => r.displayGroup === g);
    const med = median(gr.map((r) => r.variancePct));
    const bp = breachRatePct(gr);
    return {
      group: g, inScope: inScopeGroups.includes(g), reportCount: gr.length,
      medianVariancePct: med == null ? null : Math.round(med * 10) / 10,
      breachPct: bp, unworkedHours: sumUnworked(gr), status: statusFor(med, bp),
    };
  });

  // concentration: share of unworked hours held by the worst-N members (N=10 or fewer)
  const perMemberUnworked = [...current.reduce((m, r) => {
    m.set(r.empId, (m.get(r.empId) ?? 0) + (r.varianceHours > 0 ? r.varianceHours : 0));
    return m;
  }, new Map<string, number>()).values()].sort((a, b) => b - a);
  const totalUnworked = perMemberUnworked.reduce((s, v) => s + v, 0);
  const topN = Math.min(10, perMemberUnworked.length);
  const topSum = perMemberUnworked.slice(0, topN).reduce((s, v) => s + v, 0);
  const topSharePct = totalUnworked > 0 ? Math.round((100 * topSum) / totalUnworked) : 0;
  const nextSum = perMemberUnworked.slice(topN, topN + 15).reduce((s, v) => s + v, 0);
  const restSum = perMemberUnworked.slice(topN + 15).reduce((s, v) => s + v, 0);
  const pct = (v: number) => (totalUnworked > 0 ? Math.round((100 * v) / totalUnworked) : 0);
  const concentration: ConcentrationStat = {
    topN, topSharePct,
    segments: [
      { label: `Top ${topN}`, pct: topSharePct },
      { label: "Next 15", pct: pct(nextSum) },
      { label: "Remainder", pct: pct(restSum) },
    ],
  };

  // distribution box plots per in-scope group (members' median variance %)
  const curStats = personStats(current);
  const distribution: DistributionRow[] = DISPLAY_GROUPS.filter((g) => inScopeGroups.includes(g)).map((g) => {
    const people = curStats.filter((p) => p.displayGroup === g);
    const vals = people.map((p) => p.medianVariancePct);
    const box = boxStats(vals);
    return { group: g, box, memberVarPcts: vals, n: people.length, med: Math.round(box.med * 10) / 10, breachCount: people.filter((p) => p.medianVariancePct >= BREACH_PCT).length };
  });

  // movers vs prior (need >=2 reports in each period to count)
  const priStats = new Map(personStats(prior).map((p) => [p.empId, p]));
  let moversBasis: MoversBasis = "prior";
  let moverRows: MoverRow[] = curStats
    .filter((p) => p.reportCount >= 2 && (priStats.get(p.empId)?.reportCount ?? 0) >= 2)
    .map((p) => ({
      empId: p.empId, employeeName: p.employeeName, displayGroup: p.displayGroup,
      medianVariancePct: p.medianVariancePct,
      deltaPts: Math.round((p.medianVariancePct - priStats.get(p.empId)!.medianVariancePct) * 10) / 10,
    }));
  // Fallback when the preceding window has no data at all (a range starting
  // at the beginning of the coverage history): rank movers WITHIN the period,
  // first half vs second half, same >=2-reports-per-side rule. deltaPts is
  // second-half median minus first-half median; medianVariancePct shows the
  // second-half (recent) level.
  if (!hasPrior) {
    moversBasis = "half";
    const days = Math.round((utc(params.to).getTime() - utc(params.from).getTime()) / MS_DAY) + 1;
    const midEnd = iso(new Date(utc(params.from).getTime() + (Math.floor(days / 2) - 1) * MS_DAY));
    const firstStats = new Map(personStats(current.filter((r) => r.workDate <= midEnd)).map((p) => [p.empId, p]));
    moverRows = personStats(current.filter((r) => r.workDate > midEnd))
      .filter((p) => p.reportCount >= 2 && (firstStats.get(p.empId)?.reportCount ?? 0) >= 2)
      .map((p) => ({
        empId: p.empId, employeeName: p.employeeName, displayGroup: p.displayGroup,
        medianVariancePct: p.medianVariancePct,
        deltaPts: Math.round((p.medianVariancePct - firstStats.get(p.empId)!.medianVariancePct) * 10) / 10,
      }));
  }
  const improved = [...moverRows].filter((m) => m.deltaPts < 0).sort((a, b) => a.deltaPts - b.deltaPts).slice(0, 5);
  const regressed = [...moverRows].filter((m) => m.deltaPts > 0).sort((a, b) => b.deltaPts - a.deltaPts).slice(0, 5);

  // breach rate by base position
  const byPos = new Map<string, { members: Set<string>; reports: VarianceRow[] }>();
  for (const r of current) {
    const pos = basePosition(r.position);
    if (!pos) continue;
    const e = byPos.get(pos) ?? { members: new Set(), reports: [] };
    e.members.add(r.empId); e.reports.push(r); byPos.set(pos, e);
  }
  const positions: PositionRow[] = [...byPos.entries()]
    .map(([position, e]) => ({ position, members: e.members.size, breachPct: breachRatePct(e.reports) }))
    .sort((a, b) => b.breachPct - a.breachPct);

  // full watchlist, worst-to-best, with prior trend arrow
  const priMedByEmp = new Map([...priStats.values()].map((p) => [p.empId, p.medianVariancePct]));
  const unworkedByEmp = current.reduce((m, r) => {
    m.set(r.empId, (m.get(r.empId) ?? 0) + (r.varianceHours > 0 ? r.varianceHours : 0));
    return m;
  }, new Map<string, number>());
  const posByEmp = new Map<string, string | null>();
  for (const r of current) {
    if (!posByEmp.has(r.empId)) posByEmp.set(r.empId, r.position);
  }
  const watchlist: WatchlistRow[] = curStats
    .map((p) => {
      const priMed = priMedByEmp.get(p.empId);
      const trend: WatchlistRow["trend"] = priMed == null ? "flat" : p.medianVariancePct > priMed + 0.5 ? "up" : p.medianVariancePct < priMed - 0.5 ? "down" : "flat";
      return {
        empId: p.empId, employeeName: p.employeeName, displayGroup: p.displayGroup,
        position: posByEmp.get(p.empId) ?? null, reportCount: p.reportCount,
        medianVariancePct: p.medianVariancePct, breachPct: p.breachPct,
        unworkedHours: Math.round(unworkedByEmp.get(p.empId) ?? 0),
        trend, breach: p.medianVariancePct >= BREACH_PCT,
      };
    })
    .sort((a, b) => b.medianVariancePct - a.medianVariancePct);

  return {
    scope: { ...params, generatedEt, workingDays: enumerateDayColumns(params.from, params.to).length },
    activeMembers,
    kpis: {
      unworkedHours: makeKpi(curKpi.unworkedHours, hasPrior ? priKpi.unworkedHours : null, "h", true),
      productivity: makeKpi(curKpi.productivity, hasPrior ? priKpi.productivity : null, "%", false),
      breachRate: makeKpi(curBreachRate, hasPrior ? priBreachRate : null, "pts", true),
      reportCount: makeKpi(curKpi.reportCount, hasPrior ? priKpi.reportCount : null, "count", false),
    },
    trend, monthly: monthlyRows(current, params.from, params.to), groups, concentration, distribution,
    movers: { improved, regressed, basis: moversBasis }, positions, watchlist,
  };
}
