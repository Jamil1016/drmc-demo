import type { BacklogGroup } from "@/lib/hr/queries/approval-queries";

export function GroupBacklogTable({ groups }: { groups: BacklogGroup[] }) {
  if (groups.length === 0) {
    return <p className="text-sm" style={{ color: "var(--muted)" }}>No backlog by group.</p>;
  }
  return (
    <div className="surface table-scroll">
      <table className="data-table">
        <thead>
          <tr><th>Approver group</th><th>Waiting</th><th>Amber</th><th>Red</th></tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.group}>
              <td className="cell-strong">{g.group}</td>
              <td>{g.waiting}</td>
              <td style={g.amber > 0 ? { color: "#8a5a00", fontWeight: 600 } : undefined}>{g.amber}</td>
              <td style={g.red > 0 ? { color: "var(--bad)", fontWeight: 600 } : undefined}>{g.red}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
