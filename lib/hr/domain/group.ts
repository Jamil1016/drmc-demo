// Board grouping helpers — turn a flat row list into the Monday-style grouped
// board (colored group chip + its own table). Pure + deterministic so the chip
// color for a given label is stable across renders and pages.

export const GROUP_COLOR_SLOTS = 8;

/** Deterministic 0..GROUP_COLOR_SLOTS-1 slot for a group label (drives .group-chip[data-color]). */
export function colorForLabel(label: string): number {
  let sum = 0;
  for (let i = 0; i < label.length; i++) sum = (sum + label.charCodeAt(i)) % GROUP_COLOR_SLOTS;
  return sum;
}

export type Grouped<T> = { label: string; rows: T[] };

/**
 * Group rows by a key, sorted by label. Null/blank keys collapse into one
 * trailing "Unassigned" group so a board never drops rows silently.
 */
export function groupBy<T>(
  rows: T[],
  key: (row: T) => string | null | undefined,
  fallback = "Unassigned",
): Grouped<T>[] {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const raw = key(row);
    const label = raw && raw.trim() ? raw : fallback;
    const bucket = map.get(label);
    if (bucket) bucket.push(row);
    else map.set(label, [row]);
  }
  return [...map.entries()]
    .sort(([a], [b]) => {
      if (a === fallback) return 1;
      if (b === fallback) return -1;
      return a.localeCompare(b);
    })
    .map(([label, groupRows]) => ({ label, rows: groupRows }));
}
