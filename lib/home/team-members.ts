import type { HomeApproverKpis } from "./approver-kpis";

export type TeamMembers = {
  label: string;
  /** A number when scoped; the roster placeholder ("—") when a fetch failed. */
  value: number | string;
  href: string;
};

/** Assignment-first precedence for "who do I approve": the roster wins when it
 *  lists anyone; approval history is only the fallback. Pure so the rule is
 *  testable apart from the two cached RPC fetches (which run in parallel). */
export function pickTeamMembers(
  assigned: string[],
  approved: string[],
): { ids: string[]; assigned: boolean } {
  return assigned.length > 0 ? { ids: assigned, assigned: true } : { ids: approved, assigned: false };
}

/**
 * The Home "Team members" tile.
 *
 * For an approver the team is the people the roster ASSIGNS them to approve
 * (ref_employee_approvers), falling back to the DISTINCT people they have
 * personally approved (the approved_members_for_email RPC) when the roster
 * lists no one for them. History alone drifted: it undercounted
 * approvers with little recent activity (a newly assigned approver read 0) and
 * overcounted ones who had merely covered for someone in the trailing 180 days.
 *
 * - fromAssignments with a positive count -> that count, independent of the
 *   history-derived scope (a roster-assigned approver gets their tile even with
 *   no approval history yet), linking to the same people via
 *   /directory?approver=<email> (both sides resolve getTeamMemberIds, so they
 *   agree)
 * - own scope with a resolved history count -> that count, same link
 * - own scope but the count is unavailable (RPC error) -> roster placeholder,
 *   so we never invent a number
 * - org scope (super_admin) -> org roster total, "(all groups)"
 * - none scope -> plain org roster total
 */
export function resolveTeamMembers(
  memberCount: number | null,
  fromAssignments: boolean,
  scope: HomeApproverKpis["scope"],
  rosterCount: number | string,
  email: string,
): TeamMembers {
  const approverTile: TeamMembers = {
    label: "Members you approve",
    value: memberCount ?? 0,
    href: `/directory?approver=${encodeURIComponent(email)}`,
  };
  if (fromAssignments && memberCount != null && memberCount > 0) return approverTile;

  const orgFallback: TeamMembers = {
    label: scope === "org" ? "Team members (all groups)" : "Team members",
    value: rosterCount,
    href: "/directory",
  };
  if (scope !== "own") return orgFallback;

  // Own approver on history fallback: scope to the people they actually
  // approved. A null count means the lookup failed — fall back to the roster
  // placeholder rather than a made-up number. (A live "own" approver always has
  // >0, since owning a group at all requires having approved someone in the
  // trailing window.)
  if (memberCount == null) return { ...orgFallback, value: rosterCount };
  return approverTile;
}
