/**
 * Map over items with at most `limit` promises in flight. Results land at
 * their input index, so output order always matches input order. Rejects on
 * the first item error (all-or-nothing, like Promise.all).
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }
  const workers = Math.max(1, Math.min(limit, items.length));
  if (items.length > 0) await Promise.all(Array.from({ length: workers }, worker));
  return out;
}
