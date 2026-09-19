import { test, expect } from "@playwright/test";
import { approveTaskInPmApi, fetchTaskStatus, PmApiHttpError, type PmApiHttpLite } from "./approve";

const session = { idToken: "tok", user: "user-1" };

/** Fake http: patchJson behavior + optional single-task GET payload. */
function fakeHttp(opts: {
  patch?: () => Promise<unknown>;
  get?: () => Promise<unknown>;
}): PmApiHttpLite & { getCalls: string[] } {
  const wrapper = {
    getCalls: [] as string[],
    async patchJson(_url: string, _idToken: string, _body: unknown) {
      return (opts.patch ?? (async () => ({})))();
    },
    async getJson(url: string) {
      wrapper.getCalls.push(url);
      return (opts.get ?? (async () => ({})))();
    },
  };
  return wrapper;
}

test("approveTaskInPmApi PATCHes status=approved and reports ok", async () => {
  let calledUrl = "";
  let calledBody: unknown;
  const http: PmApiHttpLite = {
    async patchJson(url, _idToken, body) { calledUrl = url; calledBody = body; return {}; },
    async getJson() { return {}; },
  };
  const r = await approveTaskInPmApi(http, session, "-TASK123");
  expect(r.ok).toBe(true);
  expect(calledUrl).toContain("/tasks/-TASK123/status");
  expect(calledBody).toEqual({ status: "approved" });
});

test("approveTaskInPmApi maps a 403 to a permission message when the task is NOT already approved", async () => {
  const http = fakeHttp({
    patch: async () => { throw new PmApiHttpError(403, "denied"); },
    get: async () => ({ item: { status: "submitted" } }),
  });
  const r = await approveTaskInPmApi(http, session, "-TASK123");
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.httpStatus).toBe(403);
    expect(r.reason).toMatch(/can't perform this action|permission/i);
  }
  expect(http.getCalls.length).toBe(1); // it DID verify before failing
});

test("approveTaskInPmApi maps non-403 errors to a generic PM API error message", async () => {
  const http = fakeHttp({
    patch: async () => { throw new PmApiHttpError(500, "boom"); },
  });
  const r = await approveTaskInPmApi(http, session, "-TASK123");
  expect(r.ok).toBe(false);
  if (!r.ok) {
    expect(r.httpStatus).toBe(500);
    expect(r.reason).toMatch(/PM API error/i);
    expect(r.reason).not.toMatch(/can't perform this action|permission/i);
  }
});

// the PM API answers "approve an already-approved task" with a 403 whose body is
// "Provided status is the current status". The verification read must convert
// that into a success so approvers don't see a fake permission error.
test("approveTaskInPmApi converts a 403 on an already-approved task into ok + alreadyApproved", async () => {
  const http = fakeHttp({
    patch: async () => { throw new PmApiHttpError(403, '{"message":"Provided status is the current status"}'); },
    get: async () => ({ item: { status: "approved" } }),
  });
  const r = await approveTaskInPmApi(http, session, "-TASK123");
  expect(r.ok).toBe(true);
  if (r.ok) expect(r.alreadyApproved).toBe(true);
  expect(http.getCalls[0]).toContain("/tasks/-TASK123");
});

test("approveTaskInPmApi does NOT verify on transient failures (they will be retried)", async () => {
  for (const status of [500, 503, 408, 429]) {
    const http = fakeHttp({ patch: async () => { throw new PmApiHttpError(status, "flaky"); } });
    const r = await approveTaskInPmApi(http, session, "-TASK123");
    expect(r.ok).toBe(false);
    expect(http.getCalls.length).toBe(0);
  }
});

test("approveTaskInPmApi does NOT verify on 401 (caller refreshes the session and retries)", async () => {
  const http = fakeHttp({ patch: async () => { throw new PmApiHttpError(401, "expired"); } });
  const r = await approveTaskInPmApi(http, session, "-TASK123");
  expect(r.ok).toBe(false);
  expect(http.getCalls.length).toBe(0);
});

test("approveTaskInPmApi keeps the original failure when the verification read itself fails", async () => {
  const http = fakeHttp({
    patch: async () => { throw new PmApiHttpError(403, "denied"); },
    get: async () => { throw new PmApiHttpError(500, "boom"); },
  });
  const r = await approveTaskInPmApi(http, session, "-TASK123");
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.httpStatus).toBe(403);
});

test("fetchTaskStatus returns item.status and null on malformed bodies or errors", async () => {
  expect(await fetchTaskStatus(fakeHttp({ get: async () => ({ item: { status: "approved" } }) }), session, "-T1")).toBe("approved");
  expect(await fetchTaskStatus(fakeHttp({ get: async () => ({}) }), session, "-T1")).toBeNull();
  expect(await fetchTaskStatus(fakeHttp({ get: async () => { throw new PmApiHttpError(404, "gone"); } }), session, "-T1")).toBeNull();
});
