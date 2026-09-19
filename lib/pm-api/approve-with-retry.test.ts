import { test, expect } from "@playwright/test";
import { approveWithRetry, type PmApiSessionProvider } from "./approve-with-retry";
import { PmApiHttpError, type PmApiHttpLite } from "./approve";
import type { PmApiSession } from "./login";

const session: PmApiSession = { idToken: "tok", user: "user-1" };
const provider = (): PmApiSessionProvider => ({ get: () => session, refresh: async () => session });
const noSleep = async () => {};

// http that throws the queued errors in order, then succeeds. The verification
// GET reports the task as still submitted unless taskStatus says otherwise.
function httpSeq(errors: (PmApiHttpError | Error | null)[], taskStatus = "submitted"): { http: PmApiHttpLite; calls: () => number } {
  let i = 0;
  const http: PmApiHttpLite = {
    async patchJson() {
      const e = errors[i++];
      if (e) throw e;
      return {};
    },
    async getJson() { return { item: { status: taskStatus } }; },
  };
  return { http, calls: () => i };
}

test("succeeds on first try", async () => {
  const { http, calls } = httpSeq([null]);
  const r = await approveWithRetry(http, provider(), "-T1", noSleep);
  expect(r.ok).toBe(true);
  expect(r.attempts).toBe(1);
  expect(calls()).toBe(1);
});

test("retries a transient 503 then succeeds", async () => {
  const { http } = httpSeq([new PmApiHttpError(503, "down"), null]);
  const r = await approveWithRetry(http, provider(), "-T1", noSleep);
  expect(r.ok).toBe(true);
  expect(r.attempts).toBe(2);
});

test("does not retry a terminal 403", async () => {
  const { http, calls } = httpSeq([new PmApiHttpError(403, "denied")]);
  const r = await approveWithRetry(http, provider(), "-T1", noSleep);
  expect(r.ok).toBe(false);
  expect(r.httpStatus).toBe(403);
  expect(r.attempts).toBe(1);
  expect(calls()).toBe(1);
});

test("refreshes the session on 401 then succeeds", async () => {
  let refreshed = 0;
  const prov: PmApiSessionProvider = { get: () => session, refresh: async () => { refreshed++; return session; } };
  const { http } = httpSeq([new PmApiHttpError(401, "expired"), null]);
  const r = await approveWithRetry(http, prov, "-T1", noSleep);
  expect(r.ok).toBe(true);
  expect(refreshed).toBe(1);
  expect(r.attempts).toBe(2);
});

test("passes alreadyApproved through when the 403 is 'already in this status'", async () => {
  const { http, calls } = httpSeq([new PmApiHttpError(403, "Provided status is the current status")], "approved");
  const r = await approveWithRetry(http, provider(), "-T1", noSleep);
  expect(r.ok).toBe(true);
  expect(r.alreadyApproved).toBe(true);
  expect(r.attempts).toBe(1);
  expect(calls()).toBe(1);
});

test("gives up after 3 transient failures", async () => {
  const { http, calls } = httpSeq([new PmApiHttpError(503, "a"), new PmApiHttpError(503, "b"), new PmApiHttpError(503, "c")]);
  const r = await approveWithRetry(http, provider(), "-T1", noSleep);
  expect(r.ok).toBe(false);
  expect(r.httpStatus).toBe(503);
  expect(r.attempts).toBe(3);
  expect(calls()).toBe(3);
});
