import Link from "next/link";
import type { DirectoryRow } from "@/lib/hr/domain/types";
import { groupBy } from "@/lib/hr/domain/group";
import { bySeniorityThenName } from "@/lib/hr/domain/position-rank";
import { GroupBar } from "@/components/ui/GroupBar";
import { ActiveStatus } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Avatar";

const INACTIVE_GROUP = "Inactive";

export function EmployeeTable({ rows }: { rows: DirectoryRow[] }) {
  if (rows.length === 0) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>No people match this search.</p>;
  }
  // Senior-first within each group; groupBy preserves this input order per bucket.
  const sorted = [...rows].sort(bySeniorityThenName);
  // Active people group by carrier group; everyone inactive collapses into one
  // "Inactive" bucket that renders last regardless of the alphabetical label sort.
  const grouped = groupBy(sorted, (r) => (r.isActive ? r.carrierGroup : INACTIVE_GROUP));
  const groups = [
    ...grouped.filter((g) => g.label !== INACTIVE_GROUP),
    ...grouped.filter((g) => g.label === INACTIVE_GROUP),
  ];

  return (
    <div className="flex flex-col gap-6">
      {groups.map((g) => (
        <div key={g.label}>
          <GroupBar label={g.label} count={g.rows.length} />
          <div className="surface table-scroll">
            <table className="data-table table-fixed">
              <colgroup>
                <col style={{ width: "26%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "18%" }} />
                <col style={{ width: "22%" }} />
                <col style={{ width: "12%" }} />
              </colgroup>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Immediate supervisor</th>
                  <th>Position</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {g.rows.map((r) => (
                  <tr key={r.empId}>
                    <td className="cell-strong">
                      <Link href={`/employees/${r.empId}`} className="name-cell hover:underline">
                        <Avatar name={r.reportDisplayName ?? r.fullName ?? r.empId} />
                        <span className="name-text">{r.reportDisplayName ?? r.fullName ?? r.empId}</span>
                      </Link>
                    </td>
                    <td>{r.email}</td>
                    <td>{r.immediateSupervisor ?? "—"}</td>
                    <td>{r.position ?? "—"}</td>
                    <td><ActiveStatus active={r.isActive} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
