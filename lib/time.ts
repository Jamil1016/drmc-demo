import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays, format, parseISO } from "date-fns";

/* ── Display zone (global PHT | ET toggle) ──────────────────────────────────
   The user-facing timestamp zone. "ET" (never "EST") because it follows US
   daylight saving. Only DISPLAY changes with this: exports, emails, PDFs and
   PHT-calendar business rules keep calling the formatPht* functions below. */
export type DisplayZone = "PHT" | "ET";
export const DISPLAY_ZONE_COOKIE = "hr-display-zone";
export const DEFAULT_DISPLAY_ZONE: DisplayZone = "PHT";

/** Cookie/query value -> zone. Exact "ET" only (the cookie is ours, so we never
 *  write another spelling); anything else, including "et" or garbage, is PHT. */
export function parseDisplayZone(raw: string | null | undefined): DisplayZone {
  return raw === "ET" ? "ET" : DEFAULT_DISPLAY_ZONE;
}

export function zoneIana(zone: DisplayZone): "Asia/Manila" | "America/New_York" {
  return zone === "ET" ? "America/New_York" : "Asia/Manila";
}

export function zoneLabel(zone: DisplayZone): "PHT" | "ET" {
  return zone === "ET" ? "ET" : "PHT";
}

export function formatEastern(iso: string | null): string {
  if (!iso) return "";
  return formatInTimeZone(new Date(iso), "America/New_York", "yyyy-MM-dd HH:mm");
}

/**
 * Format a value that is already Eastern wall-clock (the view's *_et columns,
 * which are `timestamptz AT TIME ZONE 'America/New_York'`) in the display zone.
 * We reverse the ET wall-clock back to the true UTC instant first, so the
 * conversion stays correct across US daylight saving (PHT itself has no DST).
 */
export function formatZoned(etNaive: string | null, zone: DisplayZone, fmt = "yyyy-MM-dd hh:mm a"): string {
  if (!etNaive) return "";
  const instant = fromZonedTime(etNaive, "America/New_York");
  return formatInTimeZone(instant, zoneIana(zone), fmt);
}

/** Date only, "yyyy-MM-dd" (the display zone's calendar day). */
export function formatZonedDate(etNaive: string | null, zone: DisplayZone): string {
  return formatZoned(etNaive, zone, "yyyy-MM-dd");
}

/** A submitted/approved instant as MM-DD-YYYY hh:mm AM/PM in the display zone.
 *  These are real timestamps (unlike a work date), so the clock time is shown. */
export function formatZonedDateShort(etNaive: string | null, zone: DisplayZone): string {
  return formatZoned(etNaive, zone, "MM-dd-yyyy hh:mm a");
}

/** Time only, "hh:mm AM/PM", in the display zone. */
export function formatZonedTime(etNaive: string | null, zone: DisplayZone): string {
  return formatZoned(etNaive, zone, "hh:mm a");
}

/** Format a true UTC instant (a timestamptz ISO string) in the display zone. */
export function formatZonedInstant(iso: string | null, zone: DisplayZone, fmt = "yyyy-MM-dd hh:mm a"): string {
  if (!iso) return "";
  return formatInTimeZone(new Date(iso), zoneIana(zone), fmt);
}

/**
 * Friendly label for the "data updated" badge: just the clock time when the
 * refresh happened today, or "MMM d, h:mm a" when it is older (so a stalled
 * pipeline is not misread as fresh). "Today" is the display zone's calendar
 * day, so an ET viewer is not told "today" for a refresh that is still
 * yesterday on their clock. Computed server-side and passed to the client
 * badge as a string, so there is no hydration mismatch. Empty when null.
 * `nowMs` is injectable for tests; defaults to the real clock.
 */
export function formatDataRefresh(iso: string | null, zone: DisplayZone, nowMs: number = Date.now()): string {
  if (!iso) return "";
  const tz = zoneIana(zone);
  const instant = new Date(iso);
  const day = formatInTimeZone(instant, tz, "yyyy-MM-dd");
  const today = formatInTimeZone(new Date(nowMs), tz, "yyyy-MM-dd");
  return formatInTimeZone(instant, tz, day === today ? "h:mm a" : "MMM d, h:mm a");
}

/** UTC [start, end) instants spanning one calendar day of the display zone.
 *  Used to window a true UTC instant (e.g. hr_audit_log.created_at) on the day
 *  it displays as. */
export function zoneDayRangeUtc(dateStr: string, zone: DisplayZone): { startIso: string; endIso: string } {
  const tz = zoneIana(zone);
  const next = format(addDays(parseISO(dateStr), 1), "yyyy-MM-dd");
  return {
    startIso: fromZonedTime(`${dateStr}T00:00:00`, tz).toISOString(),
    endIso: fromZonedTime(`${next}T00:00:00`, tz).toISOString(),
  };
}

/* ── Legacy PHT formatters ──────────────────────────────────────────────────
   Thin "PHT" bindings of the zoned twins above. Behavior is byte-identical to
   before the toggle existed; exports, emails, PDFs and business rules keep
   using these on purpose (they are always Philippine time). */

/** ET wall-clock (*_et columns) as Philippine time, "yyyy-MM-dd hh:mm a". */
export function formatPht(etNaive: string | null, fmt = "yyyy-MM-dd hh:mm a"): string {
  return formatZoned(etNaive, "PHT", fmt);
}

/** PHT date only, "yyyy-MM-dd" (uses the Manila calendar day). */
export function formatPhtDate(etNaive: string | null): string {
  return formatZonedDate(etNaive, "PHT");
}

/** Epoch ms of an ET wall-clock value (the view's *_et columns): same
 *  reverse-through-ET conversion formatPht uses. Null when absent/invalid. */
export function etNaiveInstantMs(etNaive: string | null): number | null {
  if (!etNaive) return null;
  const ms = fromZonedTime(etNaive, "America/New_York").getTime();
  return Number.isFinite(ms) ? ms : null;
}

/** A plain calendar date string (yyyy-MM-dd) as MM-DD-YYYY, e.g. 06-25-2026.
 *  Pure string reshaping: a work date is a calendar day, so it must NOT go through
 *  Date()/a timezone (that would risk a day shift) and carries no time. */
export function formatWorkDate(d: string | null): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  return m ? `${m[2]}-${m[3]}-${m[1]}` : d;
}

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;

/** formatWorkDate with the calendar day's weekday in front: "Mon, 09-07-2026".
 *  The weekday comes from the y/m/d digits via Date.UTC so the host machine's
 *  timezone can't shift it (a work date is a PHT calendar day, never an instant). */
export function formatWorkDateWithDay(d: string | null): string {
  if (!d) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return d;
  const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return `${WEEKDAY_SHORT[dow]}, ${m[2]}-${m[3]}-${m[1]}`;
}

/** "Sat" / "Sun" for a weekend work date (a PHT calendar day, so no timezone
 *  shift), null for weekdays and unparseable input. Drives the DR Approval
 *  weekend row cue. */
export function weekendDayLabel(d: string | null): "Sat" | "Sun" | null {
  if (!d) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (!m) return null;
  const dow = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))).getUTCDay();
  return dow === 6 ? "Sat" : dow === 0 ? "Sun" : null;
}

/** A submitted/approved instant as MM-DD-YYYY hh:mm AM/PM in Philippine time. */
export function formatPhtDateShort(etNaive: string | null): string {
  return formatZonedDateShort(etNaive, "PHT");
}

/** PHT time only, "hh:mm AM/PM". */
export function formatPhtTime(etNaive: string | null): string {
  return formatZonedTime(etNaive, "PHT");
}

/** Format a true UTC instant (a timestamptz ISO string) in Philippine time. */
export function formatPhtInstant(iso: string | null, fmt = "yyyy-MM-dd hh:mm a"): string {
  return formatZonedInstant(iso, "PHT", fmt);
}

/** "Data updated" badge label in Philippine time (see formatDataRefresh). */
export function formatDataRefreshPht(iso: string | null): string {
  return formatDataRefresh(iso, "PHT");
}

/**
 * UTC [start, end) instants spanning one Eastern calendar day. Used to attribute
 * timer activity to a "work day": a PH night shift (evening to next-day morning)
 * falls inside one ET day, and the ET boundary follows US daylight saving.
 */
export function etDayRangeUtc(dateStr: string): { startIso: string; endIso: string } {
  const next = format(addDays(parseISO(dateStr), 1), "yyyy-MM-dd");
  return {
    startIso: fromZonedTime(`${dateStr}T00:00:00`, "America/New_York").toISOString(),
    endIso: fromZonedTime(`${next}T00:00:00`, "America/New_York").toISOString(),
  };
}

/** UTC [start, end) instants spanning one Manila calendar day. Used to window a
 *  true UTC instant (e.g. hr_audit_log.created_at) on the PH day it displays as. */
export function phtDayRangeUtc(dateStr: string): { startIso: string; endIso: string } {
  return zoneDayRangeUtc(dateStr, "PHT");
}
