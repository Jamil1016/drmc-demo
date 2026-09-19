"use client";

import { useState } from "react";
import type { ScorecardRow } from "@/lib/hr/queries/approval-queries";
import {
  onTimePct,
  decidedCount,
  distribution,
  rateTier,
  rankScorecard,
  sortScorecard,
  type ScorecardSortKey,
  type SortDir,
} from "@/lib/hr/domain/scorecard-metrics";
import { bucketFor } from "@/lib/hr/domain/approval-sla";
import { GroupPendingPanel } from "@/components/approvals/GroupPendingPanel";

// Map a compliance tier to the accent color used for the row edge + tinted numbers.
const TIER_COLOR: Record<"on_time" | "amber" | "red", string> = {
  on_time: "var(--ok, #10b981)",
  amber: "var(--warn, #f59e0b)",
  red: "var(--bad, #ef4444)",
};
const TIER_INK: Record<"on_time" | "amber" | "red", string> = {
  on_time: "#0a7a52",
  amber: "#8a5a00",
  red: "#b23b30",
};

// Deterministic initials for a group label (first two significant chars).
function initials(label: string): string {
  const cleaned = label.replace(/[^A-Za-z0-9 ]/g, " ").trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

type SortState = { key: ScorecardSortKey; dir: SortDir };

// First-click direction per column: names read A->Z, metrics show highest first.
const DEFAULT_DIR: Record<ScorecardSortKey, SortDir> = {
  group: "asc",
  employees: "desc",
  pending: "desc",
  approved: "desc",
  onTime: "desc",
  avgLag: "desc",
};

// A column header with a hover explanation. When `sortKey` is set the header is
// a sort control: click to sort by it, click again to flip direction.
function Th({
  label, hint, align = "left", width, sortKey, sort, onSort,
}: {
  label: string;
  hint: string;
  align?: "left" | "right";
  width?: string;
  sortKey?: ScorecardSortKey;
  sort?: SortState | null;
  onSort?: (key: ScorecardSortKey) => void;
}) {
  const labelSpan = (
    <span style={{ textDecoration: "underline dotted var(--muted-soft)", textUnderlineOffset: "3px" }}>{label}</span>
  );
  if (!sortKey) {
    return (
      <th style={{ textAlign: align, width }}>
        <span title={hint} style={{ cursor: "help", textDecoration: "underline dotted var(--muted-soft)", textUnderlineOffset: "3px" }}>
          {label}
        </span>
      </th>
    );
  }
  const active = sort?.key === sortKey;
  return (
    <th style={{ textAlign: align, width }} aria-sort={active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"}>
      <button
        type="button"
        title={hint}
        onClick={() => onSort!(sortKey)}
        style={{
          display: "inline-flex", alignItems: "center", gap: "0.3rem",
          flexDirection: align === "right" ? "row-reverse" : "row",
          background: "none", border: 0, padding: 0, margin: 0,
          font: "inherit", color: "inherit", cursor: "pointer",
        }}
      >
        {labelSpan}
        <span aria-hidden style={{ fontSize: "0.7em", lineHeight: 1, color: active ? "var(--ink)" : "var(--muted-soft)", opacity: active ? 1 : 0.4 }}>
          {active ? (sort!.dir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
  );
}

export function ApproverScorecardTable({ rows, from, to, canApprove = false, initialGroup }: { rows: ScorecardRow[]; from?: string; to?: string; canApprove?: boolean; initialGroup?: string }) {
  // Deep-link support: opening the page with ?group=<groupLabel> (e.g. from the
  // Home "Your groups" breakdown) opens that group's panel immediately. A label
  // that matches no row is a no-op rather than an error.
  const [selected, setSelected] = useState<ScorecardRow | null>(() =>
    initialGroup ? rows.find((r) => r.groupLabel === initialGroup) ?? null : null,
  );
  // null = default order (slowest first by avg lag); a key = user-chosen sort.
  const [sort, setSort] = useState<SortState | null>(null);

  const onSort = (key: ScorecardSortKey) =>
    setSort((prev) =>
      prev?.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { key, dir: DEFAULT_DIR[key] },
    );

  if (rows.length === 0) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>No approvals in this range.</p>;
  }
  const ordered = sort ? sortScorecard(rows, sort.key, sort.dir) : rankScorecard(rows);
  return (
    <div className="surface table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <Th label="#" hint="Position in the current sort order. Default: slowest group first by average approval lag." width="2.5rem" />
            <Th label="Approver group" hint="The approver group a daily report is assigned to, and how many individuals approve for it. Click to sort A to Z." sortKey="group" sort={sort} onSort={onSort} />
            <Th label="Employees" hint="Distinct employees who have a report submitted and awaiting approval in this group. Windowed the same way as Pending. A dash means none are waiting. Click to sort." align="right" sortKey="employees" sort={sort} onSort={onSort} />
            <Th label="Pending" hint="Reports awaiting approval. With no date filter this is the current backlog; with a filter it counts reports submitted in the range. Click a row to see who is waiting. Click the header to sort." align="right" sortKey="pending" sort={sort} onSort={onSort} />
            <Th label="Approved" hint="Reports approved in the selected date range (all time when no filter is set). Click to sort." align="right" sortKey="approved" sort={sort} onSort={onSort} />
            <Th label="On-time vs the 2-day window" hint="Share of decided reports approved within 2 days of submission, green, vs late — approved after it or unapproved past it, red. Reports still within their window, and reports the employee filed after the deadline, are excluded. Hover the bar for raw counts. Click to sort by on-time percentage." sortKey="onTime" sort={sort} onSort={onSort} />
            <Th label="Avg lag" hint="Secondary: average days from employee submit to lead approval (responsiveness), over the selected range. Green is 3 or less, amber 4 to 7, red over 7. Click to sort." align="right" sortKey="avgLag" sort={sort} onSort={onSort} />
          </tr>
        </thead>
        <tbody>
          {ordered.map((r, i) => {
            const pct = onTimePct(r);
            const tier = rateTier(pct);          // row accent = on-time approval tier
            const lagTier = bucketFor(r.avgLatencyDays); // secondary responsiveness tint
            const d = distribution(r);
            const noApprover = r.groupLabel === "(no approver assigned)";
            return (
              <tr
                key={r.groupLabel}
                onClick={() => setSelected(r)}
                style={{ cursor: "pointer" }}
                title="Click to see who is waiting"
              >
                <td style={{ boxShadow: tier === "on_time" ? undefined : `inset 3px 0 0 ${TIER_COLOR[tier]}`, fontVariantNumeric: "tabular-nums", color: "var(--muted-soft)" }}>
                  {i + 1}
                </td>
                <td>
                  <div className="flex items-center gap-3">
                    <span
                      className="flex items-center justify-center"
                      style={{ width: 30, height: 30, borderRadius: 8, flexShrink: 0, fontSize: "0.68rem", fontWeight: 700, color: "#fff", background: noApprover ? "#94a3b8" : TIER_COLOR[tier] }}
                    >
                      {noApprover ? "?" : initials(r.displayLabel)}
                    </span>
                    <div>
                      <div className="cell-strong" style={noApprover ? { color: "var(--muted)" } : undefined}>{r.displayLabel}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--muted)" }}>
                        {r.approvers} {r.approvers === 1 ? "approver" : "approvers"}
                      </div>
                    </div>
                  </div>
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {r.pendingEmployees > 0
                    ? <span style={{ fontWeight: 600, color: "#8a5a00" }}>{r.pendingEmployees} waiting</span>
                    : <span style={{ color: "var(--muted-soft)" }}>—</span>}
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, color: r.pending > 50 ? "#b23b30" : r.pending > 10 ? "#8a5a00" : "var(--ink)" }}>
                  {r.pending}
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.approvedCount.toLocaleString()}</td>
                <td>
                  <div
                    className="flex items-center gap-2"
                    style={{ minWidth: 200, cursor: decidedCount(r) > 0 ? "help" : undefined }}
                    title={decidedCount(r) > 0
                      ? `${r.onTimeCount} on time · ${r.lateCount} late (vs the 2-day window) · ${decidedCount(r)} decided${r.filedLateCount > 0 ? ` · ${r.filedLateCount} filed late (excluded)` : ""}`
                      : undefined}
                  >
                    <span style={{ flex: 1, height: 9, borderRadius: 999, overflow: "hidden", display: "flex", background: "var(--paper-deep, #eef2f6)" }}>
                      <span style={{ width: `${d.ok}%`, background: TIER_COLOR.on_time }} />
                      <span style={{ width: `${d.late}%`, background: TIER_COLOR.red }} />
                    </span>
                    <span style={{ width: "3rem", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, fontSize: "0.82rem", color: pct == null ? "var(--muted-soft)" : TIER_INK[tier] }}>
                      {pct == null ? "n/a" : `${pct}%`}
                    </span>
                  </div>
                </td>
                <td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: lagTier === "red" ? 700 : 600, color: r.avgLatencyDays == null ? "var(--muted-soft)" : TIER_INK[lagTier] }}>
                  {r.avgLatencyDays ?? "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {selected && (
        <GroupPendingPanel
          key={selected.groupLabel}
          groupLabel={selected.groupLabel}
          displayLabel={selected.displayLabel}
          summary={selected}
          from={from}
          to={to}
          canApprove={canApprove}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
