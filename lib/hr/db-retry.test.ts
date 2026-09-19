import { test, expect } from "@playwright/test";
import { isTransientDbError, withDbRetry } from "./db-retry";

test("classifies statement timeouts and connection drops as transient", () => {
  expect(isTransientDbError("canceling statement due to statement timeout")).toBe(true);
  expect(isTransientDbError("statement timeout")).toBe(true);
  expect(isTransientDbError("TypeError: fetch failed")).toBe(true);
  expect(isTransientDbError("connection to server was lost (57014)")).toBe(true);
  expect(isTransientDbError("PGRST002: could not query the database for the schema cache")).toBe(true);
});

test("does not classify ordinary query errors as transient", () => {
  expect(isTransientDbError('column "nope" does not exist')).toBe(false);
  expect(isTransientDbError("permission denied for view v_daily_report_approvals")).toBe(false);
  expect(isTransientDbError("")).toBe(false);
  expect(isTransientDbError(undefined)).toBe(false);
});

test("retries once on a transient failure and returns the second result", async () => {
  let calls = 0;
  const result = await withDbRetry(async () => {
    calls++;
    if (calls === 1) throw new Error("canceling statement due to statement timeout");
    return "ok";
  }, 5);
  expect(result).toBe("ok");
  expect(calls).toBe(2);
});

test("does not retry non-transient failures", async () => {
  let calls = 0;
  await expect(
    withDbRetry(async () => {
      calls++;
      throw new Error('relation "nope" does not exist');
    }, 5),
  ).rejects.toThrow(/does not exist/);
  expect(calls).toBe(1);
});

test("gives up after the single retry and rethrows the transient error", async () => {
  let calls = 0;
  await expect(
    withDbRetry(async () => {
      calls++;
      throw new Error("statement timeout");
    }, 5),
  ).rejects.toThrow(/statement timeout/);
  expect(calls).toBe(2);
});
