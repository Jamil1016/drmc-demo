import { test, expect } from "@playwright/test";
import { authBypassEnabled, bypassRefusedReason, isDemoMode, DEMO_BANNER_TEXT } from "./mode";
import { ALLOWED_DEMO_MUTATIONS, isAllowedDemoMutation } from "./mutations";
import { planOutage, sanitizeOutageAfter, DEMO_OUTAGE_FAILED_ITEMS } from "./outage";
import { decideBatchCreation, MAX_BATCHES_PER_WINDOW } from "./rate-limit";
import { emailMode } from "./email";
import { createSimulatedPmApi, simulatedPmApiLogin } from "./pm-api";
import { approveTaskInPmApi, PmApiHttpError } from "@/lib/pm-api/approve";
import { approveWithRetry } from "@/lib/pm-api/approve-with-retry";
import { decodeExpMs } from "@/lib/pm-api/jwt";

test("isDemoMode is an explicit switch", () => {
  expect(isDemoMode({ DEMO_MODE: "true" })).toBe(true);
  expect(isDemoMode({ DEMO_MODE: " TRUE " })).toBe(true);
  expect(isDemoMode({ DEMO_MODE: "1" })).toBe(false);
  expect(isDemoMode({})).toBe(false);
});

test("the local auth bypass is refused in production and whenever a VERCEL variable is set", () => {
  const on = { DEMO_MODE: "true", DEMO_AUTH_BYPASS_FOR_LOCAL_TESTS: "true" };
  expect(authBypassEnabled({ ...on, NODE_ENV: "development" })).toBe(true);
  expect(authBypassEnabled({ ...on, NODE_ENV: "production" })).toBe(false);
  expect(authBypassEnabled({ ...on, VERCEL: "1" })).toBe(false);
  expect(authBypassEnabled({ ...on, VERCEL_ENV: "preview" })).toBe(false);
  expect(authBypassEnabled({ ...on, VERCEL_URL: "x.example.com" })).toBe(false);
  expect(authBypassEnabled({ ...on, VERCEL_REGION: "bom1" })).toBe(false);
  expect(authBypassEnabled({ DEMO_AUTH_BYPASS_FOR_LOCAL_TESTS: "true" })).toBe(false); // needs DEMO_MODE
  expect(authBypassEnabled({ DEMO_MODE: "true" })).toBe(false);
  expect(bypassRefusedReason({ ...on, NODE_ENV: "production" })).toMatch(/production/);
  expect(bypassRefusedReason({ ...on, VERCEL: "1" })).toMatch(/Vercel/);
  expect(bypassRefusedReason({ ...on })).toBeNull();
});

test("the banner says what the demo is", () => {
  expect(DEMO_BANNER_TEXT).toBe(
    "Demo data. Every person, team, client and number here is invented. Nothing is sent and nothing reaches a real system. Data resets nightly.",
  );
});

test("the mutation allowlist is exactly approve / bulk approve / resume+retry", () => {
  expect([...ALLOWED_DEMO_MUTATIONS].sort()).toEqual(
    ["approval.approve", "approval.batch.process", "approval.batch.retry", "approval.batch.start"],
  );
  for (const refused of ["preview.start", "employee.update", "user.invite", "settings.save", "", "approval.approve "]) {
    expect(isAllowedDemoMutation(refused)).toBe(false);
  }
});

test("emailMode is off whatever the environment says", () => {
  expect(emailMode({})).toBe("off");
  expect(emailMode({ EMAIL_MODE: "live", NODE_ENV: "production" })).toBe("off");
});

test("batch creation is limited per window", () => {
  expect(decideBatchCreation(0).ok).toBe(true);
  expect(decideBatchCreation(MAX_BATCHES_PER_WINDOW - 1).ok).toBe(true);
  const refused = decideBatchCreation(MAX_BATCHES_PER_WINDOW);
  expect(refused.ok).toBe(false);
});

test("sanitizeOutageAfter only lets a clamped positive integer through", () => {
  expect(sanitizeOutageAfter(25)).toBe(25);
  expect(sanitizeOutageAfter(25.9)).toBe(25);
  expect(sanitizeOutageAfter(100000)).toBe(200);
  for (const bad of [0, -3, NaN, "25", null, undefined, {}]) expect(sanitizeOutageAfter(bad)).toBeNull();
});

test("planOutage: run to N, drop the connection once, fail a few, then recover", () => {
  expect(planOutage({ outageAfter: null, outageStage: 0, processed: 0 }, 25)).toEqual({ kind: "none" });
  expect(planOutage({ outageAfter: 40, outageStage: 0, processed: 0 }, 25)).toEqual({ kind: "none" });
  expect(planOutage({ outageAfter: 40, outageStage: 0, processed: 25 }, 25)).toEqual({ kind: "limit", claimLimit: 15 });
  expect(planOutage({ outageAfter: 40, outageStage: 0, processed: 40 }, 25)).toEqual({ kind: "drop" });
  expect(planOutage({ outageAfter: 40, outageStage: 1, processed: 40 }, 25)).toEqual({ kind: "fail", items: DEMO_OUTAGE_FAILED_ITEMS });
  expect(planOutage({ outageAfter: 40, outageStage: 2, processed: 45 }, 25)).toEqual({ kind: "none" });
});

const noLatency = async () => {};
const session = { idToken: "t", user: "u" };

test("simulated PM API: approve succeeds once, a second approve is an idempotent already-approved", async () => {
  const state = new Map([["T1", "submitted"]]);
  const http = createSimulatedPmApi({ latency: noLatency, statusOf: async (d) => state.get(d) ?? null });
  expect(await approveTaskInPmApi(http, session, "T1")).toEqual({ ok: true });
  state.set("T1", "approved"); // what the approval log overlay does in the real flow
  expect(await approveTaskInPmApi(http, session, "T1")).toEqual({ ok: true, alreadyApproved: true });
});

test("simulated PM API: unknown tasks 404, non-submitted tasks 409, no token 401", async () => {
  const http = createSimulatedPmApi({ latency: noLatency, statusOf: async (d) => (d === "R" ? "rejected" : null) });
  expect(await approveTaskInPmApi(http, session, "nope")).toMatchObject({ ok: false, httpStatus: 404 });
  expect(await approveTaskInPmApi(http, session, "R")).toMatchObject({ ok: false, httpStatus: 409 });
  await expect(http.patchJson("/tasks/R/status", "", { status: "approved" })).rejects.toBeInstanceOf(PmApiHttpError);
});

test("simulated outage: the first N distinct tasks fail every retry with a 503, later tasks succeed", async () => {
  const http = createSimulatedPmApi({ latency: noLatency, outageItems: 2, statusOf: async () => "submitted" });
  const provider = { get: () => session, refresh: async () => session };
  const sleep = async () => {};
  const a = await approveWithRetry(http, provider, "A", sleep);
  const b = await approveWithRetry(http, provider, "B", sleep);
  const c = await approveWithRetry(http, provider, "C", sleep);
  expect(a).toMatchObject({ ok: false, httpStatus: 503, attempts: 3 });
  expect(b).toMatchObject({ ok: false, httpStatus: 503, attempts: 3 });
  expect(c).toMatchObject({ ok: true, attempts: 1 });
  expect(http.outageHits()).toBe(2);
});

test("simulated login returns an in-memory token the session cache can read an expiry from", async () => {
  const s = await simulatedPmApiLogin("demo@example.com");
  expect(s.user).toBe("demo@example.com");
  const exp = decodeExpMs(s.idToken);
  expect(exp).not.toBeNull();
  expect(exp! - Date.now()).toBeGreaterThan(20 * 60 * 1000);
});
