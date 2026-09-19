import { test, expect } from "@playwright/test";
import { summarizeApproveResults } from "./approve-audit";

test("counts approved and failed results", () => {
  expect(summarizeApproveResults([{ ok: true }, { ok: false }, { ok: true }])).toEqual({ count: 2, failed: 1 });
});

test("handles an empty result set", () => {
  expect(summarizeApproveResults([])).toEqual({ count: 0, failed: 0 });
});
