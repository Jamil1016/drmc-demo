"use client";

import { useDisplayZone } from "@/components/layout/DisplayZoneProvider";
import { StatusPill } from "@/components/ui/StatusPill";
import {
  dateRangeLabel,
  kindLabel,
  kindTone,
  shiftWindowLabel,
  type ScheduleHistoryRow,
} from "@/lib/hr/domain/schedule-history";

// Schedule-change timeline for the directory member page. Rows come from the
// v_employee_schedule_history serving view, newest first. `rows === null` means the read
// failed (degraded); that is shown as "unavailable", never as "no changes".
export function ScheduleHistory({ rows }: { rows: ScheduleHistoryRow[] | null }) {
  const { zone } = useDisplayZone();
  return (
    <section aria-labelledby="schedule-history-heading" className="surface p-5">
      <h2
        id="schedule-history-heading"
        className="text-sm font-semibold"
        style={{ color: "var(--ink)" }}
      >
        Schedule history
      </h2>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        Approved shift changes on record, newest first.
      </p>
      {rows === null ? (
        <p className="mt-3 text-sm" style={{ color: "var(--warn)" }}>
          Schedule history is unavailable right now. Reload in a moment.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>
          No schedule changes recorded.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {rows.map((r) => (
            <li
              key={`${r.sheetTab}-${r.startDate}-${r.endDate ?? ""}-${r.shiftStartPht ?? ""}`}
              className="rounded-lg border p-3 text-sm"
              style={{ borderColor: "var(--rule)" }}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2 font-medium">
                  {dateRangeLabel(r)}
                  {r.isCurrent && <StatusPill tone="ok">Current</StatusPill>}
                  <StatusPill tone={kindTone(r.changeKind)}>{kindLabel(r.changeKind)}</StatusPill>
                </span>
                <span style={{ color: "var(--muted)" }}>
                  {shiftWindowLabel(r, zone) || "Window not recorded"}
                  {r.shiftCode ? ` · ${r.shiftCode}` : ""}
                </span>
              </div>
              {(r.workArrangement || r.restDay) && (
                <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  {[r.workArrangement, r.restDay ? `Rest day: ${r.restDay}` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              )}
              {r.notes && (
                <div className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
                  {r.notes}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
