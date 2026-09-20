"use client";

import { useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { DateRangeField } from "@/components/ui/DateRangeField";
import { LiveRefresh } from "@/components/ui/LiveRefresh";
import { setParams } from "@/lib/hr/domain/filter-url";
import { deltaInfo, type Delta } from "@/lib/hr/domain/kpi-delta";
import type { ReviewSummary } from "@/lib/hr/queries/review-queries";

/** Drill-down into a page that exists in this build, over the same date range
 *  (no range params in all-time mode, where both bounds are blank). */
function rangeHref(path: string, dateFrom: string, dateTo: string): string {
  const params = new URLSearchParams();
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

type Tile = {
  label: string;
  value: string;
  sub?: string;
  tone?: "amber" | "red";
  /** Absent for a figure with no list behind it (a missing report has no row to open). */
  href?: string;
  delta?: Delta | null;
  /** Hover explanation (native title tooltip). */
  tip: string;
};

/**
 * The dashboard's title band: same gradient KPI-band look as `KpiBand`, but
 * each tile carries a period-over-period delta and deep-links to the page that
 * lists what it counts (KpiBand's tiles do neither, so this renders the same
 * markup/classes directly instead of restyling the shared component). Also owns
 * the date-range control (URL params are the source of truth) and the live
 * data-freshness badge.
 */
export function ReviewKpis({
  kpis,
  prevKpis,
  dateFrom,
  dateTo,
  freshnessLabel,
}: {
  kpis: ReviewSummary["kpis"];
  prevKpis?: ReviewSummary["kpis"] | null;
  dateFrom: string;
  dateTo: string;
  freshnessLabel: string;
}) {
  const router = useRouter();
  const params = useSearchParams();

  const applyRange = useCallback(
    (from?: string, to?: string) => {
      const base = new URLSearchParams(params.toString());
      // Clearing (no from/to) means "show everything", which must be distinct from
      // the initial no-params load (30-day default), so mark it with range=all.
      // Picking a range clears that sentinel.
      const next = from || to
        ? setParams(base, { dateFrom: from, dateTo: to, range: undefined })
        : setParams(base, { dateFrom: undefined, dateTo: undefined, range: "all" });
      const qs = next.toString();
      router.replace(qs ? `/hr?${qs}` : "/hr", { scroll: false });
    },
    [params, router],
  );

  const onTime = kpis.onTimePct == null ? "n/a" : `${kpis.onTimePct}%`;
  const medianLag = kpis.medianLagHours == null ? "n/a" : `${kpis.medianLagHours}h`;
  const p90Lag = kpis.p90LagHours == null ? "n/a" : `${kpis.p90LagHours}h`;
  const lateRate = kpis.matured ? `${Math.round((100 * kpis.late) / kpis.matured * 10) / 10}% of matured` : "n/a";

  const num = (n: number) => String(Math.round(n));
  const pp = (n: number) => `${Math.round(n * 10) / 10}pp`;
  const hrs = (n: number) => `${Math.round(n * 10) / 10}h`;

  const browse = rangeHref("/approvals/browse", dateFrom, dateTo);

  const tiles: Tile[] = [
    {
      label: "On-time filing",
      tip: "Share of daily reports filed within 48 hours of the employee's first clock-in for that work day (60 hours for Friday work dates). Click to open the report list for this range.",
      value: onTime,
      sub: "of filed reports",
      href: browse,
      delta: deltaInfo(kpis.onTimePct, prevKpis?.onTimePct, true, pp),
    },
    {
      label: "Late filings",
      tip: "Reports filed more than 48 hours after the first clock-in (60 hours for Friday work dates). Counted only on matured reports (clock-in older than the deadline).",
      value: String(kpis.late),
      sub: lateRate,
      tone: "amber",
      href: browse,
      delta: deltaInfo(kpis.late, prevKpis?.late, false, num),
    },
    {
      label: "Missing reports",
      tip: "Work days with timer activity but no report filed once the deadline passes (48 hours; 60 for Friday work dates). Days without work evidence (leave, holidays, rest days) are never flagged. The oldest are listed in the unfiled backlog below.",
      value: String(kpis.missing),
      tone: kpis.missing > 0 ? "red" : undefined,
      delta: deltaInfo(kpis.missing, prevKpis?.missing, false, num),
    },
    {
      label: "Median filing lag",
      tip: "Typical hours between first clock-in and filing, over reports that were filed. Median, so a few extreme stragglers don't distort it; p90 shows the slow tail.",
      value: medianLag,
      sub: `p90 ${p90Lag}`,
      href: browse,
      delta: deltaInfo(kpis.medianLagHours, prevKpis?.medianLagHours, false, hrs),
    },
    {
      label: "High variance",
      tip: "Reports where 15% or more of the break-deducted stated hours are not backed by timer evidence (coverage 85% or lower). A review lead, not proof. Click to open Hours Analysis for this range.",
      value: String(kpis.highVariance),
      sub: "of timer-tracked reports",
      tone: kpis.highVariance > 0 ? "red" : undefined,
      href: rangeHref("/hr/variance", dateFrom, dateTo),
      delta: deltaInfo(kpis.highVariance, prevKpis?.highVariance, false, num),
    },
  ];

  return (
    <div className="kpi-band">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="kpi-band-title">DR Monitoring</h1>
          <p className="kpi-band-desc">
            Filing compliance for the selected range · rates computed only on matured reports (clock-in older than
            48h; 60h for Friday work dates)
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <LiveRefresh label={freshnessLabel} />
          <DateRangeField fromIso={dateFrom} toIso={dateTo} onApply={applyRange} />
        </div>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {tiles.map((t) => {
          const body = (
            <>
              <div className="kpi-tile-value">{t.value}</div>
              <div className="kpi-tile-label">{t.label}</div>
              {t.sub && <div className="kpi-tile-sub">{t.sub}</div>}
              {t.delta && (
                <div className="kpi-tile-delta" data-tone={t.delta.tone} title="vs previous period">
                  {t.delta.text}
                </div>
              )}
            </>
          );
          return t.href ? (
            <Link key={t.label} href={t.href} className="kpi-tile kpi-tile-link" data-tone={t.tone} title={t.tip}>
              {body}
            </Link>
          ) : (
            <div key={t.label} className="kpi-tile" data-tone={t.tone} title={t.tip}>
              {body}
            </div>
          );
        })}
      </div>
    </div>
  );
}
