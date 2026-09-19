/** Wall-clock minutes covered by at least one timer interval: overlapping
 * entries merge instead of stacking (members run parallel timers, so a plain
 * duration sum double-counts; a 12.5-hr report was showing 15h+ "worked").
 * Back-to-back entries chain into one block; gaps with no timer count as 0.
 * An entry with no end (still running) falls back to start + duration_min. */
export function unionMinutes(
  intervals: { start: string | null; end: string | null; durationMin: number | null }[],
): number {
  const spans: [number, number][] = [];
  for (const iv of intervals) {
    if (!iv.start) continue;
    const s = Date.parse(iv.start);
    const e = iv.end != null
      ? Date.parse(iv.end)
      : iv.durationMin != null
        ? s + iv.durationMin * 60_000
        : NaN;
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) continue;
    spans.push([s, e]);
  }
  if (spans.length === 0) return 0;
  spans.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let total = 0;
  let [curS, curE] = spans[0];
  for (let i = 1; i < spans.length; i++) {
    const [s, e] = spans[i];
    if (s > curE) {
      total += curE - curS;
      curS = s;
      curE = e;
    } else if (e > curE) {
      curE = e;
    }
  }
  total += curE - curS;
  return total / 60_000;
}
