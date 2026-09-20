import { test, expect } from "@playwright/test";
import { bucketLabel, defaultGroup, failRate, parseGroup } from "./activity-dashboard";

test("parseGroup accepts the three groupings only", () => {
  expect(parseGroup("week")).toBe("week");
  expect(parseGroup("year")).toBeUndefined();
  expect(parseGroup(undefined)).toBeUndefined();
});

test("defaultGroup scales with the inclusive range length", () => {
  expect(defaultGroup("2026-03-01", "2026-03-31")).toBe("day");
  expect(defaultGroup("2026-03-01", "2026-04-01")).toBe("week");
  expect(defaultGroup("2026-01-01", "2026-06-29")).toBe("week");
  expect(defaultGroup("2026-01-01", "2026-06-30")).toBe("month");
});

test("bucketLabel shows the year for months only", () => {
  expect(bucketLabel("2026-07-04", "day")).toBe("Jul 4");
  expect(bucketLabel("2026-07-06", "week")).toBe("Jul 6");
  expect(bucketLabel("2026-07-01", "month")).toBe("Jul 2026");
  expect(bucketLabel("not a date", "day")).toBe("not a date");
});

test("failRate is a whole percent of all attempts", () => {
  expect(failRate(0, 0)).toBe(0);
  expect(failRate(95, 5)).toBe(5);
  expect(failRate(1, 2)).toBe(67);
});
