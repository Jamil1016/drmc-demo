// lib/hr/domain/browse-columns.ts
import type { BrowseSortKey } from "@/lib/hr/domain/browse-sort";
import { type ColumnDef, STATUS_OPTIONS, VARIANCE_TOOLTIP } from "@/lib/hr/domain/review-columns";
import type { MultiOption } from "@/components/ui/MultiSelectFilter";
import { type DisplayZone, zoneLabel } from "@/lib/time";

/** A DR Approval browse column: the shared ColumnDef shape, keyed to the
 *  browse sort whitelist. */
export type BrowseColumn = ColumnDef<BrowseSortKey>;

/**
 * The ordered DR Approval (browse) columns and their header popovers. Pure data:
 * ColumnHeader interprets each `kind` into JSX. Keep the order/labels in lockstep
 * with EntryBrowseTable's <tbody> cells. Filters write the SAME URL params the top
 * ApprovalFilters bar uses (search / carrierGroup / dateFrom / dateTo / status /
 * ag), so the bar and the headers stay in sync via the URL. Stated hrs adds a
 * header-only numeric range (shMin/shMax, no bar counterpart); the rest of the
 * bar-less columns are sort-only. `opts.zone` names the display zone in the
 * timestamp headers (PHT by default so exports and tests stay unchanged); the
 * sort keys stay on the *_et columns regardless of zone.
 */
export function buildBrowseColumns(groupOptions: string[], approverOptions: MultiOption[], opts?: { zone?: DisplayZone }): BrowseColumn[] {
  const zl = zoneLabel(opts?.zone ?? "PHT");
  return [
    {
      label: "Employee", sortKey: "employee_name",
      filters: [{ kind: "search", param: "search", placeholder: "Search name or ID..." }],
    },
    {
      label: "Division", sortKey: "carrier_group",
      filters: [{
        kind: "multiselect", param: "carrierGroup", allLabel: "All divisions",
        options: groupOptions.map((g) => ({ value: g, label: g })),
      }],
    },
    {
      label: "Work date", sortKey: "work_date",
      // Day-of-week picker (dows param), backed by the view's work_dow column.
      filters: [{ kind: "daterange", fromParam: "dateFrom", toParam: "dateTo", dowParam: "dows" }],
    },
    {
      label: "Status", sortKey: "task_status",
      filters: [{ kind: "multiselect", param: "status", allLabel: "All statuses", options: STATUS_OPTIONS }],
    },
    { label: `Clock in (${zl})`, sortKey: "clock_in_et" },
    { label: `Submitted (${zl})`, sortKey: "submitted_on_et" },
    { label: `Approved (${zl})`, sortKey: "approved_on_et" },
    {
      label: "Stated hrs", sortKey: "total_hours",
      tip: "Hours stated on the daily report, minus a 1-hour unpaid break (floored at 0). The report detail drawer shows the full stated hours.",
      filters: [{
        kind: "numeric-range", minParam: "shMin", maxParam: "shMax", suffix: "h",
        hint: "Hours net of the 1h break. Either side optional.",
      }],
    },
    { label: "Timer hrs", sortKey: "timed_hours" },
    // Same signal, tiers and tooltip as Hours Analysis. Sort-only: a
    // client-side range would filter only the rows infinite scroll had loaded.
    { label: "Variance", sortKey: "variance_hours", tip: VARIANCE_TOOLTIP },
    {
      label: "Approver", sortKey: "assigned_approver",
      filters: [{ kind: "multiselect", param: "ag", allLabel: "All approvers", options: approverOptions }],
    },
    { label: "Approved by", sortKey: "approved_by" },
  ];
}
