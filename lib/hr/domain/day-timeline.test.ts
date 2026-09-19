import { test, expect } from "@playwright/test";
import { buildDayTimeline, formatMinutes, taskColorCategory, taskTypeTotals } from "./day-timeline";
import type { DayActivity } from "./types";

const HOUR = 3_600_000;

function act(over: Partial<DayActivity>): DayActivity {
  return {
    start: null, end: null, durationMin: null,
    project: null, siteName: null, task: null, assetDid: null,
    ...over,
  };
}

// All fixtures use UTC instants; PHT = UTC+8 with no DST, so PHT hour
// boundaries coincide with epoch hour boundaries.
const T0500 = "2026-07-21T05:00:00.000Z"; // 1:00 PM PHT
const NOW_0700 = Date.parse("2026-07-21T07:00:00.000Z");

test("returns null for empty input and for entries with no usable start", () => {
  expect(buildDayTimeline([], NOW_0700)).toBeNull();
  expect(buildDayTimeline([act({ end: "2026-07-21T06:00:00Z" })], NOW_0700)).toBeNull();
  expect(buildDayTimeline([act({ start: "not a date" })], NOW_0700)).toBeNull();
});

test("groups sessions of the same site+task into one row with two bars", () => {
  const tl = buildDayTimeline([
    act({ start: T0500, end: "2026-07-21T05:30:00Z", durationMin: 30, siteName: "Cedar Hollow 014", task: "Site Audit" }),
    act({ start: "2026-07-21T06:00:00Z", end: "2026-07-21T06:30:00Z", durationMin: 30, siteName: "Cedar Hollow 014", task: "Site Audit" }),
    act({ start: "2026-07-21T05:15:00Z", end: "2026-07-21T06:45:00Z", durationMin: 90, siteName: "Harbor Point 022", task: "Drawing Update" }),
  ], NOW_0700)!;
  expect(tl.rows.length).toBe(2);
  expect(tl.rows[0].site).toBe("Cedar Hollow 014");
  expect(tl.rows[0].bars.length).toBe(2);
  expect(tl.rows[1].site).toBe("Harbor Point 022");
  expect(tl.rows[0].totalMin).toBe(60);
});

test("rows are ordered by their earliest start", () => {
  const tl = buildDayTimeline([
    act({ start: "2026-07-21T06:00:00Z", end: "2026-07-21T06:30:00Z", siteName: "B", task: "t" }),
    act({ start: T0500, end: "2026-07-21T05:30:00Z", siteName: "A", task: "t" }),
  ], NOW_0700)!;
  expect(tl.rows.map((r) => r.site)).toEqual(["A", "B"]);
});

test("window floors/ceils to the hour and enforces the 3h minimum span", () => {
  // 05:03–06:45 → floor 05:00, ceil 07:00 = 2h span → extended to 08:00.
  const tl = buildDayTimeline([
    act({ start: "2026-07-21T05:03:00Z", end: "2026-07-21T06:45:00Z", durationMin: 102 }),
  ], NOW_0700)!;
  expect(tl.startMs).toBe(Date.parse("2026-07-21T05:00:00Z"));
  expect(tl.endMs).toBe(Date.parse("2026-07-21T08:00:00Z"));
});

test("bar geometry: left/width percentages within the window", () => {
  // Window 05:00–08:00 (3h). Entry 05:00–06:00 → left 0%, width 33.33%.
  const tl = buildDayTimeline([
    act({ start: T0500, end: "2026-07-21T06:00:00Z", durationMin: 60 }),
  ], NOW_0700)!;
  const bar = tl.rows[0].bars[0];
  expect(bar.leftPct).toBeCloseTo(0, 5);
  expect(bar.widthPct).toBeCloseTo(100 / 3, 3);
  expect(bar.open).toBe(false);
});

test("open timer without durationMin extends to now and sets the now line", () => {
  const tl = buildDayTimeline([
    act({ start: T0500, siteName: "S", task: "t" }), // no end, no duration
  ], Date.parse("2026-07-21T06:30:00Z"))!;
  const bar = tl.rows[0].bars[0];
  expect(bar.open).toBe(true);
  expect(bar.endMs).toBe(Date.parse("2026-07-21T06:30:00Z"));
  expect(tl.rows[0].hasOpen).toBe(true);
  // Window 05:00–08:00; now 06:30 → 50%.
  expect(tl.nowPct).toBeCloseTo(50, 3);
});

test("open timer with durationMin ends at start+duration (last-sync truth), now line still shown", () => {
  const tl = buildDayTimeline([
    act({ start: T0500, durationMin: 30, siteName: "S", task: "t" }),
  ], NOW_0700)!;
  const bar = tl.rows[0].bars[0];
  expect(bar.open).toBe(true);
  expect(bar.endMs).toBe(Date.parse("2026-07-21T05:30:00Z"));
  // Window 05:00–08:00; now 07:00 → 66.67%.
  expect(tl.nowPct).toBeCloseTo(200 / 3, 3);
});

test("stale open timer viewed days later: bar capped at 12h, no now line", () => {
  const tl = buildDayTimeline([
    act({ start: T0500 }),
  ], Date.parse("2026-07-24T05:00:00.000Z"))!;
  const bar = tl.rows[0].bars[0];
  expect(bar.endMs).toBe(Date.parse(T0500) + 12 * HOUR);
  expect(tl.endMs).toBe(Date.parse("2026-07-21T17:00:00Z"));
  expect(tl.nowPct).toBeNull();
});

test("closed entries never draw a now line", () => {
  const tl = buildDayTimeline([
    act({ start: T0500, end: "2026-07-21T06:00:00Z", durationMin: 60 }),
  ], Date.parse("2026-07-21T06:30:00Z"))!;
  expect(tl.nowPct).toBeNull();
});

test("hour ticks: 1h step on short spans, aligned to every window hour", () => {
  const tl = buildDayTimeline([
    act({ start: T0500, end: "2026-07-21T06:00:00Z", durationMin: 60 }),
  ], NOW_0700)!;
  // Window 05:00–08:00 → ticks at 05,06,07,08 (0%, 33.3%, 66.7%, 100%).
  expect(tl.ticks.map((t) => t.ms)).toEqual([5, 6, 7, 8].map((h) => Date.parse(`2026-07-21T0${h}:00:00Z`)));
  expect(tl.ticks[1].leftPct).toBeCloseTo(100 / 3, 3);
});

test("hour ticks: 2h step on medium spans, aligned to even PHT hours", () => {
  // 05:00–15:30 → window 05:00–16:00 (11h) → 2h step. 05:00Z = 1 PM PHT (odd),
  // so the first tick is 06:00Z (2 PM PHT), then every 2h through 16:00Z.
  const tl = buildDayTimeline([
    act({ start: T0500, end: "2026-07-21T15:30:00Z", durationMin: 630 }),
  ], NOW_0700)!;
  expect(tl.ticks.map((t) => t.ms)).toEqual(
    ["06", "08", "10", "12", "14", "16"].map((h) => Date.parse(`2026-07-21T${h}:00:00Z`)),
  );
});

test("hour ticks: 2h step aligned to even ET hours in winter (EST), diverging from PHT", () => {
  // Same 11h shape on a January day. 05:00Z is 00:00 EST (even) but 1 PM PHT
  // (odd), so ET ticks land on 05,07,...,15Z while PHT would give 06,...,16Z.
  // Reading the hour through the IANA zone (not a fixed offset) is what keeps
  // this right across daylight saving.
  const entries = [act({ start: "2026-01-21T05:00:00Z", end: "2026-01-21T15:30:00Z", durationMin: 630 })];
  const now = Date.parse("2026-01-21T18:00:00Z");
  const et = buildDayTimeline(entries, now, null, null, "ET")!;
  expect(et.ticks.map((t) => t.ms)).toEqual(
    ["05", "07", "09", "11", "13", "15"].map((h) => Date.parse(`2026-01-21T${h}:00:00Z`)),
  );
  const pht = buildDayTimeline(entries, now, null, null, "PHT")!;
  expect(pht.ticks.map((t) => t.ms)).toEqual(
    ["06", "08", "10", "12", "14", "16"].map((h) => Date.parse(`2026-01-21T${h}:00:00Z`)),
  );
  // Summer (EDT, UTC-4): 05:00Z is 1 AM (odd), so ET and PHT agree on 06..16Z.
  const edt = buildDayTimeline([act({ start: T0500, end: "2026-07-21T15:30:00Z", durationMin: 630 })], NOW_0700, null, null, "ET")!;
  expect(edt.ticks.map((t) => t.ms)).toEqual(
    ["06", "08", "10", "12", "14", "16"].map((h) => Date.parse(`2026-07-21T${h}:00:00Z`)),
  );
});

test("zero-length closed entries still plot with a minimum visible width", () => {
  const tl = buildDayTimeline([
    act({ start: T0500, end: T0500, durationMin: 0 }),
  ], NOW_0700)!;
  expect(tl.rows[0].bars[0].widthPct).toBeGreaterThanOrEqual(0.8);
  expect(tl.rows[0].totalMin).toBe(0);
});

test("summary: overlapping and back-to-back entries merge into one segment", () => {
  const tl = buildDayTimeline([
    act({ start: T0500, end: "2026-07-21T06:00:00Z", durationMin: 60, task: "a" }),
    // Overlaps the first by 20 min, extends to 06:40.
    act({ start: "2026-07-21T05:40:00Z", end: "2026-07-21T06:40:00Z", durationMin: 60, task: "b" }),
    // Back-to-back with the merged block (starts exactly at 06:40).
    act({ start: "2026-07-21T06:40:00Z", end: "2026-07-21T07:00:00Z", durationMin: 20, task: "c" }),
  ], Date.parse("2026-07-21T08:00:00Z"))!;
  expect(tl.summary.segments.length).toBe(1);
  expect(tl.summary.segments[0].startMs).toBe(Date.parse(T0500));
  expect(tl.summary.segments[0].endMs).toBe(Date.parse("2026-07-21T07:00:00Z"));
  // Union: 05:00–07:00 = 120 min, no double counting of the overlap.
  expect(tl.summary.workedMin).toBeCloseTo(120, 3);
  expect(tl.summary.gaps.length).toBe(0);
  expect(tl.summary.gapMin).toBe(0);
});

test("summary: an interior gap gets a segment with minutes and pct geometry", () => {
  const tl = buildDayTimeline([
    act({ start: T0500, end: "2026-07-21T06:00:00Z", durationMin: 60, task: "a" }),
    act({ start: "2026-07-21T06:45:00Z", end: "2026-07-21T07:30:00Z", durationMin: 45, task: "b" }),
  ], Date.parse("2026-07-21T08:00:00Z"))!;
  // Window 05:00–08:00 (3h). Gap 06:00–06:45.
  expect(tl.summary.segments.length).toBe(2);
  expect(tl.summary.gaps.length).toBe(1);
  const gap = tl.summary.gaps[0];
  expect(gap.minutes).toBeCloseTo(45, 3);
  expect(gap.leftPct).toBeCloseTo((100 * 1) / 3, 3);      // 06:00 in a 3h window
  expect(gap.widthPct).toBeCloseTo((100 * 0.75) / 3, 3);  // 45 min wide
  expect(tl.summary.gapMin).toBeCloseTo(45, 3);
  expect(tl.summary.workedMin).toBeCloseTo(105, 3);
});

test("summary: gaps under 5 minutes count in gapMin but are not drawn", () => {
  const tl = buildDayTimeline([
    act({ start: T0500, end: "2026-07-21T06:00:00Z", durationMin: 60, task: "a" }),
    // 3-minute gap, then work again.
    act({ start: "2026-07-21T06:03:00Z", end: "2026-07-21T07:00:00Z", durationMin: 57, task: "b" }),
  ], Date.parse("2026-07-21T08:00:00Z"))!;
  expect(tl.summary.gaps.length).toBe(0);
  expect(tl.summary.gapMin).toBeCloseTo(3, 3);
  expect(tl.summary.segments.length).toBe(2);
});

test("summary: edge padding to whole hours never counts as gap", () => {
  // Entry 05:03–06:45 → window 05:00–08:00; idle 05:00–05:03 and 06:45–08:00
  // is window padding, not interior gap.
  const tl = buildDayTimeline([
    act({ start: "2026-07-21T05:03:00Z", end: "2026-07-21T06:45:00Z", durationMin: 102 }),
  ], Date.parse("2026-07-21T08:00:00Z"))!;
  expect(tl.summary.gaps.length).toBe(0);
  expect(tl.summary.gapMin).toBe(0);
});

test("summary: open timers participate with their resolved end", () => {
  const tl = buildDayTimeline([
    act({ start: T0500, end: "2026-07-21T06:00:00Z", durationMin: 60, task: "a" }),
    act({ start: "2026-07-21T07:00:00Z", task: "b" }), // open, no duration → ends at now
  ], Date.parse("2026-07-21T07:30:00Z"))!;
  expect(tl.summary.segments.length).toBe(2);
  expect(tl.summary.gaps[0].minutes).toBeCloseTo(60, 3); // 06:00–07:00
  expect(tl.summary.workedMin).toBeCloseTo(90, 3);
});

// ---------------------------------------------------------------------------
// Work-hours band (clock-in + 9h)
// ---------------------------------------------------------------------------

const CLOCKIN_0500 = Date.parse(T0500);

test("band: window always covers clock-in + 9h even when entries are shorter", () => {
  const tl = buildDayTimeline([
    act({ start: "2026-07-21T05:30:00Z", end: "2026-07-21T06:30:00Z", durationMin: 60 }),
  ], NOW_0700, CLOCKIN_0500)!;
  expect(tl.startMs).toBe(Date.parse("2026-07-21T05:00:00Z"));
  expect(tl.endMs).toBe(Date.parse("2026-07-21T14:00:00Z")); // 05:00 + 9h
  expect(tl.band).not.toBeNull();
  expect(tl.band!.startMs).toBe(CLOCKIN_0500);
  expect(tl.band!.endMs).toBe(CLOCKIN_0500 + 9 * HOUR);
  expect(tl.band!.leftPct).toBeCloseTo(0, 3);
  expect(tl.band!.widthPct).toBeCloseTo(100, 3);
});

test("band: no clock-in → no band, auto-fit window and interior gaps as before", () => {
  const tl = buildDayTimeline([
    act({ start: T0500, end: "2026-07-21T06:00:00Z", durationMin: 60 }),
  ], NOW_0700)!;
  expect(tl.band).toBeNull();
  expect(tl.endMs).toBe(Date.parse("2026-07-21T08:00:00Z")); // 3h min span, not 9h
});

test("band: no-timer counts leading, interior, and trailing time inside the band", () => {
  // Clock-in 05:00, single timer 06:00–07:00 → 1h leading + 7h trailing = 8h.
  const tl = buildDayTimeline([
    act({ start: "2026-07-21T06:00:00Z", end: "2026-07-21T07:00:00Z", durationMin: 60 }),
  ], NOW_0700, CLOCKIN_0500)!;
  expect(tl.summary.gapMin).toBeCloseTo(8 * 60, 3);
  expect(tl.summary.gaps.length).toBe(2);
  expect(tl.summary.gaps[0].minutes).toBeCloseTo(60, 3);       // 05:00–06:00
  expect(tl.summary.gaps[1].minutes).toBeCloseTo(7 * 60, 3);   // 07:00–14:00
});

test("band: early work before clock-in is drawn but never counted as gap", () => {
  const tl = buildDayTimeline([
    act({ start: "2026-07-21T02:00:00Z", end: "2026-07-21T03:00:00Z", durationMin: 60, task: "early" }),
    act({ start: "2026-07-21T05:30:00Z", end: "2026-07-21T06:30:00Z", durationMin: 60, task: "shift" }),
  ], NOW_0700, CLOCKIN_0500)!;
  // Window extends left to cover the early entry.
  expect(tl.startMs).toBe(Date.parse("2026-07-21T02:00:00Z"));
  // Gaps: only inside the band — 05:00–05:30 (30m) + 06:30–14:00 (7h30m).
  // The 03:00–05:00 stretch between early work and clock-in is NOT a gap.
  expect(tl.summary.gapMin).toBeCloseTo(8 * 60, 3);
  expect(tl.summary.gaps[0].startMs).toBe(CLOCKIN_0500);
  expect(tl.summary.segments.length).toBe(2); // early block still drawn
});

test("band: idle after the band end never counts, even between overtime timers", () => {
  // Full band worked 05:00–14:00, then OT 15:00–16:00: the 14:00–15:00 idle
  // hour is past the band end and does NOT count (matches the serving
  // view's cap at clock-in + raw stated hours). The OT bar still draws.
  const tl = buildDayTimeline([
    act({ start: T0500, end: "2026-07-21T14:00:00Z", durationMin: 540, task: "day" }),
    act({ start: "2026-07-21T15:00:00Z", end: "2026-07-21T16:00:00Z", durationMin: 60, task: "ot" }),
  ], Date.parse("2026-07-21T17:00:00Z"), CLOCKIN_0500)!;
  expect(tl.summary.gapMin).toBe(0);
  expect(tl.summary.gaps.length).toBe(0);
  expect(tl.summary.segments.length).toBe(2); // OT block still drawn
  expect(tl.summary.workedMin).toBeCloseTo(10 * 60, 3); // worked total keeps the OT hour
});

test("band: a timer straddling the band end is clipped for gap accounting", () => {
  // Clock-in 05:00, band ends 14:00. Work 05:00–12:00, then 13:00–15:00
  // (straddles the band end). The 12:00–13:00 idle counts; nothing after
  // 14:00 does — no trailing gap appears past the band end.
  const tl = buildDayTimeline([
    act({ start: T0500, end: "2026-07-21T12:00:00Z", durationMin: 420, task: "a" }),
    act({ start: "2026-07-21T13:00:00Z", end: "2026-07-21T15:00:00Z", durationMin: 120, task: "b" }),
  ], Date.parse("2026-07-21T16:00:00Z"), CLOCKIN_0500)!;
  expect(tl.summary.gapMin).toBeCloseTo(60, 3);
  expect(tl.summary.gaps.length).toBe(1);
  expect(tl.summary.gaps[0].startMs).toBe(Date.parse("2026-07-21T12:00:00Z"));
  expect(tl.summary.gaps[0].endMs).toBe(Date.parse("2026-07-21T13:00:00Z"));
});

test("band: clocked in with zero timers in band still reports the full band as no-timer", () => {
  // Only early work exists; the whole 9h band is uncovered.
  const tl = buildDayTimeline([
    act({ start: "2026-07-21T02:00:00Z", end: "2026-07-21T03:00:00Z", durationMin: 60 }),
  ], Date.parse("2026-07-21T15:00:00Z"), CLOCKIN_0500)!;
  expect(tl.summary.gapMin).toBeCloseTo(9 * 60, 3);
});

// ---------------------------------------------------------------------------
// Stated-hours band width (4DWW: band = the DR's raw stated hours)
// ---------------------------------------------------------------------------

test("band: stated hours set the band width (11h 4DWW day)", () => {
  const tl = buildDayTimeline([
    act({ start: "2026-07-21T05:30:00Z", end: "2026-07-21T06:30:00Z", durationMin: 60 }),
  ], NOW_0700, CLOCKIN_0500, 11)!;
  expect(tl.band!.endMs).toBe(CLOCKIN_0500 + 11 * HOUR);
  expect(tl.endMs).toBe(Date.parse("2026-07-21T16:00:00Z")); // axis covers 05:00 + 11h
  expect(tl.bandHours).toBe(11);
});

test("band: stated hours below 9 shrink the band (half-day claim)", () => {
  const tl = buildDayTimeline([
    act({ start: "2026-07-21T05:00:00Z", end: "2026-07-21T06:00:00Z", durationMin: 60 }),
  ], NOW_0700, CLOCKIN_0500, 4)!;
  expect(tl.band!.endMs).toBe(CLOCKIN_0500 + 4 * HOUR);
  // No-timer accounting follows the shorter band: 06:00–09:00 = 3h.
  expect(tl.summary.gapMin).toBeCloseTo(3 * 60, 3);
});

test("band: null / zero / negative stated hours fall back to the 9h default", () => {
  for (const stated of [null, 0, -2]) {
    const tl = buildDayTimeline([
      act({ start: "2026-07-21T05:30:00Z", end: "2026-07-21T06:30:00Z", durationMin: 60 }),
    ], NOW_0700, CLOCKIN_0500, stated)!;
    expect(tl.band!.endMs).toBe(CLOCKIN_0500 + 9 * HOUR);
    expect(tl.bandHours).toBe(9);
  }
});

test("band: garbage stated hours cap at 24h so the axis survives", () => {
  const tl = buildDayTimeline([
    act({ start: "2026-07-21T05:30:00Z", end: "2026-07-21T06:30:00Z", durationMin: 60 }),
  ], NOW_0700, CLOCKIN_0500, 99)!;
  expect(tl.band!.endMs).toBe(CLOCKIN_0500 + 24 * HOUR);
  expect(tl.bandHours).toBe(24);
});

test("band: stated hours without a clock-in still draw no band", () => {
  const tl = buildDayTimeline([
    act({ start: T0500, end: "2026-07-21T06:00:00Z", durationMin: 60 }),
  ], NOW_0700, null, 11)!;
  expect(tl.band).toBeNull();
});

test("formatMinutes renders hours+minutes and never shows 60m", () => {
  expect(formatMinutes(null)).toBe("—");
  expect(formatMinutes(0)).toBe("0m");
  expect(formatMinutes(42)).toBe("42m");
  expect(formatMinutes(102)).toBe("1h 42m");
  expect(formatMinutes(119.6)).toBe("2h 0m");
});

test("totalMin prefers the reported durationMin over span math", () => {
  const tl = buildDayTimeline([
    // Reported 55m even though the span is 60m (source dedupe can trim).
    act({ start: T0500, end: "2026-07-21T06:00:00Z", durationMin: 55 }),
  ], NOW_0700)!;
  expect(tl.rows[0].totalMin).toBe(55);
});

// --- taskColorCategory: bar color buckets for the Gantt view -----------------
// Timer task names arrive both bare ("Training") and with the PM API enumeration
// prefixes ("7. Training", "3B. Data Entry Complete"), so classification
// must survive the prefix. Scope: overhead/admin
// tasks gray, Data Entry orange, Data Prep explicitly NOT included.

test("overhead tasks classify as overhead, with or without enumeration prefix", () => {
  const overhead = [
    "General Admin",
    "1. General Admin",
    "Quality Review",
    "9. Quality Review",
    "Training",
    "7. Training",
    "Documentation",
    "8. Documentation",
    "Reporting and Analysis",
    "4. Reporting and Analysis",
    "Coaching Session",
    "3. Coaching Session",
    "Peer Review",
    "2. Peer Review",
    "Research",
    "10. Research",
    "Internal Projects",
    "5. Internal Projects",
    "Recruiting Support",
    "Business Development",
  ];
  for (const task of overhead) {
    expect(taskColorCategory(task), task).toBe("overhead");
  }
});

test("Tools and Automation classifies as its own tools bucket (split out of admin)", () => {
  for (const task of ["Tools and Automation", "2. Tools and Automation", "  tools AND automation "]) {
    expect(taskColorCategory(task), task).toBe("tools");
  }
});

test("Data Entry classifies as dataentry across prefix variants", () => {
  for (const task of [
    "Data Entry Complete",
    "7. Data Entry Complete",
    "3B. Data Entry Complete",
    "9. Data Entry Complete",
  ]) {
    expect(taskColorCategory(task), task).toBe("dataentry");
  }
});

test("Data Prep stays standard (explicitly excluded from dataentry)", () => {
  expect(taskColorCategory("Data Prep Complete")).toBe("standard");
  expect(taskColorCategory("6. Data Prep Complete")).toBe("standard");
});

test("production tasks and missing names stay standard", () => {
  expect(taskColorCategory("Package Assembly")).toBe("standard");
  expect(taskColorCategory("Design Review")).toBe("standard");
  expect(taskColorCategory("Quality Check")).toBe("standard");
  expect(taskColorCategory(null)).toBe("standard");
});

test("classification is case- and stray-whitespace-insensitive", () => {
  expect(taskColorCategory("  General Admin ")).toBe("overhead");
  expect(taskColorCategory("1B.  Training")).toBe("overhead");
});

// --- taskTypeTotals: minutes per task-type bucket for the breakdown chart ----

const row = (task: string | null, totalMin: number) => ({
  site: null, task, totalMin, hasOpen: false, bars: [],
});

test("taskTypeTotals sums row minutes into production/overhead/dataentry/tools buckets", () => {
  const t = taskTypeTotals([
    row("Package Assembly", 120),
    row("Design Review", 30),
    row("General Admin", 45),
    row("7. Training", 15),
    row("Data Entry Complete", 60),
    row("2. Tools and Automation", 20),
  ]);
  expect(t.production).toBe(150);
  expect(t.overhead).toBe(60);
  expect(t.dataentry).toBe(60);
  expect(t.tools).toBe(20);
  expect(t.totalMin).toBe(290);
});

test("taskTypeTotals: empty rows give all-zero buckets", () => {
  const t = taskTypeTotals([]);
  expect(t.production).toBe(0);
  expect(t.overhead).toBe(0);
  expect(t.dataentry).toBe(0);
  expect(t.tools).toBe(0);
  expect(t.totalMin).toBe(0);
});

test("taskTypeTotals: a missing task name counts as production", () => {
  const t = taskTypeTotals([row(null, 25)]);
  expect(t.production).toBe(25);
  expect(t.totalMin).toBe(25);
});
