// Shared column-header vocabulary for the sortable/filterable tables.
import type { MultiOption } from "@/components/ui/MultiSelectFilter";

/** Task-status options, shared by the filter bar and the Status header popover. */
export const STATUS_OPTIONS: MultiOption[] = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

/** A header popover body. Each writes the SAME URL params the filter bar uses. */
export type ColumnFilter =
  | { kind: "search"; param: string; placeholder: string }
  | { kind: "multiselect"; param: string; allLabel: string; options: MultiOption[] }
  // `dowParam` is optional: a table may add a day-of-week picker to the range.
  | { kind: "daterange"; fromParam: string; toParam: string; dowParam?: string }
  | { kind: "numeric-range"; minParam: string; maxParam: string; suffix?: string; hint?: string }
  | { kind: "toggles"; toggles: { value: string; label: string }[] }; // writes the comma-list `flags` param

/** A sortable/filterable table column, generic over the table's sort-key union
 *  so ColumnHeader can drive any table. */
export type ColumnDef<K extends string = string> = {
  label: string;
  tip?: string;
  sortKey?: K;
  filters?: ColumnFilter[];
};

// Permanent framing: variance is a lead to follow up on, never proof of wrongdoing.
export const VARIANCE_TOOLTIP =
  "Variance is a review lead, not proof: timers do not capture meetings, huddles, coaching, or offline work. Confirm with the team lead before acting.";
