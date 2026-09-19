import { test, expect } from "playwright/test";
import { getAttachments, ATTACHMENTS_CLIENT_TTL_MS, _resetAttachmentsClientCache, type AttachmentsResult } from "./attachments-client";

const result = (tag: string): AttachmentsResult => ({ files: [], source: tag });

test.beforeEach(() => _resetAttachmentsClientCache());

test("a hover warm-up and a later open share ONE fetch per task", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return result("a"); };
  const p1 = getAttachments("T1", fetcher, 1000);
  const p2 = getAttachments("T1", fetcher, 1500);
  expect(await p1).toEqual(await p2);
  expect(calls).toBe(1);
  await getAttachments("T2", fetcher, 1600);
  expect(calls).toBe(2);
});

test("an entry older than the TTL is refetched (its presigned links would be dead)", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return result(`v${calls}`); };
  expect((await getAttachments("T1", fetcher, 0)).source).toBe("v1");
  expect((await getAttachments("T1", fetcher, ATTACHMENTS_CLIENT_TTL_MS)).source).toBe("v1");
  expect((await getAttachments("T1", fetcher, ATTACHMENTS_CLIENT_TTL_MS + 1)).source).toBe("v2");
  expect(calls).toBe(2);
});

test("a failed fetch is not cached: the next call retries", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; if (calls === 1) throw new Error("boom"); return result("ok"); };
  await expect(getAttachments("T1", fetcher, 0)).rejects.toThrow("boom");
  expect((await getAttachments("T1", fetcher, 10)).source).toBe("ok");
});
