"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateRangeField } from "@/components/ui/DateRangeField";
import { MultiSelectFilter } from "@/components/ui/MultiSelectFilter";

const SEARCH_DEBOUNCE_MS = 250;

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending" },
  { value: "in_progress", label: "In progress" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "cancelled", label: "Cancelled" },
];

/**
 * Auto-applying filter bar (no submit button). The URL query string is the
 * source of truth: every change rewrites it via router.replace (replace, not
 * push, so typing does not flood the back button) and the server page
 * re-renders with the new filters. Search is debounced; dropdowns and the date
 * control apply immediately. Used by the approvals queue and the browse page;
 * the date control only shows when `showDate` is set.
 */
export function ApprovalFilters({
  basePath,
  carrierGroup,
  search,
  showStatus = false,
  dateFrom,
  dateTo,
  dows,
  showDate = false,
  groupOptions,
  carrierGroups,
  statuses,
  approvers,
  approverOptions,
  wideSearch = false,
  showDivision = true,
  actions,
}: {
  basePath: string;
  /** Free-text single value (queue page, no groupOptions). */
  carrierGroup?: string;
  search?: string;
  showStatus?: boolean;
  dateFrom?: string;
  dateTo?: string;
  /** Active weekday filter (extract(dow) 0=Sun..6=Sat) for the Work date control. */
  dows?: number[];
  showDate?: boolean;
  /** Show the top-bar Division control. Off on DR Approval (browse), where the
   *  Division filter lives only in the column header; the /approvals queue keeps it. */
  showDivision?: boolean;
  groupOptions?: string[];
  /** Active Division selections (comma-joined `carrierGroup` URL param). */
  carrierGroups?: string[];
  /** Active Status selections (comma-joined `status` URL param). */
  statuses?: string[];
  /** Active assigned-approver groups (comma-joined `ag` URL param). */
  approvers?: string[];
  /** When set, renders the "Approver" multi-select with these choices. */
  approverOptions?: { value: string; label: string }[];
  wideSearch?: boolean;
  actions?: React.ReactNode;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();

  // Keep the freshest params in a ref so the debounced search closure always
  // builds on current state rather than a stale render snapshot.
  const paramsRef = useRef(params);
  paramsRef.current = params;

  // Array values write as repeated params (ag=a&ag=b); scalars as one value;
  // empty/undefined removes the key.
  const push = useCallback(
    (updates: Record<string, string | string[] | undefined | null>) => {
      const next = new URLSearchParams(paramsRef.current.toString());
      for (const [k, v] of Object.entries(updates)) {
        next.delete(k);
        if (Array.isArray(v)) v.forEach((x) => next.append(k, x));
        else if (v != null && v !== "") next.set(k, v);
      }
      const qs = next.toString();
      startTransition(() => router.replace(qs ? `${basePath}?${qs}` : basePath, { scroll: false }));
    },
    [router, basePath],
  );

  // Local, immediately-responsive search text; debounced before it hits the URL.
  const [searchVal, setSearchVal] = useState(search ?? "");
  // True from the first keystroke until the debounced fetch starts, so the
  // "Updating…" hint shows instantly instead of after the debounce window.
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  // Debounce a single param update (text inputs). One field is typed at a time,
  // so a shared timer is fine.
  const debouncedPush = useCallback((key: string, value: string) => {
    setTyping(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setTyping(false); push({ [key]: value }); }, SEARCH_DEBOUNCE_MS);
  }, [push]);

  function onSearchChange(value: string) {
    setSearchVal(value);
    debouncedPush("search", value);
  }

  // Signal the rest of the page (results regions) that a filter fetch is in
  // flight, so they can dim while new data loads. A document-level data
  // attribute keeps this decoupled from the sibling result tables.
  const busy = typing || isPending;
  useEffect(() => {
    const el = document.documentElement;
    if (busy) el.setAttribute("data-filtering", "true");
    else el.removeAttribute("data-filtering");
    return () => el.removeAttribute("data-filtering");
  }, [busy]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className={`flex flex-col gap-1 max-w-full ${wideSearch ? "w-[36rem]" : "w-72"}`}>
        <span className="field-label">Employee</span>
        <input
          name="search"
          value={searchVal}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search name or ID…"
          className="field"
        />
      </label>

      {/* "Division" is the team's name for the roster carrier_group (Group A/Group B/QPI…);
          the URL param and data column stay carrierGroup/carrier_group. With
          groupOptions it's a multi-select (comma-joined param); the queue page
          keeps its free-text single input. */}
      {showDivision && (groupOptions ? (
        <MultiSelectFilter
          label="Division"
          allLabel="All divisions"
          options={groupOptions.map((g) => ({ value: g, label: g }))}
          selected={carrierGroups ?? []}
          onChange={(vals) => push({ carrierGroup: vals.join(",") })}
        />
      ) : (
        <label className="flex w-52 flex-col gap-1">
          <span className="field-label">Division</span>
          <input
            defaultValue={carrierGroup ?? ""}
            onChange={(e) => debouncedPush("carrierGroup", e.target.value)}
            className="field"
          />
        </label>
      ))}

      {approverOptions && (
        <MultiSelectFilter
          label="Approver"
          allLabel="All approvers"
          options={approverOptions}
          selected={approvers ?? []}
          // Comma-joined single `ag` param (like carrierGroup/status), so the bar
          // and the Approver column header write the URL identically.
          onChange={(vals) => push({ ag: vals.join(",") })}
          width="14rem"
        />
      )}

      {showStatus && (
        <MultiSelectFilter
          label="Status"
          allLabel="All statuses"
          options={STATUS_OPTIONS}
          selected={statuses ?? []}
          onChange={(vals) => push({ status: vals.join(",") })}
          width="11rem"
        />
      )}

      {showDate && (
        <div className="flex flex-col gap-1">
          <span className="field-label">Work date</span>
          <DateRangeField
            fromIso={dateFrom}
            toIso={dateTo}
            showWeekdays
            weekdayWrap
            dows={dows}
            onApply={(from, to, d) => push({ dateFrom: from, dateTo: to, dows: d && d.length ? d.join(",") : undefined })}
          />
        </div>
      )}

      <span className="filter-status" data-busy={busy ? "true" : undefined} aria-hidden={!busy}>
        <span className="filter-status-dot" />
        Updating…
      </span>

      {actions && <div className="ml-auto">{actions}</div>}

      {/* Slim top-of-viewport progress bar while a filter fetch is in flight. */}
      <div className="filter-progress" data-busy={busy ? "true" : undefined} aria-hidden />
    </div>
  );
}
