import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";

// ---------- statistics ----------

/** Linear-interpolated quantile (0 for an empty set). Sorts a copy,
 *  interpolates between the two nearest ranks. */
export function quantile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const a = [...values].sort((x, y) => x - y);
  const i = (a.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return lo === hi ? a[lo] : a[lo] + (a[hi] - a[lo]) * (i - lo);
}

/** Median, or null when there are no values (so callers can distinguish
 *  "no data" from a real 0). */
export function median(values: number[]): number | null {
  return values.length ? quantile(values, 0.5) : null;
}

// ---------- date / week helpers ----------

const MS_DAY = 86_400_000;

function utcDate(dateIso: string): Date {
  return new Date(dateIso + "T00:00:00Z");
}
function isoOf(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Monday (yyyy-MM-dd) of the ISO date's week. UTC-based, so it is stable
 *  regardless of the runtime timezone. */
export function mondayWeekStart(dateIso: string): string {
  const d = utcDate(dateIso);
  const dow = (d.getUTCDay() + 6) % 7; // 0=Mon .. 6=Sun
  d.setUTCDate(d.getUTCDate() - dow);
  return isoOf(d);
}

/** Every Monday week-start from the week containing `fromIso` through the week
 *  containing `toIso`, ascending. */
export function enumerateWeekStarts(fromIso: string, toIso: string): string[] {
  const out: string[] = [];
  let cur = utcDate(mondayWeekStart(fromIso));
  const end = utcDate(mondayWeekStart(toIso));
  while (cur.getTime() <= end.getTime()) {
    out.push(isoOf(cur));
    cur = new Date(cur.getTime() + 7 * MS_DAY);
  }
  return out;
}

/** Every working day (Mon-Fri) in [fromIso, toIso], each tagged with its
 *  Monday week-start (so day columns group under weeks). */
export function enumerateDayColumns(
  fromIso: string,
  toIso: string,
): { weekStart: string; dayIso: string }[] {
  const out: { weekStart: string; dayIso: string }[] = [];
  let cur = utcDate(fromIso);
  const end = utcDate(toIso);
  while (cur.getTime() <= end.getTime()) {
    const dow = cur.getUTCDay(); // 0=Sun .. 6=Sat
    if (dow >= 1 && dow <= 5) {
      const dayIso = isoOf(cur);
      out.push({ weekStart: mondayWeekStart(dayIso), dayIso });
    }
    cur = new Date(cur.getTime() + MS_DAY);
  }
  return out;
}

/** Rolling 90-day window (inclusive) ending today PHT. Mirrors the PHT "today"
 *  convention of defaultReviewRange in review-window.ts. */
export function defaultVarianceRange(now: Date = new Date()): { from: string; to: string } {
  const to = formatInTimeZone(now, "Asia/Manila", "yyyy-MM-dd");
  const from = formatInTimeZone(subDays(now, 89), "Asia/Manila", "yyyy-MM-dd");
  return { from, to };
}

// ---------- variance aggregation ----------

import { VARIANCE_RED_MAX_COVERAGE } from "./review-signals";
import type { DisplayGroup } from "./production-scope";

/** One production daily report with computable coverage. Every numeric field
 *  is non-null: the query pre-filters coverage_pct IS NOT NULL, which implies
 *  stated_hours_net and timed_hours are present too. */
export type VarianceRow = {
  empId: string;
  employeeName: string;
  email: string | null;
  carrierGroup: string;       // raw stored value
  displayGroup: DisplayGroup; // mapped Carrier A | Carrier C | Carrier B
  workDate: string;           // yyyy-MM-dd
  taskDid: string;
  clockInEt: string | null;   // ET-naive timestamp, for the day-timeline modal
  /** RAW stated hours (break included); sizes the day-timeline band. Optional
   *  because aggregation fixtures don't need it. */
  statedHours?: number | null;
  statedHoursNet: number;
  timedHours: number;
  varianceHours: number;      // statedHoursNet - timedHours
  coveragePct: number;        // 100 * timed / stated
  variancePct: number;        // 100 - coveragePct (the untimed share)
  breach: boolean;            // coveragePct <= 85
  isActive: boolean;          // roster is_active; resigned/inactive default-hidden
  position: string | null;    // roster job position, for the position filter
};

/** Variance % = untimed share = 100 - coverage. */
export function variancePctOf(coveragePct: number): number {
  return 100 - coveragePct;
}

/** Breach = coverage at/below the single RED policy line (85%). Single-sourced
 *  from review-signals so the definition never drifts. */
export function isBreach(coveragePct: number): boolean {
  return coveragePct <= VARIANCE_RED_MAX_COVERAGE;
}

/** Roster job title with the trailing level dropped, so the position filter
 *  offers base titles instead of every level. E.g.
 *  "Field Analyst II" -> "Field Analyst", "Project Coordinator I" ->
 *  "Project Coordinator". Titles with no level pass through unchanged. */
export function basePosition(position: string | null | undefined): string | null {
  if (!position) return null;
  return position.replace(/\s+(?:[IVX]+|\d+)$/, "").trim() || position;
}

export type Kpis = {
  unworkedHours: number;
  productivity: number | null; // median coverage % (management report KPI)
  timedHours: number;          // sum of timer-backed hours across the scope
  declaredHours: number;       // sum of stated hours net of break (what members declared)
  breaching: number;
  reportCount: number;
};

export function computeKpis(rows: VarianceRow[]): Kpis {
  let unworkedHours = 0;
  let breaching = 0;
  let timedHours = 0;
  let declaredHours = 0;
  const covs: number[] = [];
  for (const r of rows) {
    if (r.varianceHours > 0) unworkedHours += r.varianceHours;
    if (r.breach) breaching += 1;
    timedHours += r.timedHours;
    declaredHours += r.statedHoursNet;
    covs.push(r.coveragePct);
  }
  return {
    unworkedHours: Math.round(unworkedHours),
    productivity: covs.length ? Math.round(quantile(covs, 0.5)) : null,
    timedHours: Math.round(timedHours),
    declaredHours: Math.round(declaredHours),
    breaching,
    reportCount: rows.length,
  };
}

export type PersonStat = {
  empId: string;
  employeeName: string;
  email: string | null;
  displayGroup: DisplayGroup;
  medianVariancePct: number;
  medianCoverage: number;
  breachCount: number;
  breachPct: number;
  reportCount: number;
};

/** One stat row per employee across `rows`. medianVariancePct is the median of
 *  the person's per-report variance % (the value every distribution view uses). */
export function personStats(rows: VarianceRow[]): PersonStat[] {
  const byEmp = new Map<string, VarianceRow[]>();
  for (const r of rows) {
    const arr = byEmp.get(r.empId);
    if (arr) arr.push(r);
    else byEmp.set(r.empId, [r]);
  }
  const out: PersonStat[] = [];
  for (const [empId, rs] of byEmp) {
    const varPcts = rs.map((r) => r.variancePct);
    const covs = rs.map((r) => r.coveragePct);
    const breachCount = rs.filter((r) => r.breach).length;
    out.push({
      empId,
      employeeName: rs[0].employeeName,
      email: rs[0].email,
      displayGroup: rs[0].displayGroup,
      medianVariancePct: Math.round((median(varPcts) ?? 0) * 10) / 10,
      medianCoverage: Math.round(median(covs) ?? 0),
      breachCount,
      breachPct: Math.round((100 * breachCount) / rs.length),
      reportCount: rs.length,
    });
  }
  return out;
}

export type BoxStats = {
  q1: number;
  med: number;
  q3: number;
  whiskerLo: number;
  whiskerHi: number;
  outlierIdx: number[];
};

/** Tukey box stats over `values`: quartiles, 1.5*IQR whiskers clamped to the
 *  inlier min/max, and the indices of values beyond the fences. */
export function boxStats(values: number[]): BoxStats {
  const q1 = quantile(values, 0.25);
  const med = quantile(values, 0.5);
  const q3 = quantile(values, 0.75);
  const iqr = q3 - q1;
  const hi = q3 + 1.5 * iqr;
  const lo = q1 - 1.5 * iqr;
  const inliers = values.filter((v) => v >= lo && v <= hi);
  const outlierIdx: number[] = [];
  values.forEach((v, i) => {
    if (v > hi || v < lo) outlierIdx.push(i);
  });
  return {
    q1, med, q3,
    whiskerLo: inliers.length ? Math.min(...inliers) : 0,
    whiskerHi: inliers.length ? Math.max(...inliers) : 0,
    outlierIdx,
  };
}

// ---------- heatmap & distribution helpers ----------

export type CellStats = { avgVariancePct: number; breachPct: number; n: number };

/** Aggregate a set of reports into one heatmap cell: mean variance %, breach
 *  share, count. Null when the set is empty (renders as a blank cell). */
export function cellStats(rows: VarianceRow[]): CellStats | null {
  if (rows.length === 0) return null;
  let sumVar = 0;
  let breach = 0;
  for (const r of rows) {
    sumVar += r.variancePct;
    if (r.breach) breach += 1;
  }
  return {
    avgVariancePct: Math.round((sumVar / rows.length) * 10) / 10,
    breachPct: Math.round((100 * breach) / rows.length),
    n: rows.length,
  };
}

export type ColMode = "week" | "day";

/** Column key for a row: Monday week-start ("week") or the exact work date ("day"). */
export function colKeyOf(row: VarianceRow, colMode: ColMode): string {
  return colMode === "week" ? mondayWeekStart(row.workDate) : row.workDate;
}

/** Bucket rows by their column key, so a heatmap can look up each cell in O(1). */
export function bucketByColumn(rows: VarianceRow[], colMode: ColMode): Map<string, VarianceRow[]> {
  const out = new Map<string, VarianceRow[]>();
  for (const r of rows) {
    const k = colKeyOf(r, colMode);
    const arr = out.get(k);
    if (arr) arr.push(r);
    else out.set(k, [r]);
  }
  return out;
}

export type DotBin = { binIndex: number; stackIndex: number; value: number };

/** Bin values along the x-domain and assign each a stack height so dots stack
 *  upward (vertical height = count at that level).
 *  `binW` is the pixel bin width; `plotW` the plot width. */
export function binDots(
  values: number[],
  domainMin: number,
  domainMax: number,
  plotW: number,
  binW: number,
): { bins: DotBin[]; maxStack: number } {
  const X = (c: number) =>
    ((Math.max(domainMin, Math.min(domainMax, c)) - domainMin) / (domainMax - domainMin)) * plotW;
  const sorted = [...values].sort((a, b) => a - b);
  const counts: Record<number, number> = {};
  const bins: DotBin[] = [];
  let maxStack = 0;
  for (const v of sorted) {
    const binIndex = Math.round(X(v) / binW);
    const stackIndex = counts[binIndex] ?? 0;
    counts[binIndex] = stackIndex + 1;
    if (counts[binIndex] > maxStack) maxStack = counts[binIndex];
    bins.push({ binIndex, stackIndex, value: v });
  }
  return { bins, maxStack };
}

// ---------- charting helpers ----------

/** Trimmed x-axis domain for the distribution charts: keeps a small negative
 *  buffer (down to at most -5) so under-tracking is visible, and extends up to
 *  at least 45% (or past the data), so a positive-only dataset does not leave a
 *  large empty on-track gutter. Snaps to 5% steps. Empty set -> [-5, 45]. */
export function distDomain(values: number[]): [number, number] {
  if (values.length === 0) return [-5, 45];
  const dmin = Math.min(...values);
  const dmax = Math.max(...values);
  const lo = Math.min(-5, Math.floor(dmin / 5) * 5);
  const hi = Math.max(45, Math.ceil(dmax / 5) * 5 + 5);
  return [lo, hi];
}

export type TrendPoint = {
  date: string;
  value: number; // median variance % that day (the plotted value)
  n: number; // reports that day
  breaches: number; // reports that day at/above the 15% breach line
};

/** Daily median variance % over the work dates present in `rows`, one point per
 *  work_date (median of that day's variance %, plus report count and breach
 *  count for the hover tooltip), ascending by date. `days` omitted keeps the
 *  whole range; a number caps to the last N work dates. Drives the trend line. */
export function dailyMedianSeries(rows: VarianceRow[], days?: number): TrendPoint[] {
  const byDate = new Map<string, { vals: number[]; breaches: number }>();
  for (const r of rows) {
    const g = byDate.get(r.workDate);
    if (g) {
      g.vals.push(r.variancePct);
      if (r.breach) g.breaches += 1;
    } else {
      byDate.set(r.workDate, { vals: [r.variancePct], breaches: r.breach ? 1 : 0 });
    }
  }
  const points = [...byDate.entries()]
    .map(([date, g]) => ({
      date,
      value: Math.round((median(g.vals) ?? 0) * 10) / 10,
      n: g.vals.length,
      breaches: g.breaches,
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  // days omitted => keep the whole selected range (rows are already scoped to
  // [from, to] upstream). A number caps to the last N working days.
  return days != null ? points.slice(-days) : points;
}

// ---------- monthly trend mode (windows spanning 3+ calendar months) ----------

export type MonthlyTrendStat = {
  month: string; // "2026-07"
  label: string; // short month name for the axis tick ("Jul")
  min: number | null;
  max: number | null;
  med: number | null; // median of the month's daily medians (median-everywhere convention)
  sd: number | null; // sample std dev (n-1) of the daily medians; null when n < 2
  n: number; // daily points in the month
};

/** Daily line up to 2 calendar months; per-month min-max/median/sd past that
 *  (a daily line over 3+ months overplots into noise). */
export function trendChartMode(from: string, to: string): "daily" | "monthly" {
  const f = new Date(from + "T00:00:00Z");
  const t = new Date(to + "T00:00:00Z");
  const months = (t.getUTCFullYear() - f.getUTCFullYear()) * 12 + (t.getUTCMonth() - f.getUTCMonth()) + 1;
  return months >= 3 ? "monthly" : "daily";
}

/** Buckets a daily-median series into one stat per calendar month of
 *  [from, to] (window months with no data stay as n=0 gaps so the x-axis
 *  keeps its calendar shape). */
export function monthlyTrendStats(series: TrendPoint[], from: string, to: string): MonthlyTrendStat[] {
  const byMonth = new Map<string, number[]>();
  for (const p of series) {
    const k = p.date.slice(0, 7);
    const arr = byMonth.get(k) ?? [];
    arr.push(p.value);
    byMonth.set(k, arr);
  }
  const r1 = (v: number) => Math.round(v * 10) / 10;
  const out: MonthlyTrendStat[] = [];
  let cur = new Date(Date.UTC(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, 1));
  const end = new Date(to + "T00:00:00Z");
  while (cur.getTime() <= end.getTime()) {
    const month = cur.toISOString().slice(0, 7);
    const vals = byMonth.get(month) ?? [];
    let sd: number | null = null;
    if (vals.length >= 2) {
      const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
      sd = r1(Math.sqrt(vals.reduce((s, v) => s + (v - mean) ** 2, 0) / (vals.length - 1)));
    }
    out.push({
      month,
      label: new Intl.DateTimeFormat("en-US", { month: "short", timeZone: "UTC" }).format(cur),
      min: vals.length ? r1(Math.min(...vals)) : null,
      max: vals.length ? r1(Math.max(...vals)) : null,
      med: vals.length ? r1(median(vals) ?? 0) : null,
      sd,
      n: vals.length,
    });
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
  }
  return out;
}
