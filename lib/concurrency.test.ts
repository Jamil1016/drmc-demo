import { test, expect } from "@playwright/test";
import { mapWithConcurrency } from "./concurrency";

test("preserves input order regardless of completion order", async () => {
  const delays = [30, 5, 20, 1, 10];
  const out = await mapWithConcurrency(delays, 3, async (ms, i) => {
    await new Promise((r) => setTimeout(r, ms));
    return `item-${i}`;
  });
  expect(out).toEqual(["item-0", "item-1", "item-2", "item-3", "item-4"]);
});

test("never exceeds the concurrency limit", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  await mapWithConcurrency(Array.from({ length: 12 }, (_, i) => i), 4, async () => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 5));
    inFlight--;
  });
  expect(maxInFlight).toBeLessThanOrEqual(4);
  expect(maxInFlight).toBeGreaterThanOrEqual(2);
});

test("empty input resolves to empty array without calling fn", async () => {
  let called = 0;
  const out = await mapWithConcurrency([], 4, async () => { called++; });
  expect(out).toEqual([]);
  expect(called).toBe(0);
});

test("rejects when any item rejects", async () => {
  await expect(
    mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error("boom");
      return n;
    }),
  ).rejects.toThrow("boom");
});
