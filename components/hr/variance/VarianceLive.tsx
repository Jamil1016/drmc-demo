// components/hr/variance/VarianceLive.tsx
"use client";

import { useState } from "react";
import type { VarianceRow, ColMode } from "@/lib/hr/domain/variance-agg";
import type { DisplayGroup } from "@/lib/hr/domain/production-scope";
import type { HeatMetric } from "./VarianceHeatmap";
import { VarianceWorkspace } from "./VarianceWorkspace";

type WorkspaceProps = {
  rows: VarianceRow[];
  from: string;
  to: string;
  view: "group" | "member";
  currentWeekStart: string;
  initialDrill: { group?: DisplayGroup; empId?: string; weekStart?: string; dayIso?: string | null };
  initialColMode: ColMode;
  initialMetric: HeatMetric;
};

/**
 * Keeps the Hours Variance console mounted across the 60s LiveRefresh ticks.
 *
 * The timer rollup MV (`mv_timer_day_rollup`) goes transiently empty during its
 * CONCURRENTLY rebuild (see lib/hr/queries/timer-rollup-health.ts). The page
 * used to swap the whole console out for a full-page "refreshing" notice
 * whenever that happened -- including on a *background* router.refresh(), which
 * unmounted the open day-timeline (gantt) modal and collapsed the page so the
 * browser jumped to the top. That guard is only needed on the FIRST paint (so a
 * cold load doesn't flash a blank dashboard); once healthy data has rendered we
 * must never tear the console down again.
 *
 * On a background refresh that lands in an empty-MV window we render the last
 * healthy snapshot (rows + remount key) so the charts don't blank, keep the
 * workspace mounted with a stable key (so the modal and scroll position
 * survive), and show a small inline amber badge instead of destroying the view.
 */
export function VarianceLive({
  refreshing,
  keySig,
  ...workspace
}: { refreshing: boolean; keySig: string } & WorkspaceProps) {
  // Snapshot of the last healthy render, kept in state so it survives the
  // router.refresh() re-render. Updated during render (React's supported
  // "adjust state from props" pattern) and compared by keySig -- a primitive --
  // so the freshly-created `workspace` object identity can't spin an update
  // loop. Null until the first healthy data has been captured.
  const [snap, setSnap] = useState<{ keySig: string; props: WorkspaceProps } | null>(
    refreshing ? null : { keySig, props: workspace },
  );
  if (!refreshing && snap?.keySig !== keySig) {
    setSnap({ keySig, props: workspace });
  }

  // First paint, no healthy data captured yet -> the full-page refreshing
  // notice. Once we've rendered healthy data this branch is never taken again.
  if (!snap) {
    return (
      <div className="panel timer-refreshing" role="status">
        <div className="spin" aria-hidden />
        <h3>Timer data is refreshing</h3>
        <p className="sub">
          The worked-hours rollup is being rebuilt, so coverage and variance are
          momentarily unavailable. This usually clears within a few minutes.
          The page reloads its data on its own, or refresh to check again.
        </p>
      </div>
    );
  }

  // Healthy -> render the current data. Background empty-MV window -> render the
  // last healthy snapshot + a badge. Either way the workspace key is stable
  // across the tick, so the open modal and the scroll position survive.
  const shown = refreshing ? snap : { keySig, props: workspace };
  return (
    <>
      {refreshing && (
        <span
          className="live-badge live-badge--stale variance-refresh-badge"
          role="status"
          title="The worked-hours rollup is rebuilding. Showing the last loaded data; it updates automatically when the rebuild finishes."
        >
          <span className="live-dot live-dot--stale" aria-hidden />
          <span>Refreshing timer data · showing last loaded</span>
        </span>
      )}
      <VarianceWorkspace key={shown.keySig} {...shown.props} />
    </>
  );
}
