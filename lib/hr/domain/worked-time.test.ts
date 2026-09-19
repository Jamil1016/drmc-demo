import { test, expect } from "@playwright/test";
import { unionMinutes } from "./worked-time";

function iv(start: string, end: string | null, durationMin: number | null = null) {
  return { start, end, durationMin };
}

test("overlapping timers merge instead of stacking", () => {
  // An admin timer 20:01–01:39 with a short task (21:32–21:44) and a review (23:00–02:34)
  // running inside/past it: union = 20:01 -> 02:34 = 6h 33m, not the 9h24m sum.
  const m = unionMinutes([
    iv("2026-06-30T20:01:00+08:00", "2026-07-01T01:39:00+08:00"),
    iv("2026-06-30T21:32:00+08:00", "2026-06-30T21:44:00+08:00"),
    iv("2026-06-30T23:00:00+08:00", "2026-07-01T02:34:00+08:00"),
  ]);
  expect(m).toBe(6 * 60 + 33);
});

test("a gap starts a new block and is not counted", () => {
  const m = unionMinutes([
    iv("2026-06-30T08:00:00Z", "2026-06-30T09:00:00Z"),
    iv("2026-06-30T10:00:00Z", "2026-06-30T10:30:00Z"),
  ]);
  expect(m).toBe(90);
});

test("back-to-back entries chain into one block without double counting", () => {
  const m = unionMinutes([
    iv("2026-06-30T08:00:00Z", "2026-06-30T09:00:00Z"),
    iv("2026-06-30T09:00:00Z", "2026-06-30T09:45:00Z"),
  ]);
  expect(m).toBe(105);
});

test("an end-less entry falls back to its duration; junk entries are skipped", () => {
  const m = unionMinutes([
    iv("2026-06-30T08:00:00Z", null, 30),
    iv("2026-06-30T09:00:00Z", "2026-06-30T08:00:00Z"), // end before start
    { start: null, end: "2026-06-30T09:00:00Z", durationMin: 60 },
  ]);
  expect(m).toBe(30);
});

test("empty input is 0", () => {
  expect(unionMinutes([])).toBe(0);
});
