import { test, expect } from "@playwright/test";
import { gridTicks, isWeekend, shortDate, weekLabel, weekdayOf } from "./trend-axis";

test("weekdayOf reads the calendar date as-is", () => {
  expect(weekdayOf("2026-03-02")).toBe(1); // a Monday
  expect(weekdayOf("2026-03-08")).toBe(0); // a Sunday
});

test("isWeekend is true for Saturday and Sunday only", () => {
  expect(["2026-03-06", "2026-03-07", "2026-03-08", "2026-03-09"].map(isWeekend)).toEqual([false, true, true, false]);
});

test("gridTicks spans 0..max inclusive, and is empty when there is nothing to scale", () => {
  expect(gridTicks(100)).toEqual([0, 50, 100]);
  expect(gridTicks(90, 3)).toEqual([0, 30, 60, 90]);
  expect(gridTicks(0)).toEqual([]);
  expect(gridTicks(10, 0)).toEqual([]);
});

test("shortDate and weekLabel drop leading zeros and the year", () => {
  expect(shortDate("2026-03-02")).toBe("3/2");
  expect(shortDate("2026-11-20")).toBe("11/20");
  expect(weekLabel("2026-03-02", "2026-03-08")).toBe("3/2 - 3/8");
});
