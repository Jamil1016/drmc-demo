import { requireUser } from "@/lib/auth/require-user";
import { canApprove } from "@/lib/auth/roles";
import { getApproverScorecard } from "@/lib/hr/queries/approval-queries";
import { getLastDataRefresh } from "@/lib/hr/queries/data-freshness";
import { summarizeScorecard } from "@/lib/hr/domain/scorecard-metrics";
import { ApproverScorecardTable } from "@/components/approvals/ApproverScorecardTable";
import { ScorecardDateFilter } from "@/components/approvals/ScorecardDateFilter";
import { KpiBand, type KpiTile } from "@/components/ui/KpiBand";
import { LiveRefresh } from "@/components/ui/LiveRefresh";
import { formatDataRefresh } from "@/lib/time";
import { getDisplayZone } from "@/lib/display-zone.server";

type SearchParams = { from?: string; to?: string; group?: string };

export default async function ScorecardPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const zone = await getDisplayZone();
  const approver = canApprove(user.role);
  const sp = await searchParams;
  const [rows, lastRefresh] = await Promise.all([
    getApproverScorecard(sp.from, sp.to),
    getLastDataRefresh(),
  ]);
  const s = summarizeScorecard(rows);

  const tiles: KpiTile[] = [
    { label: "Approver groups", value: s.groups },
    { label: "Pending approvals", value: s.pending.toLocaleString(), tone: "red" },
    { label: "On-time rate (approved within 2 days)", value: s.onTimeRate == null ? "—" : `${s.onTimeRate}%`, tone: "amber" },
    { label: "Groups under 90%", value: s.groupsBelowTarget, tone: "red" },
    { label: "Filed late (excluded)", value: s.filedLate.toLocaleString() },
  ];

  return (
    <div className="flex flex-col gap-6">
      <KpiBand
        title="Approval Performance"
        description="Whether each approver group approves within 2 days of submission. Most late reports first."
        tiles={tiles}
        action={
          <div className="flex flex-col items-end gap-2">
            <ScorecardDateFilter from={sp.from} to={sp.to} />
            <LiveRefresh label={formatDataRefresh(lastRefresh, zone)} />
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: "var(--muted)" }}>
        <span className="inline-flex items-center gap-1.5"><span style={{ width: 11, height: 11, borderRadius: 3, background: "#10b981" }} /> On time (approved within 2 days of submission)</span>
        <span className="inline-flex items-center gap-1.5"><span style={{ width: 11, height: 11, borderRadius: 3, background: "#ef4444" }} /> Late (approved later, or still waiting past 2 days)</span>
        <span style={{ marginLeft: "auto" }}>Reports filed more than 48 h after clock-in (60 h for a Friday work date) are excluded.</span>
      </div>

      <ApproverScorecardTable rows={rows} from={sp.from} to={sp.to} canApprove={approver} initialGroup={sp.group} />
    </div>
  );
}
