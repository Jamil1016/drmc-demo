import { test, expect } from "@playwright/test";
import {
  quantile,
  median,
  mondayWeekStart,
  enumerateWeekStarts,
  enumerateDayColumns,
  defaultVarianceRange,
} from "./variance-agg";

test("quantile interpolates linearly", () => {
  expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
  expect(quantile([10, 20, 30], 0.25)).toBe(15);
  expect(quantile([5], 0.5)).toBe(5);
  expect(quantile([], 0.5)).toBe(0);
});

test("median returns null for an empty set", () => {
  expect(median([])).toBeNull();
  expect(median([2, 4, 6])).toBe(4);
});

test("mondayWeekStart snaps any date to that week's Monday (UTC-stable)", () => {
  // 2026-07-29 is a Wednesday -> Monday is 2026-07-27
  expect(mondayWeekStart("2026-07-29")).toBe("2026-07-27");
  expect(mondayWeekStart("2026-07-27")).toBe("2026-07-27"); // Monday itself
  expect(mondayWeekStart("2026-08-02")).toBe("2026-07-27"); // Sunday -> prior Monday
  expect(mondayWeekStart("2026-08-03")).toBe("2026-08-03"); // next Monday
});

test("enumerateWeekStarts lists Monday week-starts covering the range", () => {
  const weeks = enumerateWeekStarts("2026-07-15", "2026-07-29");
  expect(weeks).toEqual(["2026-07-13", "2026-07-20", "2026-07-27"]);
});

test("enumerateDayColumns yields Mon-Fri days tagged with their week", () => {
  const days = enumerateDayColumns("2026-07-27", "2026-08-02"); // Mon..Sun
  expect(days.map((d) => d.dayIso)).toEqual([
    "2026-07-27", "2026-07-28", "2026-07-29", "2026-07-30", "2026-07-31",
  ]);
  expect(days.every((d) => d.weekStart === "2026-07-27")).toBe(true);
});

test("defaultVarianceRange is a 90-day window ending today PHT", () => {
  const r = defaultVarianceRange(new Date("2026-07-29T04:00:00Z")); // noon PHT
  expect(r.to).toBe("2026-07-29");
  expect(r.from).toBe("2026-05-01"); // 89 days earlier, inclusive 90-day window
});

import {
  variancePctOf,
  isBreach,
  basePosition,
  computeKpis,
  personStats,
  boxStats,
  type VarianceRow,
} from "./variance-agg";

function row(over: Partial<VarianceRow> = {}): VarianceRow {
  return {
    empId: "E1", employeeName: "Alice", email: "a@example.com",
    carrierGroup: "Group A - Carrier A", displayGroup: "Carrier A",
    workDate: "2026-07-27", taskDid: "T1", clockInEt: null,
    statedHoursNet: 8, timedHours: 6, varianceHours: 2,
    coveragePct: 75, variancePct: 25, breach: true, isActive: true, position: "Field Analyst",
    ...over,
  };
}

test("basePosition strips the trailing level so the filter has base titles", () => {
  expect(basePosition("Field Analyst II")).toBe("Field Analyst");
  expect(basePosition("Field Associate I")).toBe("Field Associate");
  expect(basePosition("Project Coordinator III")).toBe("Project Coordinator");
  expect(basePosition("Project Coordinator 2")).toBe("Project Coordinator"); // arabic level too
  expect(basePosition("Team Lead")).toBe("Team Lead"); // no level -> unchanged
  expect(basePosition(null)).toBeNull();
});

test("variancePctOf and isBreach are single-sourced on the 85% line", () => {
  expect(variancePctOf(75)).toBe(25);
  expect(variancePctOf(110)).toBe(-10);
  expect(isBreach(85)).toBe(true);   // coverage 85 = untimed 15 = breach
  expect(isBreach(85.5)).toBe(false);
  expect(isBreach(90)).toBe(false);
});

test("computeKpis: unworked = sum of positive variance only; productivity = median coverage", () => {
  const rows = [
    row({ varianceHours: 2, coveragePct: 75, breach: true }),
    row({ varianceHours: 1, coveragePct: 88, breach: false }),
    row({ varianceHours: -3, coveragePct: 130, breach: false }), // under-tracker, not netted in
  ];
  const k = computeKpis(rows);
  expect(k.unworkedHours).toBe(3);       // 2 + 1, the -3 excluded
  expect(k.productivity).toBe(88);       // median of [75, 88, 130]
  expect(k.timedHours).toBe(18);         // 3 rows x default timedHours 6
  expect(k.declaredHours).toBe(24);      // 3 rows x default statedHoursNet 8
  expect(k.breaching).toBe(1);
  expect(k.reportCount).toBe(3);
});

test("computeKpis on an empty set yields null productivity", () => {
  const k = computeKpis([]);
  expect(k.productivity).toBeNull();
  expect(k.timedHours).toBe(0);
  expect(k.declaredHours).toBe(0);
  expect(k.unworkedHours).toBe(0);
  expect(k.breaching).toBe(0);
});

test("personStats uses per-person median variance %, not mean", () => {
  const rows = [
    row({ empId: "E1", coveragePct: 90, variancePct: 10, breach: false }),
    row({ empId: "E1", coveragePct: 60, variancePct: 40, breach: true }),
    row({ empId: "E1", coveragePct: 50, variancePct: 50, breach: true }),
    row({ empId: "E2", employeeName: "Bob", coveragePct: 95, variancePct: 5, breach: false }),
  ];
  const stats = personStats(rows);
  const e1 = stats.find((s) => s.empId === "E1")!;
  expect(e1.medianVariancePct).toBe(40); // median of [10,40,50], not the mean 33.3
  expect(e1.breachCount).toBe(2);
  expect(e1.reportCount).toBe(3);
  expect(e1.medianCoverage).toBe(60);
});

test("boxStats computes quartiles, 1.5*IQR whiskers, and outlier indices", () => {
  const values = [1, 2, 3, 4, 5, 6, 7, 8, 100]; // 100 is a high outlier
  const b = boxStats(values);
  expect(b.med).toBe(5);
  expect(b.q1).toBe(3);
  expect(b.q3).toBe(7);
  expect(b.outlierIdx).toEqual([8]);   // index of 100
  expect(b.whiskerHi).toBe(8);         // max inlier
  expect(b.whiskerLo).toBe(1);
});

import {
  cellStats,
  colKeyOf,
  bucketByColumn,
  binDots,
} from "./variance-agg";

test("cellStats: mean variance %, breach share, count", () => {
  const rows = [
    row({ variancePct: 10, coveragePct: 90, breach: false }),
    row({ variancePct: 30, coveragePct: 70, breach: true }),
  ];
  const c = cellStats(rows)!;
  expect(c.avgVariancePct).toBe(20);   // mean of 10 and 30
  expect(c.breachPct).toBe(50);
  expect(c.n).toBe(2);
  expect(cellStats([])).toBeNull();
});

test("colKeyOf keys by Monday week or exact day", () => {
  const r = row({ workDate: "2026-07-29" }); // Wednesday
  expect(colKeyOf(r, "week")).toBe("2026-07-27");
  expect(colKeyOf(r, "day")).toBe("2026-07-29");
});

test("bucketByColumn groups rows under their column key", () => {
  const rows = [
    row({ workDate: "2026-07-27" }),
    row({ workDate: "2026-07-29" }),
    row({ workDate: "2026-08-03" }),
  ];
  const wk = bucketByColumn(rows, "week");
  expect(wk.get("2026-07-27")!.length).toBe(2);
  expect(wk.get("2026-08-03")!.length).toBe(1);
});

test("binDots stacks co-located values upward and reports the tallest stack", () => {
  // three identical values land in the same bin -> stack 0,1,2
  const { bins, maxStack } = binDots([20, 20, 20], -15, 50, 520, 12);
  const stacks = bins.map((b) => b.stackIndex).sort((a, b) => a - b);
  expect(stacks).toEqual([0, 1, 2]);
  expect(maxStack).toBe(3);
  expect(new Set(bins.map((b) => b.binIndex)).size).toBe(1); // same x-bin
});

import { distDomain, dailyMedianSeries } from "./variance-agg";

test("distDomain keeps a small negative buffer and extends to the data", () => {
  expect(distDomain([])).toEqual([-5, 45]);
  expect(distDomain([10, 20, 30])).toEqual([-5, 45]);   // all within default range
  expect(distDomain([2, 60])).toEqual([-5, 65]);        // extends up past 45
  expect(distDomain([-12, 5])).toEqual([-15, 45]);      // extends down past -5
});

test("dailyMedianSeries gives one median point per date, ascending, last N", () => {
  const rows = [
    row({ workDate: "2026-07-01", coveragePct: 90, variancePct: 10 }),
    row({ workDate: "2026-07-01", coveragePct: 70, variancePct: 30 }),
    row({ workDate: "2026-07-02", coveragePct: 80, variancePct: 20 }),
    row({ workDate: "2026-06-30", coveragePct: 95, variancePct: 5 }),
  ];
  const series = dailyMedianSeries(rows);
  expect(series.map((p) => p.date)).toEqual(["2026-06-30", "2026-07-01", "2026-07-02"]);
  expect(series.map((p) => p.value)).toEqual([5, 20, 20]); // 07-01 median of [10,30] = 20
  expect(dailyMedianSeries(rows, 2).map((p) => p.date)).toEqual(["2026-07-01", "2026-07-02"]);
});

import { monthlyTrendStats, trendChartMode } from "./variance-agg";

test("trendChartMode: monthly only when the window intersects 3+ calendar months", () => {
  expect(trendChartMode("2026-07-01", "2026-07-31")).toBe("daily");
  expect(trendChartMode("2026-07-01", "2026-08-31")).toBe("daily");   // 2 months
  expect(trendChartMode("2026-06-15", "2026-08-10")).toBe("monthly"); // 3 months, partial edges
  expect(trendChartMode("2025-12-20", "2026-02-01")).toBe("monthly"); // year rollover
});

test("monthlyTrendStats buckets daily medians per window month with min/max/median/sd and gap months", () => {
  const series = [
    { date: "2026-06-10", value: 10, n: 3, breaches: 0 },
    { date: "2026-06-20", value: 20, n: 4, breaches: 1 },
    { date: "2026-08-05", value: 30, n: 2, breaches: 2 },
  ];
  const m = monthlyTrendStats(series, "2026-06-01", "2026-08-31");
  expect(m.map((x) => x.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
  expect(m[0]).toMatchObject({ label: "Jun", min: 10, max: 20, med: 15, n: 2 });
  expect(m[0].sd).toBeCloseTo(7.1, 1); // sample sd of [10,20]
  expect(m[1]).toMatchObject({ min: null, max: null, med: null, sd: null, n: 0 }); // gap month
  expect(m[2]).toMatchObject({ min: 30, max: 30, med: 30, n: 1 });
  expect(m[2].sd).toBeNull(); // sd undefined for a single day
});
