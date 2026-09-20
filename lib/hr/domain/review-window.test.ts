import { test, expect } from "@playwright/test";
import { ALL_TIME_FROM, defaultReviewRange, previousRange, resolveDashboardRange } from "./review-window";

const NOW = new Date("2026-03-10T20:00:00Z"); // already 2026-03-11 in Manila

test("defaultReviewRange is the last 30 Manila days, ending today in Manila", () => {
  expect(defaultReviewRange(NOW)).toEqual({ from: "2026-02-10", to: "2026-03-11" });
});

test("no params falls back to the 30-day default", () => {
  expect(resolveDashboardRange({}, NOW)).toEqual({
    isAll: false, queryFrom: "2026-02-10", queryTo: "2026-03-11", displayFrom: "2026-02-10", displayTo: "2026-03-11",
  });
});

test("an explicit range wins, and a malformed bound falls back to the default", () => {
  const r = resolveDashboardRange({ dateFrom: "2026-01-05", dateTo: "2026-01-09" }, NOW);
  expect([r.queryFrom, r.queryTo, r.isAll]).toEqual(["2026-01-05", "2026-01-09", false]);
  expect(resolveDashboardRange({ dateFrom: "yesterday" }, NOW).queryFrom).toBe("2026-02-10");
});

test("range=all queries from the floor and shows blank display bounds", () => {
  expect(resolveDashboardRange({ range: "all", dateFrom: "2026-01-05" }, NOW)).toEqual({
    isAll: true, queryFrom: ALL_TIME_FROM, queryTo: "2026-03-11", displayFrom: "", displayTo: "",
  });
});

test("previousRange is the same length, ending the day before", () => {
  expect(previousRange("2026-03-02", "2026-03-08")).toEqual({ from: "2026-02-23", to: "2026-03-01" });
  expect(previousRange("2026-03-01", "2026-03-01")).toEqual({ from: "2026-02-28", to: "2026-02-28" });
});
