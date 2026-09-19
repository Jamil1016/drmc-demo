import { test, expect } from "@playwright/test";
import { monthOf, monthLabel } from "./export-month";

test("monthOf slices the work date", () => {
  expect(monthOf("2026-07-15")).toBe("2026-07");
  expect(monthOf("2025-12-01")).toBe("2025-12");
});

test("monthLabel is the zero-padded '08. August' form", () => {
  expect(monthLabel("2026-08-03")).toBe("08. August");
  expect(monthLabel("2026-01-31")).toBe("01. January");
  expect(monthLabel("not-a-date")).toBe("");
  expect(monthLabel("2026-13-01")).toBe("");
});
