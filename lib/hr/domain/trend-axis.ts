// Shared, pure helpers for the DR monitoring trend charts (LateMissingTrend,
// FilingSpeedTrend, ApprovalComplianceTrend): weekday detection, gridline tick
// values and short axis labels. Kept framework-free so they're unit-testable
// and identical across the two daily charts, which must stay column-aligned.

/**
 * Day-of-week for a plain `yyyy-MM-dd` calendar date, timezone-independent.
 * The date is anchored at UTC noon so no local offset can shift it across a
 * day boundary (same "render the calendar date as-is" rule the charts use for
 * display). 0 = Sunday … 6 = Saturday.
 */
export function weekdayOf(d: string): number {
  return new Date(`${d}T12:00:00Z`).getUTCDay();
}

/** True for Saturday/Sunday, used to shade non-working-day columns. */
export function isWeekend(d: string): boolean {
  const w = weekdayOf(d);
  return w === 0 || w === 6;
}

/**
 * Evenly spaced gridline tick values from 0 to `max` inclusive, `steps`
 * intervals (so `steps + 1` ticks). Returns [] when there's nothing to scale.
 * Exact values (label rounding is the caller's job) so line positions are precise.
 */
export function gridTicks(max: number, steps = 2): number[] {
  if (!(max > 0) || steps < 1) return [];
  const ticks: number[] = [];
  for (let i = 0; i <= steps; i++) ticks.push((max / steps) * i);
  return ticks;
}

/**
 * Compact axis label for a `yyyy-MM-dd` date: `M/D` with no leading zeros and
 * no year (the range is short enough that year is redundant on the axis).
 */
export function shortDate(d: string): string {
  const [, m, day] = d.split("-");
  return `${Number(m)}/${Number(day)}`;
}

/** Label for one work week from its Monday and Sunday: "3/2 - 3/8". */
export function weekLabel(startIso: string, endIso: string): string {
  return `${shortDate(startIso)} - ${shortDate(endIso)}`;
}
