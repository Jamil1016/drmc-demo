// components/hr/variance/VarianceHeatmap.tsx
"use client";
import { useMemo, useState } from "react";
import {
  bucketByColumn,
  cellStats,
  personStats,
  enumerateWeekStarts,
  enumerateDayColumns,
  colKeyOf,
  type VarianceRow,
  type ColMode,
} from "@/lib/hr/domain/variance-agg";
import { variancePctColor, breachPctColor } from "@/lib/hr/domain/variance-color";
import { DISPLAY_GROUPS, type DisplayGroup } from "@/lib/hr/domain/production-scope";
import { formatWorkDate } from "@/lib/time";
import { useChartWidth } from "./use-chart-width";

export type HeatMetric = "var" | "breach";
export type HeatCellClick =
  | { kind: "group"; group: DisplayGroup; weekStart: string; dayIso: string | null }
  | { kind: "member"; empId: string; weekStart: string; dayIso: string | null };

type Col = { key: string; weekStart: string; dayIso: string | null; label: string; partial: boolean };

function buildColumns(from: string, to: string, colMode: ColMode, currentWeekStart: string): Col[] {
  if (colMode === "day") {
    return enumerateDayColumns(from, to).map((d) => ({
      key: d.dayIso,
      weekStart: d.weekStart,
      dayIso: d.dayIso,
      label: formatWorkDate(d.dayIso),
      partial: d.weekStart === currentWeekStart,
    }));
  }
  return enumerateWeekStarts(from, to).map((w) => ({
    key: w,
    weekStart: w,
    dayIso: null,
    label: formatWorkDate(w),
    partial: w === currentWeekStart,
  }));
}

function cellColor(rowsInCell: VarianceRow[], metric: HeatMetric): { color: string; title: string } | null {
  const c = cellStats(rowsInCell);
  if (!c) return null;
  return metric === "var"
    ? { color: variancePctColor(c.avgVariancePct), title: `variance ${c.avgVariancePct}%` }
    : { color: breachPctColor(c.breachPct), title: `${c.breachPct}% breaching` };
}

export function VarianceHeatmap(props: {
  rows: VarianceRow[];
  from: string;
  to: string;
  view: "group" | "member";
  colMode: ColMode;
  metric: HeatMetric;
  currentWeekStart: string;
  selected: { group?: DisplayGroup; empId?: string; weekStart?: string; dayIso?: string | null } | null;
  onRowClick: (t: { kind: "group"; group: DisplayGroup } | { kind: "member"; empId: string }) => void;
  onCellClick: (t: HeatCellClick) => void;
  onMetricChange: (m: HeatMetric) => void;
  onColModeChange: (c: ColMode) => void;
}) {
  const { rows, from, to, view, colMode, metric, currentWeekStart, selected } = props;
  const cols = useMemo(() => buildColumns(from, to, colMode, currentWeekStart), [from, to, colMode, currentWeekStart]);

  // By-member view only: cap the rows to the (already worst-first) top 25, or
  // show everyone. Hidden entirely in group view.
  const [memberCap, setMemberCap] = useState(true);

  // Measured panel width so week-mode cells widen to fill the panel (no side
  // gap); day mode keeps fixed-width cells and scrolls horizontally.
  const [wrapRef, cwPanel] = useChartWidth(720);

  // Per-row bucket maps: key = `${rowId}|${colKey}` -> rows. Built once.
  const { rowDefs, buckets } = useMemo(() => {
    const byCol = bucketByColumn(rows, colMode);
    if (view === "group") {
      const defs = DISPLAY_GROUPS.map((g) => ({ id: g as string, label: g as string, group: g }));
      const b = new Map<string, VarianceRow[]>();
      for (const [colKey, colRows] of byCol) {
        for (const g of DISPLAY_GROUPS) b.set(`${g}|${colKey}`, colRows.filter((r) => r.displayGroup === g));
      }
      return { rowDefs: defs, buckets: b };
    }
    let ppl = personStats(rows).sort((a, b2) => b2.medianVariancePct - a.medianVariancePct);
    if (memberCap) ppl = ppl.slice(0, 25);
    const defs = ppl.map((p) => ({ id: p.empId, label: p.employeeName, empId: p.empId }));
    const b = new Map<string, VarianceRow[]>();
    for (const r of rows) {
      const k = `${r.empId}|${colKeyOf(r, colMode)}`;
      const arr = b.get(k);
      if (arr) arr.push(r);
      else b.set(k, [r]);
    }
    return { rowDefs: defs, buckets: b };
  }, [rows, view, colMode, memberCap]);

  const shownRowDefs = rowDefs;

  const isDay = colMode === "day";
  const L = view === "group" ? 118 : 150;
  const rh = view === "group" ? 30 : 24;
  const top = 22;
  // Cells stretch to fill the panel width so W below equals the measured panel
  // width exactly -> the SVG renders 1:1 and filling the width widens the cells
  // WITHOUT magnifying the row height or fonts (those come from the fixed rh /
  // fontSize values, not the cell width). Each mode has a lower bound on cell
  // width: below it, W exceeds the panel and week mode gently downscales while
  // day mode (minWidth: W on the svg) scrolls horizontally. The bound is smaller
  // for day mode since a day range has ~7x the columns.
  const cwFill = (cwPanel - L - 8) / Math.max(1, cols.length);
  const cw = isDay ? Math.max(12, cwFill) : Math.max(24, cwFill);
  const W = L + cols.length * cw + 8;
  const H = top + shownRowDefs.length * rh + 6;

  const legend = metric === "var"
      ? ([["#57a07c", "0% or less"], ["#8dc4a3", "5%"], ["#bcdcc7", "12%"], ["#e2897b", "15% breach"], ["#cc5647", "24%"], ["#a5342a", "40%+"]] as const)
      : ([["#57a07c", "0%"], ["#8dc4a3", "8%"], ["#e2897b", "15%"], ["#cc5647", "30%"], ["#a5342a", "45%+"]] as const);

  return (
    <div className="panel">
      <div className="row-head">
        <div>
          <h3>{view === "member" ? "Members (worst first)" : "Carrier group over time"}</h3>
          <p className="ph-sub" style={{ margin: 0 }}>
            {view === "member"
              ? "Rows sorted worst first by median variance %. Click a member or cell to drill in."
              : "Click a row or cell to drill into a group. Faded column is the current week (in progress)."}
          </p>
        </div>
        <div className="metricToggle">
          <button className={metric === "var" ? "on" : ""} onClick={() => props.onMetricChange("var")}>Avg variance %</button>
          <button className={metric === "breach" ? "on" : ""} onClick={() => props.onMetricChange("breach")}>% breaching</button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", margin: "0 0 10px", flexWrap: "wrap" }}>
        <span style={{ fontSize: 11, color: "var(--muted)" }}>Columns</span>
        <div className="metricToggle" style={{ margin: 0 }}>
          <button className={colMode === "week" ? "on" : ""} onClick={() => props.onColModeChange("week")}>Week</button>
          <button className={colMode === "day" ? "on" : ""} onClick={() => props.onColModeChange("day")}>Day</button>
        </div>
        {view === "member" && (
          <>
            <span style={{ fontSize: 11, color: "var(--muted)" }}>Rows</span>
            <div className="metricToggle" style={{ margin: 0 }}>
              <button className={memberCap ? "on" : ""} onClick={() => setMemberCap(true)}>Top 25</button>
              <button className={!memberCap ? "on" : ""} onClick={() => setMemberCap(false)}>Show all</button>
            </div>
          </>
        )}
      </div>

      <div ref={wrapRef} style={{ overflowX: "auto" }}>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", minWidth: isDay ? W : undefined, display: "block", overflow: "visible" }}>
          {/* column headers */}
          {cols.map((c, i) => {
            const x = L + i * cw;
            if (isDay) {
              // At each week's first day: a divider line spanning the grid plus a
              // bold week-start date, so week boundaries are clear in the day view.
              const firstOfWeek = i === 0 || cols[i - 1].weekStart !== c.weekStart;
              if (!firstOfWeek) return null;
              return (
                <g key={`h${c.key}`}>
                  {i > 0 && <line x1={x} y1={top} x2={x} y2={top + shownRowDefs.length * rh} stroke="#d1d5db" />}
                  <text x={x + 3} y={15} fontSize={8.5} fontWeight={600} fill={c.partial ? "#c7c7c7" : "#6b7280"} textAnchor="start">
                    {c.weekStart.slice(5)}
                  </text>
                </g>
              );
            }
            return (
              <text key={`h${c.key}`} x={x + cw / 2} y={15} fontSize={9} fill={c.partial ? "#c7c7c7" : "#9ca3af"} textAnchor="middle">
                {c.weekStart.slice(5)}{c.partial ? " •" : ""}
              </text>
            );
          })}
          {/* rows */}
          {shownRowDefs.map((rd, ri) => {
            const y = top + ri * rh;
            const active = view === "group" ? selected?.group === (rd as { group: DisplayGroup }).group : selected?.empId === (rd as { empId: string }).empId;
            return (
              <g key={rd.id}>
                <text
                  x={L - 8}
                  y={y + rh / 2 + 4}
                  fontSize={view === "group" ? 11 : 11.5}
                  fill={active ? "#111" : "#374151"}
                  fontWeight={active ? 700 : 400}
                  textAnchor="end"
                  style={{ cursor: "pointer" }}
                  onClick={() =>
                    view === "group"
                      ? props.onRowClick({ kind: "group", group: (rd as { group: DisplayGroup }).group })
                      : props.onRowClick({ kind: "member", empId: (rd as { empId: string }).empId })
                  }
                >
                  {rd.label}
                </text>
                {cols.map((c, ci) => {
                  const x = L + ci * cw;
                  const cell = cellColor(buckets.get(`${rd.id}|${c.key}`) ?? [], metric);
                  if (!cell) {
                    return <rect key={c.key} x={x + 1} y={y + 1} width={cw - 2} height={rh - 2} rx={2} fill="#f3f4f6" />;
                  }
                  const sel =
                    selected?.weekStart === c.weekStart &&
                    (selected?.dayIso ?? null) === c.dayIso &&
                    (view === "group"
                      ? selected?.group === (rd as { group: DisplayGroup }).group
                      : selected?.empId === (rd as { empId: string }).empId);
                  return (
                    <rect
                      key={c.key}
                      className={`cell${c.partial ? " partial" : ""}`}
                      x={x + 1}
                      y={y + 1}
                      width={cw - 2}
                      height={rh - 2}
                      rx={isDay ? 1 : 3}
                      fill={cell.color}
                      style={sel ? { stroke: "#111", strokeWidth: 2 } : undefined}
                      onClick={() =>
                        view === "group"
                          ? props.onCellClick({ kind: "group", group: (rd as { group: DisplayGroup }).group, weekStart: c.weekStart, dayIso: c.dayIso })
                          : props.onCellClick({ kind: "member", empId: (rd as { empId: string }).empId, weekStart: c.weekStart, dayIso: c.dayIso })
                      }
                    >
                      <title>{`${rd.label} · ${c.label}${c.partial ? " (in progress)" : ""}\n${cell.title}`}</title>
                    </rect>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      <div className="legend">
        {legend.map(([color, label]) => (
          <span key={label} className="lg"><span className="sw" style={{ background: color }} />{label}</span>
        ))}
        <span className="lg" style={{ opacity: 0.65 }}><span className="sw" style={{ background: "#9aa2ad", opacity: 0.4 }} />current week (in progress)</span>
      </div>
    </div>
  );
}
