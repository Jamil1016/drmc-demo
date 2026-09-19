/** Shared filter-parsing + row-scoping for the Hours Variance page and its
 *  management print report, so both consume the exact same URL-param contract
 *  and row filtering. */
import { defaultVarianceRange, basePosition, type VarianceRow } from "./variance-agg";
import { DISPLAY_GROUPS, type DisplayGroup } from "./production-scope";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export type VarianceParams = {
  from: string; to: string;
  groups: DisplayGroup[]; includeInactive: boolean; positions: string[];
};

export function parseVarianceParams(sp: {
  dateFrom?: string; dateTo?: string; group?: string; inactive?: string; position?: string;
}): VarianceParams {
  const def = defaultVarianceRange();
  const from = sp.dateFrom && ISO_DATE.test(sp.dateFrom) ? sp.dateFrom : def.from;
  const to = sp.dateTo && ISO_DATE.test(sp.dateTo) ? sp.dateTo : def.to;
  const groups = (sp.group?.split(",").map((s) => s.trim())
    .filter((g): g is DisplayGroup => (DISPLAY_GROUPS as readonly string[]).includes(g))) ?? [];
  const includeInactive = sp.inactive === "show";
  const positions = sp.position?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  return { from, to, groups, includeInactive, positions };
}

export function scopeVarianceRows(
  rowsAll: VarianceRow[],
  p: Pick<VarianceParams, "groups" | "includeInactive" | "positions">,
): VarianceRow[] {
  const groupScoped = p.groups.length ? rowsAll.filter((r) => p.groups.includes(r.displayGroup)) : rowsAll;
  const activeScoped = p.includeInactive ? groupScoped : groupScoped.filter((r) => r.isActive);
  return p.positions.length
    ? activeScoped.filter((r) => {
        const b = basePosition(r.position);
        return b != null && p.positions.includes(b);
      })
    : activeScoped;
}
