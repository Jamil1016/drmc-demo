import { bucketFor } from "@/lib/hr/domain/approval-sla";
import type { QueueRow } from "@/lib/hr/domain/approval-metrics";
import { PmTaskLink } from "@/components/demo/PmTaskLink";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { NameCell } from "@/components/ui/Avatar";
import { formatWorkDate, formatZonedDateShort, zoneLabel, type DisplayZone } from "@/lib/time";
import { approverGroupLabel } from "@/lib/hr/domain/approver-label";

const BUCKET_TONE: Record<string, PillTone> = {
  on_time: "neutral",
  amber: "warn",
  red: "bad",
};

export function ApprovalQueueTable({ rows, zone = "PHT" }: { rows: QueueRow[]; zone?: DisplayZone }) {
  if (rows.length === 0) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>Nothing awaiting approval.</p>;
  }
  return (
    <div className="surface table-scroll">
      <table className="data-table">
        <thead>
          <tr>
            <th>Employee</th>
            <th>Group</th>
            <th>Division</th>
            <th>Work date</th>
            <th>Submitted ({zoneLabel(zone)})</th>
            <th>Days waiting</th>
            <th>Approver group</th>
            <th>Hours</th>
            <th>PM system</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.taskDid}>
              <td className="cell-strong"><NameCell name={r.employeeName ?? r.empId} /></td>
              <td>{r.carrierGroup ?? "—"}</td>
              <td>{r.division ?? "—"}</td>
              <td className="whitespace-nowrap">{formatWorkDate(r.workDate)}</td>
              <td className="whitespace-nowrap">{formatZonedDateShort(r.submittedOnEt, zone) || "—"}</td>
              <td>
                <StatusPill tone={BUCKET_TONE[bucketFor(r.pendingWaitDays)]}>
                  {r.pendingWaitDays ?? 0}
                </StatusPill>
              </td>
              <td>
                {r.noApproverFlag ? (
                  <StatusPill tone="warn">none assigned</StatusPill>
                ) : (
                  <span title={r.assignedApprover ?? undefined}>{approverGroupLabel(r.assignedApprover) ?? "—"}</span>
                )}
              </td>
              <td>{r.totalHours ?? "—"}</td>
              <td>
                <PmTaskLink label="Open" bare />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
