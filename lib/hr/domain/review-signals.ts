/** Signal logic for the report grids. Thresholds are constants (demo values).
 * Variance is a review lead, not proof: timers miss meetings and offline work. */
export type VarianceTier = "red" | "under" | "ok" | "none";

// Break deduction: EVERY daily report includes a 1h unpaid break, so the
// "Stated hrs" columns and all variance math net that hour out, regardless of
// length. The deduction is floored at 0 (never negative): a report at or below
// 1h nets to 0, matching the serving view (stated_hours_net). This helper is
// the SAME rule for surfaces that only have the raw stated hours (the DR
// Approval browse "Stated hrs" column + its export). The report detail drawer
// deliberately shows the RAW hours.
export const BREAK_HOURS = 1;
export function statedHoursNetOfBreak(stated: number | null): number | null {
  if (stated == null) return null;
  return Math.max(stated - BREAK_HOURS, 0);
}

// Single variance alarm: a report is RED when 15% or more of its
// (break-deducted) stated hours are not backed by timers, i.e. coverage <= 85%
// (untimed = 100 - coverage >= 15). There is no amber tier; everything below
// the line is normal. The serving view applies the same line; keep the 85 in sync.
export const VARIANCE_RED_MAX_COVERAGE = 85; // coverage_pct <= 85  <=>  untimed >= 15%

export function varianceTier(varianceHours: number | null, coveragePct: number | null): VarianceTier {
  if (varianceHours == null || coveragePct == null) return "none";
  if (varianceHours < 0) return "under";
  return coveragePct <= VARIANCE_RED_MAX_COVERAGE ? "red" : "ok";
}

/** Label shows the UNTIMED share (100 − coverage): the percent of stated hours
 *  NOT backed by timer entries. Negative = timers exceeded
 *  the stated hours. Tier thresholds above stay in coverage terms. */
export function varianceLabel(varianceHours: number | null, coveragePct: number | null): string | null {
  if (varianceHours == null || coveragePct == null) return null;
  const sign = varianceHours < 0 ? "−" : "+";
  const untimed = 100 - coveragePct;
  const untimedLabel = `${untimed < 0 ? "−" : ""}${Math.abs(untimed)}%`;
  return `${sign}${Math.abs(varianceHours).toFixed(1)}h · ${untimedLabel}`;
}

export function formatLagHours(h: number | null): string {
  return h == null ? "" : `${h.toFixed(1)}h`;
}

export type HoursCell =
  | { kind: "value"; timed: number }
  | { kind: "open"; timedFloor: number }
  | { kind: "not_tracked" }
  | { kind: "no_entries" };

export function hoursCell(timedHours: number | null, openCount: number, hasTimerHistory: boolean): HoursCell {
  if (openCount > 0) return { kind: "open", timedFloor: timedHours ?? 0 };
  if (timedHours != null) return { kind: "value", timed: timedHours };
  return hasTimerHistory ? { kind: "no_entries" } : { kind: "not_tracked" };
}
