import { test, expect } from "@playwright/test";
import { chunk, pickApprovableTaskDids, APPROVE_CHUNK } from "./bulk-approve";
import { isTransientPmApiFailure, describeFailure, failureTag } from "./bulk-approve";
import { batchProgress } from "./bulk-approve";

test("chunk splits into fixed-size groups", () => {
  expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  expect(chunk([], 2)).toEqual([]);
});

test("APPROVE_CHUNK is 25", () => {
  expect(APPROVE_CHUNK).toBe(25);
});

test("pickApprovableTaskDids keeps only submitted rows", () => {
  const rows = [
    { taskStatus: "submitted", taskDid: "-a" },
    { taskStatus: "approved", taskDid: "-b" },
    { taskStatus: "Submitted", taskDid: "-c" },
    { taskStatus: "rejected", taskDid: "-d" },
  ];
  expect(pickApprovableTaskDids(rows)).toEqual(["-a", "-c"]);
});

test("isTransientPmApiFailure: transport error (no status) is transient", () => {
  expect(isTransientPmApiFailure(undefined)).toBe(true);
});

test("isTransientPmApiFailure: 5xx / 408 / 429 are transient", () => {
  for (const s of [500, 502, 503, 504, 408, 429]) expect(isTransientPmApiFailure(s)).toBe(true);
});

test("isTransientPmApiFailure: business 4xx are terminal", () => {
  for (const s of [400, 403, 404, 409, 422]) expect(isTransientPmApiFailure(s)).toBe(false);
});

test("describeFailure: transient gives a try-again message", () => {
  expect(describeFailure(503)).toBe("The PM API is temporarily unavailable. Try again in a moment.");
  expect(describeFailure(undefined)).toBe("Couldn't reach the PM API. Try again in a moment.");
});

test("describeFailure: 403 gives a permission message", () => {
  expect(describeFailure(403)).toBe("Your PM API account can't approve this report.");
});

test("describeFailure: other terminal shows the code", () => {
  expect(describeFailure(422)).toBe("The PM API rejected this report (422).");
});

test("failureTag reflects retryability", () => {
  expect(failureTag(true)).toBe("Retried 3x");
  expect(failureTag(false)).toBe("Won't retry");
});

test("batchProgress is 0 when total is 0 and rounds otherwise", () => {
  expect(batchProgress(0, 0)).toBe(0);
  expect(batchProgress(1, 3)).toBe(33);
  expect(batchProgress(3, 3)).toBe(100);
});
