import { test, expect } from "@playwright/test";
import { attachmentSummary } from "./attachment-summary";

test("returns null label when no requirements carry a file", () => {
  const r = attachmentSummary([
    { reqId: "a", description: "x", hours: 3, status: "approved", fileCount: 0 },
    { reqId: "b", description: "y", hours: 1, status: "approved", fileCount: 0 },
  ]);
  expect(r.total).toBe(0);
  expect(r.label).toBeNull();
});

test("singular label for exactly one file", () => {
  const r = attachmentSummary([
    { reqId: "a", description: "x", hours: 3, status: "approved", fileCount: 1 },
    { reqId: "b", description: "y", hours: 1, status: "approved", fileCount: 0 },
  ]);
  expect(r.total).toBe(1);
  expect(r.label).toBe("1 file");
});

test("plural label sums across requirements", () => {
  const r = attachmentSummary([
    { reqId: "a", description: "x", hours: 3, status: "approved", fileCount: 1 },
    { reqId: "b", description: "y", hours: 1, status: "approved", fileCount: 2 },
  ]);
  expect(r.total).toBe(3);
  expect(r.label).toBe("3 files");
});

test("handles empty and null input safely", () => {
  expect(attachmentSummary([]).label).toBeNull();
  expect(attachmentSummary(null).total).toBe(0);
});
