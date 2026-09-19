/**
 * Shared variance-% color scale. Pivots on the 15% breach line: below 15 is
 * green (greener the lower; 0 and negative = deepest green), at/above 15 is red
 * (light at 15,
 * deepening as it climbs). No amber, no blue: under-tracking (variance % <= 0)
 * is never colored as a problem.
 */
export function variancePctColor(variancePct: number): string {
  const v = variancePct;
  if (v >= 40) return "#a5342a";
  if (v >= 28) return "#c34133";
  if (v >= 22) return "#cc5647";
  if (v >= 15) return "#e2897b"; // light red right at the 15% breach line
  if (v >= 9) return "#bcdcc7";
  if (v >= 1) return "#8dc4a3";
  return "#57a07c"; // <= 0 (worked >= stated) = deep green
}

/** Darker shade of a scale color, keeping the exact hue (so the green/red signal
 *  is unchanged) while deepening it. Used for the box-plot median line, which
 *  otherwise sits at the same color as its box fill and outline and is hard to
 *  locate. `factor` is the fraction of each channel kept (0.6 = 40% darker). */
export function darkenHex(hex: string, factor = 0.6): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

/** Color for the "% breaching" heatmap metric: share of a cell's reports that
 *  breach. 0 = green, higher = red. */
export function breachPctColor(breachPct: number): string {
  const p = breachPct;
  if (p >= 45) return "#a5342a";
  if (p >= 30) return "#cc5647";
  if (p >= 18) return "#e2897b";
  if (p >= 8) return "#bcdcc7";
  if (p > 0) return "#8dc4a3";
  return "#57a07c";
}
