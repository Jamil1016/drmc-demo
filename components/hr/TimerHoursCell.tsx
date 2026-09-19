import { StatusPill } from "@/components/ui/StatusPill";
import { hoursCell } from "@/lib/hr/domain/review-signals";

/**
 * Timer-hours table cell used by the DR Approval grid: real timed
 * value, an open-timer floor with a warn pill, "not tracked" for people with
 * no timer history at all, and the quiet "no entries" state. The warn dot on
 * "no entries" only appears when the report HAS a clock-in (physically
 * worked, ran no timers); a submitted report with no clock-in is usually a
 * paid holiday/leave report and must never look like a warning.
 */
export function TimerHoursCell({
  timedHours,
  openTimerCount,
  hasTimerHistory,
  hasTimeIn,
}: {
  timedHours: number | null;
  openTimerCount: number;
  hasTimerHistory: boolean;
  hasTimeIn: boolean;
}) {
  const cell = hoursCell(timedHours, openTimerCount, hasTimerHistory);

  if (cell.kind === "value") {
    return <span>{cell.timed.toFixed(1)}</span>;
  }
  if (cell.kind === "open") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: "0.4rem" }}>
        <span>≥{cell.timedFloor.toFixed(1)}</span>
        <StatusPill tone="warn">open ⏱</StatusPill>
      </span>
    );
  }
  if (cell.kind === "not_tracked") {
    return <span style={{ color: "var(--muted)", fontStyle: "italic" }}>not tracked</span>;
  }
  return (
    <span style={{ color: "var(--muted)" }}>
      no entries
      {hasTimeIn && (
        <span
          aria-hidden
          title="Submitted with a clock-in but no timer activity logged"
          style={{ color: "var(--warn)", marginLeft: 4 }}
        >
          ●
        </span>
      )}
    </span>
  );
}
