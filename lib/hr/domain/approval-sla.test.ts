import { test, expect } from "@playwright/test";
import { bucketFor } from "./approval-sla";

test("bucketFor classifies SLA tiers at the boundaries", () => {
  expect(bucketFor(0)).toBe("on_time");
  expect(bucketFor(2)).toBe("on_time");
  expect(bucketFor(3)).toBe("amber");
  expect(bucketFor(5)).toBe("amber");
  expect(bucketFor(6)).toBe("red");
  expect(bucketFor(null)).toBe("on_time");
});
