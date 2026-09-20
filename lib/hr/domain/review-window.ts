import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";

/** Last-30-days PHT window (yyyy-MM-dd), ending today PHT. The default window
 *  of the DR monitoring dashboard. */
export function defaultReviewRange(now: Date = new Date()): { from: string; to: string } {
  const to = formatInTimeZone(now, "Asia/Manila", "yyyy-MM-dd");
  const from = formatInTimeZone(subDays(now, 29), "Asia/Manila", "yyyy-MM-dd");
  return { from, to };
}

/** Floor for the "all dates" query window. Any date well before the data begins
 *  makes `work_date BETWEEN floor AND today` cover everything (the review RPCs
 *  use BETWEEN, so a NULL bound would match nothing). */
export const ALL_TIME_FROM = "2000-01-01";

export type DashboardRange = {
  /** True when the user explicitly cleared the filter (show everything). */
  isAll: boolean;
  /** Bounds passed to the review RPCs. For all-time this is floor..today. */
  queryFrom: string;
  queryTo: string;
  /** Bounds shown in the date control and used for drill-down links. Empty in
   *  all-time mode so the control reads "All dates" and drill-downs carry no
   *  date restriction. */
  displayFrom: string;
  displayTo: string;
};

/**
 * Resolve the dashboard's effective date window from the URL params, keeping
 * three states distinct that would otherwise collapse together:
 *   - no params (initial load)  -> last 30 days (the friendly default)
 *   - explicit dateFrom/dateTo   -> that range
 *   - range=all (user cleared)   -> all-time (floor..today), shown as "All dates"
 *
 * Without the `range=all` sentinel, "cleared" and "initial load" both look like
 * "no params", so clearing the filter would fall back to the 30-day default
 * instead of showing everything.
 */
export function resolveDashboardRange(
  sp: { range?: string; dateFrom?: string; dateTo?: string },
  now: Date = new Date(),
): DashboardRange {
  const def = defaultReviewRange(now);
  if (sp.range === "all") {
    return { isAll: true, queryFrom: ALL_TIME_FROM, queryTo: def.to, displayFrom: "", displayTo: "" };
  }
  const ISO = /^\d{4}-\d{2}-\d{2}$/;
  const from = sp.dateFrom && ISO.test(sp.dateFrom) ? sp.dateFrom : def.from;
  const to = sp.dateTo && ISO.test(sp.dateTo) ? sp.dateTo : def.to;
  return { isAll: false, queryFrom: from, queryTo: to, displayFrom: from, displayTo: to };
}

/** The immediately preceding window of the same length, for period-over-period
 *  KPI deltas. Pure calendar arithmetic on yyyy-MM-dd strings (UTC noon anchor,
 *  so no local offset can shift a day). */
export function previousRange(from: string, to: string): { from: string; to: string } {
  const DAY = 86_400_000;
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  const len = Math.round((b - a) / DAY) + 1;
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  return { from: iso(a - len * DAY), to: iso(a - DAY) };
}
