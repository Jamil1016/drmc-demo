// components/hr/variance/report/report-charts.tsx
import { distDomain, type TrendPoint, type BoxStats, type MonthlyTrendStat } from "@/lib/hr/domain/variance-agg";
import { variancePctColor } from "@/lib/hr/domain/variance-color";
import type { DistributionRow, MonthlyRow } from "@/lib/hr/domain/variance-report-model";

const BREACH_PCT = 15;

// Example Co report palette (fixed, not the interactive-app color scale).
const LINE = "#0891b2";
const AREA_FILL = "#06b6d414";
const BREACH = "#b23b30";
const BREACH_BAND = "rgba(178,59,48,.07)";
const GRID = "#e7ebf0";
const AXIS_TEXT = "#94a3b8";
const BOX_FILL = "#cffafe";
const BOX_BORDER = "#0891b2";
const DOT = "#334155";

/** Static, print-safe daily-median-variance line chart. Fixed 720x150 viewBox,
 *  no hooks, no hover, no expand. Geometry ported from VarianceTrend.tsx's
 *  `TrendLineChart` (detailed branch), recolored to the Example Co report palette. */
export function ReportTrendChart({ series }: { series: TrendPoint[] }) {
  const W = 720;
  const H = 150;
  const padL = 36;
  const padR = 12;
  const padT = 14;
  const padB = 26;

  if (series.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        <text x={W / 2} y={H / 2} fontSize={11} fill={AXIS_TEXT} textAnchor="middle">
          No data for this range.
        </text>
      </svg>
    );
  }

  const vals = series.map((s) => s.value);
  const lo = Math.min(0, ...vals) - 2;
  const hi = Math.max(20, ...vals) + 3;

  const X = (i: number) => padL + (series.length < 2 ? 0 : i / (series.length - 1)) * (W - padL - padR);
  const Y = (v: number) => padT + ((hi - v) / (hi - lo)) * (H - padT - padB);

  const gridlines: number[] = [];
  for (let g = Math.ceil(lo / 10) * 10; g <= hi; g += 10) gridlines.push(g);

  const linePath = series.map((pt, i) => `${i ? "L" : "M"}${X(i).toFixed(1)} ${Y(pt.value).toFixed(1)}`).join(" ");
  const areaPath =
    `M${X(0).toFixed(1)} ${Y(lo).toFixed(1)} ` +
    series.map((pt, i) => `L${X(i).toFixed(1)} ${Y(pt.value).toFixed(1)}`).join(" ") +
    ` L${X(series.length - 1).toFixed(1)} ${Y(lo).toFixed(1)} Z`;

  const last = series[series.length - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {gridlines.map((g) => (
        <g key={g}>
          <line x1={padL} y1={Y(g)} x2={W - padR} y2={Y(g)} stroke={GRID} />
          <text x={padL - 5} y={Y(g) + 3} fontSize={9} fill={AXIS_TEXT} textAnchor="end">
            {g}%
          </text>
        </g>
      ))}
      <line x1={padL} y1={Y(0)} x2={W - padR} y2={Y(0)} stroke={AXIS_TEXT} strokeDasharray="2 2" />
      <text x={W - padR} y={Y(0) - 4} fontSize={9} fill={AXIS_TEXT} textAnchor="end">
        0% · fully timed
      </text>
      <line x1={padL} y1={Y(BREACH_PCT)} x2={W - padR} y2={Y(BREACH_PCT)} stroke={BREACH} strokeDasharray="4 3" />
      <text x={padL + 2} y={Y(BREACH_PCT) - 4} fontSize={10} fill={BREACH}>
        target ≤15% breach
      </text>
      <path d={areaPath} fill={AREA_FILL} />
      <path d={linePath} fill="none" stroke={LINE} strokeWidth={2} />
      <circle cx={X(series.length - 1)} cy={Y(last.value)} r={4} fill={variancePctColor(last.value)} />
      {series.map(
        (pt, i) =>
          (i % 5 === 0 || i === series.length - 1) && (
            <text key={pt.date} x={X(i)} y={H - 9} fontSize={8} fill={AXIS_TEXT} textAnchor="middle">
              {pt.date.slice(5)}
            </text>
          ),
      )}
    </svg>
  );
}

const SIGMA = "#7c3aed";

/** Static, print-safe monthly variance chart for windows spanning 3+ calendar
 *  months (the daily line overplots at that scale): per month a min-max
 *  whisker of the daily median variance %, a diamond at the monthly median,
 *  and a dashed sigma (sample std dev) series on a right-hand axis showing
 *  how spread each month's days were. Same 720x150 viewBox as the daily
 *  chart; all marks are drawn shapes (no font glyph symbols, so the chart
 *  prints the same whatever fonts the machine has). */
export function ReportMonthlyTrendChart({ months, hours }: { months: MonthlyTrendStat[]; hours?: MonthlyRow[] }) {
  const W = 720;
  const H = 196; // 150 chart zone + a variance-hours bar row beneath it
  const padL = 36;
  const padR = 40; // room for the right-hand sigma axis
  const padT = 14;
  const plotH = 110; // whisker/sd plot height (same as the daily chart's)
  const barBase = 172; // bars grow up from here; month labels sit below
  const barMaxH = 28;

  const withData = months.filter((m) => m.n > 0);
  if (withData.length === 0) {
    return (
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
        <text x={W / 2} y={H / 2} fontSize={11} fill={AXIS_TEXT} textAnchor="middle">
          No data for this range.
        </text>
      </svg>
    );
  }

  const lo = Math.min(0, ...withData.map((m) => m.min ?? 0)) - 2;
  const hi = Math.max(20, ...withData.map((m) => m.max ?? 20)) + 3;
  // Fixed 0-100 sd scale: real sd values sit low on the
  // chart — visible but visually subordinate, so the spread line can't be
  // misread against the 15% variance target on the left axis.
  const sdMax = 100;

  const slotW = (W - padL - padR) / months.length;
  const X = (i: number) => padL + (i + 0.5) * slotW;
  const Y = (v: number) => padT + ((hi - v) / (hi - lo)) * plotH;
  const YS = (v: number) => padT + ((sdMax - v) / sdMax) * plotH;

  // variance-hours bars, aligned to the same month slots as the whiskers
  const hoursByMonth = new Map((hours ?? []).map((h) => [h.month, h.varianceHours]));
  const maxHours = Math.max(1, ...(hours ?? []).map((h) => h.varianceHours));

  const gridlines: number[] = [];
  for (let g = Math.ceil(lo / 10) * 10; g <= hi; g += 10) gridlines.push(g);

  // sigma polyline: connect only consecutive months that have a sd (gaps break the line)
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

  const cap = Math.min(9, slotW * 0.18);
  const dia = 4.5; // median diamond half-size

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", display: "block" }}>
      {gridlines.map((g) => (
        <g key={g}>
          <line x1={padL} y1={Y(g)} x2={W - padR} y2={Y(g)} stroke={GRID} />
          <text x={padL - 5} y={Y(g) + 3} fontSize={9} fill={AXIS_TEXT} textAnchor="end">
            {g}%
          </text>
        </g>
      ))}
      <line x1={padL} y1={Y(BREACH_PCT)} x2={W - padR} y2={Y(BREACH_PCT)} stroke={BREACH} strokeDasharray="4 3" />
      <text x={padL + 2} y={Y(BREACH_PCT) - 4} fontSize={10} fill={BREACH}>
        target ≤15% breach
      </text>
      {/* Right-hand spread axis: 0 and the top-of-scale tick. Labeled "sd",
          not the sigma glyph - Greek is outside the next/font latin subsets,
          so sigma would fall back to a system font in print. */}
      <text x={W - padR + 6} y={YS(0) + 3} fontSize={9} fill={SIGMA} textAnchor="start">
        0
      </text>
      <text x={W - padR + 6} y={YS(sdMax) + 9} fontSize={9} fill={SIGMA} textAnchor="start">
        {Math.round(sdMax)}
      </text>
      <text x={W - 4} y={padT + 2} fontSize={9} fill={SIGMA} textAnchor="end">
        sd
      </text>
      {sdSegs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={SIGMA} strokeWidth={1.5} strokeDasharray="5 4" opacity={0.85} />
      ))}
      {months.map((m, i) => (
        <g key={m.month}>
          {m.min != null && m.max != null && m.med != null && (
            <>
              <line x1={X(i)} y1={Y(m.min)} x2={X(i)} y2={Y(m.max)} stroke={LINE} strokeWidth={1.5} />
              <line x1={X(i) - cap} y1={Y(m.max)} x2={X(i) + cap} y2={Y(m.max)} stroke={LINE} strokeWidth={1.5} />
              <line x1={X(i) - cap} y1={Y(m.min)} x2={X(i) + cap} y2={Y(m.min)} stroke={LINE} strokeWidth={1.5} />
              <path
                d={`M${X(i)} ${(Y(m.med) - dia).toFixed(1)} L${(X(i) + dia).toFixed(1)} ${Y(m.med).toFixed(1)} L${X(i)} ${(Y(m.med) + dia).toFixed(1)} L${(X(i) - dia).toFixed(1)} ${Y(m.med).toFixed(1)} Z`}
                fill={variancePctColor(m.med)}
                stroke="#ffffff"
                strokeWidth={0.75}
              />
            </>
          )}
          {m.sd != null && <circle cx={X(i)} cy={YS(m.sd)} r={2.5} fill={SIGMA} />}
          {(() => {
            const hrs = hoursByMonth.get(m.month);
            if (hrs == null || hrs <= 0) return null;
            const bh = Math.max(1.5, (hrs / maxHours) * barMaxH);
            const bw = Math.min(46, slotW * 0.5);
            return (
              <>
                <rect x={X(i) - bw / 2} y={barBase - bh} width={bw} height={bh} rx={1.5} fill={LINE} opacity={0.3} />
                <text x={X(i)} y={barBase - bh - 3} fontSize={8} fill="#334155" textAnchor="middle">
                  {Math.round(hrs).toLocaleString("en-US")}h
                </text>
              </>
            );
          })()}
          <text x={X(i)} y={H - 9} fontSize={9} fill={m.n ? AXIS_TEXT : GRID} textAnchor="middle">
            {m.label}
          </text>
        </g>
      ))}
      {hours && hours.some((h) => h.varianceHours > 0) && (
        <text x={padL - 5} y={barBase} fontSize={8} fill={AXIS_TEXT} textAnchor="end">
          hrs
        </text>
      )}
    </svg>
  );
}

const L = 118;
const TOP = 10;
const RH = 44;
const AXOFF = 18;
const W_BOX = 720;

/** Static, print-safe per-group box plot: one horizontal row per group over a
 *  shared variance% x-domain, with a shaded breach band from 15% to the domain
 *  max. Geometry ported from VarianceDistribution.tsx, recolored to the Example Co
 *  report palette, no hooks/hover/click. */
export function ReportGroupBoxPlot({ rows }: { rows: DistributionRow[] }) {
  if (rows.length === 0) {
    return (
      <svg viewBox={`0 0 ${W_BOX} 60`} style={{ width: "100%", display: "block" }}>
        <text x={W_BOX / 2} y={30} fontSize={11} fill={AXIS_TEXT} textAnchor="middle">
          No data for this range.
        </text>
      </svg>
    );
  }

  const allValues = rows.flatMap((r) => r.memberVarPcts);
  const [vmin, vmax] = distDomain(allValues);
  const plotW = Math.max(120, W_BOX - L - 40);
  const x0 = L;
  const x1 = L + plotW;
  const X = (v: number) => x0 + ((Math.max(vmin, Math.min(vmax, v)) - vmin) / (vmax - vmin)) * plotW;
  const rowsH = rows.length * RH;
  const H = TOP + rowsH + AXOFF + 6;

  const gridlines: number[] = [];
  for (let v = Math.ceil(vmin / 10) * 10; v <= vmax; v += 10) gridlines.push(v);
  const bx = X(BREACH_PCT);

  return (
    <svg viewBox={`0 0 ${W_BOX} ${H}`} style={{ width: "100%", display: "block" }}>
      <rect x={bx} y={TOP} width={x1 - bx} height={rowsH} fill={BREACH_BAND} />
      {gridlines.map((v) => (
        <g key={v}>
          <line
            x1={X(v)}
            y1={TOP}
            x2={X(v)}
            y2={TOP + rowsH}
            stroke={v === 0 ? AXIS_TEXT : GRID}
            strokeDasharray={v === 0 ? "3 3" : undefined}
          />
          <text x={X(v)} y={TOP + rowsH + AXOFF} fontSize={9} fill={AXIS_TEXT} textAnchor="middle">
            {v}%
          </text>
        </g>
      ))}
      <line x1={bx} y1={TOP} x2={bx} y2={TOP + rowsH} stroke={BREACH} strokeWidth={1.5} />
      <text x={bx} y={TOP + rowsH + AXOFF} fontSize={9} fill={BREACH} textAnchor="middle" fontWeight={600}>
        15%
      </text>
      {rows.map((row, ri) => {
        const y = TOP + ri * RH + RH / 2;
        const box: BoxStats = row.box;
        return (
          <g key={row.group}>
            <text x={L - 8} y={y - 4} fontSize={11.5} fill="#374151" fontWeight={600} textAnchor="end">
              {row.group}
            </text>
            <text x={L - 8} y={y + 10} fontSize={9} fill={AXIS_TEXT} textAnchor="end">
              {`n${row.n} · med ${row.med}% · ${row.breachCount} brch`}
            </text>
            {row.memberVarPcts.map((v, pi) => {
              const jy = y + ((pi * 7) % 16) - 8;
              return <circle key={pi} cx={X(v)} cy={jy} r={3} fill={DOT} opacity={0.55} />;
            })}
            <line x1={X(box.whiskerLo)} y1={y} x2={X(box.whiskerHi)} y2={y} stroke={AXIS_TEXT} />
            <rect
              x={X(box.q1)}
              y={y - 9}
              width={Math.max(2, X(box.q3) - X(box.q1))}
              height={18}
              rx={2}
              fill={BOX_FILL}
              stroke={BOX_BORDER}
              strokeWidth={1}
            />
            <line x1={X(box.med)} y1={y - 9} x2={X(box.med)} y2={y + 9} stroke={LINE} strokeWidth={2.5} />
          </g>
        );
      })}
    </svg>
  );
}
