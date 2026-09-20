import Link from "next/link";
import type { ReviewSummary } from "@/lib/hr/queries/review-queries";
import { formatWorkDate } from "@/lib/time";
import { isWeekend } from "@/lib/hr/domain/trend-axis";
import { TrendGridlines } from "@/components/hr/TrendGridlines";
import { TrendDateAxis } from "@/components/hr/TrendDateAxis";

// Two-tone filing speed: on time green, late red, split on the filing deadline
// (48h after clock-in; 60h for Friday work dates). Same severity tones as the
// other dashboard charts.
const ON_TIME_COLOR = "#0a7a52";
const LATE_COLOR = "#c9564a";

/**
 * How promptly each day's reports were filed, as a 100%-stacked pass/fail bar:
 * of the reports filed for that work date, the share filed on time (green) vs
 * late (red). Composition, not volume, so every bar is 0-100% and days are
 * comparable; counts are in the tooltip. Days with nothing filed render as a
 * gap; the still-maturing tail is dimmed + hatched. `d` is a plain calendar
 * date rendered as-is. Shares its x-domain (and the date axis below) with
 * LateMissingTrend. Each bar opens that day's reports.
 */
export function FilingSpeedTrend({ trend }: { trend: ReviewSummary["trend"] }) {
  const hasMaturing = trend.some((p) => p.matured === false);

  return (
    <div className="surface" style={{ padding: "0.9rem 1rem", minWidth: 0, display: "flex", flexDirection: "column" }}>
      <div className="flex flex-wrap items-center justify-between gap-2" style={{ marginBottom: 10 }}>
        <span className="side-label" style={{ color: "var(--muted)" }} title="Of the reports filed each day, how many landed on time vs late (late = filed more than 48h after clock-in; 60h for Friday reports). Behavior changes show here first, before the late rate visibly drops.">
          Filing speed per day (of reports filed)
        </span>
        <div className="flex items-center gap-3" style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
          <span className="flex items-center gap-1">
            <i style={{ width: 8, height: 8, borderRadius: 2, background: ON_TIME_COLOR, display: "inline-block" }} />
            On time
          </span>
          <span className="flex items-center gap-1">
            <i style={{ width: 8, height: 8, borderRadius: 2, background: LATE_COLOR, display: "inline-block" }} />
            Late
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
              const filed = p.filedN;
              const onTimePct = filed > 0 ? (p.onTime / filed) * 100 : 0;
              const latePct = filed > 0 ? (p.late / filed) * 100 : 0;
              const label = formatWorkDate(p.d);
              const desc =
                filed > 0
                  ? `${label}: of ${filed} filed, ${p.onTime} on time, ${p.late} late${p.matured === false ? " (still maturing)" : ""}`
                  : `${label}: no filed report`;
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
                      height: filed > 0 ? "100%" : "0%",
                      display: "flex",
                      flexDirection: "column-reverse",
                      borderRadius: "2px 2px 0 0",
                      overflow: "hidden",
                    }}
                  >
                    <div style={{ height: `${onTimePct}%`, background: ON_TIME_COLOR }} />
                    <div style={{ height: `${latePct}%`, background: LATE_COLOR }} />
                  </div>
                </Link>
              );
            })}
          </div>
          <TrendGridlines max={100} format={(v) => `${Math.round(v)}%`} />
        </div>
      )}
      {trend.length > 0 && <TrendDateAxis days={trend.map((p) => p.d)} />}
    </div>
  );
}
