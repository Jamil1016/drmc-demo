import { test, expect } from "@playwright/test";
import { groupPendingByEmployee } from "./group-pending";
import type { PendingRow } from "./types";

function row(over: Partial<PendingRow>): PendingRow {
  return {
    empId: "e1", employeeName: "Alice", email: null, carrierGroup: null, division: null,
    workDate: "2026-06-01", taskStatus: "submitted", clockInEt: null,
    submittedOnEt: "2026-06-02T09:00:00", approvedOnEt: null, totalHours: null,
    assignedApprover: "G", approvedBy: null, approvalLatencyDays: null,
    taskDid: "t1", pendingWaitDays: 1, shiftTimeInPht: null,
    timedHours: null, openTimerCount: 0, hasTimerHistory: false, varianceHours: null, coveragePct: null, ...over,
  };
}

test("groups by employee with count, longest wait, and kept entry order", () => {
  const rows = [
    row({ empId: "a", employeeName: "Al", taskDid: "a1", pendingWaitDays: 2 }),
    row({ empId: "a", employeeName: "Al", taskDid: "a2", pendingWaitDays: 9 }),
    row({ empId: "b", employeeName: "Bo", taskDid: "b1", pendingWaitDays: 4 }),
  ];
  const out = groupPendingByEmployee(rows);
  // a has longest wait 9 -> sorts before b (4)
  expect(out.map((e) => e.empId)).toEqual(["a", "b"]);
  expect(out[0]).toMatchObject({ count: 2, longestWaitDays: 9 });
  expect(out[0].entries.map((e) => e.taskDid)).toEqual(["a1", "a2"]); // input order preserved
  expect(out[1]).toMatchObject({ empId: "b", count: 1, longestWaitDays: 4 });
});

test("null wait counts as 0; null name falls back to id, sorted ascending", () => {
  const rows = [
    row({ empId: "zoe", employeeName: "Zoe", taskDid: "z1", pendingWaitDays: 0 }),
    row({ empId: "amy", employeeName: null, taskDid: "a1", pendingWaitDays: null }),
  ];
  const out = groupPendingByEmployee(rows);
  expect(out.find((e) => e.empId === "amy")!.longestWaitDays).toBe(0);
  // both wait 0, count 1 -> name/id ascending: "amy" (id fallback) < "Zoe" -> amy first
  expect(out.map((e) => e.empId)).toEqual(["amy", "zoe"]);
});

test("ties broken by count desc, then name ascending", () => {
  const rows = [
    row({ empId: "z", employeeName: "Zebra", taskDid: "z1", pendingWaitDays: 5 }),
    row({ empId: "a", employeeName: "Apple", taskDid: "a1", pendingWaitDays: 5 }),
    row({ empId: "m", employeeName: "Mango", taskDid: "m1", pendingWaitDays: 5 }),
    row({ empId: "m", employeeName: "Mango", taskDid: "m2", pendingWaitDays: 3 }),
  ];
  const out = groupPendingByEmployee(rows);
  // all longest wait 5; Mango has count 2 (wins count tiebreak); then Apple before Zebra (name asc)
  expect(out.map((e) => e.empId)).toEqual(["m", "a", "z"]);
});

test("does not mutate the input array", () => {
  const rows = [
    row({ empId: "a", taskDid: "a1", pendingWaitDays: 1 }),
    row({ empId: "b", taskDid: "b1", pendingWaitDays: 9 }),
  ];
  const before = rows.slice();
  groupPendingByEmployee(rows);
  expect(rows).toEqual(before);
});

test("empty input returns empty array", () => {
  expect(groupPendingByEmployee([])).toEqual([]);
});
