import { test, expect } from "@playwright/test";
import { summarizeQueue, groupBacklog, type QueueRow } from "./approval-metrics";

function row(p: Partial<QueueRow>): QueueRow {
  return {
    empId: "E1", employeeName: "A", carrierGroup: "Group A", division: "TS",
    workDate: "2026-06-01", taskDid: "t1", submittedOnEt: "2026-06-01 09:00",
    pendingWaitDays: 1, assignedApprover: "Daily Report Approvers - Group A",
    noApproverFlag: false, totalHours: 8, clockInEt: "2026-06-01 09:00", ...p,
  };
}

test("summarizeQueue counts buckets, oldest wait, and missing approver", () => {
  const rows = [
    row({ pendingWaitDays: 2 }),
    row({ pendingWaitDays: 5 }),
    row({ pendingWaitDays: 12, noApproverFlag: true, assignedApprover: null }),
  ];
  const s = summarizeQueue(rows);
  expect(s.awaiting).toBe(3);
  expect(s.amber).toBe(1);
  expect(s.red).toBe(1);
  expect(s.oldestWaitDays).toBe(12);
  expect(s.noApprover).toBe(1);
});

test("groupBacklog aggregates per approver group, unassigned bucketed", () => {
  const rows = [
    row({ assignedApprover: "G1", pendingWaitDays: 2 }),
    row({ assignedApprover: "G1", pendingWaitDays: 9 }),
    row({ assignedApprover: null, pendingWaitDays: 5 }),
  ];
  const g = groupBacklog(rows);
  expect(g[0]).toEqual({ group: "G1", waiting: 2, amber: 0, red: 1 });
  expect(g.find((x) => x.group === "(unassigned)")).toEqual({ group: "(unassigned)", waiting: 1, amber: 1, red: 0 });
});
