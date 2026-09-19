import { requireMinRolePage } from "@/lib/auth/require-user";
import { getVarianceRows } from "@/lib/hr/queries/variance-queries";
import { getLastDataRefresh } from "@/lib/hr/queries/data-freshness";
import { getTimerRollupHealth } from "@/lib/hr/queries/timer-rollup-health";
import { mondayWeekStart, basePosition } from "@/lib/hr/domain/variance-agg";
import { DISPLAY_GROUPS, type DisplayGroup } from "@/lib/hr/domain/production-scope";
import { parseVarianceParams, scopeVarianceRows } from "@/lib/hr/domain/variance-filters";
import { PageHeader } from "@/components/ui/PageHeader";
import { LiveRefresh } from "@/components/ui/LiveRefresh";
import { BackToTop } from "@/components/ui/BackToTop";
import { formatDataRefresh } from "@/lib/time";
import { getDisplayZone } from "@/lib/display-zone.server";
import { formatInTimeZone } from "date-fns-tz";
import { VarianceControls, type ViewMode } from "@/components/hr/variance/VarianceControls";
import { VarianceLive } from "@/components/hr/variance/VarianceLive";
import type { ColMode } from "@/lib/hr/domain/variance-agg";
import type { HeatMetric } from "@/components/hr/variance/VarianceHeatmap";
import "./variance.css";

export const dynamic = "force-dynamic";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

type SearchParams = {
  dateFrom?: string; dateTo?: string;
  view?: string; group?: string; member?: string; cell?: string; col?: string; metric?: string;
  inactive?: string; position?: string;
};

/** A `cell` URL param is either a week-start (Monday) or an exact work date.
 *  Equal to its own Monday week-start => a week cell (dayIso: null); any
 *  other ISO date => a day cell. Undefined when there is no cell param. */
function parseCell(cell: string | undefined): { weekStart: string; dayIso: string | null } | undefined {
  if (!cell || !ISO_DATE.test(cell)) return undefined;
  const weekStart = mondayWeekStart(cell);
  return { weekStart, dayIso: cell === weekStart ? null : cell };
}

export default async function HoursVariancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // manager+ can view the dashboard and its print report.
  await requireMinRolePage("manager");
  const zone = await getDisplayZone();
  const sp = await searchParams;
  const { from, to, groups, includeInactive, positions } = parseVarianceParams(sp);
  const view: ViewMode = sp.view === "member" ? "member" : "group";
  const colMode: ColMode = sp.col === "day" ? "day" : "week";
  const metric: HeatMetric = sp.metric === "breach" ? "breach" : "var";

  const [rowsAll, lastRefresh, timerHealth] = await Promise.all([
    getVarianceRows(from, to),
    getLastDataRefresh(),
    getTimerRollupHealth(),
  ]);
  // Position options are BASE titles (level stripped), so the filter shows a few
  // clean options rather than every level. Drawn from the full in-range production set so any
  // position with data in the window is always selectable.
  const positionOptions = [...new Set(rowsAll.map((r) => basePosition(r.position)).filter((p): p is string => !!p))].sort();
  // The carrier-group filter narrows which display groups appear (equivalent to drilling).
  const rows = scopeVarianceRows(rowsAll, { groups, includeInactive, positions });

  // Guard: when the timer rollup MV is empty, every report's coverage_pct is
  // NULL and the whole dashboard would render blank. That is a transient
  // refresh state (see lib/hr/queries/timer-rollup-health.ts), not "no data",
  // so show a refreshing notice instead of an empty console.
  const timerRefreshing = timerHealth.empty;

  const currentWeekStart = mondayWeekStart(formatInTimeZone(new Date(), "Asia/Manila", "yyyy-MM-dd"));
  const cell = parseCell(sp.cell);
  const initialDrill = {
    group: sp.group && groups.length === 1 ? groups[0] : (DISPLAY_GROUPS as readonly string[]).includes(sp.group ?? "") ? (sp.group as DisplayGroup) : undefined,
    empId: sp.member || undefined,
    weekStart: cell?.weekStart,
    dayIso: cell?.dayIso,
  };

  return (
    <div className="variance-page flex flex-col gap-4">
      <PageHeader
        title="Hours Analysis"
        description="Production team stated vs worked hours. Variance % is the untimed share; 15% or more is a breach."
      >
        <LiveRefresh label={formatDataRefresh(lastRefresh, zone)} />
      </PageHeader>

      {/* Controls always render (they don't depend on timer data). The console
          is gated by VarianceLive so a background auto-refresh landing in an
          empty-MV window can't tear down the workspace / open modal: it holds
          the last-good render and shows an inline badge instead. Only a cold
          first paint with no data shows the full-page refreshing notice. */}
      <VarianceControls
        from={from}
        to={to}
        view={view}
        groups={groups}
        includeInactive={includeInactive}
        positionOptions={positionOptions}
        positions={positions}
      />

      <VarianceLive
        refreshing={timerRefreshing}
        keySig={`${from}:${to}:${view}:${groups.join(",")}:${includeInactive}:${positions.join(",")}`}
        rows={rows}
        from={from}
        to={to}
        view={view}
        currentWeekStart={currentWeekStart}
        initialDrill={initialDrill}
        initialColMode={colMode}
        initialMetric={metric}
      />

      <BackToTop />
    </div>
  );
}
