import { test, expect } from "@playwright/test";
import { getPmApiSession, invalidatePmApiSession, _resetPmApiSessionCache, SESSION_SAFETY_MS } from "./session-cache";
import type { PmApiSession } from "./login";

function makeJwt(payload: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}
// A session whose token expires `secsFromEpoch` seconds after the epoch.
const sessionExpiringAt = (secs: number): PmApiSession => ({ idToken: makeJwt({ sub: "user-u", exp: secs }), user: "user-u" });

test.beforeEach(() => _resetPmApiSessionCache());

test("logs in once, then serves the cached session on the next call", async () => {
  let logins = 0;
  const login = async () => { logins++; return sessionExpiringAt(10_000); };
  const now = 1_000_000; // ms, well before token exp (10_000_000 ms)
  const a = await getPmApiSession("lead@example.com", login, now);
  const b = await getPmApiSession("lead@example.com", login, now + 3_000);
  expect(logins).toBe(1);
  expect(b.idToken).toBe(a.idToken);
});

test("re-logs in when the cached token is within the safety margin of expiry", async () => {
  let logins = 0;
  const login = async () => { logins++; return sessionExpiringAt(10_000); };
  const expMs = 10_000 * 1000;
  await getPmApiSession("lead@example.com", login, 1_000_000);
  // now sits inside the safety window before expiry -> must refresh
  await getPmApiSession("lead@example.com", login, expMs - SESSION_SAFETY_MS + 1);
  expect(logins).toBe(2);
});

test("caches separately per user", async () => {
  let logins = 0;
  const login = async () => { logins++; return sessionExpiringAt(10_000); };
  await getPmApiSession("a@example.com", login, 1_000_000);
  await getPmApiSession("b@example.com", login, 1_000_000);
  expect(logins).toBe(2);
});

test("invalidate forces a fresh login", async () => {
  let logins = 0;
  const login = async () => { logins++; return sessionExpiringAt(10_000); };
  await getPmApiSession("lead@example.com", login, 1_000_000);
  invalidatePmApiSession("lead@example.com");
  await getPmApiSession("lead@example.com", login, 1_000_000);
  expect(logins).toBe(2);
});

test("a token with no exp claim is still cached for the safety window", async () => {
  let logins = 0;
  const login = async () => { logins++; return { idToken: makeJwt({ sub: "user-u" }), user: "user-u" }; };
  const now = 1_000_000;
  await getPmApiSession("lead@example.com", login, now);
  await getPmApiSession("lead@example.com", login, now + 1_000); // within window -> cached
  expect(logins).toBe(1);
});
