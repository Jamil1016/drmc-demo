import { requireUser } from "@/lib/auth/require-user";
import { roleAtLeast } from "@/lib/auth/roles";
import { KpiBand, type KpiTile } from "@/components/ui/KpiBand";
import { AttentionPanel } from "@/components/home/AttentionPanel";
import { GroupBreakdown, type GroupBreakdownRow } from "@/components/home/GroupBreakdown";
import { MissingApproverPanel } from "@/components/home/MissingApproverPanel";
import { greetingFor, firstNameFrom } from "@/lib/home/greeting";
import { aggregateApproverKpis } from "@/lib/home/approver-kpis";
import { resolveTeamMembers } from "@/lib/home/team-members";
import { getApproverGroupsForEmail, getTeamMemberIds, getUnassignedReportsForApprover, type TeamMemberIds } from "@/lib/hr/queries/home-queries";
import type { UnassignedReport } from "@/lib/hr/domain/missing-approver";
import { getApproverScorecard, type ScorecardRow } from "@/lib/hr/queries/approval-queries";
import { getLastDataRefresh } from "@/lib/hr/queries/data-freshness";
import { countActiveEmployees } from "@/lib/hr/queries/directory-queries";
import { formatDataRefresh, zoneIana, zoneLabel } from "@/lib/time";
import { getDisplayZone } from "@/lib/display-zone.server";
import { rateTier, onTimePct } from "@/lib/hr/domain/scorecard-metrics";

// The daily-report pipeline lands new data ~every 10 min; if the last
// successful run is older than this, the "synced" chip is likely stale
// rather than merely a normal gap between runs.
const STALE_REFRESH_MS = 2 * 60 * 60 * 1000;

/**
 * Fetch wrapper that logs failures (instead of swallowing them) and reports
 * ok/fail so callers can render "-" for a genuine fetch failure instead of a
 * misleading 0/n-a that reads the same as "nothing to show".
 */
async function safeR<T>(p: Promise<T>, fallback: T, label: string): Promise<{ ok: boolean; value: T }> {
  try {
    return { ok: true, value: await p };
  } catch (err) {
    console.error(`[home] ${label} failed`, err);
    return { ok: false, value: fallback };
  }
}

function isStaleRefresh(iso: string): boolean {
  return Date.now() - new Date(iso).getTime() > STALE_REFRESH_MS;
}

export default async function HomePage() {
  const user = await requireUser();
  const zone = await getDisplayZone();
  const isApprover = roleAtLeast(user.role, "lead");
  const [groups, scorecard, memberIds, refreshedAt, roster, unassigned] = await Promise.all([
    isApprover
      ? safeR(getApproverGroupsForEmail(user.email), [], "approver-groups")
      : safeR(Promise.resolve<string[]>([]), [], "approver-groups"),
    isApprover
      ? safeR(getApproverScorecard(), [], "scorecard")
      : safeR(Promise.resolve<ScorecardRow[]>([]), [], "scorecard"),
    isApprover
      ? safeR(getTeamMemberIds(user.email), { ids: [], assigned: false }, "team-members")
      : safeR(Promise.resolve<TeamMemberIds>({ ids: [], assigned: false }), { ids: [], assigned: false }, "team-members"),
    safeR(getLastDataRefresh(), null, "last-data-refresh"),
    safeR(countActiveEmployees(), 0, "roster-count"),
    isApprover
      ? safeR(getUnassignedReportsForApprover(user.email, user.role === "super_admin"), [], "unassigned-reports")
      : safeR(Promise.resolve<UnassignedReport[]>([]), [], "unassigned-reports"),
  ]);

  const pendingOk = groups.ok && scorecard.ok;
  const kpis = aggregateApproverKpis(scorecard.value, groups.value, user.role);
  const showApproverTiles = pendingOk ? kpis.scope !== "none" : isApprover;

  // The browse page filters task_status via an exact match; "submitted" is
  // its "awaiting approval decision" value (see getApprovableTaskDids, which
  // uses the same status to build the approvable pool), so it is the closest
  // scoped href to "pending". The browse view's assigned_approver column
  // holds the same group labels as the scorecard/groups list (e.g. "Daily
  // Daily Report Approvers - Group C"), so for a scope-"own" approver we deep-link to
  // exactly their queue(s) via the `ag` param; org-wide (super_admin) stays
  // unscoped since that view is meant to cover every group.
  function buildBrowseHref(ownGroups: string[]): string {
    const p = new URLSearchParams();
    p.set("status", "submitted");
    for (const g of ownGroups) p.append("ag", g);
    return `/approvals/browse?${p.toString()}`;
  }
  const browseHref =
    kpis.scope === "own" ? buildBrowseHref(groups.value) : "/approvals/browse?status=submitted";

  // Per-group breakdown: only meaningful for an approver scoped to their OWN
  // groups (not the org-wide super_admin view) who covers more than one group,
  // since a blended KPI number hides which specific group is behind.
  const groupRows: GroupBreakdownRow[] =
    pendingOk && kpis.scope === "own" && groups.value.length > 1
      ? groups.value.flatMap((g) => {
          const r = scorecard.value.find((row) => row.groupLabel === g);
          return r
            ? [{
                label: r.displayLabel ?? r.groupLabel,
                pending: r.pending,
                onTimePct: onTimePct(r),
                href: `/approvals/scorecard?group=${encodeURIComponent(r.groupLabel)}`,
              }]
            : [];
        })
      : [];

  const refreshLabel = refreshedAt.ok ? formatDataRefresh(refreshedAt.value, zone) : "";
  let description: string;
  if (!refreshedAt.ok || !refreshLabel) {
    description = "Sync status unavailable";
  } else {
    description = `Data synced ${refreshLabel} (${zoneLabel(zone)})`;
    if (isStaleRefresh(refreshedAt.value as string)) description += " · sync delayed";
  }

  // Team-members tile. For an approver, "team" = the people the roster ASSIGNS
  // them to approve, with the distinct people they have personally approved as
  // the fallback when the roster lists no one for them (see resolveTeamMembers / getTeamMemberIds). The tile links to
  // the same people via /directory?approver=email (both resolve the same query).
  const teamMembers = resolveTeamMembers(
    memberIds.ok ? memberIds.value.ids.length : null,
    memberIds.ok && memberIds.value.assigned,
    kpis.scope,
    roster.ok ? roster.value : "—",
    user.email,
  );

  const tiles: KpiTile[] = [
    { label: teamMembers.label, value: teamMembers.value, href: teamMembers.href },
  ];
  if (showApproverTiles) {
    const suffix = pendingOk ? (kpis.scope === "own" ? " (your groups)" : " (all groups)") : "";
    const pendingValue = pendingOk ? kpis.pending : "—";
    tiles.push({
      label: `Pending approvals${suffix}`,
      value: pendingValue,
      tone: pendingOk && kpis.pending > 0 ? "amber" : undefined,
      href: browseHref,
    });

    const onTimeValue = pendingOk ? (kpis.onTimePct === null ? "n/a" : `${kpis.onTimePct}%`) : "—";
    let onTimeTone: "amber" | "red" | undefined;
    if (pendingOk && kpis.onTimePct !== null) {
      const tier = rateTier(kpis.onTimePct);
      onTimeTone = tier === "on_time" ? undefined : tier;
    }
    tiles.push({
      label: `On-time rate${suffix}`,
      value: onTimeValue,
      tone: onTimeTone,
      href: "/approvals/scorecard",
    });
  }
  return (
    <div className="space-y-6">
      <KpiBand
        title={`${greetingFor(new Date(), zoneIana(zone))}, ${firstNameFrom(user.name, user.email)}`}
        description={description}
        tiles={tiles}
        markTone
      />
      {showApproverTiles && pendingOk ? (
        <AttentionPanel pending={kpis.pending} browseHref={browseHref} />
      ) : null}
      {isApprover && unassigned.value.length > 0 ? (
        <MissingApproverPanel reports={unassigned.value} scopeAll={user.role === "super_admin"} canApprove={isApprover} />
      ) : null}
      {groupRows.length > 0 ? <GroupBreakdown rows={groupRows} /> : null}
    </div>
  );
}
