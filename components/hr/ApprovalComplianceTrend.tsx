import Link from "next/link";
import type { ApprovalCompliance } from "@/lib/hr/queries/review-queries";
import { weekLabel } from "@/lib/hr/domain/trend-axis";
import { formatWorkDate } from "@/lib/time";

const ONTIME_COLOR = "#0a7a52";
const LATE_COLOR = "#c9564a";
const TARGET_PCT = 90;

/**
 * Approval compliance, one bar per work week. Stacked on-time/late as % of
 * DECIDED reports: on time = approved within 2 days of submission, late =
 * approved later or still waiting past the window. Reports the employee filed
 * late are excluded from grading (the approver could not have been on time) and
 * shown in the tooltip. A week still in flight renders hatched/ungraded:
 * grading it early would fake a good score, because only the reports already
 * approved would count. Bars deep-link to the scorecard for that week.
 */
export function ApprovalComplianceTrend({ data }: { data: ApprovalCompliance }) {
  const { periods, today } = data;
  const lastDecided = [...periods].reverse().find((p) => p.deadline < today);
  const lastRate = lastDecided && lastDecided.onTime + lastDecided.late > 0
    ? Math.round((100 * lastDecided.onTime) / (lastDecided.onTime + lastDecided.late))
    : null;

  return (
    <div className="surface" style={{ padding: "0.9rem 1rem", minWidth: 0 }}>
      <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginBottom: 10 }}>
        <span
          className="side-label"
          style={{ color: "var(--muted)" }}
          title="Share of each week's reports approved within 2 days of submission. Reports the employee filed after the filing deadline are excluded from grading. The current week is hatched until it closes. Bars open the approver scorecard for that week."
        >
          Approval compliance per week
        </span>
        <div className="flex items-center gap-3" style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
          <span className="flex items-center gap-1">
            <i style={{ width: 8, height: 8, borderRadius: 2, background: ONTIME_COLOR, display: "inline-block" }} />
            On time
          </span>
          <span className="flex items-center gap-1">
            <i style={{ width: 8, height: 8, borderRadius: 2, background: LATE_COLOR, display: "inline-block" }} />
            Late
          </span>
          {lastRate != null && (
            <span>
              Last week <b style={{ color: lastRate >= TARGET_PCT ? "var(--ok)" : "var(--bad)" }}>{lastRate}%</b> on time
            </span>
          )}
        </div>
      </div>

      {periods.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>No data yet.</p>
      ) : (
        <>
          <div style={{ position: "relative", height: 140, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: "100%", minWidth: 0 }}>
              {periods.map((p) => {
                const decided = p.onTime + p.late;
                const inFlight = p.deadline >= today;
                const onTimePct = decided > 0 ? (100 * p.onTime) / decided : 0;
                const latePct = decided > 0 ? (100 * p.late) / decided : 0;
                const label = weekLabel(p.periodStart, p.periodEnd);
                const desc = inFlight
                  ? `${label}: in flight, ${p.pendingNotDue} pending, closes ${formatWorkDate(p.deadline)}`
                  : `${label}: ${Math.round(onTimePct)}% on time (${p.onTime} on time, ${p.late} late${p.filedLate ? `, ${p.filedLate} filed late excluded` : ""})`;
                return (
                  <Link
                    key={p.periodStart}
                    href={`/approvals/scorecard?from=${p.periodStart}&to=${p.periodEnd}`}
                    title={desc}
                    aria-label={desc}
                    style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}
                  >
                    {inFlight ? (
                      <div
                        className="trend-bar"
                        data-maturing="true"
                        style={{ height: "100%", borderRadius: "3px 3px 0 0", background: "var(--paper-deep)" }}
                      />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", height: "100%", justifyContent: "flex-end" }}>
                        <div style={{ height: `${latePct}%`, background: LATE_COLOR, borderRadius: "3px 3px 0 0" }} />
                        <div style={{ height: `${onTimePct}%`, background: ONTIME_COLOR, borderBottom: "1px solid var(--card)" }} />
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
            {/* 90% on-time target line (measured from the bottom of the plot) */}
            <div
              aria-hidden
              style={{
                position: "absolute", left: 0, right: 0, bottom: `${TARGET_PCT}%`,
                borderTop: "1px dashed var(--muted-soft)", pointerEvents: "none",
              }}
              title={`${TARGET_PCT}% target`}
            />
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
            {periods.map((p) => (
              <div key={p.periodStart} style={{ flex: 1, minWidth: 0, textAlign: "center", fontSize: "0.66rem", color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {weekLabel(p.periodStart, p.periodEnd)}
                {p.deadline >= today ? " ⏳" : ""}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
