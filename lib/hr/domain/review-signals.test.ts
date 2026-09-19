import { test, expect } from "@playwright/test";
import { varianceTier, varianceLabel, formatLagHours, hoursCell, statedHoursNetOfBreak } from "./review-signals";

test("statedHoursNetOfBreak: 1h break on every report, floored at 0", () => {
  expect(statedHoursNetOfBreak(8)).toBe(7);      // >=5: 8 - 1
  expect(statedHoursNetOfBreak(5)).toBe(4);      // boundary, still - 1
  expect(statedHoursNetOfBreak(3)).toBe(2);      // [1,5) now deducts (was unchanged before)
  expect(statedHoursNetOfBreak(1)).toBe(0);      // exactly 1h -> 0
  expect(statedHoursNetOfBreak(0.5)).toBe(0);    // floored at 0, never negative
  expect(statedHoursNetOfBreak(0)).toBe(0);      // empty report stays 0
  expect(statedHoursNetOfBreak(null)).toBeNull();
});

test("variance tier: single 15%+ untimed alarm (coverage <= 85 = red), no amber", () => {
  expect(varianceTier(5.9, 41)).toBe("red");     // 59% untimed
  expect(varianceTier(3.1, 67)).toBe("red");     // 33% untimed
  expect(varianceTier(1.9, 85)).toBe("red");     // exactly 15% untimed -> red (boundary)
  expect(varianceTier(0.5, 86)).toBe("ok");      // 14% untimed -> normal (just under the line)
  expect(varianceTier(2.5, 86)).toBe("ok");      // big gap but only 14% untimed -> normal (pct, not gap)
  expect(varianceTier(0.3, 97)).toBe("ok");
  expect(varianceTier(-3.2, 136)).toBe("under"); // timed exceeds stated
  expect(varianceTier(null, null)).toBe("none");
});

test("variance label pairs gap with the untimed share (100 − coverage)", () => {
  expect(varianceLabel(3.1, 67)).toBe("+3.1h · 33%");
  expect(varianceLabel(-3.2, 136)).toBe("−3.2h · −36%"); // timers exceeded stated
  expect(varianceLabel(0.3, 100)).toBe("+0.3h · 0%");
  expect(varianceLabel(null, null)).toBeNull();
});

test("lag formatting", () => {
  expect(formatLagHours(48.7)).toBe("48.7h");
  expect(formatLagHours(null)).toBe("");
});

test("hours cell states", () => {
  expect(hoursCell(9.2, 0, true)).toEqual({ kind: "value", timed: 9.2 });
  expect(hoursCell(8.0, 1, true)).toEqual({ kind: "open", timedFloor: 8.0 });
  expect(hoursCell(null, 0, false)).toEqual({ kind: "not_tracked" });
  expect(hoursCell(null, 0, true)).toEqual({ kind: "no_entries" });
});
