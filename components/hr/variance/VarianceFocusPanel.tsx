"use client";
import { useState } from "react";
import { personStats, type PersonStat, type VarianceRow } from "@/lib/hr/domain/variance-agg";
import { variancePctColor } from "@/lib/hr/domain/variance-color";
import type { DisplayGroup } from "@/lib/hr/domain/production-scope";
import { formatWorkDate } from "@/lib/time";
import { VarianceMemberBox } from "./VarianceMemberBox";

const BREACH_PCT = 15;

function initials(n: string): string {
  return n.split(" ").map((w) => w[0]).slice(0, 2).join("");
}

function RankRow({ rank, p, onClick }: { rank: number; p: PersonStat; onClick: () => void }) {
  const tier = p.medianVariancePct >= BREACH_PCT ? "red" : "ok";
  return (
    <div className="rankrow" onClick={onClick}>
      <div className="rk">{rank}</div>
      <div className="av">{initials(p.employeeName)}</div>
      <div className="nm">
        <div className="n">{p.employeeName}</div>
        <div className="s">
          {p.displayGroup} · {p.breachCount} breaching
        </div>
      </div>
      <div className="val" style={{ color: variancePctColor(p.medianVariancePct) }}>{p.medianVariancePct}%</div>
      <span className={`pill ${tier}`}>{tier === "red" ? "breaching" : "on-track"}</span>
    </div>
  );
}

/** Persistent right-rail content. Returns a FRAGMENT (not a wrapping div) so
 *  its children are direct flex children of `.rail` in variance.css -- that's
 *  what makes the top-10 "fill" list and the show-all scroll list work.
 *  Three states:
 *  - idle (no group, no person): org-wide "Top offenders", top 10 by default
 *    (fills the rail, no scroll), with a Show-all toggle that scrolls everyone.
 *  - group (no person): that group's people, ranked worst-first, scrolling.
 *  - person: breadcrumb + the day list (stated/worked bars), no sparkline. */
export function VarianceFocusPanel(props: {
  scopedRows: VarianceRow[]; // already scoped to scopeGroup/focusPerson (+ focusCell)
  scopeGroup: DisplayGroup | null;
  focusPerson: { empId: string; name: string } | null;
  cellLabel: string | null;
  onReset: () => void;
  onSelectGroup: (g: DisplayGroup) => void;
  onSelectCell: () => void;
  onSelectPerson: (empId: string) => void;
  onOpenDay: (taskDid: string) => void;
}) {
  const { scopedRows, scopeGroup, focusPerson, cellLabel } = props;
  const [showAll, setShowAll] = useState(false);

  const crumb = (
    <div className="crumb">
      <a onClick={props.onReset}>Overview</a>
      {scopeGroup && (
        <>
          <span className="sep">▸</span>
          {focusPerson ? <a onClick={() => props.onSelectGroup(scopeGroup)}>{scopeGroup}</a> : <b>{scopeGroup}</b>}
        </>
      )}
      {cellLabel && (
        <>
          <span className="sep">▸</span>
          {focusPerson ? <a onClick={props.onSelectCell}>{cellLabel}</a> : <b>{cellLabel}</b>}
        </>
      )}
      {focusPerson && (
        <>
          <span className="sep">▸</span>
          <b>{focusPerson.name}</b>
        </>
      )}
    </div>
  );

  // ---- idle: org-wide top offenders ----
  if (!scopeGroup && !focusPerson) {
    const ranked = personStats(scopedRows).sort((a, b) => b.medianVariancePct - a.medianVariancePct);
    const list = showAll ? ranked : ranked.slice(0, 10);
    return (
      <>
        <div className="rhead">
          <h3>Top offenders</h3>
        </div>
        <p className="rsub">
          {showAll
            ? "Everyone, worst first, by median variance %. Click anyone to drill."
            : "Worst 10 org-wide by median variance %. Click anyone to drill."}
        </p>
        <div className={`rank${showAll ? "" : " fill"}`}>
          {list.map((p, i) => (
            <RankRow key={p.empId} rank={i + 1} p={p} onClick={() => props.onSelectPerson(p.empId)} />
          ))}
        </div>
        <button className="showall" onClick={() => setShowAll((v) => !v)}>
          {showAll ? "Show top 10 only" : `Show all ${ranked.length} members ↓`}
        </button>
      </>
    );
  }

  // ---- group: ranked list of that group's people (scrolling, no fill) ----
  if (!focusPerson) {
    const ranked = personStats(scopedRows).sort((a, b) => b.medianVariancePct - a.medianVariancePct);
    return (
      <>
        {crumb}
        <h3 style={{ margin: "0 0 2px" }}>{scopeGroup} · {ranked.length} people{cellLabel ? ` · ${cellLabel}` : ""}</h3>
        <p className="ph-sub">Ranked by {cellLabel ? `variance % for ${cellLabel}` : "median variance % over the window"}. Click anyone.</p>
        <div className="rank">
          {ranked.map((p, i) => (
            <RankRow key={p.empId} rank={i + 1} p={p} onClick={() => props.onSelectPerson(p.empId)} />
          ))}
        </div>
      </>
    );
  }

  // ---- person: day list (scopedRows already scoped to this person + optional cell) ----
  // Show every day in the selected range (newest first); the list scrolls
  // (.daylist overflow:auto). No last-30 cap — that dropped older days (e.g. May)
  // even when the date filter included them.
  const days = [...scopedRows].sort((a, b) => (a.workDate < b.workDate ? 1 : -1));
  // Bar length reference: the longest stated day in view (min 8h), so a short
  // stated day reads as a shorter bar.
  const maxStated = Math.max(8, ...days.map((d) => d.statedHoursNet));
  return (
    <>
      {crumb}
      <div className="rhead"><h3>{focusPerson.name}</h3></div>
      <VarianceMemberBox days={days} />
      <p className="rsub">Bar = stated hours, green = worked, gap = variance. Click a day for the timeline.</p>
      <div className="legend">
        <span className="lg"><span className="sw" style={{ background: "#5aa17f" }} />worked (timed)</span>
        <span className="lg"><span className="sw" style={{ background: "#efc7bf" }} />variance gap</span>
      </div>
      <div className="daylist">
        {days.map((r) => {
          // Track width = stated relative to the longest day; fill = worked as a
          // share of stated (= coverage), so the uncovered remainder is the gap.
          const trackPct = Math.round((100 * r.statedHoursNet) / maxStated);
          const coverPct = Math.max(0, Math.min(100, Math.round((100 * r.timedHours) / Math.max(0.1, r.statedHoursNet))));
          return (
            <div key={r.taskDid} className={`dayrow ${r.breach ? "br" : ""}`} onClick={() => props.onOpenDay(r.taskDid)}>
              <div className="dt">{formatWorkDate(r.workDate)}</div>
              <div className="cov" title={`stated ${r.statedHoursNet}h, worked ${r.timedHours}h`}>
                <div className="cov-track" style={{ width: `${trackPct}%`, background: r.breach ? "#efc7bf" : "#e6eaef" }}>
                  <div className="cov-fill" style={{ width: `${coverPct}%` }} />
                </div>
              </div>
              <div className="dv">
                <span className="dv-hrs">{r.timedHours.toFixed(1)}/{r.statedHoursNet.toFixed(1)}h</span>
                <span className="dv-gap" style={{ color: variancePctColor(r.variancePct) }}>{r.varianceHours > 0 ? "+" : ""}{r.varianceHours.toFixed(1)}h · {r.variancePct}%</span>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
