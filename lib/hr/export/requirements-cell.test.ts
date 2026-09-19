import { test, expect } from "@playwright/test";
import { requirementsCell } from "./requirements-cell";

test("requirementsCell lists descriptions only, one per line, no hours prefix", () => {
  expect(
    requirementsCell([
      { hours: 9, description: "A lot of today went into X" } as never,
      { hours: null, description: "  Second item " } as never,
      { hours: 2, description: "" } as never,
      { hours: 1, description: null } as never,
    ]),
  ).toBe("A lot of today went into X\nSecond item");
  expect(requirementsCell([])).toBe("");
  expect(requirementsCell(undefined)).toBe("");
});
