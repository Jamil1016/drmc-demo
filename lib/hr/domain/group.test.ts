import { test, expect } from "@playwright/test";
import { colorForLabel, groupBy, GROUP_COLOR_SLOTS } from "./group";

test("colorForLabel is deterministic and within range", () => {
  const a = colorForLabel("Delivery");
  expect(a).toBe(colorForLabel("Delivery"));
  expect(a).toBeGreaterThanOrEqual(0);
  expect(a).toBeLessThan(GROUP_COLOR_SLOTS);
});

test("colorForLabel separates distinct common labels", () => {
  // Not a guarantee for all inputs, but these real group names should differ.
  expect(colorForLabel("Accounting")).not.toBe(colorForLabel("Delivery"));
});

test("groupBy buckets, sorts by label, and trails the fallback group", () => {
  const rows = [
    { name: "a", div: "Delivery" },
    { name: "b", div: "Accounting" },
    { name: "c", div: null },
    { name: "d", div: "Delivery" },
    { name: "e", div: "  " },
  ];
  const groups = groupBy(rows, (r) => r.div);
  expect(groups.map((g) => g.label)).toEqual(["Accounting", "Delivery", "Unassigned"]);
  expect(groups[1].rows.map((r) => r.name)).toEqual(["a", "d"]);
  expect(groups[2].rows.map((r) => r.name)).toEqual(["c", "e"]);
});
