"use client";

import { useRef, useState } from "react";
import { ApproveButton } from "@/components/approvals/ApproveButton";
import { ReportDetailDrawer } from "@/components/approvals/ReportDetailDrawer";
import { fetchReportForDrawer } from "@/app/(app)/approvals/actions";
import { toItem, type UnassignedReport, type MissingApproverItem } from "@/lib/hr/domain/missing-approver";
import type { SlaBucket } from "@/lib/hr/domain/approval-sla";
import type { PendingRow } from "@/lib/hr/queries/approval-queries";
import type { ReportDetail } from "@/lib/hr/queries/report-detail";

// Wait-day tone -> color. on_time stays neutral (a report waiting a day or two is
// not yet urgent), amber/red match the SLA palette the scorecard/queue use.
const TONE_COLOR: Record<SlaBucket, string> = {
  on_time: "var(--muted)",
  amber: "var(--warn)",
  red: "var(--bad)",
};

// A minimal PendingRow from the panel's slim item, so the drawer can OPEN
// instantly (like a browse-row click) while the authentic row + detail load in.
// The fields the panel doesn't carry are the drawer's own "—"/empty defaults;
// the fetched row replaces this within one round trip.
function stubRow(it: MissingApproverItem): PendingRow {
  return {
    empId: it.empId,
    employeeName: it.employeeName,
    email: it.memberEmail,
    carrierGroup: null,
    division: null,
    workDate: it.workDate,
    taskStatus: "submitted", // these are, by definition, submitted + un-assigned
    clockInEt: null,
    submittedOnEt: it.submittedOnEt,
    approvedOnEt: null,
    totalHours: null,
    assignedApprover: null,
    approvedBy: null,
    approvalLatencyDays: null,
    taskDid: it.taskDid,
    shiftTimeInPht: null,
    timedHours: null,
    openTimerCount: 0,
    hasTimerHistory: false,
    varianceHours: null,
    coveragePct: null,
    pendingWaitDays: it.pendingWaitDays,
  };
}

/**
 * "Missing approver" — the submitted daily reports from the lead's HR-assigned
 * members that were filed with no approver group set in the PM API, so they are
 * invisible to the lead's normal group queues. Clicking a row opens the same
 * report detail drawer DR Approval uses (entry details, requirements, the
 * "Worked on this day" timeline, in-drawer Approve); the row also carries a quick
 * Approve action. Approval in the PM API is per-report and group-agnostic,
 * so an un-assigned report approves fine. Renders nothing when the list is empty.
 */
export function MissingApproverPanel({
  reports,
  scopeAll,
  canApprove = false,
}: {
  reports: UnassignedReport[];
  scopeAll: boolean;
  canApprove?: boolean;
}) {
  const [items, setItems] = useState(() => reports.map(toItem));
  const remove = (taskDid: string) => setItems((prev) => prev.filter((i) => i.taskDid !== taskDid));

  // Drawer state. Opening stubs the row for an instant open, then a single
  // fetch replaces it with the authentic row + full detail.
  const [drawerRow, setDrawerRow] = useState<PendingRow | null>(null);
  const [drawerDetail, setDrawerDetail] = useState<ReportDetail | null>(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const cacheRef = useRef<Map<string, { row: PendingRow | null; detail: ReportDetail | null }>>(new Map());

  async function openDrawer(it: MissingApproverItem) {
    const cached = cacheRef.current.get(it.taskDid);
    if (cached) {
      setDrawerRow(cached.row ?? stubRow(it));
      setDrawerDetail(cached.detail);
      setDrawerLoading(false);
      return;
    }
    setDrawerRow(stubRow(it)); // open immediately
    setDrawerDetail(null);
    setDrawerLoading(true);
    try {
      const res = await fetchReportForDrawer(it.taskDid);
      cacheRef.current.set(it.taskDid, res);
      // Guard against a race: only apply if this row is still the open one.
      setDrawerRow((cur) => (cur && cur.taskDid === it.taskDid ? res.row ?? cur : cur));
      setDrawerDetail((_cur) => res.detail);
    } catch {
      /* keep the stub row; detail stays null and the drawer shows its empty state */
    } finally {
      setDrawerLoading(false);
    }
  }

  function closeDrawer() {
    setDrawerRow(null);
    setDrawerDetail(null);
    setDrawerLoading(false);
  }

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby="missing-approver-heading"
      className="surface p-5"
      style={{
        background: "color-mix(in srgb, var(--warn) 8%, var(--card))",
        borderColor: "color-mix(in srgb, var(--warn) 35%, var(--rule))",
      }}
    >
      <h2 id="missing-approver-heading" className="text-sm font-semibold" style={{ color: "var(--warn)" }}>
        Missing approver ({items.length})
      </h2>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        {scopeAll
          ? "Submitted reports filed with no approver group set in the PM API (all teams). Open a report to review it, or approve it directly."
          : "Your team's submitted reports filed with no approver group set in the PM API. Open a report to review it, or approve it directly."}
      </p>
      <div className="mt-3">
        {items.map((it, i) => (
          <div
            key={it.taskDid}
            className="flex items-center justify-between gap-3"
            style={{
              padding: "0.6rem 0.4rem",
              margin: "0 -0.4rem",
              borderTop: i === 0 ? undefined : "1px solid var(--rule)",
            }}
          >
            {/* Info region opens the detail drawer; the action buttons are
                separate siblings, so a button click never also opens it. */}
            <button
              type="button"
              onClick={() => openDrawer(it)}
              className="flex flex-1 items-center justify-between gap-3 text-left"
              style={{ minWidth: 0, background: "none", border: 0, padding: 0, cursor: "pointer" }}
              title="Open report detail"
            >
              <span style={{ minWidth: 0 }}>
                <span className="block text-sm hover:underline" style={{ color: "var(--ink)", fontWeight: 600 }}>
                  {it.employeeName ?? it.empId}
                </span>
                <span
                  className="block text-xs"
                  style={{ color: "var(--muted)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                >
                  {it.workDate} · {it.contextLabel}
                </span>
              </span>
              <span className="text-xs" style={{ color: TONE_COLOR[it.waitTone], fontWeight: 600, whiteSpace: "nowrap" }}>
                {it.waitLabel}
              </span>
            </button>
            <div className="flex items-center gap-3" style={{ whiteSpace: "nowrap" }}>
              <ApproveButton taskDid={it.taskDid} onApproved={remove} />
            </div>
          </div>
        ))}
      </div>

      {drawerRow && (
        <ReportDetailDrawer
          row={drawerRow}
          detail={drawerDetail}
          loading={drawerLoading && !drawerDetail}
          canApprove={canApprove}
          onClose={closeDrawer}
          onApproved={(did) => {
            cacheRef.current.delete(did);
            remove(did);
            closeDrawer();
          }}
        />
      )}
    </section>
  );
}
