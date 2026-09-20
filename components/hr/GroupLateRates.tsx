import Link from "next/link";
import type { ReviewSummary } from "@/lib/hr/queries/review-queries";

/**
 * Late-filing rate per group for the selected range: a meter bar (width =
 * late_pct) plus the bold rate and a muted late/n fraction. Each row opens that
 * group's reports over the same date range. A null group renders as
 * "Unassigned" and the link omits the carrierGroup param entirely (there's
 * nothing to filter on).
 */
export function GroupLateRates({
  groups,
  dateFrom,
  dateTo,
}: {
  groups: ReviewSummary["groups"];
  dateFrom: string;
  dateTo: string;
}) {
  return (
    <div className="surface" style={{ padding: "0.9rem 1rem", minWidth: 0 }}>
      <div className="side-label" style={{ color: "var(--muted)", marginBottom: 10 }} title="The late-filing rate broken down by team, so follow-ups land with the right supervisor.">
        Late rate by group
      </div>

      {groups.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No data for this range.
        </p>
      ) : (
        <div style={{ minWidth: 0 }}>
          {groups.map((g) => {
            const label = g.carrierGroup ?? "Unassigned";
            const params = new URLSearchParams();
            if (dateFrom) params.set("dateFrom", dateFrom);
            if (dateTo) params.set("dateTo", dateTo);
            if (g.carrierGroup) params.set("carrierGroup", g.carrierGroup);
            return (
              <Link key={label} href={`/approvals/browse?${params.toString()}`} className="group-rate-row">
                <div className="flex items-center justify-between gap-2" style={{ fontSize: "0.8125rem" }}>
                  <span
                    className={g.carrierGroup ? "cell-strong" : undefined}
                    style={g.carrierGroup ? undefined : { color: "var(--muted)" }}
                  >
                    {label}
                  </span>
                  <span style={{ whiteSpace: "nowrap" }}>
                    <b style={{ fontSize: "0.95rem" }}>{g.latePct}%</b>{" "}
                    <span style={{ color: "var(--muted)" }}>
                      ({g.late}/{g.n})
                    </span>
                  </span>
                </div>
                <div className="group-rate-meter">
                  <div className="group-rate-meter-fill" style={{ width: `${Math.min(100, Math.max(0, g.latePct))}%` }} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
