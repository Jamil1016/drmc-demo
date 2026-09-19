// components/hr/variance/VarianceMemberDist.tsx
"use client";
import { useMemo } from "react";
import { binDots, distDomain, type PersonStat } from "@/lib/hr/domain/variance-agg";
import { variancePctColor } from "@/lib/hr/domain/variance-color";
import { useChartWidth } from "./use-chart-width";

const BREACH_PCT = 15;
const L = 8;
const DOT_R = 5;
const BIN_W = 13;
const STEP = 11;

/** Pooled member-distribution dot-histogram: every person is a dot at their
 *  median variance %, stacked upward so height = count. Ported from the
 *  mockup's drawDots()/renderMemberDist(). */
export function VarianceMemberDist(props: {
  people: PersonStat[];
  scopeLabel: string;
  highlightEmpId?: string | null;
  onMemberClick: (empId: string) => void;
}) {
  const { people, scopeLabel, highlightEmpId, onMemberClick } = props;
  const [wrapRef, cw] = useChartWidth(720);
  const plotW = Math.max(120, cw - L - 8);

  // Sort ascending with the IDENTICAL comparator binDots uses internally, so
  // that after binning, bins[i] lines up with sortedPeople[i] (stable sort).
  const sortedPeople = useMemo(
    () => [...people].sort((a, b) => a.medianVariancePct - b.medianVariancePct),
    [people],
  );
  const [cmin, cmax] = useMemo(
    () => distDomain(people.map((p) => p.medianVariancePct)),
    [people],
  );
  const { bins, maxStack } = useMemo(
    () => binDots(sortedPeople.map((p) => p.medianVariancePct), cmin, cmax, plotW, BIN_W),
    [sortedPeople, cmin, cmax, plotW],
  );

  const x0 = L, x1 = L + plotW;
  const X = (c: number) => x0 + (Math.max(cmin, Math.min(cmax, c)) - cmin) / (cmax - cmin) * plotW;
  const effMax = Math.max(maxStack, 2);
  const topPad = 14, axisPad = 40;
  const baseY = topPad + effMax * STEP + DOT_R;
  const H = baseY + axisPad;

  const gridlines: number[] = [];
  for (let v = Math.ceil(cmin / 10) * 10; v <= cmax; v += 10) gridlines.push(v);

  return (
    <div className="panel">
      <h3>Member distribution</h3>
      <p className="sub">
        {scopeLabel} · by median variance %. Stacked height = how many members sit at that level. Click a dot to
        drill in.
      </p>
      {people.length === 0 ? (
        <p className="sub">No members in this range.</p>
      ) : (
        <div ref={wrapRef} style={{ width: "100%" }}>
        <svg
          viewBox={`0 0 ${cw} ${H}`}
          style={{ width: "100%", display: "block", overflow: "visible" }}
        >
          <rect x={X(BREACH_PCT)} y={8} width={x1 - X(BREACH_PCT)} height={baseY - 8} fill="#c9564a0a" />
          {gridlines.map((v) => (
            <g key={v}>
              <line x1={X(v)} y1={8} x2={X(v)} y2={baseY} stroke={v === 0 ? "#e5e7eb" : "#f4f5f6"} />
              <text x={X(v)} y={baseY + 14} fontSize={8} fill="#9ca3af" textAnchor="middle">
                {v}%
              </text>
            </g>
          ))}
          <line x1={X(BREACH_PCT)} y1={8} x2={X(BREACH_PCT)} y2={baseY} stroke="#c9564a" strokeDasharray="3 3" />
          <line x1={x0} y1={baseY} x2={x1} y2={baseY} stroke="#d1d5db" />
          <text x={x0} y={14} fontSize={8} fill="#9ca3af">
            ↑ members
          </text>
          <text x={X(BREACH_PCT)} y={baseY + 28} fontSize={9} fill="#c9564a" textAnchor="middle">
            15% breach ►
          </text>
          {bins.map((b, i) => {
            const p = sortedPeople[i];
            const cx = x0 + b.binIndex * BIN_W;
            const cy = baseY - DOT_R - b.stackIndex * STEP;
            const isHi = highlightEmpId != null && p.empId === highlightEmpId;
            return (
              <circle
                key={`${p.empId}-${i}`}
                className="dot"
                cx={cx}
                cy={cy}
                r={isHi ? DOT_R + 1 : DOT_R}
                fill={variancePctColor(b.value)}
                stroke={isHi ? "#111" : undefined}
                strokeWidth={isHi ? 2 : undefined}
                style={{ cursor: "pointer" }}
                onClick={() => onMemberClick(p.empId)}
              >
                <title>{`${p.employeeName}: ${p.medianVariancePct}%`}</title>
              </circle>
            );
          })}
        </svg>
        </div>
      )}
    </div>
  );
}
