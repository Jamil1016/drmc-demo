"use client";

import { useMemo, useState } from "react";
import type { DayActivity } from "@/lib/hr/queries/report-detail";
import { buildDayTimeline, formatMinutes, taskColorCategory, taskTypeTotals, type TaskColorCategory, type TimelineBar, type SummaryGap, type SummarySegment } from "@/lib/hr/domain/day-timeline";
import { formatZonedInstant, zoneLabel, type DisplayZone } from "@/lib/time";
import { useDisplayZone } from "@/components/layout/DisplayZoneProvider";

// The label column must stay in sync between the rows and the axis, so the
// tick positions (percentages of the track) line up with the gridlines.
// `wide` = the pop-out modal: more room for labels and taller rows.
const LABEL_COL = "118px";
const LABEL_COL_WIDE = "190px";
const ROW_MIN_H = 36;
const ROW_MIN_H_WIDE = 44;

// Open (still running) timers use the same amber language as the list cards
// and the Timer hrs cells. Closed bars color by task type: overhead/admin
// work gray, Tools and Automation purple, Data Entry orange, everything
// else the app's signal cyan.
const BAR_CLOSED = "var(--signal)";
const BAR_OPEN = "#d97706";
// slate-700: dark enough that admin bars separate cleanly from the signal
// cyan for colorblind viewers (ΔE 14.8+ across CVD types; slate-400/500 fail).
const BAR_OVERHEAD = "#334155";
// violet-600, the purple the variance charts already use for σ; sits apart
// from cyan, slate, and orange for deutan/protan viewers.
const BAR_TOOLS = "#7c3aed";
const BAR_DATAENTRY = "#f97316";

const BAR_BY_CATEGORY: Record<TaskColorCategory, string> = {
  overhead: BAR_OVERHEAD,
  tools: BAR_TOOLS,
  dataentry: BAR_DATAENTRY,
  standard: BAR_CLOSED,
};

// Rows of the "Time by task type" breakdown chart, in fixed display order.
// Colors mirror the Gantt bars above so the two charts read as one system.
// Tools and Automation sits last: it is tracked apart from Admin and
// reads as its own line beneath the three original buckets.
const TYPE_ROWS: Array<{ key: "production" | "overhead" | "dataentry" | "tools"; label: string; color: string; hint: string }> = [
  { key: "production", label: "Production", color: BAR_CLOSED, hint: "Site/asset work — every task that isn't admin/overhead, Tools and Automation, or Data Entry" },
  { key: "overhead", label: "Admin", color: BAR_OVERHEAD, hint: "Overhead tasks: General Admin, Training, QA and Control, Documentation, Data Analysis, Coaching Session, Peer Review, R&D, Internal Projects, Staffing/HR, Marketing" },
  { key: "dataentry", label: "Data Entry", color: BAR_DATAENTRY, hint: "Data Entry tasks" },
  { key: "tools", label: "Tools & Automation", color: BAR_TOOLS, hint: "Tools and Automation timers (tracked apart from the other admin/overhead tasks)" },
];

// Clock time in the user's display zone (PHT or ET); the tooltips below
// carry the zone label so a reader never mistakes one for the other.
function zonedTime(ms: number, zone: DisplayZone): string {
  return formatZonedInstant(new Date(ms).toISOString(), zone, "hh:mm a");
}

/** Native-title tooltip: "01:03 PM – 02:45 PM PHT · 1h 42m". */
function barTitle(b: TimelineBar, zone: DisplayZone): string {
  const range = b.open ? `${zonedTime(b.startMs, zone)} – running` : `${zonedTime(b.startMs, zone)} – ${zonedTime(b.endMs, zone)}`;
  const min = b.durationMin ?? (b.endMs - b.startMs) / 60_000;
  return `${range} ${zoneLabel(zone)} · ${formatMinutes(min)}`;
}

function segTitle(s: SummarySegment, zone: DisplayZone): string {
  return `${zonedTime(s.startMs, zone)} – ${zonedTime(s.endMs, zone)} ${zoneLabel(zone)} · ${formatMinutes((s.endMs - s.startMs) / 60_000)}`;
}

function gapTitle(g: SummaryGap, zone: DisplayZone): string {
  return `No timer running · ${zonedTime(g.startMs, zone)} – ${zonedTime(g.endMs, zone)} ${zoneLabel(zone)} · ${formatMinutes(g.minutes)}`;
}

/** "(clock-in + 11h stated)" when the DR's hours sized the band, "(clock-in +
 *  9h default)" on the fallback — so a reviewer knows which window they read. */
function bandTitle(b: SummarySegment, bandHours: number, fromStated: boolean, zone: DisplayZone): string {
  const hrs = Number.isInteger(bandHours) ? String(bandHours) : bandHours.toFixed(1);
  return `Work hours ${zonedTime(b.startMs, zone)} – ${zonedTime(b.endMs, zone)} ${zoneLabel(zone)} (clock-in + ${hrs}h ${fromStated ? "stated" : "default"})`;
}

/** Gantt view of the day's timer log: one row per asset task, the display
 *  zone's clock (PHT or ET) on the x axis. Pure presentation: all geometry
 *  comes from buildDayTimeline. */
export function DayTimeline({ dayActivities, clockInMs = null, statedHours = null, wide = false }: { dayActivities: DayActivity[]; clockInMs?: number | null; statedHours?: number | null; wide?: boolean }) {
  const { zone } = useDisplayZone();
  // "Now" is snapshotted once per mount (lazy initializer keeps render pure);
  // the drawer remounts this section on every open, so it stays fresh enough
  // for the open-timer bar and the now line.
  const [nowMs] = useState(() => Date.now());
  // zone feeds the tick alignment: gridlines sit on the display zone's hours.
  const timeline = useMemo(() => buildDayTimeline(dayActivities, nowMs, clockInMs, statedHours, zone), [dayActivities, nowMs, clockInMs, statedHours, zone]);
  const typeTotals = useMemo(() => taskTypeTotals(timeline?.rows ?? []), [timeline]);
  const cols = `${wide ? LABEL_COL_WIDE : LABEL_COL} minmax(0, 1fr)`;
  const rowMinH = wide ? ROW_MIN_H_WIDE : ROW_MIN_H;
  const barH = wide ? 18 : 14;
  if (!timeline) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Timer entries have no start times to chart.</p>;
  }
  return (
    <div>
      {timeline.rows.map((row, i) => (
        <div key={i} className="grid items-center" style={{ gridTemplateColumns: cols, minHeight: rowMinH }}>
          <div className="pr-2" style={{ overflow: "hidden" }}>
            <div className="truncate text-xs font-medium" style={{ color: "var(--ink)" }} title={row.site || row.task || undefined}>
              {row.site || row.task || "—"}
            </div>
            <div className="truncate text-[11px]" style={{ color: "var(--muted)" }} title={row.site && row.task ? row.task : undefined}>
              {row.site && row.task ? `${row.task} · ` : ""}{formatMinutes(row.totalMin)}{row.hasOpen ? " ⏱" : ""}
            </div>
          </div>
          <div className="relative h-full" style={{ minHeight: rowMinH, borderLeft: "1px solid var(--rule)" }}>
            {timeline.band && (
              <span aria-hidden title={bandTitle(timeline.band, timeline.bandHours, statedHours != null && statedHours > 0, zone)} className="absolute inset-y-0" style={{ left: `${timeline.band.leftPct}%`, width: `${timeline.band.widthPct}%`, background: "var(--signal-wash)" }} />
            )}
            {timeline.ticks.map((t) => (
              <span key={t.ms} aria-hidden className="absolute inset-y-0" style={{ left: `${t.leftPct}%`, width: 1, background: "var(--rule)" }} />
            ))}
            {row.bars.map((b, j) => (
              <span
                key={j}
                title={barTitle(b, zone)}
                className="absolute rounded"
                style={{
                  left: `${b.leftPct}%`, width: `${b.widthPct}%`,
                  top: "50%", height: barH, transform: "translateY(-50%)",
                  background: b.open ? BAR_OPEN : BAR_BY_CATEGORY[taskColorCategory(row.task)],
                }}
              />
            ))}
            {timeline.nowPct != null && (
              <span aria-hidden className="absolute inset-y-0" style={{ left: `${timeline.nowPct}%`, width: 1.5, background: "var(--bad)" }} />
            )}
          </div>
        </div>
      ))}
      {/* Combined "All tasks" row: merged worked blocks + no-timer gaps.
          Gaps are hollow dashed spans, labeled inline when wide enough. */}
      <div
        className="grid items-center"
        style={{ gridTemplateColumns: cols, minHeight: rowMinH, borderTop: "1px solid var(--rule)", marginTop: 4 }}
      >
        <div className="pr-2" style={{ overflow: "hidden" }}>
          <div className="truncate text-xs font-medium" style={{ color: "var(--ink)" }}>All tasks</div>
          <div className="truncate text-[11px]" style={{ color: "var(--muted)" }} title={`${formatMinutes(timeline.summary.workedMin)} with a timer running · ${formatMinutes(timeline.summary.gapMin)} without`}>
            {timeline.summary.gapMin >= 1 ? `${formatMinutes(timeline.summary.gapMin)} no timer` : "no gaps"}
          </div>
        </div>
        <div className="relative h-full" style={{ minHeight: rowMinH, borderLeft: "1px solid var(--rule)" }}>
          {timeline.band && (
            <span aria-hidden title={bandTitle(timeline.band, timeline.bandHours, statedHours != null && statedHours > 0, zone)} className="absolute inset-y-0" style={{ left: `${timeline.band.leftPct}%`, width: `${timeline.band.widthPct}%`, background: "var(--signal-wash)" }} />
          )}
          {timeline.ticks.map((t) => (
            <span key={t.ms} aria-hidden className="absolute inset-y-0" style={{ left: `${t.leftPct}%`, width: 1, background: "var(--rule)" }} />
          ))}
          {timeline.summary.gaps.map((g, i) => (
            <span
              key={i}
              title={gapTitle(g, zone)}
              className="absolute text-center text-[9px] leading-[12px]"
              style={{
                left: `${g.leftPct}%`, width: `${g.widthPct}%`,
                top: "50%", height: barH, transform: "translateY(-50%)",
                border: "1px dashed var(--muted-soft)", borderRadius: 4,
                color: "var(--muted)", overflow: "hidden", whiteSpace: "nowrap",
              }}
            >
              {g.widthPct >= 13 ? formatMinutes(g.minutes) : ""}
            </span>
          ))}
          {timeline.summary.segments.map((s, i) => (
            <span
              key={i}
              title={segTitle(s, zone)}
              className="absolute rounded"
              style={{ left: `${s.leftPct}%`, width: `${s.widthPct}%`, top: "50%", height: barH, transform: "translateY(-50%)", background: BAR_CLOSED }}
            />
          ))}
          {timeline.nowPct != null && (
            <span aria-hidden className="absolute inset-y-0" style={{ left: `${timeline.nowPct}%`, width: 1.5, background: "var(--bad)" }} />
          )}
        </div>
      </div>
      <div className="grid" style={{ gridTemplateColumns: cols }}>
        <div className="text-[10px]" style={{ color: "var(--muted-soft)" }}>{zoneLabel(zone)}</div>
        <div className="relative" style={{ height: 16 }}>
          {timeline.ticks.map((t) => (
            <span
              key={t.ms}
              className="absolute text-[10px]"
              style={{ left: `${t.leftPct}%`, transform: "translateX(-50%)", whiteSpace: "nowrap", color: "var(--muted-soft)" }}
            >
              {formatZonedInstant(new Date(t.ms).toISOString(), zone, "h a")}
            </span>
          ))}
        </div>
      </div>
      {/* "Time by task type": how the day's timer minutes split across
          production, admin/overhead, Data Entry, and Tools and Automation.
          Bar length = share of
          the day's total timer time (common scale, zero baseline); colors match
          the Gantt bars above. Long bars carry their label inside to avoid
          overflowing the track. */}
      {typeTotals.totalMin > 0 && (
        <div style={{ borderTop: "1px solid var(--rule)", marginTop: 10, paddingTop: 8 }}>
          <div className="text-[11px] font-medium" style={{ color: "var(--ink)" }}>
            Time by task type
          </div>
          {TYPE_ROWS.map((r) => {
            const min = typeTotals[r.key];
            const pct = (100 * min) / typeTotals.totalMin;
            const pctLabel = min > 0 && pct < 0.5 ? "<1%" : `${Math.round(pct)}%`;
            const labelInside = pct > 70;
            return (
              <div key={r.key} className="grid items-center" style={{ gridTemplateColumns: cols, minHeight: 24 }} title={`${r.hint} · ${formatMinutes(min)} · ${pctLabel} of timer time`}>
                <div className="truncate pr-2 text-[11px]" style={{ color: "var(--muted)" }}>{r.label}</div>
                <div className="relative h-full" style={{ minHeight: 24, borderLeft: "1px solid var(--rule)" }}>
                  {min > 0 && (
                    <span
                      className="absolute rounded"
                      style={{ left: 0, width: `max(${pct}%, 3px)`, top: "50%", height: barH - 4, transform: "translateY(-50%)", background: r.color }}
                    />
                  )}
                  <span
                    className="absolute text-[10px]"
                    style={
                      labelInside
                        ? { right: `calc(${100 - pct}% + 6px)`, top: "50%", transform: "translateY(-50%)", whiteSpace: "nowrap", color: "#ffffff" }
                        : { left: `calc(${Math.max(pct, 0)}% + 6px)`, top: "50%", transform: "translateY(-50%)", whiteSpace: "nowrap", color: "var(--muted)" }
                    }
                  >
                    {formatMinutes(min)} · {pctLabel}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
