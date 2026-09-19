import { bucketFor, type SlaBucket } from "./approval-sla";

// Pure domain for the Home "Missing approver" panel: the submitted daily reports
// with no approver assigned that belong to a lead's roster (see the
// dr_unassigned_reports_for_email RPC). Kept free of any DB / React so the
// display shaping is testable on its own.

/** One un-assigned report row, camelCased from the RPC. */
export type UnassignedReport = {
  taskDid: string;
  empId: string;
  employeeName: string | null;
  memberEmail: string | null;
  /** yyyy-mm-dd (the report's work date). */
  workDate: string;
  assetName: string | null;
  milestone: string | null;
  /** ET timestamp string, or null. */
  submittedOnEt: string | null;
  pendingWaitDays: number | null;
};

/** A row shaped for display: wait label + SLA tone + a compact asset·milestone line. */
export type MissingApproverItem = UnassignedReport & {
  waitLabel: string;
  waitTone: SlaBucket;
  contextLabel: string;
};

/** "1d waiting" / "12d waiting"; a dash when the wait is unknown (never "0d"). */
export function waitLabel(days: number | null): string {
  if (days === null) return "—";
  return `${days}d waiting`;
}

/** "Asset · 07. July", or just the part present, or "—" when both are blank. */
export function contextLabel(assetName: string | null, milestone: string | null): string {
  const parts = [assetName, milestone].filter(
    (s): s is string => typeof s === "string" && s.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function toItem(r: UnassignedReport): MissingApproverItem {
  return {
    ...r,
    waitLabel: waitLabel(r.pendingWaitDays),
    waitTone: bucketFor(r.pendingWaitDays),
    contextLabel: contextLabel(r.assetName, r.milestone),
  };
}
