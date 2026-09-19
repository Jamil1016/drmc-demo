"use client";

import { Fragment } from "react";
import type { BrowseRow } from "@/lib/hr/queries/approval-queries";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { NameCell } from "@/components/ui/Avatar";
import { formatPhtDate, formatWorkDate, formatZoned, formatZonedDateShort, formatZonedTime, weekendDayLabel } from "@/lib/time";
import { useDisplayZone } from "@/components/layout/DisplayZoneProvider";
import { failureTag } from "@/lib/hr/domain/bulk-approve";
import { approverGroupLabel } from "@/lib/hr/domain/approver-label";
import type { BatchFailure } from "@/lib/hr/queries/approval-batch";
import type { BrowseSort, BrowseSortKey, SortDir } from "@/lib/hr/domain/browse-sort";
import { ColumnHeader } from "@/components/ui/ColumnHeader";
import { buildBrowseColumns } from "@/lib/hr/domain/browse-columns";
import type { MultiOption } from "@/components/ui/MultiSelectFilter";
import { TimerHoursCell } from "@/components/hr/TimerHoursCell";
import { VarianceCell } from "@/components/hr/VarianceCell";
import { statedHoursNetOfBreak } from "@/lib/hr/domain/review-signals";

function statusTone(status: string): PillTone {
  const s = status.toLowerCase();
  if (s.includes("approv")) return "ok";
  if (s.includes("reject") || s.includes("declin")) return "bad";
  if (s.includes("submit") || s.includes("pending") || s.includes("review")) return "info";
  return "neutral";
}

export function EntryBrowseTable({
  rows,
  onSelect,
  selectedTaskDid,
  selectable = false,
  selectedDids,
  onToggle,
  onRangeSelect,
  onRowHover,
  onRowMove,
  onRowHoverEnd,
  approvedDids,
  failureByDid,
  sort,
  onSetSort,
  groupOptions,
  approverOptions,
}: {
  rows: BrowseRow[];
  onSelect?: (row: BrowseRow) => void;
  selectedTaskDid?: string | null;
  selectable?: boolean;
  selectedDids?: Set<string>;
  onToggle?: (taskDid: string, index: number) => void;
  onRangeSelect?: (index: number) => void;
  onRowHover?: (taskDid: string, x: number, y: number) => void;
  onRowMove?: (x: number, y: number) => void;
  onRowHoverEnd?: () => void;
  approvedDids?: Set<string>;
  failureByDid?: Map<string, BatchFailure>;
  sort?: BrowseSort | null;
  onSetSort?: (key: BrowseSortKey, dir: SortDir) => void;
  /** Division options for the Division header multi-select. */
  groupOptions?: string[];
  /** Approver-group options for the Approver header multi-select. */
  approverOptions?: MultiOption[];
}) {
  const { zone } = useDisplayZone();
  const columns = buildBrowseColumns(groupOptions ?? [], approverOptions ?? [], { zone });
  const colCount = columns.length + (selectable ? 1 : 0);
  return (
    <table className="data-table data-table--sticky">
        <thead>
          <tr>
            {selectable && <th style={{ width: 32 }} aria-label="Select" />}
            {columns.map((c) => (
              <ColumnHeader key={c.label} column={c} sort={sort} onSetSort={onSetSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            // Keep the header row (and its filter popovers) mounted on an empty
            // result so the user can loosen the filters right here instead of
            // losing the controls to a bare message.
            <tr>
              <td colSpan={colCount} className="text-sm" style={{ padding: "1rem", textAlign: "center", color: "var(--muted)" }}>
                No entries match.
              </td>
            </tr>
          )}
          {rows.map((r, index) => {
            // Flag a clock-in whose PHT calendar day differs from the work date
            // (overnight crossing midnight, or a mis-dated entry). Stays on PHT
            // regardless of the display zone: work_date is a PHT calendar day, so
            // comparing an ET date against it would flag nearly every row.
            const clockInDate = formatPhtDate(r.clockInEt);
            const dateMismatch = !!r.clockInEt && !!clockInDate && clockInDate !== r.workDate;
            const selected = selectedTaskDid === r.taskDid;
            const isApprovable = selectable && r.taskStatus.toLowerCase() === "submitted" && !approvedDids?.has(r.taskDid);
            const failure = failureByDid?.get(r.taskDid);
            // Weekend reports get a lavender wash (a different hue from the cyan
            // selection states, which still win) plus a Sat/Sun token next to the
            // date so the cue survives colour-blindness and screenshots.
            const weekend = weekendDayLabel(r.workDate);
            return (
              <Fragment key={r.taskDid}>
                <tr
                  // Plain click opens the detail drawer. Ctrl/Cmd+click is a selection
                  // gesture and never opens the drawer: it toggles this row's checkbox when
                  // the row is approvable, otherwise does nothing. Shift+click selects the
                  // range from the last checked row to this one.
                  onMouseDown={(e) => { if (selectable && e.shiftKey) e.preventDefault(); }}
                  onMouseEnter={(e) => onRowHover?.(r.taskDid, e.clientX, e.clientY)}
                  onMouseMove={(e) => onRowMove?.(e.clientX, e.clientY)}
                  onMouseLeave={() => onRowHoverEnd?.()}
                  onClick={(e) => {
                    if (selectable && e.shiftKey) { e.preventDefault(); onRangeSelect?.(index); return; }
                    if (selectable && (e.ctrlKey || e.metaKey)) { if (isApprovable) onToggle?.(r.taskDid, index); return; }
                    onSelect?.(r);
                  }}
                  data-selected={selected}
                  data-checked={selectable && selectedDids?.has(r.taskDid) ? "true" : undefined}
                  data-weekend={weekend ? "true" : undefined}
                  className={onSelect ? "row-clickable" : undefined}
                  style={failure ? { background: "var(--bad-wash, #fbecea)" } : undefined}
                >
                  {selectable && (
                    <td onClick={(e) => e.stopPropagation()}>
                      {approvedDids?.has(r.taskDid) ? (
                        <span title="Approved (syncing)" style={{ color: "var(--ok, #16a34a)" }}>✓</span>
                      ) : r.taskStatus.toLowerCase() === "submitted" ? (
                        <input
                          type="checkbox"
                          checked={selectedDids?.has(r.taskDid) ?? false}
                          onClick={(e) => { if (e.shiftKey) { e.preventDefault(); onRangeSelect?.(index); } }}
                          onChange={() => onToggle?.(r.taskDid, index)}
                        />
                      ) : (
                        // Not awaiting approval: show a muted placeholder rather than a
                        // disabled checkbox, so we never present a control that can't be used.
                        <span aria-hidden title="Only reports awaiting approval can be selected" style={{ color: "var(--muted-soft)" }}>—</span>
                      )}
                    </td>
                  )}
                  <td className="cell-strong"><NameCell name={r.employeeName ?? r.empId} /></td>
                  <td>{r.carrierGroup ?? "—"}</td>
                  <td className="whitespace-nowrap">
                    {formatWorkDate(r.workDate)}
                    {weekend && (
                      <span className="weekend-tag" title={`${weekend === "Sat" ? "Saturday" : "Sunday"} report`}>{weekend}</span>
                    )}
                  </td>
                  <td><StatusPill tone={statusTone(r.taskStatus)}>{r.taskStatus}</StatusPill></td>
                  <td
                    className="whitespace-nowrap"
                    title={dateMismatch ? `Clock-in date ${clockInDate} (PHT) differs from work date ${r.workDate}` : formatZoned(r.clockInEt, zone)}
                    style={dateMismatch ? { color: "var(--bad)", fontWeight: 600 } : undefined}
                  >
                    {formatZonedTime(r.clockInEt, zone) || "—"}
                  </td>
                  <td className="whitespace-nowrap" title={formatZoned(r.submittedOnEt, zone)}>{formatZonedDateShort(r.submittedOnEt, zone) || "—"}</td>
                  <td className="whitespace-nowrap" title={formatZoned(r.approvedOnEt, zone)}>{formatZonedDateShort(r.approvedOnEt, zone) || "—"}</td>
                  <td title={r.totalHours != null && statedHoursNetOfBreak(r.totalHours) !== r.totalHours ? `${r.totalHours.toFixed(1)}h stated − 1h break` : undefined}>
                    {statedHoursNetOfBreak(r.totalHours)?.toFixed(1) ?? "—"}
                  </td>
                  <td className="whitespace-nowrap"><TimerHoursCell timedHours={r.timedHours} openTimerCount={r.openTimerCount} hasTimerHistory={r.hasTimerHistory} hasTimeIn={!!r.clockInEt} /></td>
                  <td className="whitespace-nowrap"><VarianceCell varianceHours={r.varianceHours} coveragePct={r.coveragePct} /></td>
                  <td title={r.assignedApprover ?? undefined}>
                    <span style={{ display: "block", maxWidth: "13rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {approverGroupLabel(r.assignedApprover) ?? "—"}
                    </span>
                  </td>
                  <td>{r.approvedBy ?? "—"}</td>
                </tr>
                {failure && (
                  <tr>
                    <td colSpan={colCount} style={{ background: "var(--bad-wash, #fbecea)", padding: "6px 12px 10px 40px", borderBottom: "1px solid #f0d4cf" }}>
                      <span style={{ fontFamily: "var(--font-mono), monospace", fontSize: "0.73rem", color: "var(--bad)" }}>
                        <span style={{ fontWeight: 700, marginRight: 8, textTransform: "uppercase" }}>{failureTag(failure.retryable)}</span>
                        {failure.reason}
                      </span>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
    </table>
  );
}
