"use client";

import { useCallback, useRef, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateRangeField } from "@/components/ui/DateRangeField";
import { MultiSelectFilter, type MultiOption } from "@/components/ui/MultiSelectFilter";
import { DISPLAY_GROUPS } from "@/lib/hr/domain/production-scope";
import { setParams } from "@/lib/hr/domain/filter-url";

export type ViewMode = "group" | "member";

const GROUP_OPTIONS: MultiOption[] = DISPLAY_GROUPS.map((g) => ({ value: g, label: g }));

/**
 * Filter bar for the Hours Variance dashboard: date window, carrier-group and
 * position multi-selects, and the By group / By member toggle. Same URL-params-
 * as-source-of-truth idiom as the other filter bars (read live params via a ref, merge
 * with `setParams`, `router.replace` inside a transition). Column mode
 * (Week/Day) and heatmap metric are also URL params but toggled by
 * `VarianceWorkspace`, not here. Drill state (selected group/cell/member)
 * lives in `VarianceWorkspace` client state, not the URL owned by this bar.
 */
export function VarianceControls({
  from,
  to,
  view,
  groups,
  includeInactive,
  positionOptions,
  positions,
}: {
  from: string;
  to: string;
  view: ViewMode;
  groups: string[];
  includeInactive: boolean;
  positionOptions: string[];
  positions: string[];
}) {
  const positionOpts: MultiOption[] = positionOptions.map((p) => ({ value: p, label: p }));
  const router = useRouter();
  const params = useSearchParams();
  const paramsRef = useRef(params);
  paramsRef.current = params;
  const [, startTransition] = useTransition();

  // The print view reads exactly these params: dateFrom/dateTo/group/inactive/
  // position. It opens in a new tab and brings up the browser's print dialog
  // (print=1), where "Save as PDF" produces the management report.
  const reportHref = (() => {
    const p = new URLSearchParams();
    if (from) p.set("dateFrom", from);
    if (to) p.set("dateTo", to);
    if (groups.length) p.set("group", groups.join(","));
    if (includeInactive) p.set("inactive", "show");
    if (positions.length) p.set("position", positions.join(","));
    p.set("print", "1");
    return `/hr/variance/report?${p.toString()}`;
  })();

  const push = useCallback(
    (updates: Record<string, string | undefined | null>) => {
      const qs = setParams(new URLSearchParams(paramsRef.current.toString()), updates).toString();
      startTransition(() => router.replace(qs ? `/hr/variance?${qs}` : "/hr/variance", { scroll: false }));
    },
    [router],
  );

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <span className="field-label">Date range</span>
        <DateRangeField
          fromIso={from}
          toIso={to}
          // Changing the window also clears any drill cell/member (they may no longer exist).
          onApply={(f, t) => push({ dateFrom: f, dateTo: t, cell: null, member: null })}
        />
      </div>
      <MultiSelectFilter
        label="Carrier group"
        allLabel="All carriers"
        options={GROUP_OPTIONS}
        selected={groups}
        onChange={(vals) => push({ group: vals.join(","), cell: null, member: null })}
      />
      <MultiSelectFilter
        label="Position"
        allLabel="All positions"
        options={positionOpts}
        selected={positions}
        onChange={(vals) => push({ position: vals.join(","), cell: null, member: null })}
      />
      <div className="flex flex-col gap-1">
        <span className="field-label">View</span>
        {/* Control area matches the .field height (~2.375rem) and centers the
            toggle, so the buttons align vertically with the date/dropdown
            controls while the "View" label lines up with the other labels. */}
        <div style={{ display: "flex", alignItems: "center", minHeight: "2.375rem" }}>
          <div className="metricToggle" style={{ marginLeft: 0 }}>
            <button
              className={view === "group" ? "on" : ""}
              onClick={() => push({ view: "group", group: null, member: null, cell: null })}
            >
              By group
            </button>
            <button
              className={view === "member" ? "on" : ""}
              onClick={() => push({ view: "member", group: null, member: null, cell: null })}
            >
              By member
            </button>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        <span className="field-label">Members</span>
        <div style={{ display: "flex", alignItems: "center", minHeight: "2.375rem" }}>
          <div className="metricToggle" style={{ marginLeft: 0 }}>
            {/* Resigned/inactive members are hidden by default; "All" includes them.
                Changing this may hide the drilled member, so clear cell/member. */}
            <button
              className={!includeInactive ? "on" : ""}
              onClick={() => push({ inactive: null, member: null, cell: null })}
            >
              Active only
            </button>
            <button
              className={includeInactive ? "on" : ""}
              onClick={() => push({ inactive: "show", member: null, cell: null })}
            >
              All
            </button>
          </div>
        </div>
      </div>
      {/* The management report is a print-styled page; the browser's own
          "Save as PDF" replaces a server-side PDF renderer. */}
      <a className="btn-ghost" href={reportHref} target="_blank" rel="noopener noreferrer">
        Print report
      </a>
    </div>
  );
}
