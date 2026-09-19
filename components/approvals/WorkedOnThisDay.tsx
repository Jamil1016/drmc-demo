"use client";

import { useState } from "react";
import type { DayActivity, ReportRequirement } from "@/lib/hr/queries/report-detail";
import { StatusPill } from "@/components/ui/StatusPill";
import { formatZonedInstant, etNaiveInstantMs, zoneLabel, type DisplayZone } from "@/lib/time";
import { useDisplayZone } from "@/components/layout/DisplayZoneProvider";
import { unionMinutes } from "@/lib/hr/domain/worked-time";
import { formatMinutes } from "@/lib/hr/domain/day-timeline";
import { DayTimeline } from "@/components/approvals/DayTimeline";
import { DayTimelineModal } from "@/components/approvals/DayTimelineModal";

type View = "list" | "chart";
// Persisted like the drawer width: reviewers who prefer the chart keep it.
const VIEW_STORAGE_KEY = "hr-worked-day-view";

function savedView(): View {
  if (typeof window === "undefined") return "list";
  return window.localStorage.getItem(VIEW_STORAGE_KEY) === "chart" ? "chart" : "list";
}

// Time range with date(s) in the display zone. Shows the date once, or both
// dates when the session crosses midnight in that zone (common on night
// shifts for PHT viewers).
function rangeLabel(start: string | null, end: string | null, zone: DisplayZone): string {
  if (!start) return "—";
  const sd = formatZonedInstant(start, zone, "MMM d");
  const st = formatZonedInstant(start, zone, "hh:mm a");
  if (!end) return `${sd} ${st} – running`;
  const ed = formatZonedInstant(end, zone, "MMM d");
  const et = formatZonedInstant(end, zone, "hh:mm a");
  return sd === ed ? `${sd} · ${st} – ${et}` : `${sd} ${st} – ${ed} ${et}`;
}

const VIEWS: { id: View; label: string }[] = [
  { id: "list", label: "List" },
  { id: "chart", label: "Chart" },
];

/** "Worked on this day" — full clean timer log for the ET work day, as the
 *  original card list or a Gantt-style timeline (asset tasks × display-zone
 *  hours, PHT or ET per the user's toggle).
 *  Rendered inline by ReportDetailBody, or in its own right column by
 *  ReportDetailDrawer when the drawer is wide enough for the split layout. */
export function WorkedOnThisDay({ dayActivities, loading, clockInEt = null, statedHours = null, memberName = null, workDate = null, requirements = null }: { dayActivities: DayActivity[] | null | undefined; loading: boolean; clockInEt?: string | null; statedHours?: number | null; memberName?: string | null; workDate?: string | null; requirements?: ReportRequirement[] | null }) {
  const { zone } = useDisplayZone();
  const [view, setView] = useState<View>(savedView);
  const [expanded, setExpanded] = useState(false);
  const pick = (v: View) => {
    setView(v);
    window.localStorage.setItem(VIEW_STORAGE_KEY, v);
  };
  const hasEntries = !!dayActivities && dayActivities.length > 0;
  const clockInMs = etNaiveInstantMs(clockInEt);
  return (
    <section>
      <div className="side-label mb-2 flex items-center justify-between gap-2" style={{ color: "var(--muted)" }}>
        <span>Worked on this day{dayActivities ? ` (${dayActivities.length})` : ""}</span>
        {hasEntries && (
          <span className="flex items-center gap-2">
            <span style={{ color: "var(--ink-soft)" }} title="Time covered by at least one running timer; overlapping entries are not double-counted">
              {formatMinutes(unionMinutes(dayActivities))}
            </span>
            <span className="flex gap-1" role="group" aria-label="Timer log view">
              {VIEWS.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  onClick={() => pick(v.id)}
                  style={{
                    fontSize: "0.68rem", fontWeight: 600, letterSpacing: 0, textTransform: "none",
                    padding: "2px 8px", borderRadius: 6, border: "1px solid var(--rule)",
                    background: v.id === view ? "var(--signal)" : "var(--card)",
                    color: v.id === view ? "#fff" : "var(--muted)", cursor: "pointer",
                  }}
                >{v.label}</button>
              ))}
              <button
                type="button"
                onClick={() => setExpanded(true)}
                aria-label="Open the day timeline in a larger view"
                title="Open the day timeline in a larger view"
                style={{
                  fontSize: "0.68rem", fontWeight: 600, lineHeight: 1.2,
                  padding: "2px 7px", borderRadius: 6, border: "1px solid var(--rule)",
                  background: "var(--card)", color: "var(--muted)", cursor: "pointer",
                }}
              >⤢</button>
            </span>
          </span>
        )}
      </div>
      {loading && !dayActivities && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>}
      {dayActivities && dayActivities.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>No timer activity logged for this work day.</p>
      )}
      {hasEntries && view === "chart" && <DayTimeline dayActivities={dayActivities} clockInMs={clockInMs} statedHours={statedHours} />}
      {hasEntries && (
        <DayTimelineModal
          open={expanded}
          onClose={() => setExpanded(false)}
          dayActivities={dayActivities}
          clockInMs={clockInMs}
          statedHours={statedHours}
          memberName={memberName}
          workDate={workDate}
          requirements={requirements}
        />
      )}
      {hasEntries && view === "list" && (
        <ul className="flex flex-col gap-2">
          {dayActivities.map((a, i) => {
            // No end time = the timer is still running; tint the card with the
            // same warn amber the Timer hrs cells use for open timers.
            const open = !a.end;
            return (
              <li
                key={i}
                className="surface flex items-start justify-between gap-3 p-3"
                style={open ? { background: "#fdf6e6", borderColor: "#ecd9ab" } : undefined}
              >
                <div className="min-w-0">
                  <div className="text-sm font-medium" style={{ color: "var(--ink)" }}>
                    {a.siteName || a.task || "—"}
                  </div>
                  {a.task && a.siteName && (
                    <div className="text-xs" style={{ color: "var(--ink-soft)" }}>{a.task}</div>
                  )}
                  <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                    {rangeLabel(a.start, a.end, zone)} {zoneLabel(zone)}
                  </div>
                </div>
                <div className="shrink-0 text-right text-xs font-medium" style={{ color: "var(--ink-soft)" }}>
                  <div>{open ? <StatusPill tone="warn">open ⏱</StatusPill> : formatMinutes(a.durationMin)}</div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
