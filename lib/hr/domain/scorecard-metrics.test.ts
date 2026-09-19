import { test, expect } from "@playwright/test";
import { onTimePct, distribution, summarizeScorecard, rankScorecard } from "./scorecard-metrics";
import type { ScorecardRow } from "./types";

function row(over: Partial<ScorecardRow>): ScorecardRow {
  return {
    groupLabel: "g", displayLabel: "G", carrierGroup: null, employees: null,
    pending: 0, pendingEmployees: 0, approvers: 1,
    approvedCount: 0, onTimeCount: 0, lateCount: 0, filedLateCount: 0,
    avgLatencyDays: null, ...over,
  };
}

test("onTimePct is null when nothing decided, else rounded percent of decided", () => {
  expect(onTimePct(row({ onTimeCount: 0, lateCount: 0 }))).toBeNull();
  // 50 on-time out of 50+150 = 200 decided -> 25% (approvedCount is irrelevant now)
  expect(onTimePct(row({ approvedCount: 200, onTimeCount: 50, lateCount: 150 }))).toBe(25);
});

test("distribution splits DECIDED reports into ok/late percentages", () => {
  const d = distribution(row({ onTimeCount: 20, lateCount: 80 }));
  expect(Math.round(d.ok)).toBe(20);
  expect(Math.round(d.late)).toBe(80);
});

test("distribution returns zeros when nothing decided (no divide-by-zero)", () => {
  expect(distribution(row({ onTimeCount: 0, lateCount: 0 }))).toEqual({ ok: 0, late: 0 });
});

test("summarizeScorecard weights on-time rate over decided, flags groups under target", () => {
  const rows = [
    row({ pending: 100, approvedCount: 100, onTimeCount: 10, lateCount: 90, avgLatencyDays: 20, filedLateCount: 3 }), // 10% decided
    row({ pending: 5, approvedCount: 300, onTimeCount: 240, lateCount: 60, avgLatencyDays: 4, filedLateCount: 1 }),   // 80% decided
  ];
  const s = summarizeScorecard(rows);
  expect(s.groups).toBe(2);
  expect(s.pending).toBe(105);
  expect(s.onTimeRate).toBe(63);        // weighted (10+240)/(100+300) = 62.5 -> 63
  expect(s.orgAvgLag).toBe(8);          // weighted (20*100 + 4*300)/400 = 8
  expect(s.groupsBelowTarget).toBe(2);  // both under 90%
  expect(s.filedLate).toBe(4);
});

test("summarizeScorecard handles an empty set", () => {
  const s = summarizeScorecard([]);
  expect(s.groups).toBe(0);
  expect(s.pending).toBe(0);
  expect(s.onTimeRate).toBeNull();
  expect(s.orgAvgLag).toBeNull();
  expect(s.filedLate).toBe(0);
});

test("rankScorecard orders most-late first, then lower on-time rate, then volume", () => {
  const a = row({ displayLabel: "A", lateCount: 50, onTimeCount: 50, approvedCount: 100 }); // 50 late, 50% rate
  const b = row({ displayLabel: "B", lateCount: 90, onTimeCount: 10, approvedCount: 100 }); // most late
  const c = row({ displayLabel: "C", lateCount: 50, onTimeCount: 150, approvedCount: 200 }); // 50 late, 75% rate
  const z = row({ displayLabel: "Z", lateCount: 0, onTimeCount: 0, approvedCount: 0 });      // no late, last
  const out = rankScorecard([a, b, c, z]).map((r) => r.displayLabel);
  // B (90 late) first; A & C tie on 50 late -> lower rate (A 50%) before C (75%); Z last.
  expect(out).toEqual(["B", "A", "C", "Z"]);
});
