import { test, expect } from "@playwright/test";
import { precedingWindow, buildVarianceReportModel } from "./variance-report-model";
import type { VarianceRow } from "./variance-agg";

function r(over: Partial<VarianceRow>): VarianceRow {
  const stated = over.statedHoursNet ?? 8;
  const timed = over.timedHours ?? stated;
  const cov = over.coveragePct ?? (stated ? (100 * timed) / stated : 100);
  return {
    empId: "E", employeeName: "A", email: null, carrierGroup: "Group A - Carrier A",
    displayGroup: "Carrier A", workDate: "2026-06-02", taskDid: "T", clockInEt: null,
    statedHoursNet: stated, timedHours: timed, varianceHours: stated - timed,
    coveragePct: cov, variancePct: 100 - cov, breach: cov <= 85,
    isActive: true, position: "Field Analyst II", ...over,
  };
}

test("precedingWindow returns the equal-length window immediately before", () => {
  // Jun 1..Jun 25 inclusive is 25 days; prior is May 7..May 31.
  expect(precedingWindow("2026-06-01", "2026-06-25")).toEqual({ from: "2026-05-07", to: "2026-05-31" });
});

test("KPIs carry prior-period deltas with correct sentiment", () => {
  const current = [r({ empId: "1", statedHoursNet: 10, timedHours: 7 })]; // variance 3h, cov 70 => breach
  const prior = [r({ empId: "1", statedHoursNet: 10, timedHours: 9 })];   // variance 1h, cov 90
  const m = buildVarianceReportModel({
    current, prior,
    params: { from: "2026-06-01", to: "2026-06-25", groups: [], includeInactive: false, positions: [] },
    generatedEt: "2026-07-31 02:40 AM ET",
  });
  expect(m.kpis.unworkedHours.value).toBe(3);
  expect(m.kpis.unworkedHours.prior).toBe(1);
  expect(m.kpis.unworkedHours.sentiment).toBe("bad");   // more unworked = bad
  expect(m.kpis.breachRate.value).toBe(100);            // 1 of 1 report breaches
});

test("watchlist lists all members worst-to-best with breach flag and prior trend", () => {
  const current = [
    r({ empId: "1", employeeName: "Worst", statedHoursNet: 10, timedHours: 6 }), // var% 40
    r({ empId: "2", employeeName: "Best",  statedHoursNet: 10, timedHours: 10 }), // var% 0
  ];
  const prior = [ r({ empId: "1", employeeName: "Worst", statedHoursNet: 10, timedHours: 9 }) ]; // was var% 10 -> regressed
  const m = buildVarianceReportModel({
    current, prior,
    params: { from: "2026-06-01", to: "2026-06-25", groups: [], includeInactive: false, positions: [] },
    generatedEt: "x",
  });
  expect(m.watchlist.map((w) => w.employeeName)).toEqual(["Worst", "Best"]);
  expect(m.watchlist[0].breach).toBe(true);
  expect(m.watchlist[0].trend).toBe("up");   // variance rose vs prior
  expect(m.watchlist[1].breach).toBe(false);
});

test("concentration reports top-N share of unworked hours", () => {
  // 12 members: ten with 10h unworked each (100h) + two with 5h each (10h) = 110h total.
  // topN caps at 10, so the top 10 hold 100/110 = 91%.
  const current = [
    ...Array.from({ length: 10 }, (_, i) => r({ empId: `T${i}`, statedHoursNet: 10, timedHours: 0 })),
    r({ empId: "B1", statedHoursNet: 10, timedHours: 5 }),
    r({ empId: "B2", statedHoursNet: 10, timedHours: 5 }),
  ];
  const m = buildVarianceReportModel({
    current, prior: [],
    params: { from: "2026-06-01", to: "2026-06-25", groups: [], includeInactive: false, positions: [] },
    generatedEt: "x",
  });
  expect(m.concentration.topN).toBe(10);
  expect(m.concentration.topSharePct).toBe(91);
});

test("monthly rows bucket by calendar month: mean variance, positive-only hours, partial flags, zero-report gaps", () => {
  // Window Jun 15 .. Aug 10 spans Jun (partial), Jul (full, no data), Aug (partial).
  const current = [
    r({ empId: "1", workDate: "2026-06-20", statedHoursNet: 10, timedHours: 8 }),  // var% 20, +2h
    r({ empId: "1", workDate: "2026-06-21", statedHoursNet: 10, timedHours: 9 }),  // var% 10, +1h
    r({ empId: "1", workDate: "2026-08-05", statedHoursNet: 10, timedHours: 12 }), // var% -20, over-tracked
  ];
  const m = buildVarianceReportModel({
    current, prior: [],
    params: { from: "2026-06-15", to: "2026-08-10", groups: [], includeInactive: false, positions: [] },
    generatedEt: "x",
  });
  expect(m.monthly.map((x) => x.month)).toEqual(["2026-06", "2026-07", "2026-08"]);
  expect(m.monthly[0]).toMatchObject({ label: "Jun 2026", reportCount: 2, avgVariancePct: 15, varianceHours: 3, partial: true });
  expect(m.monthly[1]).toMatchObject({ reportCount: 0, avgVariancePct: null, varianceHours: 0, partial: false });
  expect(m.monthly[2].partial).toBe(true);
  expect(m.monthly[2].avgVariancePct).toBe(-20); // mean keeps over-tracking visible...
  expect(m.monthly[2].varianceHours).toBe(0);    // ...but variance hours stay positive-only
});

test("monthly marks a window that covers a whole single month as not partial", () => {
  const m = buildVarianceReportModel({
    current: [r({ empId: "1", workDate: "2026-07-10" })], prior: [],
    params: { from: "2026-07-01", to: "2026-07-31", groups: [], includeInactive: false, positions: [] },
    generatedEt: "x",
  });
  expect(m.monthly).toHaveLength(1);
  expect(m.monthly[0].partial).toBe(false);
});

test("group rows mark filtered-out groups as out of scope", () => {
  const current = [ r({ empId: "1", displayGroup: "Carrier A" }) ];
  const m = buildVarianceReportModel({
    current, prior: [],
    params: { from: "2026-06-01", to: "2026-06-25", groups: ["Carrier A"], includeInactive: false, positions: [] },
    generatedEt: "x",
  });
  const carrierC = m.groups.find((g) => g.group === "Carrier C")!;
  expect(carrierC.inScope).toBe(false);
});

function build(current: VarianceRow[], prior: VarianceRow[]) {
  return buildVarianceReportModel({
    current, prior,
    params: { from: "2026-06-01", to: "2026-06-25", groups: [], includeInactive: false, positions: [] },
    generatedEt: "x",
  });
}

test("movers rank regressed and improved, requiring >=2 reports in both periods", () => {
  const cur = [
    r({ empId: "X", statedHoursNet: 10, timedHours: 7, workDate: "2026-06-02" }),   // var 30
    r({ empId: "X", statedHoursNet: 10, timedHours: 7, workDate: "2026-06-03" }),
    r({ empId: "Y", statedHoursNet: 10, timedHours: 9.5, workDate: "2026-06-02" }), // var 5
    r({ empId: "Y", statedHoursNet: 10, timedHours: 9.5, workDate: "2026-06-03" }),
    r({ empId: "Z", statedHoursNet: 10, timedHours: 5, workDate: "2026-06-02" }),   // only 1 report
  ];
  const pri = [
    r({ empId: "X", statedHoursNet: 10, timedHours: 9, workDate: "2026-05-02" }),   // var 10
    r({ empId: "X", statedHoursNet: 10, timedHours: 9, workDate: "2026-05-03" }),
    r({ empId: "Y", statedHoursNet: 10, timedHours: 7.5, workDate: "2026-05-02" }), // var 25
    r({ empId: "Y", statedHoursNet: 10, timedHours: 7.5, workDate: "2026-05-03" }),
  ];
  const m = build(cur, pri);
  expect(m.movers.regressed[0].empId).toBe("X");
  expect(m.movers.regressed[0].deltaPts).toBe(20);
  expect(m.movers.improved[0].empId).toBe("Y");
  expect(m.movers.improved[0].deltaPts).toBe(-20);
  expect(m.movers.regressed.find((x) => x.empId === "Z")).toBeUndefined();
  expect(m.movers.improved.find((x) => x.empId === "Z")).toBeUndefined();
});

test("positions reports breach rate by base title, sorted worst-first", () => {
  const cur = [
    r({ empId: "A", position: "Field Analyst II", statedHoursNet: 10, timedHours: 5 }), // breach
    r({ empId: "B", position: "Field Analyst I", statedHoursNet: 10, timedHours: 9 }),  // no breach
    r({ empId: "C", position: "Project Coordinator", statedHoursNet: 10, timedHours: 5 }),    // breach
  ];
  const m = build(cur, []);
  const ta = m.positions.find((p) => p.position === "Field Analyst")!;
  expect(ta.members).toBe(2);
  expect(ta.breachPct).toBe(50);
  const pa = m.positions.find((p) => p.position === "Project Coordinator")!;
  expect(pa.breachPct).toBe(100);
  expect(m.positions[0].position).toBe("Project Coordinator");
});

test("distribution box per group and group status band", () => {
  const cur = [
    r({ empId: "V1", displayGroup: "Carrier A", carrierGroup: "Group A - Carrier A", statedHoursNet: 10, timedHours: 5 }), // var 50
    r({ empId: "V2", displayGroup: "Carrier A", carrierGroup: "Group A - Carrier A", statedHoursNet: 10, timedHours: 8 }), // var 20
    r({ empId: "V3", displayGroup: "Carrier A", carrierGroup: "Group A - Carrier A", statedHoursNet: 10, timedHours: 9 }), // var 10
  ];
  const m = build(cur, []);
  const dist = m.distribution.find((d) => d.group === "Carrier A")!;
  expect(dist.n).toBe(3);
  expect(dist.breachCount).toBe(2);
  const carrierA = m.groups.find((g) => g.group === "Carrier A")!;
  expect(carrierA.status).toBe("red");
});

test("movers fall back to first-half vs second-half when the prior window has no data", () => {
  // Window Jun 1..Jun 25 splits at Jun 12/13. X worsens half-over-half, Y improves.
  const cur = [
    r({ empId: "X", statedHoursNet: 10, timedHours: 9, workDate: "2026-06-02" }),   // var 10
    r({ empId: "X", statedHoursNet: 10, timedHours: 9, workDate: "2026-06-03" }),
    r({ empId: "X", statedHoursNet: 10, timedHours: 7, workDate: "2026-06-20" }),   // var 30
    r({ empId: "X", statedHoursNet: 10, timedHours: 7, workDate: "2026-06-21" }),
    r({ empId: "Y", statedHoursNet: 10, timedHours: 7.5, workDate: "2026-06-02" }), // var 25
    r({ empId: "Y", statedHoursNet: 10, timedHours: 7.5, workDate: "2026-06-03" }),
    r({ empId: "Y", statedHoursNet: 10, timedHours: 9.5, workDate: "2026-06-20" }), // var 5
    r({ empId: "Y", statedHoursNet: 10, timedHours: 9.5, workDate: "2026-06-21" }),
    r({ empId: "Z", statedHoursNet: 10, timedHours: 5, workDate: "2026-06-20" }),   // second half only
  ];
  const m = build(cur, []);
  expect(m.movers.basis).toBe("half");
  expect(m.movers.regressed[0].empId).toBe("X");
  expect(m.movers.regressed[0].deltaPts).toBe(20);
  expect(m.movers.improved[0].empId).toBe("Y");
  expect(m.movers.improved[0].deltaPts).toBe(-20);
  expect(m.movers.regressed.find((x) => x.empId === "Z")).toBeUndefined();
});

test("movers basis stays 'prior' when the prior window has data", () => {
  const cur = [
    r({ empId: "X", statedHoursNet: 10, timedHours: 7, workDate: "2026-06-02" }),
    r({ empId: "X", statedHoursNet: 10, timedHours: 7, workDate: "2026-06-03" }),
  ];
  const pri = [
    r({ empId: "X", statedHoursNet: 10, timedHours: 9, workDate: "2026-05-02" }),
    r({ empId: "X", statedHoursNet: 10, timedHours: 9, workDate: "2026-05-03" }),
  ];
  expect(build(cur, pri).movers.basis).toBe("prior");
});
