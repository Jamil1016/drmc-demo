import { test, expect } from "@playwright/test";
import { formatApprovalLatency } from "./approval-latency";

test("same-day approval shows hours, not a day", () => {
  expect(formatApprovalLatency("2026-06-25 09:00:00", "2026-06-25 12:00:00", 0)).toBe("0d 3h");
});

test("cross-midnight under 24h is 0d, not the calendar-day 1", () => {
  // The view's day-diff would say 1 here; elapsed is 3 hours.
  expect(formatApprovalLatency("2026-06-25 23:00:00", "2026-06-26 02:00:00", 1)).toBe("0d 3h");
});

test("multi-day spans split into days and remainder hours", () => {
  expect(formatApprovalLatency("2026-06-20 08:00:00", "2026-06-21 10:30:00", 1)).toBe("1d 2h");
});

test("DST spring-forward hour is not double counted", () => {
  // ET skips 2 AM on 2026-03-08: 11 PM -> 3 AM wall clock is 3 real hours.
  expect(formatApprovalLatency("2026-03-07 23:00:00", "2026-03-08 03:00:00", 1)).toBe("0d 3h");
});

test("falls back to the day count when a timestamp is missing or out of order", () => {
  expect(formatApprovalLatency(null, "2026-06-25 12:00:00", 2)).toBe("2d");
  expect(formatApprovalLatency("2026-06-25 12:00:00", "2026-06-25 09:00:00", 0)).toBe("0d");
});

test("null when nothing is known", () => {
  expect(formatApprovalLatency(null, null, null)).toBeNull();
});
