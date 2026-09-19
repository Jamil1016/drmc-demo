import { test, expect } from "@playwright/test";
import { classifyAuthProbe, decideFromProbe } from "./live-refresh-policy";

test("healthy probe refreshes and clears stale", () => {
  expect(decideFromProbe(200)).toEqual({ refresh: true, stale: false });
});

test("auth failures still refresh so the signed-out redirect can happen", () => {
  // A dead session must not silently freeze the page: refreshing routes the
  // user to /signin via the layout guard. The badge must not show stale.
  expect(decideFromProbe(401)).toEqual({ refresh: true, stale: false });
  expect(decideFromProbe(403)).toEqual({ refresh: true, stale: false });
});

test("data-service failures skip the refresh and mark the badge stale", () => {
  expect(decideFromProbe(503)).toEqual({ refresh: false, stale: true });
  expect(decideFromProbe(500)).toEqual({ refresh: false, stale: true });
  expect(decideFromProbe(504)).toEqual({ refresh: false, stale: true });
});

test("network errors and timeouts skip the refresh and mark the badge stale", () => {
  expect(decideFromProbe("network-error")).toEqual({ refresh: false, stale: true });
});

test("unexpected statuses fail safe: keep the page, mark stale", () => {
  // e.g. a proxy 429 or an HTML error page; never replace a working page.
  expect(decideFromProbe(429)).toEqual({ refresh: false, stale: true });
  expect(decideFromProbe(302)).toEqual({ refresh: false, stale: true });
});

test("a live auth user probes ok", () => {
  expect(classifyAuthProbe({ id: "abc" }, null)).toBe("ok");
});

test("no user and no error means genuinely signed out", () => {
  expect(classifyAuthProbe(null, null)).toBe("signed_out");
});

test("missing/expired sessions classify as signed out (refresh may redirect)", () => {
  expect(classifyAuthProbe(null, { name: "AuthSessionMissingError" })).toBe("signed_out");
  expect(classifyAuthProbe(null, { name: "AuthApiError", status: 401 })).toBe("signed_out");
  expect(classifyAuthProbe(null, { name: "AuthApiError", status: 400 })).toBe("signed_out");
  expect(classifyAuthProbe(null, { name: "AuthApiError", status: 403 })).toBe("signed_out");
});

test("auth-service outages classify as unavailable, NOT signed out", () => {
  // A GoTrue blip must never yank every open tab to /signin: 5xx, network
  // failures, and unknown errors all hold the page instead.
  expect(classifyAuthProbe(null, { name: "AuthRetryableFetchError", status: 0 })).toBe("unavailable");
  expect(classifyAuthProbe(null, { name: "AuthApiError", status: 502 })).toBe("unavailable");
  expect(classifyAuthProbe(null, { name: "AuthApiError", status: 500 })).toBe("unavailable");
  expect(classifyAuthProbe(null, { name: "AuthUnknownError" })).toBe("unavailable");
});
