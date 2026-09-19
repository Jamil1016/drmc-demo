// components/hr/variance/VarianceDistribution.tsx
"use client";
import { useMemo } from "react";
import { personStats, boxStats, distDomain, type VarianceRow } from "@/lib/hr/domain/variance-agg";
import { variancePctColor, darkenHex } from "@/lib/hr/domain/variance-color";
import { DISPLAY_GROUPS, type DisplayGroup } from "@/lib/hr/domain/production-scope";
import { useChartWidth } from "./use-chart-width";

const BREACH_PCT = 15;
const L = 118;
const TOP = 10;
const RH = 44;
const AXOFF = 18;

/** Group box plot: one row per carrier group, every person in the group shown
 *  as a small jittered dot plus the group's box (q1-q3) and median line.
 *  Member distribution now lives in VarianceMemberDist; this is group-only.
 */
export function VarianceDistribution(props: {
  rows: VarianceRow[];
  selectedGroup?: DisplayGroup | null;
  onGroupClick: (g: DisplayGroup) => void;
  onPersonClick: (empId: string) => void;
}) {
  const { rows, selectedGroup, onGroupClick, onPersonClick } = props;
  const [wrapRef, cw] = useChartWidth(720);

  const groups = useMemo(() => {
    const stats = personStats(rows);
    return DISPLAY_GROUPS.map((g) => {
      const people = stats.filter((p) => p.displayGroup === g);
      const values = people.map((p) => p.medianVariancePct);
      return { group: g, people, values, box: boxStats(values) };
    });
  }, [rows]);

  const allValues = useMemo(() => groups.flatMap((g) => g.values), [groups]);
  const [vmin, vmax] = distDomain(allValues);
  const plotW = Math.max(120, cw - L - 40);
  const x0 = L, x1 = L + plotW;
  const X = (v: number) => x0 + (Math.max(vmin, Math.min(vmax, v)) - vmin) / (vmax - vmin) * plotW;
  const rowsH = groups.length * RH;
  const H = TOP + rowsH + AXOFF + 6;

  const gridlines: number[] = [];
  for (let v = Math.ceil(vmin / 10) * 10; v <= vmax; v += 10) gridlines.push(v);
  const bx = X(BREACH_PCT);

  return (
    <div className="panel">
      <h3>Spread of per-person variance</h3>
      <p className="ph-sub">
        Every dot is a person&apos;s median variance %. Box = middle 50% of the group. Trimmed axis. Click a box to
        drill.
      </p>
      <div ref={wrapRef} style={{ width: "100%" }}>
      <svg viewBox={`0 0 ${cw} ${H}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
        <rect x={bx} y={TOP} width={x1 - bx} height={rowsH} fill="#c9564a0a" />
        {gridlines.map((v) => (
          <g key={v}>
            <line
              x1={X(v)}
              y1={TOP}
              x2={X(v)}
              y2={TOP + rowsH}
              stroke={v === 0 ? "#9ca3af" : "#f0f1f3"}
              strokeDasharray={v === 0 ? "3 3" : undefined}
            />
            <text x={X(v)} y={TOP + rowsH + AXOFF} fontSize={9} fill="#9ca3af" textAnchor="middle">
              {v}%
            </text>
          </g>
        ))}
        <line x1={bx} y1={TOP} x2={bx} y2={TOP + rowsH} stroke="#c9564a" strokeWidth={1.5} />
        <text x={bx} y={TOP + rowsH + AXOFF} fontSize={9} fill="#c9564a" textAnchor="middle" fontWeight={600}>
          15%
        </text>
        {groups.map((g, ri) => {
          const y = TOP + ri * RH + RH / 2;
          const isSelected = selectedGroup === g.group;
          const dimmed = selectedGroup != null && !isSelected;
          const col = variancePctColor(g.box.med);
          const breachCount = g.people.filter((p) => p.medianVariancePct >= BREACH_PCT).length;
          return (
            <g
              key={g.group}
              className="boxg"
              style={{ cursor: "pointer" }}
              opacity={dimmed ? 0.3 : 1}
              onClick={() => onGroupClick(g.group)}
            >
              <text x={L - 8} y={y - 4} fontSize={11.5} fill="#374151" fontWeight={isSelected ? 700 : 600} textAnchor="end">
                {g.group}
              </text>
              <text x={L - 8} y={y + 10} fontSize={9} fill="#9ca3af" textAnchor="end">
                {`n${g.people.length} · med ${g.box.med.toFixed(0)}% · ${breachCount} brch`}
              </text>
              {g.people.map((p, pi) => {
                const jy = y + ((pi * 7) % 16) - 8;
                return (
                  <circle
                    key={p.empId}
                    cx={X(p.medianVariancePct)}
                    cy={jy}
                    r={3}
                    fill={variancePctColor(p.medianVariancePct)}
                    opacity={0.55}
                    style={{ cursor: "pointer" }}
                    onClick={(e) => {
                      e.stopPropagation();
                      onPersonClick(p.empId);
                    }}
                  >
                    <title>{`${p.employeeName}: ${p.medianVariancePct}%`}</title>
                  </circle>
                );
              })}
              <line x1={X(g.box.whiskerLo)} y1={y} x2={X(g.box.whiskerHi)} y2={y} stroke="#9aa2ad" />
              <rect
                x={X(g.box.q1)}
                y={y - 9}
                width={Math.max(2, X(g.box.q3) - X(g.box.q1))}
                height={18}
                rx={2}
                fill={`${col}22`}
                stroke={col}
                strokeWidth={isSelected ? 2 : 1}
              />
              <line x1={X(g.box.med)} y1={y - 9} x2={X(g.box.med)} y2={y + 9} stroke={darkenHex(col)} strokeWidth={2.5} />
            </g>
          );
        })}
      </svg>
      </div>
    </div>
  );
}
