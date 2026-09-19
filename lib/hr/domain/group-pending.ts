import type { PendingRow } from "./types";

export type EmployeePending = {
  empId: string;
  employeeName: string | null;
  count: number;
  longestWaitDays: number;
  entries: PendingRow[];
};

/** Group awaiting reports by employee. count = pending entries, longestWaitDays =
 *  max pendingWaitDays (null treated as 0). Entries keep input order (oldest-first).
 *  Sorted most-urgent first: longest wait desc, then count desc, then name/id. */
export function groupPendingByEmployee(rows: PendingRow[]): EmployeePending[] {
  const map = new Map<string, EmployeePending>();
  for (const r of rows) {
    const g = map.get(r.empId) ?? { empId: r.empId, employeeName: r.employeeName, count: 0, longestWaitDays: 0, entries: [] };
    g.count++;
    g.entries.push(r);
    const w = r.pendingWaitDays ?? 0;
    if (w > g.longestWaitDays) g.longestWaitDays = w;
    if (!g.employeeName && r.employeeName) g.employeeName = r.employeeName;
    map.set(r.empId, g);
  }
  return [...map.values()].sort(
    (a, b) =>
      b.longestWaitDays - a.longestWaitDays ||
      b.count - a.count ||
      (a.employeeName ?? a.empId).localeCompare(b.employeeName ?? b.empId),
  );
}
