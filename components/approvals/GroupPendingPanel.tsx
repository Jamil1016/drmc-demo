"use client";

import { useEffect, useRef, useState } from "react";
import type { PendingRow, ScorecardRow, GroupApprover } from "@/lib/hr/queries/approval-queries";
import { onTimePct, distribution, rateTier } from "@/lib/hr/domain/scorecard-metrics";
import type { ReportDetail } from "@/lib/hr/queries/report-detail";
import { groupPendingByEmployee, type EmployeePending } from "@/lib/hr/domain/group-pending";
import { bucketFor } from "@/lib/hr/domain/approval-sla";
import { fetchGroupPending, fetchReportDetail, fetchGroupApprovers } from "@/app/(app)/approvals/actions";
import { getOrFetch, DETAIL_WARM_MS } from "@/lib/hr/domain/detail-cache";
import { ReportDetailBody } from "@/components/approvals/ReportDetailBody";
import { Avatar } from "@/components/ui/Avatar";
import { formatWorkDate, formatZonedDateShort } from "@/lib/time";
import { useDisplayZone } from "@/components/layout/DisplayZoneProvider";
import { PmTaskLink } from "@/components/demo/PmTaskLink";
import { useApprovalBatch } from "./useApprovalBatch";
import { failureTag } from "@/lib/hr/domain/bulk-approve";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ApproveButton } from "./ApproveButton";

const TIER_INK: Record<"on_time" | "amber" | "red", string> = {
  on_time: "#0a7a52", amber: "#8a5a00", red: "#b23b30",
};

export function GroupPendingPanel({
  groupLabel, displayLabel, summary, from, to, canApprove = false, onClose,
}: {
  groupLabel: string; displayLabel: string; summary: ScorecardRow; from?: string; to?: string; canApprove?: boolean; onClose: () => void;
}) {
  const [rows, setRows] = useState<PendingRow[] | null>(null);
  const [error, setError] = useState(false);
  const [emp, setEmp] = useState<EmployeePending | null>(null);            // View 2
  const [entry, setEntry] = useState<PendingRow | null>(null);             // View 3
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [approvers, setApprovers] = useState<GroupApprover[] | null>(null);
  const [approversOpen, setApproversOpen] = useState(false);
  const [selectedDids, setSelectedDids] = useState<Set<string>>(new Set());
  const [approvedSet, setApprovedSet] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkTargets, setBulkTargets] = useState<string[]>([]);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const { start: startBatch, retry: retryBatch, resume: resumeBatch, running: bulkRunning, progress: bulkProgress, failures, error: bulkDriveError, alreadyCount } = useApprovalBatch();
  const { zone } = useDisplayZone();
  // Full-detail promise cache, warmed when the pointer rests on an entry row so
  // opening it (View 3) renders complete (same pattern as Browse).
  const detailCacheRef = useRef<Map<string, Promise<ReportDetail | null>>>(new Map());
  const warmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (warmTimerRef.current) clearTimeout(warmTimerRef.current); }, []);

  function onEntryHover(taskDid: string) {
    if (warmTimerRef.current) clearTimeout(warmTimerRef.current);
    warmTimerRef.current = setTimeout(() => {
      void getOrFetch(detailCacheRef.current, taskDid, () => fetchReportDetail(taskDid)).catch(() => {});
    }, DETAIL_WARM_MS);
  }
  function onEntryHoverEnd() {
    if (warmTimerRef.current) clearTimeout(warmTimerRef.current);
  }

  function toggleDid(did: string) {
    setSelectedDids((prev) => {
      const next = new Set(prev);
      if (next.has(did)) next.delete(did); else next.add(did);
      return next;
    });
  }
  function markApproved(dids: string[]) {
    dids.forEach((d) => detailCacheRef.current.delete(d)); // approved: cached detail is stale
    setApprovedSet((prev) => new Set([...prev, ...dids]));
    setSelectedDids(new Set());
  }
  async function doBulkApprove() {
    setBulkError(null);
    const out = await startBatch(bulkTargets);
    setConfirmOpen(false);
    if (out.error) { setBulkError(out.error); return; }
    markApproved(out.alreadyApproved);
  }

  // Close on Escape, unless the confirm dialog is open (then Escape belongs to it,
  // otherwise it would close the whole panel out from under the dialog).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !confirmOpen) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, confirmOpen]);

  // Load the group's awaiting reports once.
  useEffect(() => {
    let live = true;
    setRows(null); setError(false);
    fetchGroupPending(groupLabel, from, to)
      .then((r) => { if (live) setRows(r); })
      .catch(() => { if (live) setError(true); });
    return () => { live = false; };
  }, [groupLabel, from, to]);

  // Who approves for this group (all-time). Non-fatal if it fails.
  useEffect(() => {
    let live = true;
    setApprovers(null);
    fetchGroupApprovers(groupLabel)
      .then((a) => { if (live) setApprovers(a); })
      .catch(() => { if (live) setApprovers([]); });
    return () => { live = false; };
  }, [groupLabel]);

  // Fetch detail when an entry is opened (View 3).
  useEffect(() => {
    if (!entry) return;
    let live = true;
    setDetail(null); setDetailLoading(true);
    getOrFetch(detailCacheRef.current, entry.taskDid, () => fetchReportDetail(entry.taskDid))
      .then((d) => { if (live) setDetail(d); })
      .catch(() => {})
      .finally(() => { if (live) setDetailLoading(false); });
    return () => { live = false; };
  }, [entry]);

  const employees = rows ? groupPendingByEmployee(rows) : [];
  const total = rows?.length ?? 0;
  const retryableCount = failures.filter((f) => f.retryable).length;
  const view: "employees" | "entries" | "detail" = entry ? "detail" : emp ? "entries" : "employees";

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} aria-hidden />
      <aside className="drawer-panel" role="dialog" aria-label="Pending approvals" style={{ width: "min(540px, calc(94vw / var(--app-zoom, 1)))" }}>
        {/* Header with back navigation */}
        <div className="flex items-center justify-between gap-3 border-b p-5" style={{ borderColor: "var(--rule)" }}>
          <div className="flex items-center gap-2 min-w-0">
            {view !== "employees" && (
              <button
                onClick={() => (entry ? setEntry(null) : setEmp(null))}
                className="text-lg leading-none"
                style={{ color: "var(--muted)" }}
                aria-label="Back"
              >←</button>
            )}
            <div className="min-w-0">
              <div className="font-semibold truncate" style={{ color: "var(--ink)" }}>
                {view === "employees" ? displayLabel : view === "entries" ? (emp!.employeeName ?? emp!.empId) : (entry!.employeeName ?? entry!.empId)}
              </div>
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                {view === "employees" && `${total} awaiting approval`}
                {view === "entries" && `${emp!.count} awaiting · longest wait ${emp!.longestWaitDays}d`}
                {view === "detail" && `Work date ${formatWorkDate(entry!.workDate)}`}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-lg leading-none" style={{ color: "var(--muted)" }} aria-label="Close">✕</button>
        </div>

        {/* Body */}
        {view === "employees" && (
          <div className="flex flex-col gap-2 p-5">
            {/* Group summary + approvers (View 1 only) */}
            <div className="surface p-3" style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "1.25rem", alignItems: "center" }}>
                <Stat label="Avg lag" value={summary.avgLatencyDays == null ? "—" : `${summary.avgLatencyDays}d`} tint={bucketFor(summary.avgLatencyDays)} />
                <Stat label="On-time" value={onTimePct(summary) == null ? "n/a" : `${onTimePct(summary)}%`} tint={rateTier(onTimePct(summary))} />
                {(() => {
                  const totalCohort = summary.approvedCount + summary.pending;
                  const pct = totalCohort > 0 ? Math.round((summary.approvedCount / totalCohort) * 100) : null;
                  const ink = pct == null ? "var(--ink)" : pct >= 90 ? "#0a7a52" : pct >= 60 ? "#8a5a00" : "#b23b30";
                  return (
                    <div title="Reports submitted in this range that are approved, out of those needing approval (approved + still waiting).">
                      <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>Approved</div>
                      <div style={{ fontSize: "1.05rem", fontWeight: 700, color: ink, fontVariantNumeric: "tabular-nums" }}>
                        {totalCohort === 0 ? "—" : <>{summary.approvedCount}/{totalCohort}<span style={{ fontSize: "0.8rem", fontWeight: 600, marginLeft: "0.35rem" }}>({pct}%)</span></>}
                      </div>
                    </div>
                  );
                })()}
                <div style={{ flex: 1, minWidth: 120 }}>
                  <span style={{ display: "flex", height: 8, borderRadius: 999, overflow: "hidden", background: "var(--paper-deep, #eef2f6)" }}>
                    <span style={{ width: `${distribution(summary).ok}%`, background: "var(--ok, #10b981)" }} />
                    <span style={{ width: `${distribution(summary).late}%`, background: "var(--bad, #ef4444)" }} />
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>
                  Approvers{approvers && approvers.length > 0 ? ` (${approvers.length})` : ""}
                </div>
                {approvers === null && <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Loading…</div>}
                {approvers && approvers.length === 0 && <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>No approvers on record.</div>}
                {approvers && approvers.length > 0 && (
                  <>
                    <ul style={{ display: "flex", flexDirection: "column", gap: "0.15rem", margin: 0, padding: 0, listStyle: "none" }}>
                      {(approversOpen ? approvers : approvers.slice(0, 3)).map((a) => (
                        <li key={a.name} style={{ fontSize: "0.82rem", color: "var(--ink-soft)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</li>
                      ))}
                    </ul>
                    {approvers.length > 3 && (
                      <button
                        type="button"
                        onClick={() => setApproversOpen((v) => !v)}
                        style={{ alignSelf: "flex-start", fontSize: "0.75rem", fontWeight: 600, color: "var(--signal, #0e7490)", cursor: "pointer", background: "none", border: 0, padding: 0 }}
                      >
                        {approversOpen ? "Show less" : `See all ${approvers.length}`}
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
            {rows === null && !error && <p className="text-sm" style={{ color: "var(--muted)" }}>Loading…</p>}
            {error && <p className="text-sm" style={{ color: "var(--bad, #b23b30)" }}>Couldn&apos;t load the waiting list.</p>}
            {rows && employees.length === 0 && <p className="text-sm" style={{ color: "var(--muted)" }}>No reports awaiting approval in this range.</p>}
            {employees.map((e) => {
              const tier = bucketFor(e.longestWaitDays);
              return (
                <button
                  key={e.empId}
                  onClick={() => setEmp(e)}
                  className="surface flex items-center justify-between gap-3 p-3 text-left"
                  style={{ cursor: "pointer" }}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar name={e.employeeName ?? e.empId} />
                    <div className="min-w-0">
                      <div className="cell-strong truncate">{e.employeeName ?? e.empId}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>{e.count} {e.count === 1 ? "entry" : "entries"}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-sm font-semibold" style={{ color: TIER_INK[tier] }}>
                    {e.longestWaitDays}d
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {view === "entries" && emp && (
          <div className="flex flex-col gap-2 p-5">
            {/* Bulk bar */}
            {canApprove && (() => {
              const approvable = emp.entries.filter((r) => !approvedSet.has(r.taskDid));
              const allSelected = approvable.length > 0 && approvable.every((r) => selectedDids.has(r.taskDid));
              return (
                <div className="flex items-center justify-between gap-3 pb-1">
                  <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={(e) => setSelectedDids(e.target.checked ? new Set(approvable.map((r) => r.taskDid)) : new Set())}
                    />
                    Select all ({approvable.length})
                  </label>
                  {(selectedDids.size > 0 || retryableCount > 0 || bulkRunning) && (
                    <button className="btn-ghost" style={{ color: "var(--signal)", borderColor: "var(--signal)", opacity: bulkRunning ? 0.5 : undefined }} disabled={bulkRunning}
                      onClick={() => { if (retryableCount > 0) { void retryBatch(); } else { setBulkTargets([...selectedDids]); setConfirmOpen(true); } }}>
                      {bulkRunning
                        ? `Approving ${bulkProgress.done}/${bulkProgress.total}…`
                        : retryableCount > 0 ? `Retry ${retryableCount} selected` : `Approve ${selectedDids.size} selected`}
                    </button>
                  )}
                </div>
              );
            })()}

            {emp.entries.map((r) => {
              const tier = bucketFor(r.pendingWaitDays);
              const isApproved = approvedSet.has(r.taskDid);
              return (
                <div key={r.taskDid} className="surface flex items-center justify-between gap-3 p-3" onMouseEnter={() => onEntryHover(r.taskDid)} onMouseLeave={onEntryHoverEnd}>
                  <div className="flex min-w-0 items-center gap-3">
                    {canApprove && !isApproved && (
                      <input type="checkbox" checked={selectedDids.has(r.taskDid)} onChange={() => toggleDid(r.taskDid)} />
                    )}
                    <button onClick={() => setEntry(r)} className="min-w-0 text-left" style={{ cursor: "pointer" }}>
                      <div className="cell-strong">{formatWorkDate(r.workDate)}</div>
                      <div className="text-xs" style={{ color: "var(--muted)" }}>
                        Submitted {formatZonedDateShort(r.submittedOnEt, zone)} · <span style={{ color: TIER_INK[tier] }}>{r.pendingWaitDays ?? 0}d waiting</span>
                      </div>
                    </button>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {canApprove && (isApproved ? (
                      <span className="text-xs" style={{ color: "var(--ok, #16a34a)" }}>Approved (syncing)</span>
                    ) : (
                      <ApproveButton taskDid={r.taskDid} onApproved={(did) => markApproved([did])} />
                    ))}
                    <PmTaskLink label="PM system ↗" />
                  </div>
                </div>
              );
            })}

            {bulkError && <p role="alert" className="text-xs" style={{ color: "var(--bad)" }}>{bulkError}</p>}
            {bulkDriveError && (
              <div role="alert" className="flex items-center justify-between gap-3 text-xs" style={{ color: "var(--bad)" }}>
                <span>{bulkDriveError}</span>
                <button className="btn-ghost shrink-0" style={{ color: "var(--signal)", borderColor: "var(--signal)" }} disabled={bulkRunning} onClick={() => void resumeBatch()}>Resume</button>
              </div>
            )}
            {!bulkRunning && alreadyCount > 0 && (
              <p className="text-xs" style={{ color: "var(--ok)" }}>
                {alreadyCount} {alreadyCount === 1 ? "was" : "were"} already approved in the PM API, so {alreadyCount === 1 ? "it's" : "they're"} marked approved here. Nothing to fix.
              </p>
            )}
            {failures.length > 0 && (
              <div className="flex flex-col gap-2">
                <p role="alert" className="text-xs" style={{ color: "var(--bad)" }}>
                  {failures.length} couldn&apos;t be approved.{retryableCount > 0 ? " Use Retry above to try the retryable ones again." : " See the reasons below."}
                </p>
                {failures.map((f) => (
                  <div key={f.taskDid} className="surface flex items-center justify-between gap-3 p-3" style={{ borderColor: "var(--bad)" }}>
                    <div className="min-w-0">
                      <div className="cell-strong">{f.employeeName ?? f.taskDid}</div>
                      <div className="text-xs" style={{ color: "var(--bad)" }}>
                        <span style={{ fontWeight: 700, marginRight: 6 }}>{failureTag(f.retryable)}</span>{f.reason}
                      </div>
                    </div>
                    <PmTaskLink label="PM system ↗" />
                  </div>
                ))}
              </div>
            )}

            <ConfirmDialog
              open={confirmOpen}
              title="Approve in the PM API"
              body={`Approve ${bulkTargets.length} report(s) as you. The PM API behind this demo is simulated; the approvals themselves are real writes to the demo database and are reset nightly.`}
              confirmLabel={`Approve ${bulkTargets.length}`}
              busy={bulkRunning}
              onConfirm={doBulkApprove}
              onCancel={() => setConfirmOpen(false)}
            />
          </div>
        )}

        {view === "detail" && entry && (
          <ReportDetailBody row={entry} detail={detail} loading={detailLoading} canApprove={canApprove} />
        )}
      </aside>
    </>
  );
}

function Stat({ label, value, tint }: { label: string; value: string; tint?: "on_time" | "amber" | "red" }) {
  const ink = tint === "red" ? "#b23b30" : tint === "amber" ? "#8a5a00" : tint === "on_time" ? "#0a7a52" : "var(--ink)";
  return (
    <div>
      <div style={{ fontSize: "0.68rem", color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.03em" }}>{label}</div>
      <div style={{ fontSize: "1.05rem", fontWeight: 700, color: ink, fontVariantNumeric: "tabular-nums" }}>{value}</div>
    </div>
  );
}
