import { test, expect } from "@playwright/test";
import { setParam, setParams, isoToDate, dateToIso, formatDateButton } from "./filter-url";

test("setParam adds, replaces, and clears keys", () => {
  const base = new URLSearchParams("search=sam&carrierGroup=GroupA");
  expect(setParam(base, "search", "jane").toString()).toBe("search=jane&carrierGroup=GroupA");
  expect(setParam(base, "search", "").toString()).toBe("carrierGroup=GroupA");
  expect(setParam(base, "search", undefined).toString()).toBe("carrierGroup=GroupA");
  expect(setParam(base, "status", "approved").toString()).toBe("search=sam&carrierGroup=GroupA&status=approved");
  // original is untouched (pure)
  expect(base.toString()).toBe("search=sam&carrierGroup=GroupA");
});

test("setParams applies several updates and removes empties", () => {
  const base = new URLSearchParams("search=sam&dateFrom=2026-06-01&dateTo=2026-06-25");
  const next = setParams(base, { dateFrom: "", dateTo: "", carrierGroup: "Group B" });
  expect(next.get("dateFrom")).toBeNull();
  expect(next.get("dateTo")).toBeNull();
  expect(next.get("carrierGroup")).toBe("Group B");
  expect(next.get("search")).toBe("sam");
});

test("isoToDate parses local date components without UTC drift", () => {
  const d = isoToDate("2026-06-25")!;
  expect(d.getFullYear()).toBe(2026);
  expect(d.getMonth()).toBe(5); // June (0-indexed)
  expect(d.getDate()).toBe(25);
  expect(isoToDate(undefined)).toBeUndefined();
  expect(isoToDate("nonsense")).toBeUndefined();
});

test("dateToIso round-trips isoToDate", () => {
  expect(dateToIso(isoToDate("2025-12-28")!)).toBe("2025-12-28");
});

test("formatDateButton renders none / single / same-year range / cross-year range", () => {
  expect(formatDateButton(undefined, undefined)).toBe("All dates");
  expect(formatDateButton("2026-06-25", "2026-06-25")).toBe("Jun 25, 2026");
  expect(formatDateButton("2026-06-25", undefined)).toBe("Jun 25, 2026");
  expect(formatDateButton("2026-06-01", "2026-06-25")).toBe("Jun 1 – Jun 25, 2026");
  expect(formatDateButton("2025-12-28", "2026-01-03")).toBe("Dec 28, 2025 – Jan 3, 2026");
});
