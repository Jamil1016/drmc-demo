// components/hr/variance/VarianceMemberBox.tsx
"use client";

import { useMemo } from "react";
import { boxStats, distDomain, type VarianceRow } from "@/lib/hr/domain/variance-agg";
import { variancePctColor, darkenHex } from "@/lib/hr/domain/variance-color";
import { useChartWidth } from "./use-chart-width";

const BREACH_PCT = 15;

/** Single-member box plot: the spread of one person's daily variance % across
 *  the days currently in view. Sits at the top of the focus rail's person state
 *  (Overview > carrier > member), above the day list, and summarises what the
 *  day bars below show one row at a time. Mirrors VarianceDistribution's style:
 *  box = middle 50% (Q1-Q3), median line, 1.5*IQR whiskers, a dot per day, and
 *  the dashed 15% breach reference line. */
export function VarianceMemberBox({ days }: { days: VarianceRow[] }) {
  const [wrapRef, cw] = useChartWidth(320);

  const values = useMemo(() => days.map((d) => d.variancePct), [days]);
  const box = useMemo(() => boxStats(values), [values]);

  // A box plot needs a distribution; one or zero days has no spread to show.
  if (values.length < 2) return null;

  const breaching = values.filter((v) => v >= BREACH_PCT).length;
  const [vmin, vmax] = distDomain(values);
  const span = Math.max(1, vmax - vmin);

  const PADX = 14, TOP = 12, ROWH = 34, AXOFF = 16;
  const plotW = Math.max(80, cw - PADX * 2);
  const x0 = PADX, x1 = PADX + plotW;
  const X = (v: number) => x0 + ((Math.max(vmin, Math.min(vmax, v)) - vmin) / span) * plotW;
  const H = TOP + ROWH + AXOFF + 4;
  const yMid = TOP + ROWH / 2;

  const gridlines: number[] = [];
  for (let v = Math.ceil(vmin / 10) * 10; v <= vmax; v += 10) gridlines.push(v);
  const bx = X(BREACH_PCT);
  const breachInView = BREACH_PCT >= vmin && BREACH_PCT <= vmax;
  const col = variancePctColor(box.med);

  return (
    <div className="member-box">
      <div className="mb-head">
        <span className="mb-title">Daily variance % spread</span>
        <span className="mb-sub">n{values.length} · med {box.med.toFixed(0)}% · {breaching} breaching</span>
      </div>
      <div ref={wrapRef} style={{ width: "100%" }}>
        <svg viewBox={`0 0 ${cw} ${H}`} style={{ width: "100%", display: "block", overflow: "visible" }}>
          {breachInView && <rect x={bx} y={TOP} width={x1 - bx} height={ROWH} fill="#c9564a0a" />}
          {gridlines.map((v) => (
            <g key={v}>
              <line
                x1={X(v)}
                y1={TOP}
                x2={X(v)}
                y2={TOP + ROWH}
                stroke={v === 0 ? "#9ca3af" : "#f0f1f3"}
                strokeDasharray={v === 0 ? "3 3" : undefined}
              />
              <text x={X(v)} y={TOP + ROWH + AXOFF} fontSize={9} fill="#9ca3af" textAnchor="middle">
                {v}%
              </text>
            </g>
          ))}
          {breachInView && (
            <>
              <line x1={bx} y1={TOP} x2={bx} y2={TOP + ROWH} stroke="#c9564a" strokeWidth={1.5} />
              <text x={bx} y={TOP + ROWH + AXOFF} fontSize={9} fill="#c9564a" textAnchor="middle" fontWeight={600}>
                15%
              </text>
            </>
          )}
          <line x1={X(box.whiskerLo)} y1={yMid} x2={X(box.whiskerHi)} y2={yMid} stroke="#9aa2ad" />
          {days.map((d, i) => (
            <circle
              key={d.taskDid}
              cx={X(d.variancePct)}
              cy={yMid + ((i * 7) % 14) - 7}
              r={3}
              fill={variancePctColor(d.variancePct)}
              opacity={0.55}
            >
              <title>{`${d.workDate}: ${d.variancePct}%`}</title>
            </circle>
          ))}
          <rect
            x={X(box.q1)}
            y={yMid - 9}
            width={Math.max(2, X(box.q3) - X(box.q1))}
            height={18}
            rx={2}
            fill={`${col}22`}
            stroke={col}
            strokeWidth={1}
          />
          <line x1={X(box.med)} y1={yMid - 9} x2={X(box.med)} y2={yMid + 9} stroke={darkenHex(col)} strokeWidth={2.5} />
        </svg>
      </div>
    </div>
  );
}
