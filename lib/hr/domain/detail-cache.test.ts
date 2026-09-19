import { test, expect } from "@playwright/test";
import { getOrFetch } from "./detail-cache";

test("first call stores and returns the fetcher's promise", async () => {
  const cache = new Map<string, Promise<number>>();
  const v = await getOrFetch(cache, "k", async () => 42);
  expect(v).toBe(42);
  expect(cache.has("k")).toBe(true);
});

test("second call for the same key reuses the in-flight promise (fetcher runs once)", async () => {
  const cache = new Map<string, Promise<string>>();
  let calls = 0;
  let release!: (v: string) => void;
  const gate = new Promise<string>((res) => { release = res; });
  const fetcher = () => { calls++; return gate; };
  const p1 = getOrFetch(cache, "k", fetcher);
  const p2 = getOrFetch(cache, "k", fetcher);
  release("done");
  expect(await p1).toBe("done");
  expect(await p2).toBe("done");
  expect(calls).toBe(1);
});

test("different keys fetch independently", async () => {
  const cache = new Map<string, Promise<string>>();
  const a = await getOrFetch(cache, "a", async () => "A");
  const b = await getOrFetch(cache, "b", async () => "B");
  expect(a).toBe("A");
  expect(b).toBe("B");
  expect(cache.size).toBe(2);
});

test("a failed fetch clears the entry so the next call retries", async () => {
  const cache = new Map<string, Promise<string>>();
  let calls = 0;
  await expect(getOrFetch(cache, "k", async () => { calls++; throw new Error("boom"); })).rejects.toThrow("boom");
  expect(cache.has("k")).toBe(false);
  const v = await getOrFetch(cache, "k", async () => { calls++; return "ok"; });
  expect(v).toBe("ok");
  expect(calls).toBe(2);
});
