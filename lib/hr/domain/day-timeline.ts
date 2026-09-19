import { formatInTimeZone } from "date-fns-tz";
import type { DayActivity } from "./types";
import { zoneIana, type DisplayZone } from "@/lib/time";

// Pure geometry for the "Worked on this day" Gantt view: one row per asset
// task (site+task), bars positioned as percentages of a whole-hour window.
// Framework-free so it's unit-testable; DayTimeline.tsx renders the result.
//
// Both display zones (PHT = UTC+8, ET = UTC-5/-4) sit on whole-hour offsets,
// so their hour boundaries coincide with epoch hour boundaries: flooring
// epoch ms to the hour lands on a clean local hour in either zone. Only the
// tick alignment (which local hours get a gridline) depends on the zone.

const HOUR = 3_600_000;
const MIN_SPAN_HOURS = 3; // keeps short days from stretching one bar wall-to-wall
const OPEN_CAP_HOURS = 12; // stale open timers (never stopped) can't blow up the axis
const MIN_BAR_PCT = 0.8; // a zero-minute timer still gets a visible sliver
const MIN_GAP_MINUTES = 5; // shorter gaps count in gapMin but aren't drawn (hairline noise)
export const WORK_HOURS = 9; // default work day = clock-in + 9h (incl. break) when no stated hours
const MAX_BAND_HOURS = 24; // a garbage stated-hours value can't stretch the axis

/** Bar color buckets for the Gantt view: overhead/admin work draws gray,
 *  Tools and Automation draws purple, Data Entry draws orange, everything
 *  else keeps the signal cyan. (Data Prep is deliberately standard. Tools and
 *  Automation is split out of admin so it reads separately from the other
 *  overhead tasks.) */
export type TaskColorCategory = "overhead" | "tools" | "dataentry" | "standard";

// Normalized (lowercase, prefix-stripped) overhead task names. The PM API shows the
// same task bare and enumerated ("Training" / "7. Training"), so matching runs
// on the stripped core name.
const TOOLS_TASK = "tools and automation";
const OVERHEAD_TASKS = new Set([
  "general admin",
  "quality review",
  "training",
  "documentation",
  "reporting and analysis",
  "coaching session",
  "peer review",
  "research",
  "internal projects",
  "recruiting support",
  "business development",
]);

export function taskColorCategory(task: string | null): TaskColorCategory {
  if (!task) return "standard";
  const core = task
    .toLowerCase()
    .replace(/^\s*\d+[a-z]?\.\s*/, "") // "3B. " / "10. " enumeration prefix
    .replace(/\s+/g, " ")
    .trim();
  if (core.startsWith("data entry")) return "dataentry";
  if (core === TOOLS_TASK) return "tools";
  if (OVERHEAD_TASKS.has(core)) return "overhead";
  return "standard";
}

/** Minutes per task-type bucket, for the "Time by task type" breakdown chart
 *  under the Gantt. Sums the already-computed row totals so the chart always
 *  agrees with the row durations it sits beneath. */
export type TaskTypeTotals = {
  production: number;
  overhead: number;
  dataentry: number;
  tools: number;
  totalMin: number;
};

export function taskTypeTotals(
  rows: Array<{ task: string | null; totalMin: number }>,
): TaskTypeTotals {
  const t: TaskTypeTotals = { production: 0, overhead: 0, dataentry: 0, tools: 0, totalMin: 0 };
  for (const r of rows) {
    const cat = taskColorCategory(r.task);
    if (cat === "overhead") t.overhead += r.totalMin;
    else if (cat === "tools") t.tools += r.totalMin;
    else if (cat === "dataentry") t.dataentry += r.totalMin;
    else t.production += r.totalMin;
    t.totalMin += r.totalMin;
  }
  return t;
}

export type TimelineBar = {
  leftPct: number;
  widthPct: number;
  open: boolean;
  startMs: number;
  endMs: number;
  durationMin: number | null;
};

export type TimelineRow = {
  site: string | null;
  task: string | null;
  totalMin: number;
  hasOpen: boolean;
  bars: TimelineBar[];
};

export type TimelineTick = { ms: number; leftPct: number };

export type SummarySegment = { leftPct: number; widthPct: number; startMs: number; endMs: number };
export type SummaryGap = SummarySegment & { minutes: number };

/** The combined "All tasks" bottom row: merged worked intervals (overlapping
 *  timers collapse instead of stacking) and the no-timer gaps between them.
 *  Gaps exist only INTERIOR to the day's work (first start → last end); the
 *  window's whole-hour padding never reads as idle. gapMin is the true total
 *  even though gaps shorter than MIN_GAP_MINUTES aren't drawn. */
export type TimelineSummary = {
  segments: SummarySegment[];
  gaps: SummaryGap[];
  workedMin: number;
  gapMin: number;
};

export type DayTimelineData = {
  rows: TimelineRow[];
  ticks: TimelineTick[];
  summary: TimelineSummary;
  /** The work-hours band (clock-in → + the DR's raw stated hours, 9h default);
   *  null when the day has no clock-in. */
  band: SummarySegment | null;
  /** Band width in hours actually used (stated, clamped, or the 9h default) —
   *  lets the tooltip say which window it drew. */
  bandHours: number;
  /** Position of the "now" marker; null unless an open timer exists and now falls inside the window. */
  nowPct: number | null;
  startMs: number;
  endMs: number;
};

/** "1h 42m" / "42m" — the rendering the "Worked on this day" cards have always
 *  used, shared with the chart tooltips. Rounds to whole minutes FIRST so
 *  119.6 min renders "2h 0m", not "1h 60m". */
export function formatMinutes(min: number | null): string {
  if (min == null) return "—";
  const r = Math.round(min);
  const h = Math.floor(r / 60);
  const m = r % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type Span = {
  startMs: number;
  endMs: number;
  open: boolean;
  durationMin: number | null;
  site: string | null;
  task: string | null;
};

/** Resolve one activity to a plottable span, or null if it has no usable start. */
function toSpan(a: DayActivity, nowMs: number): Span | null {
  if (!a.start) return null;
  const startMs = Date.parse(a.start);
  if (!Number.isFinite(startMs)) return null;
  const open = a.end == null;
  let endMs: number;
  if (!open) {
    endMs = Date.parse(a.end as string);
    if (!Number.isFinite(endMs)) return null;
  } else if (a.durationMin != null) {
    // Same fallback unionMinutes uses: the duration as of the last pipeline
    // sync is the honest bar length; the now line shows time elapsed since.
    endMs = startMs + a.durationMin * 60_000;
  } else {
    endMs = Math.min(nowMs, startMs + OPEN_CAP_HOURS * HOUR);
  }
  // Zero/negative spans (0-minute timers, clock skew) still plot as a sliver.
  if (endMs < startMs + 60_000) endMs = startMs + 60_000;
  return { startMs, endMs, open, durationMin: a.durationMin, site: a.siteName, task: a.task };
}

/** Gridline step in hours, chosen so the axis stays readable at panel width. */
function tickStepHours(spanHours: number): number {
  if (spanHours <= 6) return 1;
  if (spanHours <= 12) return 2;
  if (spanHours <= 24) return 3;
  return 6;
}

export function buildDayTimeline(
  activities: DayActivity[],
  nowMs: number,
  /** Epoch ms of the member's clock-in; enables the work-hours band. */
  clockInMs: number | null = null,
  /** RAW stated hours from the DR (break included), the same window the
   *  Outside window column uses. Sets the band width so a 4DWW 11h day gets an
   *  11h band; null/non-positive falls back to the 9h default. */
  statedHours: number | null = null,
  /** Display zone for tick alignment (the zone whose hour-of-day the axis
   *  labels show). PHT default keeps exports/tests unchanged. */
  zone: DisplayZone = "PHT",
): DayTimelineData | null {
  const spans = activities.map((a) => toSpan(a, nowMs)).filter((s): s is Span => s !== null);
  if (spans.length === 0) return null;

  const bandHours = statedHours != null && statedHours > 0 ? Math.min(statedHours, MAX_BAND_HOURS) : WORK_HOURS;
  const bandStartMs = clockInMs;
  const bandEndMs = clockInMs != null ? clockInMs + bandHours * HOUR : null;

  // Axis window: the entries' range, never narrower than the work-hours band —
  // a half-worked day must show its empty half instead of zooming to the work.
  const rawStart = Math.min(...spans.map((s) => s.startMs), bandStartMs ?? Infinity);
  const rawEnd = Math.max(...spans.map((s) => s.endMs), bandEndMs ?? -Infinity);
  const startMs = Math.floor(rawStart / HOUR) * HOUR;
  let endMs = Math.ceil(rawEnd / HOUR) * HOUR;
  if (endMs - startMs < MIN_SPAN_HOURS * HOUR) endMs = startMs + MIN_SPAN_HOURS * HOUR;
  const span = endMs - startMs;

  const pct = (ms: number) => ((ms - startMs) / span) * 100;

  // Group into rows by site+task, ordered by each row's earliest start.
  const byKey = new Map<string, Span[]>();
  for (const s of spans) {
    const key = JSON.stringify([s.site, s.task]);
    const list = byKey.get(key);
    if (list) list.push(s);
    else byKey.set(key, [s]);
  }
  const rows: TimelineRow[] = [...byKey.values()]
    .map((list) => {
      list.sort((a, b) => a.startMs - b.startMs);
      return {
        site: list[0].site,
        task: list[0].task,
        totalMin: list.reduce((sum, s) => sum + (s.durationMin ?? (s.endMs - s.startMs) / 60_000), 0),
        hasOpen: list.some((s) => s.open),
        bars: list.map((s) => ({
          leftPct: pct(s.startMs),
          widthPct: Math.max(pct(s.endMs) - pct(s.startMs), MIN_BAR_PCT),
          open: s.open,
          startMs: s.startMs,
          endMs: s.endMs,
          durationMin: s.durationMin,
        })),
      };
    })
    .sort((a, b) => a.bars[0].startMs - b.bars[0].startMs);

  // Hour ticks aligned to the display zone: a tick lands where the local
  // hour-of-day is a multiple of the step (2h ticks on even hours, 3h on
  // 12/3/6/9 …). Read the hour through the IANA zone rather than a fixed
  // offset so ET stays aligned across daylight saving.
  const step = tickStepHours(span / HOUR);
  const tz = zoneIana(zone);
  const ticks: TimelineTick[] = [];
  for (let h = startMs / HOUR; h * HOUR <= endMs; h++) {
    const localHour = Number(formatInTimeZone(new Date(h * HOUR), tz, "H"));
    if (localHour % step !== 0) continue;
    ticks.push({ ms: h * HOUR, leftPct: pct(h * HOUR) });
  }

  const hasOpen = rows.some((r) => r.hasOpen);
  const nowPct = hasOpen && nowMs >= startMs && nowMs <= endMs ? pct(nowMs) : null;

  // Combined "All tasks" row: merge the spans into disjoint blocks (same
  // sweep unionMinutes uses — overlapping timers collapse, back-to-back
  // chains fuse), then the space between consecutive blocks is a gap.
  const sorted = [...spans].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
  const segments: SummarySegment[] = [];
  let [curS, curE] = [sorted[0].startMs, sorted[0].endMs];
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.startMs > curE) {
      segments.push({ leftPct: pct(curS), widthPct: Math.max(pct(curE) - pct(curS), MIN_BAR_PCT), startMs: curS, endMs: curE });
      curS = s.startMs;
      curE = s.endMs;
    } else if (s.endMs > curE) {
      curE = s.endMs;
    }
  }
  segments.push({ leftPct: pct(curS), widthPct: Math.max(pct(curE) - pct(curS), MIN_BAR_PCT), startMs: curS, endMs: curE });

  const workedMin = segments.reduce((sum, b) => sum + (b.endMs - b.startMs), 0) / 60_000;

  // "No timer" accounting region. With a clock-in: exactly the work-hours
  // band — idle past the band end never counts, matching the serving view's gap
  // cap at clock-in + raw stated hours; overtime bars still
  // draw past the edge, they just don't accrue gap time. Early work BEFORE
  // clock-in is likewise drawn but deliberately outside the region — the
  // stretch between early work and clock-in is not idle work time. Without a
  // clock-in: interior gaps between the first and last timer, the original
  // behavior.
  const regionStart = bandStartMs ?? segments[0].startMs;
  const regionEnd = bandEndMs ?? segments[segments.length - 1].endMs;

  const gaps: SummaryGap[] = [];
  let gapMin = 0;
  let cursor = regionStart;
  for (const seg of segments) {
    const s = Math.max(seg.startMs, regionStart);
    const e = Math.min(seg.endMs, regionEnd);
    if (e <= s) continue; // segment entirely outside the region (e.g. early work)
    if (s > cursor) {
      const minutes = (s - cursor) / 60_000;
      gapMin += minutes;
      if (minutes >= MIN_GAP_MINUTES) {
        gaps.push({ leftPct: pct(cursor), widthPct: pct(s) - pct(cursor), startMs: cursor, endMs: s, minutes });
      }
    }
    cursor = Math.max(cursor, e);
  }
  if (cursor < regionEnd) {
    const minutes = (regionEnd - cursor) / 60_000;
    gapMin += minutes;
    if (minutes >= MIN_GAP_MINUTES) {
      gaps.push({ leftPct: pct(cursor), widthPct: pct(regionEnd) - pct(cursor), startMs: cursor, endMs: regionEnd, minutes });
    }
  }
  const summary: TimelineSummary = { segments, gaps, workedMin, gapMin };

  const band: SummarySegment | null = bandStartMs != null && bandEndMs != null
    ? { leftPct: pct(bandStartMs), widthPct: pct(bandEndMs) - pct(bandStartMs), startMs: bandStartMs, endMs: bandEndMs }
    : null;

  return { rows, ticks, summary, band, bandHours, nowPct, startMs, endMs };
}
