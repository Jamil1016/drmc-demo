// components/hr/variance/VarianceTrend.tsx
"use client";
import { useEffect, useRef, useState } from "react";
import {
  dailyMedianSeries,
  trendChartMode,
  monthlyTrendStats,
  type VarianceRow,
  type TrendPoint,
  type MonthlyTrendStat,
} from "@/lib/hr/domain/variance-agg";
import { variancePctColor } from "@/lib/hr/domain/variance-color";
import { formatWorkDate } from "@/lib/time";
import { useChartWidth } from "./use-chart-width";

const BREACH_PCT = 15;

/** Daily-median-variance line chart card spanning the selected date range, plus
 *  an expand modal with a larger, axis-labeled version of the same chart.
 *  Ported from the mockup's lineChart()/renderTrend()/expandTrend(). */
export function VarianceTrend(props: { rows: VarianceRow[]; scopeLabel: string; from: string; to: string }) {
  const { rows, scopeLabel, from, to } = props;
  const [open, setOpen] = useState(false);
  const [wrapRef, cw] = useChartWidth(430);
  // No cap: the trend follows the selected date range (rows are already scoped
  // to [from, to]), so changing the range re-shapes the line.
  const series = dailyMedianSeries(rows);
  const rangeLabel = `${formatWorkDate(from)} – ${formatWorkDate(to)}`;
  // 3+ calendar months: a daily line overplots, so switch to per-month
  // min–max whiskers + monthly median + a σ (spread) series. Same math as the
  // management report chart (shared domain helpers) — but the threshold runs
  // on the span of the series actually charted, NOT the page's from/to: the
  // workspace narrows `rows` when drilling (a heatmap cell scopes to one
  // day/week), and judging by the outer filter would render that single
  // drilled day as a mostly-empty multi-month chart.
  const spanFrom = series.length ? series[0].date : from;
  const spanTo = series.length ? series[series.length - 1].date : to;
  const mode = trendChartMode(spanFrom, spanTo);
  const months = mode === "monthly" ? monthlyTrendStats(series, spanFrom, spanTo) : [];
  const title = mode === "monthly" ? "Monthly variance range" : "Daily median variance";
  const subCount =
    mode === "monthly" ? `${months.filter((m) => m.n > 0).length} months` : `${series.length} working days`;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="panel">
      <div className="hrow">
        <div>
          <h3>{title}</h3>
          <p className="sub">{scopeLabel} · {rangeLabel} ({subCount})</p>
        </div>
        <button className="expandbtn" onClick={() => setOpen(true)} title="Expand detailed view">
          ⤢
        </button>
      </div>
      {series.length === 0 ? (
        <p className="sub">No data for this range.</p>
      ) : (
        <div ref={wrapRef} style={{ width: "100%" }}>
          {mode === "monthly" ? (
            <MonthlyTrendChart months={months} detailed={false} width={cw} />
          ) : (
            <TrendLineChart series={series} detailed={false} width={cw} />
          )}
        </div>
      )}

      {open && (
        <div
          className="modal-bg"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="modal">
            <div className="mh">
              <div>
                <h2>{title} · {rangeLabel}</h2>
                <p className="msub">
                  {mode === "monthly" ? (
                    <>
                      {scopeLabel} · whisker = month min–max of daily medians, ◆ = monthly median, dashed purple = σ
                      (day-to-day spread, right axis). Red dashed = 15% breach target.
                    </>
                  ) : (
                    <>
                      {scopeLabel} · red dashed = 15% breach target, grey dashed = 0% (fully timed). Each point is the
                      median variance % across that day&apos;s reports.
                    </>
                  )}
                </p>
              </div>
              <button className="close" onClick={() => setOpen(false)}>
                ×
              </button>
            </div>
            {series.length === 0 ? (
              <p className="sub">No data for this range.</p>
            ) : mode === "monthly" ? (
              <MonthlyTrendChart months={months} detailed />
            ) : (
              <TrendLineChart series={series} detailed />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const SIGMA_COLOR = "#7c3aed";

/** Monthly-mode chart: one slot per calendar month of the window — min–max
 *  whisker of the daily medians, a diamond at the monthly median (colored by
 *  the shared variance scale), and a dashed σ series against a right-hand
 *  axis showing how spread each month's days were. Hover reveals the exact
 *  numbers per month. Same math as the report chart (shared domain helper). */
function MonthlyTrendChart({
  months,
  detailed,
  width,
}: {
  months: MonthlyTrendStat[];
  detailed: boolean;
  width?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = detailed ? 740 : width ?? 430;
  const H = detailed ? 300 : 92;
  const padL = detailed ? 36 : 8;
  const padR = detailed ? 42 : 32;
  const padT = 12;
  const padB = detailed ? 30 : 16;

  const withData = months.filter((m) => m.n > 0);
  const lo = Math.min(0, ...withData.map((m) => m.min ?? 0)) - 2;
  const hi = Math.max(20, ...withData.map((m) => m.max ?? 20)) + 3;
  // Fixed 0-100 sd scale (matches the report chart): sd sits low — visible
  // but subordinate, never misread against the 15% target line.
  const sdMax = 100;

  const slotW = (W - padL - padR) / months.length;
  const X = (i: number) => padL + (i + 0.5) * slotW;
  const Y = (v: number) => padT + ((hi - v) / (hi - lo)) * (H - padT - padB);
  const YS = (v: number) => padT + ((sdMax - v) / sdMax) * (H - padT - padB);

  const gridlines: number[] = [];
  if (detailed) {
    for (let g = Math.ceil(lo / 10) * 10; g <= hi; g += 10) gridlines.push(g);
  }

  // σ polyline, broken at months with no σ (n < 2)
  const sdSegs: string[] = [];
  let seg: string[] = [];
  months.forEach((m, i) => {
    if (m.sd != null) {
      seg.push(`${seg.length ? "L" : "M"}${X(i).toFixed(1)} ${YS(m.sd).toFixed(1)}`);
    } else if (seg.length) {
      sdSegs.push(seg.join(" "));
      seg = [];
    }
  });
  if (seg.length) sdSegs.push(seg.join(" "));

  const cap = Math.min(detailed ? 12 : 7, slotW * 0.18);
  const dia = detailed ? 6 : 4;

  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg || months.length === 0) return;
    const r = svg.getBoundingClientRect();
    if (r.width === 0) return;
    const svgX = ((e.clientX - r.left) / r.width) * W;
    const i = Math.floor((svgX - padL) / slotW);
    setHover(Math.max(0, Math.min(months.length - 1, i)));
  };

  const hm = hover != null ? months[hover] : null;
  const tipW = detailed ? 150 : 128;
  const tipH = detailed ? 62 : 56;
  const tipFs = detailed ? 10 : 8.5;
  const tipX = hm ? Math.max(padL, Math.min(W - padR - tipW, X(hover as number) - tipW / 2)) : 0;

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", display: "block", overflow: "visible" }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      {gridlines.map((g) => (
        <g key={g}>
          <line x1={padL} y1={Y(g)} x2={W - padR} y2={Y(g)} stroke="#f1f2f4" />
          <text x={padL - 5} y={Y(g) + 3} fontSize={9} fill="#9ca3af" textAnchor="end">
            {g}%
          </text>
        </g>
      ))}
      <line x1={padL} y1={Y(BREACH_PCT)} x2={W - padR} y2={Y(BREACH_PCT)} stroke="#c9564a" strokeDasharray="4 3" />
      <text x={padL + 2} y={Y(BREACH_PCT) - 4} fontSize={detailed ? 10 : 8} fill="#c9564a">
        target ≤15% breach
      </text>
      {/* right-hand σ axis */}
      <text x={W - padR + 6} y={YS(0) + 3} fontSize={9} fill={SIGMA_COLOR} textAnchor="start">
        0
      </text>
      <text x={W - padR + 6} y={YS(sdMax) + 9} fontSize={9} fill={SIGMA_COLOR} textAnchor="start">
        {Math.round(sdMax)}
      </text>
      <text x={W - 4} y={padT} fontSize={9} fill={SIGMA_COLOR} textAnchor="end">
        σ
      </text>
      {sdSegs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={SIGMA_COLOR} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.85} />
      ))}
      {months.map((m, i) => (
        <g key={m.month}>
          {m.min != null && m.max != null && m.med != null && (
            <>
              <line x1={X(i)} y1={Y(m.min)} x2={X(i)} y2={Y(m.max)} stroke="#3f6fd8" strokeWidth={1.5} />
              <line x1={X(i) - cap} y1={Y(m.max)} x2={X(i) + cap} y2={Y(m.max)} stroke="#3f6fd8" strokeWidth={1.5} />
              <line x1={X(i) - cap} y1={Y(m.min)} x2={X(i) + cap} y2={Y(m.min)} stroke="#3f6fd8" strokeWidth={1.5} />
              <path
                d={`M${X(i)} ${(Y(m.med) - dia).toFixed(1)} L${(X(i) + dia).toFixed(1)} ${Y(m.med).toFixed(1)} L${X(i)} ${(Y(m.med) + dia).toFixed(1)} L${(X(i) - dia).toFixed(1)} ${Y(m.med).toFixed(1)} Z`}
                fill={variancePctColor(m.med)}
                stroke="#fff"
                strokeWidth={0.75}
              />
            </>
          )}
          {m.sd != null && <circle cx={X(i)} cy={YS(m.sd)} r={2.5} fill={SIGMA_COLOR} />}
          <text x={X(i)} y={H - (detailed ? 9 : 4)} fontSize={detailed ? 9 : 8} fill={m.n ? "#9ca3af" : "#e5e7eb"} textAnchor="middle">
            {m.label}
          </text>
        </g>
      ))}
      {hm && (
        <g pointerEvents="none">
          <line x1={X(hover as number)} y1={padT} x2={X(hover as number)} y2={H - padB} stroke="#9ca3af" strokeDasharray="3 3" />
          <g transform={`translate(${tipX.toFixed(1)} ${padT.toFixed(1)})`}>
            <rect width={tipW} height={tipH} rx={6} fill="#111827" opacity={0.92} />
            <text x={8} y={tipFs + 6} fontSize={tipFs} fill="#e5e7eb">
              {hm.label} · {hm.n} day{hm.n === 1 ? "" : "s"}
            </text>
            <text x={8} y={tipFs * 2 + 12} fontSize={tipFs + 1.5} fill="#ffffff" fontWeight={700}>
              {hm.med != null ? `median ${hm.med}%` : "no data"}
            </text>
            <text x={8} y={tipFs * 3 + 18} fontSize={tipFs} fill="#cbd5e1">
              {hm.min != null ? `range ${hm.min}–${hm.max}% · σ ${hm.sd ?? "n/a"}` : "no reports this month"}
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}

function TrendLineChart({
  series,
  detailed,
  width,
}: {
  series: TrendPoint[];
  detailed: boolean;
  width?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const W = detailed ? 740 : width ?? 430;
  const H = detailed ? 300 : 92;
  const padL = detailed ? 36 : 8;
  const padR = detailed ? 12 : 8;
  const padT = 12;
  const padB = detailed ? 30 : 12;

  const vals = series.map((s) => s.value);
  const lo = Math.min(0, ...vals) - 2;
  const hi = Math.max(20, ...vals) + 3;

  const X = (i: number) => padL + (series.length < 2 ? 0 : i / (series.length - 1)) * (W - padL - padR);
  const Y = (v: number) => padT + ((hi - v) / (hi - lo)) * (H - padT - padB);

  const gridlines: number[] = [];
  if (detailed) {
    for (let g = Math.ceil(lo / 10) * 10; g <= hi; g += 10) gridlines.push(g);
  }

  const linePath = series.map((pt, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(pt.value).toFixed(1)}`).join(" ");
  const areaPath =
    `M${X(0).toFixed(1)} ${Y(lo).toFixed(1)} ` +
    series.map((pt, i) => `L${X(i).toFixed(1)} ${Y(pt.value).toFixed(1)}`).join(" ") +
    ` L${X(series.length - 1).toFixed(1)} ${Y(lo).toFixed(1)} Z`;

  const last = series[series.length - 1];

  // Map the cursor to the nearest data point (works at any rendered size: we
  // scale clientX by the SVG's on-screen width back into viewBox units).
  const onMove = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg || series.length === 0) return;
    const r = svg.getBoundingClientRect();
    if (r.width === 0) return;
    const svgX = ((e.clientX - r.left) / r.width) * W;
    const inner = W - padL - padR;
    const i = series.length < 2 ? 0 : Math.round(((svgX - padL) / inner) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  };

  const hp = hover != null ? series[hover] : null;
  const tipW = detailed ? 132 : 116;
  const tipH = detailed ? 50 : 44;
  const tipFs = detailed ? 10 : 8.5;
  const hpx = hp ? X(hover as number) : 0;
  const hpy = hp ? Y(hp.value) : 0;
  const tipX = Math.max(padL, Math.min(W - padR - tipW, hpx - tipW / 2));
  const tipY = hpy - tipH - 10 >= 0 ? hpy - tipH - 10 : Math.min(H - tipH - 2, hpy + 10);

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: "100%", display: "block", overflow: "visible" }}
      onMouseMove={onMove}
      onMouseLeave={() => setHover(null)}
    >
      {gridlines.map((g) => (
        <g key={g}>
          <line x1={padL} y1={Y(g)} x2={W - padR} y2={Y(g)} stroke="#f1f2f4" />
          <text x={padL - 5} y={Y(g) + 3} fontSize={9} fill="#9ca3af" textAnchor="end">
            {g}%
          </text>
        </g>
      ))}
      <line x1={padL} y1={Y(0)} x2={W - padR} y2={Y(0)} stroke="#b9c0cb" strokeDasharray="2 2" />
      {detailed && (
        <text x={W - padR} y={Y(0) - 4} fontSize={9} fill="#9ca3af" textAnchor="end">
          0% · fully timed
        </text>
      )}
      <line x1={padL} y1={Y(BREACH_PCT)} x2={W - padR} y2={Y(BREACH_PCT)} stroke="#c9564a" strokeDasharray="4 3" />
      <text x={padL + 2} y={Y(BREACH_PCT) - 4} fontSize={detailed ? 10 : 8} fill="#c9564a">
        target ≤15% breach
      </text>
      <path d={areaPath} fill="#3f6fd814" />
      <path d={linePath} fill="none" stroke="#3f6fd8" strokeWidth={detailed ? 2 : 1.6} />
      <circle cx={X(series.length - 1)} cy={Y(last.value)} r={detailed ? 4 : 3} fill={variancePctColor(last.value)} />
      {!detailed && (
        <text x={W - padR} y={13} fontSize={9} fill="#6b7280" textAnchor="end">
          now {last.value}%
        </text>
      )}
      {detailed &&
        series.map(
          (pt, i) =>
            (i % 5 === 0 || i === series.length - 1) && (
              <text key={pt.date} x={X(i)} y={H - 9} fontSize={8} fill="#9ca3af" textAnchor="middle">
                {pt.date.slice(5)}
              </text>
            ),
        )}
      {hp && (
        <g pointerEvents="none">
          <line x1={hpx} y1={padT} x2={hpx} y2={H - padB} stroke="#9ca3af" strokeDasharray="3 3" />
          <circle cx={hpx} cy={hpy} r={detailed ? 4.5 : 3.5} fill="#fff" stroke={variancePctColor(hp.value)} strokeWidth={2} />
          <g transform={`translate(${tipX.toFixed(1)} ${tipY.toFixed(1)})`}>
            <rect width={tipW} height={tipH} rx={6} fill="#111827" opacity={0.92} />
            <text x={8} y={tipFs + 6} fontSize={tipFs} fill="#e5e7eb">
              {formatWorkDate(hp.date)}
            </text>
            <text x={8} y={tipFs * 2 + 12} fontSize={tipFs + 1.5} fill="#ffffff" fontWeight={700}>
              median {hp.value}%
            </text>
            <text x={8} y={tipFs * 3 + 18} fontSize={tipFs} fill="#cbd5e1">
              {hp.n} report{hp.n === 1 ? "" : "s"} · {hp.breaches} breaching
            </text>
          </g>
        </g>
      )}
    </svg>
  );
}
