"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { CalendarDays, X } from "lucide-react";
import { isoToDate, dateToIso, formatDateButton } from "@/lib/hr/domain/filter-url";
import { WeekdayFilter, WEEKDAYS } from "@/components/ui/WeekdayFilter";

/**
 * One control for the work-date filter: a trigger button that opens a calendar
 * popover. Click a single day for one day, or a start then an end for a range.
 * On Apply it reports `from`/`to` as yyyy-MM-dd (single day => from === to);
 * Clear reports both undefined. Escape or an outside click closes without
 * applying, so an intermediate single-click never fires a query.
 *
 * With `showWeekdays`, a day-of-week chip row (0=Sun..6=Sat) renders at the
 * bottom of the popover, just above Clear/Apply; the selected weekdays apply
 * and clear together with the date range, reported as the third `onApply` arg.
 * Callers that don't opt in keep the two-arg contract unchanged.
 */
export function DateRangeField({
  fromIso,
  toIso,
  onApply,
  showWeekdays = false,
  dows,
  weekdayWrap = false,
}: {
  fromIso?: string;
  toIso?: string;
  onApply: (from?: string, to?: string, dows?: number[]) => void;
  showWeekdays?: boolean;
  /** Currently-applied weekdays (0=Sun..6=Sat); seeds the popover on open. */
  dows?: number[];
  /** Lay the weekday chips out in two rows (4 + 3) instead of one; used by the
   *  filter bar above the table, not the narrower column-header popover. */
  weekdayWrap?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // `render` trails `open` so the popover can play an exit animation before it
  // unmounts (open -> render immediately; close -> render stays ~140ms).
  const [render, setRender] = useState(false);
  const [draft, setDraft] = useState<DateRange | undefined>();
  const [draftDows, setDraftDows] = useState<number[]>([]);
  // True between the first and second click of a NEW range. Any click outside
  // that window (fresh popover seeded with the current filter, or a completed
  // range) starts a fresh selection at the clicked day instead of stretching
  // the old one — e.g. with Jun 1 – Jul 15 active, clicking Jul 1 means
  // "start at Jul 1", and the next click sets the end date.
  const pickingRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) { setRender(true); return; }
    if (!render) return;
    const t = setTimeout(() => setRender(false), 140);
    return () => clearTimeout(t);
  }, [open, render]);

  // Seed the draft (date range + weekdays) from the live filter each time the
  // popover opens. dows is keyed by its joined string so a fresh array identity
  // from the parent can't reseed and wipe the draft mid-edit.
  const dowsKey = (dows ?? []).join(",");
  useEffect(() => {
    if (!open) return;
    const from = isoToDate(fromIso);
    const to = isoToDate(toIso) ?? from;
    setDraft(from ? { from, to } : undefined);
    setDraftDows(dows ?? []);
    pickingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fromIso, toIso, dowsKey]);

  // Close on outside pointerdown or Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const dowActive = showWeekdays && (dows?.length ?? 0) > 0;
  const hasFilter = Boolean(fromIso || toIso) || dowActive;
  const dayLabel = dowActive
    ? dows!.map((d) => WEEKDAYS.find((w) => w.dow === d)?.label ?? d).join(", ")
    : null;
  const dateLabel = formatDateButton(fromIso, toIso);
  const label = dayLabel ? `${dateLabel} · ${dayLabel}` : dateLabel;

  function apply() {
    const from = draft?.from;
    const to = draft?.to ?? draft?.from;
    onApply(
      from ? dateToIso(from) : undefined,
      to ? dateToIso(to) : undefined,
      showWeekdays ? draftDows : undefined,
    );
    setOpen(false);
  }

  function clear() {
    setDraft(undefined);
    setDraftDows([]);
    pickingRef.current = false;
    onApply(undefined, undefined, showWeekdays ? [] : undefined);
    setOpen(false);
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="daterange-trigger"
        data-active={hasFilter ? "true" : undefined}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays size={15} aria-hidden />
        <span>{label}</span>
        {hasFilter && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear date filter"
            className="daterange-clear"
            onClick={(e) => { e.stopPropagation(); clear(); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); clear(); } }}
          >
            <X size={13} aria-hidden />
          </span>
        )}
      </button>

      {render && (
        <div className="daterange-pop" data-closing={!open ? "true" : undefined} role="dialog" aria-label="Choose work date">
          <DayPicker
            mode="range"
            selected={draft}
            // First click of a pair starts a fresh selection (never stretches a
            // seeded/completed range); second click completes it via the
            // picker's own range (which handles clicking backwards). A further
            // click starts over again. See pickingRef above.
            onSelect={(_next, clicked) => {
              if (pickingRef.current) {
                // Complete the pair ourselves (ordering both ways) so the
                // behavior never depends on the picker's own merge logic.
                setDraft((prev) => {
                  const start = prev?.from ?? clicked;
                  return clicked < start ? { from: clicked, to: start } : { from: start, to: clicked };
                });
                pickingRef.current = false;
              } else {
                setDraft({ from: clicked, to: undefined });
                pickingRef.current = true;
              }
            }}
            defaultMonth={isoToDate(toIso) ?? isoToDate(fromIso)}
            showOutsideDays
            captionLayout="dropdown"
            numberOfMonths={1}
          />
          {showWeekdays && (
            <div className="daterange-dows">
              <span className="field-label">Days of week</span>
              <WeekdayFilter selected={draftDows} onChange={setDraftDows} wrap={weekdayWrap} />
            </div>
          )}
          <div className="daterange-foot">
            <button type="button" className="btn-ghost" onClick={clear}>Clear</button>
            <button type="button" className="btn-primary" onClick={apply}>Apply</button>
          </div>
        </div>
      )}
    </div>
  );
}
