import Link from "next/link";
import { rateTier, type RateTier } from "@/lib/hr/domain/scorecard-metrics";

// Tier -> accent color, matching the palette ApproverScorecardTable uses for
// the same on-time approval tiers (on_time/amber/red).
const TIER_COLOR: Record<RateTier, string> = {
  on_time: "var(--ok)",
  amber: "var(--warn)",
  red: "var(--bad)",
};

// Screen-reader-only label so the tone is not conveyed by color alone (the
// leading dot is the sighted marker, this text is the non-visual one).
const TIER_SR_LABEL: Record<RateTier, string> = {
  on_time: "on target",
  amber: "below target",
  red: "well below target",
};

const srOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
};

export type GroupBreakdownRow = { label: string; pending: number; onTimePct: number | null; href: string };

/**
 * Per-group pending/on-time breakdown for approvers who cover more than one
 * group. The KPI band shows a single blended number across all of a user's
 * groups, which hides which specific group is behind; this lists each group
 * so a multi-group approver (e.g. covering 3 or 6 queues) can see where the
 * backlog actually sits. Presentational only, no data fetching.
 */
export function GroupBreakdown({ rows }: { rows: GroupBreakdownRow[] }) {
  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="group-breakdown-heading" className="surface p-5">
      <h2 id="group-breakdown-heading" className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
        Your groups
      </h2>
      <div className="mt-2">
        {rows.map((row, i) => {
          const tier = rateTier(row.onTimePct);
          return (
            <Link
              key={row.label}
              href={row.href}
              className="flex items-center justify-between gap-3 group-breakdown-row"
              style={{
                padding: "0.5rem 0.4rem",
                margin: "0 -0.4rem",
                borderTop: i === 0 ? undefined : "1px solid var(--rule)",
                borderRadius: "0.4rem",
                textDecoration: "none",
              }}
            >
              <span className="text-sm" style={{ color: "var(--ink)" }}>
                {row.label}
              </span>
              <span className="flex items-center gap-3" style={{ fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
                <span style={{ color: "var(--muted)" }}>
                  {row.pending} {row.pending === 1 ? "report" : "reports"} pending
                </span>
                <span className="inline-flex items-center gap-1" style={{ fontWeight: 600, color: row.onTimePct === null ? "var(--muted-soft)" : TIER_COLOR[tier] }}>
                  <span aria-hidden="true" style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", background: row.onTimePct === null ? "var(--muted-soft)" : TIER_COLOR[tier] }} />
                  <span style={srOnly}>{row.onTimePct === null ? "no data" : TIER_SR_LABEL[tier]}</span>
                  {row.onTimePct === null ? "n/a" : `${row.onTimePct}% on time`}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
