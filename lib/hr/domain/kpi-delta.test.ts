import { test, expect } from "@playwright/test";
import { deltaInfo } from "./kpi-delta";

const num = (n: number) => String(n);

test("deltaInfo is null when either period has no value", () => {
  expect(deltaInfo(null, 3, false, num)).toBeNull();
  expect(deltaInfo(3, undefined, false, num)).toBeNull();
});

test("deltaInfo reports no change as flat", () => {
  expect(deltaInfo(4, 4, true, num)).toEqual({ text: "no change", tone: "flat" });
});

test("deltaInfo colours the direction by whether higher is better", () => {
  expect(deltaInfo(95, 90, true, num)).toEqual({ text: "▲ 5", tone: "good" });
  expect(deltaInfo(90, 95, true, num)).toEqual({ text: "▼ 5", tone: "bad" });
  expect(deltaInfo(12, 8, false, num)).toEqual({ text: "▲ 4", tone: "bad" });
  expect(deltaInfo(8, 12, false, num)).toEqual({ text: "▼ 4", tone: "good" });
});
