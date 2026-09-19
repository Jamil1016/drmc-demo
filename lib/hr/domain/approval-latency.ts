import { fromZonedTime } from "date-fns-tz";

const MS_PER_HOUR = 3_600_000;

/** True elapsed submit -> approve latency as "Nd Nh", from the view's ET
 * wall-clock timestamps (reversed to real instants, so DST-correct). The
 * view's approval_latency_days is a CALENDAR-day difference: submit 11 PM,
 * approve 2 AM reads as 1 even though 3 hours elapsed. Here days/hours are
 * floored duration instead ("0d 3h"). Falls back to the day count ("Nd")
 * when a timestamp is missing or out of order; null when nothing is known. */
export function formatApprovalLatency(
  submittedOnEt: string | null,
  approvedOnEt: string | null,
  fallbackDays: number | null,
): string | null {
  if (submittedOnEt && approvedOnEt) {
    const ms =
      fromZonedTime(approvedOnEt, "America/New_York").getTime() -
      fromZonedTime(submittedOnEt, "America/New_York").getTime();
    if (Number.isFinite(ms) && ms >= 0) {
      const hours = Math.floor(ms / MS_PER_HOUR);
      return `${Math.floor(hours / 24)}d ${hours % 24}h`;
    }
  }
  return fallbackDays != null ? `${fallbackDays}d` : null;
}
