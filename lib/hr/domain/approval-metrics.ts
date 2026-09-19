import { bucketFor } from "./approval-sla";

export type QueueRow = {
  empId: string;
  employeeName: string | null;
  carrierGroup: string | null;
  division: string | null;
  workDate: string;
  taskDid: string;
  submittedOnEt: string | null;
  pendingWaitDays: number | null;
  assignedApprover: string | null;
  noApproverFlag: boolean;
  totalHours: number | null;
  clockInEt: string | null;
};

export function summarizeQueue(rows: QueueRow[]) {
  let amber = 0, red = 0, oldestWaitDays = 0, noApprover = 0;
  for (const r of rows) {
    const b = bucketFor(r.pendingWaitDays);
    if (b === "amber") amber++;
    if (b === "red") red++;
    if (r.noApproverFlag) noApprover++;
    if ((r.pendingWaitDays ?? 0) > oldestWaitDays) oldestWaitDays = r.pendingWaitDays ?? 0;
  }
  return { awaiting: rows.length, amber, red, oldestWaitDays, noApprover };
}

export function groupBacklog(rows: QueueRow[]) {
  const map = new Map<string, { group: string; waiting: number; amber: number; red: number }>();
  for (const r of rows) {
    const key = r.assignedApprover ?? "(unassigned)";
    const g = map.get(key) ?? { group: key, waiting: 0, amber: 0, red: 0 };
    g.waiting++;
    const b = bucketFor(r.pendingWaitDays);
    if (b === "amber") g.amber++;
    if (b === "red") g.red++;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => b.waiting - a.waiting);
}
