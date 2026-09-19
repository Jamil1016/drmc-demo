/**
 * Whether a table may adopt freshly polled page-1 rows (LiveRefresh calls
 * router.refresh every 60s; the server re-renders page 1). Only when the user
 * is still within page 1 (offset <= one page) and nothing is in flight, so an
 * adoption can never clobber infinite-scrolled rows or race a pending fetch.
 */
export function canAdoptPolledRows(opts: {
  offset: number;
  pageSize: number;
  loadingMore: boolean;
  busy?: boolean;
}): boolean {
  return !opts.loadingMore && !opts.busy && opts.offset <= opts.pageSize;
}
