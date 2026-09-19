/** Pure helpers describing which columns are filtered and how many filters are
 *  active, so the "N filters . Clear all" line and each header funnel's active
 *  tint read the SAME URL state the filter bar writes. No React. */

export type ColumnFilterSpec =
  | { kind: "single"; param: string }             // e.g. search, status, carrierGroup, ag
  | { kind: "anyOf"; params: readonly string[] }; // e.g. work date: dateFrom OR dateTo OR dows

/** Every URL param that represents a FILTER (cleared by "Clear all"). Sort
 *  state (`sort`/`dir`) is deliberately excluded. */
export const FILTER_PARAM_KEYS = [
  "search", "carrierGroup", "status", "ag", "dateFrom", "dateTo", "dows", "shMin", "shMax",
] as const;

function has(params: URLSearchParams, key: string): boolean {
  const v = params.get(key);
  return v != null && v !== "";
}

export function isFilterActive(params: URLSearchParams, spec: ColumnFilterSpec): boolean {
  switch (spec.kind) {
    case "single": return has(params, spec.param);
    case "anyOf": return spec.params.some((p) => has(params, p));
  }
}

/** Total logical filters set: one each for search, division, status, approver,
 *  work date (range OR weekday) and stated-hours range (min OR max). */
export function countActiveFilters(params: URLSearchParams): number {
  let n = 0;
  if (has(params, "search")) n++;
  if (has(params, "carrierGroup")) n++;
  if (has(params, "status")) n++;
  if (has(params, "ag")) n++;
  if (has(params, "dateFrom") || has(params, "dateTo") || has(params, "dows")) n++;
  if (has(params, "shMin") || has(params, "shMax")) n++;
  return n;
}
