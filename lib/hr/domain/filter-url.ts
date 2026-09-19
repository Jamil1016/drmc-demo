import { format } from "date-fns";

/**
 * Pure helpers for the auto-applying filter bar. The URL query string is the
 * single source of truth for filter state; these functions translate between
 * it and the date control without any React or browser dependency, so they are
 * cheap to unit-test.
 */

/** Clone `params`, set `key` to `value`, and drop it entirely when value is empty. */
export function setParam(params: URLSearchParams, key: string, value: string | undefined | null): URLSearchParams {
  const next = new URLSearchParams(params);
  if (value == null || value === "") next.delete(key);
  else next.set(key, value);
  return next;
}

/** Apply several key/value updates in one pass (empties removed). */
export function setParams(params: URLSearchParams, entries: Record<string, string | undefined | null>): URLSearchParams {
  let next = new URLSearchParams(params);
  for (const [k, v] of Object.entries(entries)) next = setParam(next, k, v);
  return next;
}

// work_date is a plain calendar date (yyyy-MM-dd). Parse and serialize using the
// local date components so the value never drifts a day across time zones (which
// `new Date("2026-06-25")` would, by parsing as UTC midnight).
export function isoToDate(iso: string | undefined | null): Date | undefined {
  if (!iso) return undefined;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return undefined;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function dateToIso(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

/**
 * Label for the date trigger button.
 *   none           -> "All dates"
 *   single day     -> "Jun 25, 2026"
 *   range same yr  -> "Jun 1 – Jun 25, 2026"
 *   range diff yr  -> "Dec 28, 2025 – Jan 3, 2026"
 */
export function formatDateButton(fromIso?: string, toIso?: string): string {
  const from = isoToDate(fromIso);
  const to = isoToDate(toIso);
  if (!from && !to) return "All dates";
  const a = from ?? to!;
  const b = to ?? from!;
  if (dateToIso(a) === dateToIso(b)) return format(a, "MMM d, yyyy");
  if (a.getFullYear() === b.getFullYear()) {
    return `${format(a, "MMM d")} – ${format(b, "MMM d, yyyy")}`;
  }
  return `${format(a, "MMM d, yyyy")} – ${format(b, "MMM d, yyyy")}`;
}
