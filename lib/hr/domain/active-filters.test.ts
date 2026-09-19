import { test, expect } from "@playwright/test";
import { isFilterActive, countActiveFilters, FILTER_PARAM_KEYS } from "./active-filters";

const P = (s: string) => new URLSearchParams(s);

test("isFilterActive: single-param filter", () => {
  expect(isFilterActive(P("search=al"), { kind: "single", param: "search" })).toBe(true);
  expect(isFilterActive(P(""), { kind: "single", param: "search" })).toBe(false);
  expect(isFilterActive(P("search="), { kind: "single", param: "search" })).toBe(false);
});

test("isFilterActive: any-of (work date = from OR to OR dows)", () => {
  const spec = { kind: "anyOf", params: ["dateFrom", "dateTo", "dows"] } as const;
  expect(isFilterActive(P("dateTo=2026-06-10"), spec)).toBe(true);
  expect(isFilterActive(P("dows=1,2"), spec)).toBe(true);
  expect(isFilterActive(P("status=approved"), spec)).toBe(false);
});

test("countActiveFilters: one per set filter", () => {
  expect(countActiveFilters(P(""))).toBe(0);
  // search + division + work date (range) + stated (min) + approver = 5
  expect(countActiveFilters(P("search=al&carrierGroup=GroupA&dateFrom=2026-06-01&shMin=1&ag=QueueA"))).toBe(5);
  // a multi-value status counts as one filter
  expect(countActiveFilters(P("status=submitted,approved"))).toBe(1);
  // stated-hours range counts once whether one or both bounds are set
  expect(countActiveFilters(P("shMax=4"))).toBe(1);
  expect(countActiveFilters(P("shMin=1&shMax=4"))).toBe(1);
  // sort/dir are NOT filters
  expect(countActiveFilters(P("sort=variance_hours&dir=asc"))).toBe(0);
});

test("FILTER_PARAM_KEYS covers every filter param but not sort/dir", () => {
  for (const k of ["search", "carrierGroup", "status", "ag", "dateFrom", "dateTo", "dows", "shMin", "shMax"]) {
    expect(FILTER_PARAM_KEYS).toContain(k);
  }
  expect(FILTER_PARAM_KEYS).not.toContain("sort");
  expect(FILTER_PARAM_KEYS).not.toContain("dir");
});
