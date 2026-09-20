import { KpiBand, type KpiTile } from "@/components/ui/KpiBand";
import { TrendBars } from "./TrendBars";
import { ChartGroupToggle } from "./ChartGroupToggle";
import { failRate, type Group } from "@/lib/hr/domain/activity-dashboard";
import type { DashboardData } from "@/lib/hr/queries/activity-queries";
import type { DisplayZone } from "@/lib/time";

export function ActivityDashboard({ data, group, zone = "PHT" }: { data: DashboardData; group: Group; zone?: DisplayZone }) {
  const k = data.kpis;
  const tiles: KpiTile[] = [
    { label: "Logins", value: k.logins },
    { label: "Active users", value: k.active_users },
    { label: "Approvals in-app", value: k.approvals },
    { label: "Failure rate", value: `${failRate(k.approvals, k.failures)}%`, tone: k.failures > 0 ? "amber" : undefined },
  ];
  return (
    <div className="flex flex-col gap-4">
      {/* The activity_dashboard RPC buckets days in Asia/Manila regardless of the
          display zone, so an ET viewer is told the days are PHT days rather than
          being shown a label that does not match the numbers. */}
      <KpiBand
        title="Activity"
        description={zone === "PHT" ? "App usage for the selected range (PHT)." : "App usage for the selected range (PHT calendar days)."}
        tiles={tiles}
      />
      <div className="flex items-center justify-end">
        <ChartGroupToggle group={group} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <TrendBars label="Logins" series={data.logins_series} group={group} tone="logins" />
        <TrendBars label="Approvals in-app" series={data.approvals_series} group={group} tone="approvals" />
      </div>
    </div>
  );
}
