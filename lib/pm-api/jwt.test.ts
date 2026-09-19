import { test, expect } from "@playwright/test";
import { decodeExpMs } from "./jwt";

function makeJwt(payload: object): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256" })}.${b64(payload)}.sig`;
}

test("decodeExpMs returns the exp claim converted from seconds to ms", () => {
  expect(decodeExpMs(makeJwt({ sub: "user-a", exp: 1_700_000_000 }))).toBe(1_700_000_000_000);
});

test("decodeExpMs returns null when there is no exp claim", () => {
  expect(decodeExpMs(makeJwt({ sub: "user-a" }))).toBeNull();
});

test("decodeExpMs returns null on a non-JWT instead of throwing", () => {
  expect(decodeExpMs("notajwt")).toBeNull();
});
