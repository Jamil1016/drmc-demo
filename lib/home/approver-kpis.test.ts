import { test, expect } from "@playwright/test";
import { aggregateApproverKpis } from "./approver-kpis";
import type { ScorecardRow } from "@/lib/hr/domain/types";

function row(over: Partial<ScorecardRow> & { groupLabel: string }): ScorecardRow {
  return {
    displayLabel: over.groupLabel, carrierGroup: null,
    employees: 0, pending: 0, pendingEmployees: 0, approvers: 0, approvedCount: 0,
    onTimeCount: 0, lateCount: 0, filedLateCount: 0, avgLatencyDays: null, ...over,
  };
}
const rows: ScorecardRow[] = [
  row({ groupLabel: "Group A", pending: 10, onTimeCount: 90, lateCount: 10 }),
  row({ groupLabel: "Group C", pending: 5, onTimeCount: 40, lateCount: 10 }),
  // NOTE: brief literal had lateCount: 0 here, which is inconsistent with the
  // test's own expected math (131 / 161 = 81, requires OPS decided = 11).
  // Corrected to lateCount: 10 so decidedCount (onTime + late) totals 161.
  row({ groupLabel: "OPS", pending: 2, onTimeCount: 1, lateCount: 10 }),
];

test("own scope aggregates only the user's groups", () => {
  const k = aggregateApproverKpis(rows, ["Group C"], "manager");
  expect(k).toEqual({ scope: "own", pending: 5, onTimePct: 80 });
});
test("own scope across multiple groups", () => {
  const k = aggregateApproverKpis(rows, ["Group A", "Group C"], "hr_staff");
  // pending 15; onTime 130 / decided 150 = 86.67 -> 87
  expect(k).toEqual({ scope: "own", pending: 15, onTimePct: 87 });
});
test("no groups + super_admin -> org-wide over all rows", () => {
  const k = aggregateApproverKpis(rows, [], "super_admin");
  // pending 17; onTime 131 / decided 161 = 81.4 -> 81
  expect(k).toEqual({ scope: "org", pending: 17, onTimePct: 81 });
});
test("no groups + non-admin -> scope none, no numbers", () => {
  const k = aggregateApproverKpis(rows, [], "manager");
  expect(k).toEqual({ scope: "none", pending: 0, onTimePct: null });
});
test("own scope with zero decided -> onTimePct null", () => {
  const k = aggregateApproverKpis([row({ groupLabel: "X", pending: 3 })], ["X"], "manager");
  expect(k).toEqual({ scope: "own", pending: 3, onTimePct: null });
});
