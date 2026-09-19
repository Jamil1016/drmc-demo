import { requireMinRolePage } from "@/lib/auth/require-user";
import { getApprovalQueueSummary, getApprovalQueuePage, type ApprovalFilters } from "@/lib/hr/queries/approval-queries";
import { listDivisionOptions } from "@/lib/hr/queries/division-options";
import { getLastDataRefresh } from "@/lib/hr/queries/data-freshness";
import { ApprovalQueueTable } from "@/components/approvals/ApprovalQueueTable";
import { GroupBacklogTable } from "@/components/approvals/GroupBacklogTable";
import { ApprovalFilters as Filters } from "@/components/approvals/ApprovalFilters";
import { KpiBand, type KpiTile } from "@/components/ui/KpiBand";
import { LiveRefresh } from "@/components/ui/LiveRefresh";
import { formatDataRefresh } from "@/lib/time";
import { getDisplayZone } from "@/lib/display-zone.server";

type SearchParams = { carrierGroup?: string; division?: string; search?: string };

export default async function ApprovalsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // The approval queue is the approvers' working surface (approving is lead+).
  await requireMinRolePage("lead");
  const zone = await getDisplayZone();
  const sp = await searchParams;
  const carrierGroups = sp.carrierGroup?.split(",").map((s) => s.trim()).filter(Boolean);
  const filters: ApprovalFilters = {
    carrierGroups: carrierGroups?.length ? carrierGroups : undefined,
    division: sp.division,
    search: sp.search,
  };
  const DISPLAY_LIMIT = 200;
  const [summary, shown, groups, lastRefresh] = await Promise.all([
    getApprovalQueueSummary(filters),
    getApprovalQueuePage(filters, DISPLAY_LIMIT),
    listDivisionOptions(),
    getLastDataRefresh(),
  ]);
  const s = summary.kpis;
  const tiles: KpiTile[] = [
    { label: "Awaiting approval", value: s.awaiting },
    { label: "Amber (3 to 5 days)", value: s.amber, tone: "amber" },
    { label: "Red (over 5 days)", value: s.red, tone: "red" },
    { label: "Oldest wait (days)", value: s.oldestWaitDays },
    { label: "No approver assigned", value: s.noApprover },
  ];

  return (
    <div className="flex flex-col gap-6">
      <KpiBand
        title="Approvals"
        description="Daily reports awaiting lead approval, oldest first."
        tiles={tiles}
        action={
          <LiveRefresh label={formatDataRefresh(lastRefresh, zone)} />
        }
      />
      <Filters
        basePath="/approvals"
        search={sp.search}
        groupOptions={groups}
        carrierGroups={filters.carrierGroups}
      />
      <div className="filter-dim flex flex-col gap-6">
      <section className="flex flex-col gap-2">
        {s.awaiting > DISPLAY_LIMIT && (
          <p className="text-xs" style={{ color: "var(--muted)" }}>
            Showing the {DISPLAY_LIMIT} oldest of {s.awaiting.toLocaleString()} awaiting. Use the filters or scorecard to narrow down.
          </p>
        )}
        <ApprovalQueueTable rows={shown} zone={zone} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="side-label" style={{ color: "var(--muted)" }}>Backlog by approver group</h2>
        <GroupBacklogTable groups={summary.backlog} />
      </section>
      </div>
    </div>
  );
}
