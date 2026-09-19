"use client";

import { useEffect, useId, useRef } from "react";
import type { DayActivity, ReportRequirement } from "@/lib/hr/queries/report-detail";
import { DayTimeline } from "@/components/approvals/DayTimeline";
import { RequirementList } from "@/components/approvals/RequirementList";
import { formatMinutes } from "@/lib/hr/domain/day-timeline";
import { unionMinutes } from "@/lib/hr/domain/worked-time";
import { formatWorkDateWithDay } from "@/lib/time";

/** The pop-out day timeline (the "wide" Gantt): same chart as the drawer's
 *  in-panel view with real horizontal room. Opens from the "Worked on this
 *  day" section title. Follows ConfirmDialog's stacked-modal rules: it OWNS
 *  Escape while open (capture + stopPropagation) so the drawer underneath
 *  never closes with it. */
export function DayTimelineModal({
  open, onClose, dayActivities, clockInMs = null, statedHours = null, memberName = null, workDate = null, requirements = null, loadFailed = false, loadFailedNote = null,
}: {
  open: boolean;
  onClose: () => void;
  dayActivities: DayActivity[];
  clockInMs?: number | null;
  /** RAW stated hours from the DR; sizes the work-hours band (9h fallback). */
  statedHours?: number | null;
  memberName?: string | null;
  workDate?: string | null;
  requirements?: ReportRequirement[] | null;
  /** True when the caller's detail fetch failed: show an inline error instead
   *  of leaving the modal on its loading state forever. */
  loadFailed?: boolean;
  /** Overrides the failure copy. "Try again" is wrong for a permanent reason
   *  such as no report filed for that day. */
  loadFailedNote?: string | null;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="drawer-overlay" style={{ display: "grid", placeItems: "center", zIndex: 60 }} onClick={onClose}>
      <div
        className="surface flex flex-col p-5"
        style={{ width: "80vw", maxHeight: "88vh" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex shrink-0 items-start justify-between gap-3">
          <div>
            <h3 id={titleId} className="font-semibold" style={{ color: "var(--ink)" }}>
              Day timeline{memberName ? ` · ${memberName}` : ""}
            </h3>
            <p className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
              {workDate ? `${formatWorkDateWithDay(workDate)} · ` : ""}{dayActivities.length} entries · {formatMinutes(unionMinutes(dayActivities))} worked
            </p>
          </div>
          <button ref={closeRef} onClick={onClose} className="text-lg leading-none" style={{ color: "var(--muted)" }} aria-label="Close">✕</button>
        </div>
        {/* Requirements beside the chart: the "why" behind blanks and short
            days lives in the descriptions, so a lead cross-references without
            closing the pop-out. Each column scrolls independently. */}
        {loadFailed ? (
          <p className="text-sm" style={{ color: "var(--bad)" }}>
            {loadFailedNote ?? "Couldn't load this day's details. Close and try again."}
          </p>
        ) : (
          <div className="grid min-h-0 flex-1 gap-5" style={{ gridTemplateColumns: "300px minmax(0, 1fr)" }}>
            <div className="min-h-0 overflow-y-auto overflow-x-hidden border-r pr-5" style={{ borderColor: "var(--rule)" }}>
              <div className="side-label mb-2" style={{ color: "var(--muted)" }}>
                Requirements{requirements ? ` (${requirements.length})` : ""}
              </div>
              {!requirements && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>}
              {requirements && requirements.length === 0 && (
                <p className="text-sm" style={{ color: "var(--muted)" }}>No requirement lines.</p>
              )}
              {requirements && requirements.length > 0 && <RequirementList requirements={requirements} />}
            </div>
            <div className="min-h-0 overflow-y-auto overflow-x-hidden pr-3">
              <DayTimeline dayActivities={dayActivities} clockInMs={clockInMs} statedHours={statedHours} wide />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
