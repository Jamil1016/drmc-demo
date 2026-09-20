import Link from "next/link";
import type { ReviewSummary } from "@/lib/hr/queries/review-queries";
import { formatWorkDate } from "@/lib/time";
import { isWeekend } from "@/lib/hr/domain/trend-axis";
import { TrendGridlines } from "@/components/hr/TrendGridlines";

// Late is the darker red, missing a much lighter amber: the two segments are
// separated by a large lightness gap (not hue alone), so they stay
// distinguishable under red/green colorblindness and in grayscale. A hairline
// between them makes the boundary crisp.
const LATE_COLOR = "#c9564a";
const MISSING_COLOR = "#f2c879";

/**
 * Daily non-compliance RATE (not raw counts), so bars are comparable across
 * days even though daily volume swings. Each bar is stacked late (bottom, red)
 * + missing (top, amber) as a share of that day's DUE reports (filed +
 * missing), on a fixed 0-100% scale. Counts stay in the tooltip. `d` is a plain
 * calendar date rendered as-is (no timezone conversion). Weekends get a faint
 * wash; days still inside the 48h/60h filing window render dimmed + hatched.
 * Each bar opens that day's reports.
 */
export function LateMissingTrend({ trend }: { trend: ReviewSummary["trend"] }) {
  const hasMaturing = trend.some((p) => p.matured === false);

  return (
    <div className="surface" style={{ padding: "0.9rem 1rem", minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginBottom: 10 }}>
        <span className="side-label" style={{ color: "var(--muted)" }} title="Daily trend of the two compliance failures: late filings and missing reports, as a share of that day's due reports. Shows whether a bad number is chronic or one bad day.">
          Late + missing rate per day
        </span>
        <div className="flex items-center gap-3" style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
          <span className="flex items-center gap-1">
            <i style={{ width: 8, height: 8, borderRadius: 2, background: LATE_COLOR, display: "inline-block" }} />
            Late
          </span>
          <span className="flex items-center gap-1">
            <i style={{ width: 8, height: 8, borderRadius: 2, background: MISSING_COLOR, display: "inline-block" }} />
            Missing
          </span>
          {hasMaturing && (
            <span className="flex items-center gap-1">
              <i className="trend-hatch-swatch" />
              Still maturing
            </span>
          )}
        </div>
      </div>

      {trend.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          No data for this range.
        </p>
      ) : (
        <div style={{ position: "relative", flex: 1, minHeight: 120, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: "100%", minWidth: 0 }}>
            {trend.map((p) => {
              // Due reports that day = filed (on-time + late) + never-filed (missing).
              const due = p.filedN + p.missing;
              const nonComp = p.late + p.missing;
              // Fixed 0-100% domain: bar height is the non-compliance rate itself.
              const totalPct = due > 0 ? (nonComp > 0 ? Math.max(2, (nonComp / due) * 100) : 0) : 0;
              const lateShare = nonComp > 0 ? (p.late / nonComp) * 100 : 0;
              const missingShare = nonComp > 0 ? (p.missing / nonComp) * 100 : 0;
              const label = formatWorkDate(p.d);
              const ratePct = due > 0 ? Math.round((nonComp / due) * 100) : 0;
              const desc = `${label}: ${ratePct}% not filed on time, ${p.late} late + ${p.missing} missing of ${due} due${p.matured === false ? " (still maturing)" : ""}`;
              return (
                <Link
                  key={p.d}
                  className="trend-day"
                  data-weekend={isWeekend(p.d) ? "true" : undefined}
                  href={`/approvals/browse?dateFrom=${p.d}&dateTo=${p.d}`}
                  title={desc}
                  aria-label={desc}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    height: "100%",
                  }}
                >
                  <div
                    className="trend-bar"
                    data-maturing={p.matured === false ? "true" : undefined}
                    style={{
                      height: `${totalPct}%`,
                      display: "flex",
                      flexDirection: "column-reverse",
                      borderRadius: "2px 2px 0 0",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ height: `${lateShare}%`, background: LATE_COLOR }} />
                    <div
                      style={{
                        height: `${missingShare}%`,
                        background: MISSING_COLOR,
                        boxShadow: "inset 0 1px 0 rgba(15,23,42,0.25)",
                      }}
                    />
                  </div>
                </Link>
              );
            })}
          </div>
          <TrendGridlines max={100} format={(n) => `${Math.round(n)}%`} />
        </div>
      )}
    </div>
  );
}
