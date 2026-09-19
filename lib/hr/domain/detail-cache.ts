/**
 * How long the pointer must rest on a row before we warm its full report
 * detail. Short enough that a normal aim-then-click still hits the cache,
 * long enough that sweeping the mouse across rows doesn't fire a fetch each.
 */
export const DETAIL_WARM_MS = 120;

/**
 * Promise-dedupe cache: return the stored promise for `key`, or run `fetcher`
 * once and store its promise so concurrent callers (e.g. a hover warm-up and a
 * row click) share one in-flight request. A rejected fetch removes its entry so
 * the next call retries instead of caching the failure.
 */
export function getOrFetch<K, V>(
  cache: Map<K, Promise<V>>,
  key: K,
  fetcher: () => Promise<V>,
): Promise<V> {
  const existing = cache.get(key);
  if (existing) return existing;
  const p = fetcher().catch((err) => {
    cache.delete(key);
    throw err;
  });
  cache.set(key, p);
  return p;
}
