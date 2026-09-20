export type Delta = { text: string; tone: "good" | "bad" | "flat" };

/**
 * Change vs the previous equal-length period. `higherIsBetter` flips which
 * direction is coloured green (good) vs red (bad); on-time % is the only
 * dashboard metric where up is good. Returns null when either period lacks the
 * value.
 */
export function deltaInfo(
  cur: number | null | undefined,
  prev: number | null | undefined,
  higherIsBetter: boolean,
  fmt: (n: number) => string,
): Delta | null {
  if (cur == null || prev == null) return null;
  const d = cur - prev;
  if (Math.abs(d) < 1e-9) return { text: "no change", tone: "flat" };
  const up = d > 0;
  const better = higherIsBetter ? up : !up;
  return { text: `${up ? "▲" : "▼"} ${fmt(Math.abs(d))}`, tone: better ? "good" : "bad" };
}
