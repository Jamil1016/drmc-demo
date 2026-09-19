import { test, expect } from "@playwright/test";
import { buildBrowseColumns } from "./browse-columns";
import { VARIANCE_TOOLTIP } from "./review-columns";

test("DR Approval carries the Variance column right after Timer hrs, sortable, with the review-lead tooltip", () => {
  const labels = buildBrowseColumns([], []).map((c) => c.label);
  expect(labels.indexOf("Variance")).toBe(labels.indexOf("Timer hrs") + 1);
  const variance = buildBrowseColumns([], []).find((c) => c.label === "Variance")!;
  expect(variance.sortKey).toBe("variance_hours");
  expect(variance.tip).toBe(VARIANCE_TOOLTIP);
  expect(variance.filters).toBeUndefined();
});

