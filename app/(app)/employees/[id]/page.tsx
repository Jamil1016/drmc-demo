import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { getDirectoryEntry } from "@/lib/hr/queries/directory-queries";
import { getMemberApprovers } from "@/lib/hr/queries/member-approver-queries";
import { ActiveStatus } from "@/components/ui/StatusPill";
import { Avatar } from "@/components/ui/Avatar";
import { MemberApprovers } from "@/components/employees/MemberApprovers";
import { ScheduleHistory } from "@/components/employees/ScheduleHistory";
import { listScheduleHistory } from "@/lib/hr/queries/schedule-history-queries";

type Props = { params: Promise<{ id: string }> };

// Read-only profile. `id` is the employee's emp_id (text): the Directory reads
// the roster serving view (v_employee_directory), which is keyed by emp_id and
// has one row per person.
export default async function EmployeeDetailPage({ params }: Props) {
  await requireUser();
  const { id } = await params;
  const c = await getDirectoryEntry(id);
  if (!c) notFound();

  const [approvers, scheduleHistory] = await Promise.all([
    getMemberApprovers(id),
    listScheduleHistory(id),
  ]);

  const shiftPht =
    c.shiftTimeInPht || c.shiftTimeOutPht
      ? `${c.shiftTimeInPht ?? "—"} – ${c.shiftTimeOutPht ?? "—"} PHT`
      : "—";

  const fields: [string, React.ReactNode][] = [
    ["Employee ID", c.empId],
    // Formal roster name, kept as a detail field: the header shows the short
    // report display name (to match the report tables), so this is the one place
    // the full name still appears. Omitted when it equals the displayed name.
    ...(c.fullName && c.fullName !== (c.reportDisplayName ?? c.fullName)
      ? ([["Full name", c.fullName]] as [string, React.ReactNode][])
      : []),
    ["Email", c.email],
    ["Position", c.position ?? "—"],
    ["Status", <ActiveStatus key="s" active={c.isActive} />],
    ["Employment status", c.employmentStatus ?? "—"],
    ["Carrier group", c.carrierGroup ?? "—"],
    ["Carrier", c.carrier ?? "—"],
    ["Cluster", c.cluster ?? "—"],
    ["Division", c.division ?? "—"],
    ["Sub-division", c.subDivision ?? "—"],
    ["Immediate supervisor", c.immediateSupervisor ?? "—"],
    ["Work schedule", c.workSchedule ?? "—"],
    ["Shift schedule", c.shiftSchedule ?? "—"],
    ["Shift time", shiftPht],
    ["Hire date", c.hireDate ?? "—"],
    ["Regularization date", c.regularizationDate ?? "—"],
    ...(c.resignationDate ? ([["Last working day", c.resignationDate]] as [string, React.ReactNode][]) : []),
  ];

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link href="/directory" className="text-sm" style={{ color: "var(--muted)" }}>← Directory</Link>
          <span className="name-cell">
            <Avatar name={c.reportDisplayName ?? c.fullName ?? c.empId} />
            <h1 className="page-title">{c.reportDisplayName ?? c.fullName ?? c.empId}</h1>
          </span>
        </div>
      </div>

      <dl className="surface grid grid-cols-1 gap-x-8 gap-y-3 p-5 text-sm sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between gap-4 sm:justify-start sm:gap-3">
            <dt className="field-label">{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>

      <MemberApprovers approvers={approvers} />

      <ScheduleHistory rows={scheduleHistory} />
    </div>
  );
}
