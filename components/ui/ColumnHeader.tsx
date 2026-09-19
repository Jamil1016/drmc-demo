// components/ui/ColumnHeader.tsx
"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { X } from "lucide-react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { setParams } from "@/lib/hr/domain/filter-url";
import { type SortDir } from "@/lib/hr/domain/browse-sort";
import { isFilterActive } from "@/lib/hr/domain/active-filters";
import { DateRangeField } from "@/components/ui/DateRangeField";
import type { MultiOption } from "@/components/ui/MultiSelectFilter";
import { sameSelection } from "@/lib/hr/domain/multi-select";
import type { ColumnFilter, ColumnDef } from "@/lib/hr/domain/review-columns";

/**
 * Excel-style column header: the label, a passive arrow marking the active sort
 * column/direction, and a single menu trigger (a funnel when the column filters,
 * a sort glyph when it only sorts). The trigger opens one popover holding Sort
 * ascending/descending buttons (when sortable) then the column's filter bodies,
 * so sorting lives inside the popover rather than as a second header control.
 * Every control reads and writes the SAME URL params the filter bar and chips
 * use (URL is the single source of truth), so the UIs can never disagree.
 * Outside-click / Escape close the popover (same pattern as MultiSelectFilter).
 * Additive: nothing in the bar/chips changes.
 */
export function ColumnHeader<K extends string>({
  column,
  sort,
  onSetSort,
  flagCounts,
}: {
  column: ColumnDef<K>;
  sort?: { key: K; dir: SortDir } | null;
  onSetSort?: (key: K, dir: SortDir) => void;
  flagCounts?: Partial<Record<string, number>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLTableCellElement>(null);

  const sortable = !!column.sortKey && !!onSetSort;
  const hasFilters = !!column.filters?.length;
  const hasMenu = sortable || hasFilters;
  const active = !!column.sortKey && column.sortKey === sort?.key;
  // Toggles share the single `flags` param, so a generic "is `flags` non-empty"
  // spec would tint every toggle column's funnel whenever ANY flag is set.
  // Check membership of THIS column's own toggle values instead; every other
  // kind still goes through the shared isFilterActive/toSpec spec.
  const currentFlags = flagList(params);
  const filterActive = (column.filters ?? []).some((f) =>
    f.kind === "toggles"
      ? f.toggles.some((t) => currentFlags.includes(t.value))
      : isFilterActive(new URLSearchParams(params.toString()), toSpec(f)),
  );

  // Outside-click / Escape close (one stable listener per open session). The
  // close is deferred to a microtask so a nested draft-commit control
  // (MultiSelectFilter / DateRangeField) whose OWN outside-click listener fires
  // later in the SAME event can commit its selection first. React flushes
  // discrete-event updates synchronously, so closing inline would unmount the
  // child before it commits and silently drop the selection (the reported
  // "the column filter only applies if I click inside the popover first" bug).
  useEffect(() => {
    if (!open) return;
    const close = () => queueMicrotask(() => setOpen(false));
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) close();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Right-edge columns (e.g. Variance, the last column) would clip a
  // left-anchored popover off the viewport, so measure once on open and flip
  // the anchor to the header cell's right edge when it would overflow.
  const popRef = useRef<HTMLDivElement>(null);
  const [alignRight, setAlignRight] = useState(false);
  useEffect(() => {
    if (!open) { setAlignRight(false); return; }
    const el = popRef.current;
    if (!el) return;
    if (el.getBoundingClientRect().right > window.innerWidth - 8) setAlignRight(true);
  }, [open]);

  // Applying a column filter dims the table via the SAME shared `data-filtering`
  // signal the top filter bar uses, so header-driven changes get the same
  // "Updating..." feedback. Only one popover is open at a time, so the single
  // useTransition driving it does not race across the header instances; the
  // cleanup drops the attribute if this header unmounts mid-transition (the page
  // remounts the table on a filter change).
  const [isPending, startTransition] = useTransition();
  useEffect(() => {
    const el = document.documentElement;
    if (isPending) el.setAttribute("data-filtering", "true");
    else el.removeAttribute("data-filtering");
    return () => { if (isPending) el.removeAttribute("data-filtering"); };
  }, [isPending]);

  // URL replace wrapped in a transition so `isPending` (above) can raise the
  // dim while the server re-renders. Scroll preserved.
  function push(updates: Record<string, string | undefined | null>) {
    const next = setParams(new URLSearchParams(params.toString()), updates);
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  return (
    <th title={column.tip} ref={wrapRef}
        aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}
        style={{ whiteSpace: "nowrap",
                 // Keep the CSS `position: sticky` on the th so the header row
                 // stays put on scroll (do NOT set position here, it would win
                 // over the sticky rule). Only override the bottom border to the
                 // accent colour when this column is filtered.
                 boxShadow: filterActive ? "inset 0 -2px 0 var(--signal)" : undefined }}>
      {/* Popover anchor lives on this inner span, NOT the th, so the th keeps
          its sticky positioning. */}
      <span style={{ position: "relative", display: "inline-flex", alignItems: "center", gap: "0.3rem" }}>
        <span style={{ fontWeight: filterActive ? 600 : undefined, color: filterActive ? "var(--ink)" : undefined }}>
          {column.label}
        </span>
        {/* Passive indicator of the active sort column + direction (not a control). */}
        {active && (
          <span aria-hidden style={{ fontSize: "0.7em", color: "var(--ink)" }}>
            {sort!.dir === "asc" ? "▲" : "▼"}
          </span>
        )}
        {hasMenu && (
          <button type="button"
                  aria-label={`${hasFilters ? "Filter" : "Sort"} ${column.label}`}
                  aria-expanded={open}
                  onClick={() => setOpen((o) => !o)}
                  style={{ border: 0, cursor: "pointer", lineHeight: 1, display: "inline-flex", alignItems: "center",
                           borderRadius: 999,
                           // Active filter -> a solid signal-coloured pill with a
                           // white funnel; inactive -> a quiet outline glyph.
                           padding: filterActive ? "0.05rem 0.3rem" : 0,
                           background: filterActive ? "var(--signal)" : "none",
                           color: filterActive ? "#fff" : "var(--muted-soft)",
                           opacity: filterActive ? 1 : 0.55 }}>
            {/* funnel for filter columns, sort glyph for sort-only columns */}
            <span aria-hidden style={{ fontSize: "0.75em" }}>{hasFilters ? "▽" : "↕"}</span>
          </button>
        )}

        {open && hasMenu && (
          <div className="surface" role="dialog" ref={popRef}
               style={{ position: "absolute", top: "100%", left: alignRight ? "auto" : 0, right: alignRight ? 0 : "auto",
                        marginTop: 6, zIndex: 60, minWidth: "14rem",
                        padding: "0.5rem", boxShadow: "0 10px 30px rgba(15,23,42,0.18)", textAlign: "left",
                        textTransform: "none", fontWeight: 400 }}>
            {sortable && (
              <div style={{ display: "flex", gap: "0.4rem", marginBottom: hasFilters ? "0.45rem" : 0 }}>
                <button type="button" className="chip" onClick={() => onSetSort!(column.sortKey!, "asc")}>Sort {"↑"}</button>
                <button type="button" className="chip" onClick={() => onSetSort!(column.sortKey!, "desc")}>Sort {"↓"}</button>
              </div>
            )}
            {(column.filters ?? []).map((f, i) => (
              <FilterBody key={i} filter={f} params={params} push={push} flagCounts={flagCounts} />
            ))}
          </div>
        )}
      </span>
    </th>
  );
}

/** URL-active spec for a filter body (so the funnel tint matches the bar). */
function toSpec(f: ColumnFilter) {
  switch (f.kind) {
    case "search": return { kind: "single" as const, param: f.param };
    case "multiselect": return { kind: "single" as const, param: f.param };
    case "daterange": return { kind: "anyOf" as const, params: [f.fromParam, f.toParam, f.dowParam].filter((p): p is string => !!p) };
    case "numeric-range": return { kind: "anyOf" as const, params: [f.minParam, f.maxParam] };
    case "toggles": return { kind: "anyOf" as const, params: ["flags"] };
  }
}

function flagList(params: URLSearchParams): string[] {
  const raw = params.get("flags");
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

function FilterBody({
  filter, params, push, flagCounts,
}: {
  filter: ColumnFilter;
  params: URLSearchParams;
  push: (u: Record<string, string | undefined | null>) => void;
  flagCounts?: Partial<Record<string, number>>;
}) {
  if (filter.kind === "search") {
    return <DebouncedSearch value={params.get(filter.param) ?? ""} placeholder={filter.placeholder}
                            onChange={(v) => push({ [filter.param]: v })} />;
  }
  if (filter.kind === "multiselect") {
    const selected = (params.get(filter.param) ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    return <MultiSelectBody param={filter.param} allLabel={filter.allLabel} options={filter.options}
                            selected={selected} push={push} />;
  }
  if (filter.kind === "daterange") {
    // Absent dows = all days. Split then drop empties BEFORE Number(): a bare ""
    // would otherwise become Number("") = 0 = Sunday, filtering to Sundays only.
    // dowParam is optional (DR Approval has no weekday column) — when absent we
    // hide the weekday picker and never write a dow param.
    const dowParam = filter.dowParam;
    const dows = dowParam
      ? (params.get(dowParam) ?? "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
          .map(Number)
          .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6)
      : [];
    return <DateRangeField fromIso={params.get(filter.fromParam) ?? undefined} toIso={params.get(filter.toParam) ?? undefined}
                           showWeekdays={!!dowParam} dows={dows}
                           onApply={(from, to, d) => push({ [filter.fromParam]: from, [filter.toParam]: to,
                                                            ...(dowParam ? { [dowParam]: d && d.length ? d.join(",") : undefined } : {}) })} />;
  }
  if (filter.kind === "numeric-range") {
    return <NumericRange min={params.get(filter.minParam) ?? ""} max={params.get(filter.maxParam) ?? ""} suffix={filter.suffix} hint={filter.hint}
                         onChange={(mn, mx) => push({ [filter.minParam]: mn, [filter.maxParam]: mx })} />;
  }
  // toggles: write the comma-list `flags` param (OR semantics), same as FlagChips.
  const active = flagList(params);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
      {filter.toggles.map((t) => {
        const on = active.includes(t.value);
        return (
          <label key={t.value} className="flex items-center gap-2" style={{ cursor: "pointer", fontSize: "0.82rem" }}>
            <input type="checkbox" checked={on}
                   onChange={() => {
                     const next = on ? active.filter((v) => v !== t.value) : [...active, t.value];
                     push({ flags: next.length ? next.join(",") : undefined });
                   }} />
            <span>{t.label}</span>
            {flagCounts?.[t.value] != null && <span className="chip-count">{flagCounts[t.value]}</span>}
          </label>
        );
      })}
    </div>
  );
}

/**
 * Inline checkbox list for a multiselect column (Division / Status). Renders the
 * options directly in the column popover (no nested sub-popover to click into)
 * and edits a local draft; the committed URL param is written when this body
 * UNMOUNTS, i.e. when the column popover closes. Committing on unmount is
 * deterministic: it does not depend on which outside-click listener wins the
 * race, which is what dropped the selection when a nested MultiSelectFilter was
 * used here. Empty selection writes "" so setParam deletes the param (= all).
 */
function MultiSelectBody({
  param, allLabel, options, selected, push,
}: {
  param: string;
  allLabel: string;
  options: MultiOption[];
  selected: string[];
  push: (u: Record<string, string | undefined | null>) => void;
}) {
  const [draft, setDraft] = useState<string[]>(selected);
  const pendingRef = useRef<string[] | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const pushRef = useRef(push);
  pushRef.current = push;
  useEffect(() => () => {
    const p = pendingRef.current;
    if (p && !sameSelection(p, selectedRef.current)) pushRef.current({ [param]: p.join(",") });
  }, [param]);

  function toggle(value: string) {
    setDraft((prev) => {
      const next = prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value];
      pendingRef.current = next;
      return next;
    });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "0.1rem", maxHeight: 260, overflowY: "auto" }}>
      <button type="button" onClick={() => { pendingRef.current = []; setDraft([]); }} disabled={draft.length === 0}
              style={{ textAlign: "left", background: "none", border: 0, padding: "0.2rem 0.15rem", borderRadius: 6,
                       cursor: draft.length ? "pointer" : "default", fontSize: "0.75rem",
                       color: draft.length ? "var(--signal)" : "var(--muted-soft)" }}>
        {draft.length ? `Clear (${draft.length})` : allLabel}
      </button>
      {options.map((o) => (
        <label key={o.value} className="flex items-center gap-2"
               style={{ cursor: "pointer", fontSize: "0.82rem", padding: "0.15rem", borderRadius: 6 }}>
          <input type="checkbox" checked={draft.includes(o.value)} onChange={() => toggle(o.value)} />
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.label}>{o.label}</span>
        </label>
      ))}
    </div>
  );
}

function DebouncedSearch({ value, placeholder, onChange }: { value: string; placeholder: string; onChange: (v: string) => void }) {
  const [val, setVal] = useState(value);
  // Commit the draft only when this body UNMOUNTS (the popover closes on
  // outside-click / Escape), NOT per keystroke. Same UX as NumericRange /
  // MultiSelectBody: edit a local draft, write the URL once on close. `value` is
  // the committed URL param, so skip the push when the draft matches it.
  const pendingRef = useRef<string | null>(null);
  const committedRef = useRef(value);
  committedRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => () => {
    const p = pendingRef.current;
    if (p !== null && p !== committedRef.current) onChangeRef.current(p);
  }, []);
  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
      <input ref={inputRef} className="field" value={val} placeholder={placeholder}
             style={{ width: "100%", paddingRight: val ? "1.7rem" : undefined }}
             onChange={(e) => {
               setVal(e.target.value);
               pendingRef.current = e.target.value;
             }} />
      {val && (
        // Clears the draft (the empty filter applies on popover close, same as
        // typing); refocus so the user can keep typing.
        <button type="button" aria-label="Clear search"
                onClick={() => { setVal(""); pendingRef.current = ""; inputRef.current?.focus(); }}
                style={{ position: "absolute", right: "0.4rem", display: "inline-flex", alignItems: "center",
                         justifyContent: "center", border: 0, background: "none", cursor: "pointer",
                         color: "var(--muted)", padding: 2, borderRadius: 999, lineHeight: 0 }}>
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
  );
}

function NumericRange({ min, max, suffix, hint, onChange }: { min: string; max: string; suffix?: string; hint?: string; onChange: (min: string, max: string) => void }) {
  const [mn, setMn] = useState(min);
  const [mx, setMx] = useState(max);
  // Commit the draft only when this body UNMOUNTS (the popover closes on
  // outside-click / Escape), NOT per keystroke. A debounce still fired an
  // intermediate filter every time the user paused between digits (typing "10"
  // filtered on "1" first), so this mirrors MultiSelectBody: edit a local draft,
  // write the URL once on close. `min`/`max` props ARE the committed URL values,
  // so we skip the push when the draft matches them (nothing actually changed).
  const pendingRef = useRef<{ mn: string; mx: string } | null>(null);
  const committedRef = useRef({ mn, mx: max });
  committedRef.current = { mn: min, mx: max };
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => () => {
    const p = pendingRef.current;
    if (p && (p.mn !== committedRef.current.mn.trim() || p.mx !== committedRef.current.mx.trim())) {
      onChangeRef.current(p.mn, p.mx);
    }
  }, []);
  function edit(nextMn: string, nextMx: string) {
    setMn(nextMn);
    setMx(nextMx);
    pendingRef.current = { mn: nextMn.trim(), mx: nextMx.trim() };
  }
  return (
    <div title={hint} style={{ display: "flex", alignItems: "center", gap: "0.3rem" }}>
      <input type="number" inputMode="numeric" aria-label="Minimum" placeholder="min" className="field w-16"
             value={mn} onChange={(e) => edit(e.target.value, mx)} />
      <span aria-hidden style={{ color: "var(--muted)" }}>{"–"}</span>
      <input type="number" inputMode="numeric" aria-label="Maximum" placeholder="max" className="field w-16"
             value={mx} onChange={(e) => edit(mn, e.target.value)} />
      {suffix && <span aria-hidden style={{ color: "var(--muted)" }}>{suffix}</span>}
    </div>
  );
}
