import { requireMinRolePage } from "@/lib/auth/require-user";
import { getReviewSummary, getApprovalCompliance, getReviewBacklog } from "@/lib/hr/queries/review-queries";
import { getLastDataRefresh } from "@/lib/hr/queries/data-freshness";
import { previousRange, resolveDashboardRange } from "@/lib/hr/domain/review-window";
import { formatDataRefresh } from "@/lib/time";
import { getDisplayZone } from "@/lib/display-zone.server";
import { ReviewKpis } from "@/components/hr/ReviewKpis";
import { LateMissingTrend } from "@/components/hr/LateMissingTrend";
import { FilingSpeedTrend } from "@/components/hr/FilingSpeedTrend";
import { GroupLateRates } from "@/components/hr/GroupLateRates";
import { ApprovalComplianceTrend } from "@/components/hr/ApprovalComplianceTrend";
import { ApprovalOverdueAging } from "@/components/hr/ApprovalOverdueAging";
import { BacklogAging } from "@/components/hr/BacklogAging";

export const dynamic = "force-dynamic";

type SearchParams = { dateFrom?: string; dateTo?: string; range?: string };

export default async function DrMonitoringPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  // manager+, the same tier as Hours Analysis: the demo visitor is a manager.
  await requireMinRolePage("manager");
  const zone = await getDisplayZone();
  const sp = await searchParams;
  // queryFrom/queryTo drive the RPCs (all-time = a wide floor..today window);
  // displayFrom/displayTo drive the date control + drill-down links (blank when
  // all-time, so the control shows "All dates"). See resolveDashboardRange.
  const { isAll, queryFrom, queryTo, displayFrom, displayTo } = resolveDashboardRange(sp);

  // Immediately-preceding window of the same length, for period-over-period KPI
  // deltas. Skipped for all-time, where "the previous period" is meaningless.
  const prev = previousRange(queryFrom, queryTo);

  const [summary, prevSummary, approvalCompliance, backlog, lastRefresh] = await Promise.all([
    getReviewSummary(queryFrom, queryTo),
    isAll ? Promise.resolve(null) : getReviewSummary(prev.from, prev.to),
    getApprovalCompliance(),
    getReviewBacklog(),
    getLastDataRefresh(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <ReviewKpis
        kpis={summary.kpis}
        prevKpis={prevSummary?.kpis ?? null}
        dateFrom={displayFrom}
        dateTo={displayTo}
        freshnessLabel={formatDataRefresh(lastRefresh, zone)}
      />

      {/* The two "as of now" piles side by side: employee-side (unfiled) and
          approver-side (waiting past the window). Both ignore the date range. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <BacklogAging backlog={backlog} />
        <ApprovalOverdueAging data={approvalCompliance} />
      </div>

      <div className="hr-dashboard-grid">
        <div className="hr-dashboard-left">
          <LateMissingTrend trend={summary.trend} />
          <FilingSpeedTrend trend={summary.trend} />
        </div>
        <GroupLateRates groups={summary.groups} dateFrom={displayFrom} dateTo={displayTo} />
      </div>

      <ApprovalComplianceTrend data={approvalCompliance} />
    </div>
  );
}
