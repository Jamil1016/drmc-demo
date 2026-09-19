/**
 * Iterate every page of a Range-paginated query, in parallel waves, yielding
 * one page array at a time in page order.
 *
 * Page 0 goes out alone so the common small export (one short page) costs a
 * single query. When page 0 comes back full, the remaining pages are fetched
 * `concurrency` at a time; the first short page ends the set (pages fetched
 * past it in the same wave are discarded), so the concatenated output is
 * identical to a sequential loop.
 *
 * Only safe when the underlying query has a STABLE total order (a unique
 * tiebreak column), otherwise concurrent Range windows could overlap.
 */
export async function* iterPagesParallel<T>(
  fetchPage: (page: number) => Promise<T[]>,
  opts: { pageSize: number; maxPages: number; concurrency?: number },
): AsyncGenerator<T[], void, void> {
  const concurrency = Math.max(1, opts.concurrency ?? 4);
  const first = await fetchPage(0);
  yield first;
  if (first.length < opts.pageSize || opts.maxPages <= 1) return;

  for (let start = 1; start < opts.maxPages; start += concurrency) {
    const n = Math.min(concurrency, opts.maxPages - start);
    const wave = await Promise.all(Array.from({ length: n }, (_, i) => fetchPage(start + i)));
    for (const page of wave) {
      yield page;
      if (page.length < opts.pageSize) return;
    }
  }
}

/** Collected form of iterPagesParallel, for callers that need the full set. */
export async function fetchAllPagesParallel<T>(
  fetchPage: (page: number) => Promise<T[]>,
  opts: { pageSize: number; maxPages: number; concurrency?: number },
): Promise<T[]> {
  const pages: T[][] = [];
  for await (const page of iterPagesParallel(fetchPage, opts)) pages.push(page);
  return pages.flat();
}
