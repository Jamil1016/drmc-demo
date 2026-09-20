import { requireMinRolePage } from "@/lib/auth/require-user";
import { queryActivityLog, getActivityDashboard } from "@/lib/hr/queries/activity-queries";
import { normalizeActivityQuery, nextActivityCursor, formatActionLabel, formatActivityObject } from "@/lib/hr/domain/activity-format";
import { defaultGroup, parseGroup } from "@/lib/hr/domain/activity-dashboard";
import { ActivityFilters } from "@/components/activity/ActivityFilters";
import { ActivityDashboard } from "@/components/activity/ActivityDashboard";
import { formatZonedInstant, zoneLabel } from "@/lib/time";
import { getDisplayZone } from "@/lib/display-zone.server";
import { formatInTimeZone } from "date-fns-tz";

export const dynamic = "force-dynamic";

/** Last-30-days PHT window as yyyy-MM-dd, used when no date filter is set.
 *  Always Manila, whatever the display zone: the activity_dashboard RPC
 *  buckets on Manila calendar days, so an ET "today" would drop the current
 *  PHT day from the KPIs and trend for half of every day. Only the log table
 *  window and the "When" column follow the display zone. */
function defaultPeriod(): { from: string; to: string } {
  const now = new Date();
  const to = formatInTimeZone(now, "Asia/Manila", "yyyy-MM-dd");
  const from = formatInTimeZone(new Date(now.getTime() - 29 * 86_400_000), "Asia/Manila", "yyyy-MM-dd");
  return { from, to };
}

export default async function ActivityPage(
  { searchParams }: { searchParams: Promise<Record<string, string | undefined>> },
) {
  // manager+: the demo visitor is a manager, and the log holds nothing beyond
  // who signed in and who approved what.
  await requireMinRolePage("manager");
  const zone = await getDisplayZone();
  const sp = await searchParams;
  const filters = normalizeActivityQuery(sp);

  const def = defaultPeriod();
  const from = filters.from ?? def.from;
  const to = filters.to ?? def.to;
  const group = parseGroup(sp.group) ?? defaultGroup(from, to);

  const [dashboard, rows] = await Promise.all([
    getActivityDashboard(from, to, group),
    queryActivityLog(filters, zone),
  ]);
  const cursor = nextActivityCursor(rows, filters.limit);

  const olderParams = new URLSearchParams();
  if (filters.actor) olderParams.set("actor", filters.actor);
  if (filters.action) olderParams.set("action", filters.action);
  if (filters.from) olderParams.set("from", filters.from);
  if (filters.to) olderParams.set("to", filters.to);
  if (parseGroup(sp.group)) olderParams.set("group", group);
  if (cursor) olderParams.set("before", String(cursor));

  return (
    <div className="flex flex-col gap-6">
      <ActivityDashboard data={dashboard} group={group} zone={zone} />

      <div>
        <ActivityFilters actor={filters.actor} action={filters.action} dateFrom={filters.from} dateTo={filters.to} />
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="surface table-scroll filter-dim">
            <table className="data-table">
              <thead>
                <tr><th>When ({zoneLabel(zone)})</th><th>Person</th><th>Action</th><th>Detail</th></tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr><td colSpan={4} className="text-center" style={{ color: "var(--muted)" }}>No activity for this filter.</td></tr>
                )}
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap" style={{ color: "var(--ink-soft)" }}>{formatZonedInstant(r.created_at, zone)}</td>
                    <td className="whitespace-nowrap cell-strong">{r.actor_email}</td>
                    <td className="whitespace-nowrap">{formatActionLabel(r.action)}</td>
                    <td style={{ color: "var(--muted)" }}>{formatActivityObject(r) || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {cursor && (
            <a href={`/activity?${olderParams.toString()}`} className="mt-4 inline-block text-sm underline" style={{ color: "var(--signal)" }}>
              Load older
            </a>
          )}
        </div>

        <div className="flex w-full flex-col gap-3 lg:w-72">
          <div className="surface" style={{ padding: "0.75rem 0.9rem" }}>
            <div className="side-label" style={{ color: "var(--muted)", marginBottom: 8 }}>Most active approvers</div>
            {dashboard.top_approvers.length === 0
              ? <p className="text-sm" style={{ color: "var(--muted)" }}>No in-app approvals yet.</p>
              : dashboard.top_approvers.map((a) => (
                  <div key={a.email} className="flex items-center justify-between text-sm" style={{ padding: "3px 0" }}>
                    <span className="truncate" style={{ color: "var(--ink-soft)" }}>{a.email}</span>
                    <b style={{ color: "var(--ink)" }}>{a.n}</b>
                  </div>
                ))}
          </div>
          <div className="surface" style={{ padding: "0.75rem 0.9rem" }}>
            <div className="side-label" style={{ color: "var(--muted)", marginBottom: 8 }}>Top failure reasons</div>
            {dashboard.top_failures.length === 0
              ? <p className="text-sm" style={{ color: "var(--muted)" }}>No in-app failures. Run a bulk approve with a simulated outage to see some.</p>
              : dashboard.top_failures.map((f, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 text-sm" style={{ padding: "3px 0" }}>
                    <span className="truncate" style={{ color: "var(--ink-soft)" }}>{f.reason}{f.http_status ? ` (${f.http_status})` : ""}</span>
                    <b style={{ color: "var(--bad)" }}>{f.n}</b>
                  </div>
                ))}
          </div>
        </div>
      </div>
    </div>
  );
}
