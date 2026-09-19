/** Parsing for the "Stated hrs" range filter on DR Approval.
 *  The value is stated hours NET of the 1h unpaid break (floored at 0), the
 *  number the column displays. Pure + URL-driven, same contract as
 *  variance-filter.ts, so it is cheap to unit-test. */

export type StatedRange = { min: number | null; max: number | null };

const MAX_HOURS = 24;

/** One bound: empty/undefined/non-numeric -> null; else clamp to [0, 24] and
 *  round to 1 decimal (half-hour reports are common; integers are too coarse). */
function parseBound(raw?: string): number | null {
  if (raw == null) return null;
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return null;
  return Math.round(Math.max(0, Math.min(MAX_HOURS, n)) * 10) / 10;
}

/** Parse the `shMin`/`shMax` URL params into a net-hours range. When both
 *  bounds are present and min > max they are swapped (less surprising than
 *  match-nothing). Either side may be null (unbounded). */
export function parseStatedRange(shMin?: string, shMax?: string): StatedRange {
  let min = parseBound(shMin);
  let max = parseBound(shMax);
  if (min != null && max != null && min > max) [min, max] = [max, min];
  return { min, max };
}

/** Map a NET range onto the RAW total_hours column DR Approval queries
 *  (net = max(total_hours - 1, 0); v_daily_report_approvals has no net column):
 *  - net >= min (min > 0)  <=>  total_hours >= min + 1
 *  - net >= 0 is every non-null row (a raw 0.5h nets to 0), so min = 0 only
 *    demands stated hours exist: requireStated, not a raw >= 1 bound
 *  - net <= max            <=>  total_hours <= max + 1 (raw <= 1h nets to 0) */
export type RawHoursBounds = { rawMin: number | null; rawMax: number | null; requireStated: boolean };

export function statedNetToRawBounds(r: StatedRange): RawHoursBounds {
  return {
    rawMin: r.min != null && r.min > 0 ? r.min + 1 : null,
    rawMax: r.max != null ? r.max + 1 : null,
    requireStated: r.min != null || r.max != null,
  };
}
