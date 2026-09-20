import type { ReviewBacklog } from "@/lib/hr/queries/review-queries";
import { formatWorkDate } from "@/lib/time";

// Age ramp, youngest -> oldest (cool -> hot). Length matches the RPC's 5 buckets.
const BUCKET_COLORS = ["#5aa0b8", "#e3a13c", "#d98544", "#c9564a", "#8a2f27"];

/**
 * Current unfiled-report backlog, aged. Unlike the rest of the dashboard this
 * is "as of now", independent of the selected date range (an overdue report is
 * overdue regardless of which range you're looking at). A proportional stacked
 * bar splits the total by how far past the filing deadline (48h; 60h for Friday
 * work dates) each day is, with a per-bucket legend, then the oldest few to
 * chase first. An unfiled day has no report row to open, so the card is not a
 * link.
 */
export function BacklogAging({ backlog }: { backlog: ReviewBacklog }) {
  const { total, oldestDays, buckets, oldest } = backlog;
  return (
    <div className="surface" style={{ padding: "0.9rem 1rem", minWidth: 0 }}>
      <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginBottom: 10 }}>
        <span className="side-label" style={{ color: "var(--muted)" }} title="Every report currently overdue and unfiled, bucketed by how old it is. Ignores the date range: this is the pile as of right now.">
          Unfiled backlog · as of now (all dates)
        </span>
        <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
          <b style={{ color: total > 0 ? "var(--bad)" : "var(--ink)" }}>{total}</b> overdue
          {oldestDays != null && total > 0 ? ` · oldest ${oldestDays}d` : ""}
        </span>
      </div>

      {total === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No unfiled reports past the filing deadline. 🎉
        </p>
      ) : (
        <>
          <div className="backlog-bar" role="img" aria-label={`Unfiled backlog by age: ${buckets.map((b) => `${b.label} ${b.n}`).join(", ")}`}>
            {buckets.map((b, i) =>
              b.n > 0 ? (
                <div
                  key={b.label}
                  style={{ flex: b.n, background: BUCKET_COLORS[i] ?? "#8a2f27" }}
                  title={`${b.label}: ${b.n}`}
                />
              ) : null,
            )}
          </div>
          <div className="flex flex-wrap gap-3" style={{ marginTop: 8, fontSize: "0.7rem", color: "var(--muted)" }}>
            {buckets.map((b, i) => (
              <span key={b.label} className="flex items-center gap-1">
                <i style={{ width: 8, height: 8, borderRadius: 2, background: BUCKET_COLORS[i] ?? "#8a2f27", display: "inline-block" }} />
                {b.label} <b style={{ color: "var(--ink)" }}>{b.n}</b>
              </span>
            ))}
          </div>
          {oldest.length > 0 && (
            <ul data-testid="backlog-oldest" style={{ marginTop: 10, fontSize: "0.72rem", color: "var(--muted)", listStyle: "none", padding: 0 }}>
              {oldest.map((o) => (
                <li key={`${o.employeeName}-${o.workDate}`} className="flex items-center justify-between gap-2" style={{ padding: "2px 0" }}>
                  <span className="truncate">
                    <b style={{ color: "var(--ink)" }}>{o.employeeName}</b> · {formatWorkDate(o.workDate)}
                    {o.carrierGroup ? ` · ${o.carrierGroup}` : ""}
                  </span>
                  <span style={{ whiteSpace: "nowrap" }}>{o.daysOverdue}d over</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
