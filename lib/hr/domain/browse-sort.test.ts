import { test, expect } from "@playwright/test";
import { sanitizeBrowseSort, compareBrowseRows, BROWSE_SORT_KEYS, BROWSE_DEFAULT_DIR } from "./browse-sort";
import type { BrowseRow } from "./types";

function row(p: Partial<BrowseRow>): BrowseRow {
  return {
    empId: "260001", employeeName: null, email: null, carrierGroup: null, division: null,
    workDate: "2026-07-10", taskStatus: "submitted", clockInEt: null, submittedOnEt: null,
    approvedOnEt: null, totalHours: null, assignedApprover: null, approvedBy: null,
    approvalLatencyDays: null, taskDid: "t1", shiftTimeInPht: null,
    timedHours: null, openTimerCount: 0, hasTimerHistory: false,
    varianceHours: null, coveragePct: null,
    ...p,
  };
}

test("sanitizeBrowseSort whitelists keys and defaults direction to desc", () => {
  expect(sanitizeBrowseSort("total_hours", "asc")).toEqual({ key: "total_hours", dir: "asc" });
  expect(sanitizeBrowseSort("total_hours", "junk")).toEqual({ key: "total_hours", dir: "desc" });
  expect(sanitizeBrowseSort("task_did", "asc")).toBeUndefined(); // not a sortable column
  expect(sanitizeBrowseSort("emp_id; drop table", "asc")).toBeUndefined();
  expect(sanitizeBrowseSort(undefined, "asc")).toBeUndefined();
});

test("every sortable key has a first-click direction", () => {
  for (const key of BROWSE_SORT_KEYS) {
    expect(["asc", "desc"]).toContain(BROWSE_DEFAULT_DIR[key]);
    expect(sanitizeBrowseSort(key, BROWSE_DEFAULT_DIR[key])).toEqual({ key, dir: BROWSE_DEFAULT_DIR[key] });
  }
});

test("comparator default ordering: work_date desc, task_did asc tie-breaker", () => {
  const rows = [
    row({ workDate: "2026-07-09", taskDid: "a" }),
    row({ workDate: "2026-07-10", taskDid: "b" }),
    row({ workDate: "2026-07-10", taskDid: "a" }),
  ];
  const sorted = [...rows].sort((a, b) => compareBrowseRows(a, b));
  expect(sorted.map((r) => `${r.workDate}/${r.taskDid}`)).toEqual([
    "2026-07-10/a",
    "2026-07-10/b",
    "2026-07-09/a",
  ]);
});

test("comparator: active column orders first, nulls last in both directions", () => {
  const rows = [
    row({ taskDid: "a", totalHours: 4 }),
    row({ taskDid: "b", totalHours: null }),
    row({ taskDid: "c", totalHours: 9 }),
  ];
  const desc = [...rows].sort((a, b) => compareBrowseRows(a, b, { key: "total_hours", dir: "desc" }));
  expect(desc.map((r) => r.taskDid)).toEqual(["c", "a", "b"]);
  const asc = [...rows].sort((a, b) => compareBrowseRows(a, b, { key: "total_hours", dir: "asc" }));
  expect(asc.map((r) => r.taskDid)).toEqual(["a", "c", "b"]);
});

test("text columns read A-to-Z first; dates and measures biggest-first", () => {
  expect(BROWSE_DEFAULT_DIR.employee_name).toBe("asc");
  expect(BROWSE_DEFAULT_DIR.carrier_group).toBe("asc");
  expect(BROWSE_DEFAULT_DIR.work_date).toBe("desc");
  expect(BROWSE_DEFAULT_DIR.total_hours).toBe("desc");
});

test("variance_hours sorts biggest gap first, rows without a variance last", () => {
  const rows = [
    row({ taskDid: "none", varianceHours: null, coveragePct: null }),
    row({ taskDid: "small", varianceHours: 0.5, coveragePct: 94 }),
    row({ taskDid: "big", varianceHours: 3.2, coveragePct: 60 }),
    row({ taskDid: "over", varianceHours: -1.0, coveragePct: 112 }),
  ];
  expect(BROWSE_DEFAULT_DIR.variance_hours).toBe("desc");
  expect(sanitizeBrowseSort("variance_hours", "asc")).toEqual({ key: "variance_hours", dir: "asc" });
  const desc = [...rows].sort((a, b) => compareBrowseRows(a, b, { key: "variance_hours", dir: "desc" })).map((r) => r.taskDid);
  expect(desc).toEqual(["big", "small", "over", "none"]);
  const asc = [...rows].sort((a, b) => compareBrowseRows(a, b, { key: "variance_hours", dir: "asc" })).map((r) => r.taskDid);
  expect(asc).toEqual(["over", "small", "big", "none"]);
});
