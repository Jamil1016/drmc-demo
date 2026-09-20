import Link from "next/link";
import type { ApprovalCompliance } from "@/lib/hr/queries/review-queries";

// Age ramp matching BacklogAging (cool -> hot), 4 buckets.
const BUCKET_COLORS = ["#e3a13c", "#d98544", "#c9564a", "#8a2f27"];

/**
 * Approver-side twin of the Unfiled backlog card: every report currently
 * awaiting approval PAST the 2-day approval window, as of now
 * (range-independent), bucketed by calendar days over. The footer carries what
 * is still inside the window. Filed-late-pending reports are shown separately:
 * approvers are not graded on them, but they still sit in a queue. Links to the
 * approvals queue.
 */
export function ApprovalOverdueAging({ data }: { data: ApprovalCompliance }) {
  const { overdue, dueSoon } = data;
  const buckets = [
    { label: "1-2d", n: overdue.b1_2 },
    { label: "3-5d", n: overdue.b3_5 },
    { label: "6-10d", n: overdue.b6_10 },
    { label: "11d+", n: overdue.b11p },
  ];

  return (
    <Link
      href="/approvals"
      className="surface backlog-card"
      style={{ padding: "0.9rem 1rem", minWidth: 0, display: "block", textDecoration: "none" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginBottom: 10 }}>
        <span
          className="side-label"
          style={{ color: "var(--muted)" }}
          title="Reports still awaiting approval past the 2-day approval window, as of right now, bucketed by days over. Ignores the date range. Filed-late reports are listed separately: approvers aren't graded on them, but they still need approving."
        >
          Overdue approvals · as of now
        </span>
        <span style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
          <b style={{ color: overdue.total > 0 ? "var(--bad)" : "var(--ink)" }}>{overdue.total}</b> overdue
          {overdue.oldestDays != null && overdue.total > 0 ? ` · oldest ${overdue.oldestDays}d` : ""}
        </span>
      </div>

      {overdue.total === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Nothing awaiting approval past the approval window. 🎉
        </p>
      ) : (
        <>
          <div className="backlog-bar" role="img" aria-label={`Overdue approvals by age: ${buckets.map((b) => `${b.label} ${b.n}`).join(", ")}`}>
            {buckets.map((b, i) =>
              b.n > 0 ? (
                <div key={b.label} style={{ flex: b.n, background: BUCKET_COLORS[i] ?? "#8a2f27" }} title={`${b.label}: ${b.n}`} />
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
        </>
      )}

      <div className="flex flex-wrap items-center gap-3" style={{ marginTop: 10, fontSize: "0.72rem", color: "var(--muted)" }}>
        <span>
          <b style={{ color: "var(--ink)" }}>{dueSoon}</b> more waiting, still inside the 2-day window
        </span>
        {overdue.filedLatePending > 0 && (
          <span style={{ color: "var(--muted-soft)" }}>
            +{overdue.filedLatePending} filed-late pending (not graded)
          </span>
        )}
      </div>
    </Link>
  );
}
