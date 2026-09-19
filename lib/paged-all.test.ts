import { test, expect } from "@playwright/test";
import { fetchAllPagesParallel, iterPagesParallel } from "./paged-all";

// Simulated table: `totalRows` rows of sequential integers, served in
// `pageSize` slices like a PostgREST .range() query.
function makeFetcher(totalRows: number, pageSize: number, log?: number[]) {
  const all = Array.from({ length: totalRows }, (_, i) => i);
  return async (page: number) => {
    log?.push(page);
    return all.slice(page * pageSize, page * pageSize + pageSize);
  };
}

test("short first page returns after one fetch", async () => {
  const calls: number[] = [];
  const rows = await fetchAllPagesParallel(makeFetcher(37, 100, calls), { pageSize: 100, maxPages: 200 });
  expect(rows).toEqual(Array.from({ length: 37 }, (_, i) => i));
  expect(calls).toEqual([0]);
});

test("exact multiple of pageSize: trailing empty page ends the loop", async () => {
  const rows = await fetchAllPagesParallel(makeFetcher(200, 100), { pageSize: 100, maxPages: 200 });
  expect(rows.length).toBe(200);
  expect(rows[199]).toBe(199);
});

test("multi-wave result is complete and in page order", async () => {
  const rows = await fetchAllPagesParallel(makeFetcher(950, 100), { pageSize: 100, maxPages: 200, concurrency: 4 });
  expect(rows.length).toBe(950);
  expect(rows).toEqual(Array.from({ length: 950 }, (_, i) => i));
});

test("pages after the first short page in a wave are discarded", async () => {
  // 250 rows, pageSize 100: pages are 100/100/50. Page 3 (empty) may be
  // fetched in the same wave as page 2 but must not truncate or reorder.
  const rows = await fetchAllPagesParallel(makeFetcher(250, 100), { pageSize: 100, maxPages: 200, concurrency: 4 });
  expect(rows.length).toBe(250);
});

test("respects maxPages ceiling", async () => {
  const calls: number[] = [];
  const rows = await fetchAllPagesParallel(makeFetcher(10_000, 100, calls), { pageSize: 100, maxPages: 3 });
  expect(rows.length).toBe(300);
  expect(Math.max(...calls)).toBeLessThanOrEqual(2);
});

test("waves run concurrently (wall-clock bound by waves, not pages)", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchPage = async (page: number) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 10));
    inFlight--;
    return page < 8 ? Array.from({ length: 100 }, (_, i) => page * 100 + i) : [];
  };
  await fetchAllPagesParallel(fetchPage, { pageSize: 100, maxPages: 200, concurrency: 4 });
  expect(maxInFlight).toBeGreaterThanOrEqual(2);
  expect(maxInFlight).toBeLessThanOrEqual(4);
});

test("a rejecting page rejects the whole fetch", async () => {
  const fetchPage = async (page: number) => {
    if (page === 1) throw new Error("boom");
    return Array.from({ length: 100 }, (_, i) => page * 100 + i);
  };
  await expect(fetchAllPagesParallel(fetchPage, { pageSize: 100, maxPages: 200 })).rejects.toThrow("boom");
});

// --- iterPagesParallel (the streaming variant the export routes consume) ---

async function collectPages<T>(gen: AsyncGenerator<T[]>): Promise<T[][]> {
  const out: T[][] = [];
  for await (const page of gen) out.push(page);
  return out;
}

test("iter: yields pages in order and stops after the first short page", async () => {
  const pages = await collectPages(iterPagesParallel(makeFetcher(250, 100), { pageSize: 100, maxPages: 200, concurrency: 4 }));
  expect(pages.map((p) => p.length)).toEqual([100, 100, 50]);
  expect(pages.flat()).toEqual(Array.from({ length: 250 }, (_, i) => i));
});

test("iter: single short page 0 yields exactly once", async () => {
  const calls: number[] = [];
  const pages = await collectPages(iterPagesParallel(makeFetcher(37, 100, calls), { pageSize: 100, maxPages: 200 }));
  expect(pages.length).toBe(1);
  expect(pages[0].length).toBe(37);
  expect(calls).toEqual([0]);
});

test("iter: respects maxPages", async () => {
  const pages = await collectPages(iterPagesParallel(makeFetcher(10_000, 100), { pageSize: 100, maxPages: 3 }));
  expect(pages.length).toBe(3);
  expect(pages.flat().length).toBe(300);
});

test("iter: waves stay bounded by concurrency", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const fetchPage = async (page: number) => {
    inFlight++;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((r) => setTimeout(r, 10));
    inFlight--;
    return page < 8 ? Array.from({ length: 100 }, (_, i) => page * 100 + i) : [];
  };
  await collectPages(iterPagesParallel(fetchPage, { pageSize: 100, maxPages: 200, concurrency: 4 }));
  expect(maxInFlight).toBeLessThanOrEqual(4);
  expect(maxInFlight).toBeGreaterThanOrEqual(2);
});
