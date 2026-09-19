import { DB } from "@/lib/db/schemas";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service"; // match approval-queries.ts import exactly
import { pickTeamMembers } from "@/lib/home/team-members";
import type { UnassignedReport } from "@/lib/hr/domain/missing-approver";

async function getApproverGroupsUncached(email: string): Promise<string[]> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .schema(DB.analytics)
    .rpc("approver_groups_for_email", { p_email: email });
  if (error) throw new Error(error.message);
  // RPC returns setof text; PostgREST shapes scalar-returning RPCs as an array
  // of values or of {approver_groups_for_email: text}. Normalize both.
  return ((data ?? []) as unknown[])
    .map((r) => (typeof r === "string" ? r : (r as Record<string, string>).approver_groups_for_email))
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

// History-derived groups: every queue the user has ever cleared a report in.
// Retained ONLY as a fallback for approvers the roster does
// not list (see getApproverGroupsForEmail). Cached 1h under the "approver-groups"
// tag, keyed by email so different users do not share a cache entry.
function getHistoryApproverGroups(email: string): Promise<string[]> {
  return unstable_cache(
    () => getApproverGroupsUncached(email),
    ["approver-groups-history", email],
    { revalidate: 3600, tags: ["approver-groups"] },
  )();
}

async function getAssignedApproverGroupsUncached(email: string): Promise<string[]> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .schema(DB.analytics)
    .rpc("dr_assigned_groups_for_email", { p_email: email });
  if (error) throw new Error(error.message);
  // Same setof-text shaping as the other analytics RPCs above.
  return ((data ?? []) as unknown[])
    .map((r) => (typeof r === "string" ? r : (r as Record<string, string>).dr_assigned_groups_for_email))
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

// The DR queues an approver is ASSIGNED to, from the roster
// (ref_employee_approvers.approver_group via the dr_assigned_groups_for_email
// RPC). Cached 1h like the members/approver-group lookups: the data only
// changes when the roster does.
function getAssignedApproverGroups(email: string): Promise<string[]> {
  return unstable_cache(
    () => getAssignedApproverGroupsUncached(email),
    ["assigned-approver-groups", email],
    { revalidate: 3600, tags: ["approver-groups"] },
  )();
}

// Assignment-first approver groups: the roster is the source of truth for
// which DR queues a user approves. Approval HISTORY drifts -- it
// credits any queue the user ever cleared a report in, so an approver who once
// covered another team's queue keeps showing it forever,
// leaking that queue's reports into the Home Pending-approvals count, its browse
// deep-link, and the "Your groups" breakdown. Roster is authoritative; history
// remains only for approvers the roster does not list. Mirrors getTeamMemberIds'
// assignment-first-with-history-fallback shape so the group scope and the
// "Members you approve" tile stay derived from the same source.
export async function getApproverGroupsForEmail(email: string): Promise<string[]> {
  const assigned = await getAssignedApproverGroups(email);
  if (assigned.length > 0) return assigned;
  return getHistoryApproverGroups(email);
}

async function getApprovedMemberIdsUncached(email: string): Promise<string[]> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .schema(DB.analytics)
    .rpc("approved_members_for_email", { p_email: email });
  if (error) throw new Error(error.message);
  // Same setof-text shaping as approver_groups_for_email: PostgREST returns an
  // array of scalars or of {approved_members_for_email: text}. Normalize both.
  return ((data ?? []) as unknown[])
    .map((r) => (typeof r === "string" ? r : (r as Record<string, string>).approved_members_for_email))
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

// The distinct emp_ids an approver has personally approved.
// Backs the Home "Team members" tile and the /directory?approver= drill-down, so
// both read the identical set. Keyed by email; tagged "approvals" (revalidates
// with the scorecard/approval data, not the near-static approver-group list).
export function getApprovedMemberIds(email: string): Promise<string[]> {
  return unstable_cache(
    () => getApprovedMemberIdsUncached(email),
    ["approved-members", email],
    { revalidate: 60, tags: ["approvals"] },
  )();
}

async function getAssignedMemberIdsUncached(email: string): Promise<string[]> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .schema(DB.analytics)
    .rpc("dr_assigned_members_for_email", { p_email: email });
  if (error) throw new Error(error.message);
  // Same setof-text shaping as the other analytics RPCs above.
  return ((data ?? []) as unknown[])
    .map((r) => (typeof r === "string" ? r : (r as Record<string, string>).dr_assigned_members_for_email))
    .filter((v): v is string => typeof v === "string" && v.length > 0);
}

// The emp_ids an approver is ASSIGNED to approve, from the roster
// (ref_employee_approvers). Canonical, unlike the approval-history inference
// above. Cached 1h like approver-groups: the data only changes when the roster does.
export function getAssignedMemberIds(email: string): Promise<string[]> {
  return unstable_cache(
    () => getAssignedMemberIdsUncached(email),
    ["assigned-members", email],
    { revalidate: 3600, tags: ["approver-groups"] },
  )();
}

export type TeamMemberIds = {
  ids: string[];
  /** true when ids came from roster assignments (canonical), false when
   * from approval history (fallback for approvers the roster doesn't list). */
  assigned: boolean;
};

// Assignment-first membership: the roster is the source of truth for "who do I
// approve"; approval history remains only a fallback so approvers the roster
// doesn't cover never lose their team. The Home tile
// and /directory?approver= both resolve through this, so tile count and
// drill-down list always agree. Both RPCs go out in parallel: the fallback was
// previously serialized behind the assigned lookup, costing every non-roster
// approver an extra sequential round trip on most Home loads.
export async function getTeamMemberIds(email: string): Promise<TeamMemberIds> {
  const [assigned, approved] = await Promise.all([
    getAssignedMemberIds(email),
    getApprovedMemberIds(email),
  ]);
  return pickTeamMembers(assigned, approved);
}

type UnassignedRow = {
  task_did: string;
  emp_id: string;
  employee_name: string | null;
  member_email: string | null;
  work_date: string;
  asset_name: string | null;
  milestone: string | null;
  submitted_on_et: string | null;
  pending_wait_days: number | null;
};

async function getUnassignedReportsUncached(email: string, all: boolean): Promise<UnassignedReport[]> {
  const svc = createServiceClient();
  const { data, error } = await svc
    .schema(DB.analytics)
    .rpc("dr_unassigned_reports_for_email", { p_email: email, p_all: all });
  if (error) throw new Error(error.message);
  return ((data ?? []) as UnassignedRow[]).map((r) => ({
    taskDid: r.task_did,
    empId: r.emp_id,
    employeeName: r.employee_name,
    memberEmail: r.member_email,
    workDate: r.work_date,
    assetName: r.asset_name,
    milestone: r.milestone,
    submittedOnEt: r.submitted_on_et,
    pendingWaitDays: r.pending_wait_days,
  }));
}

// Submitted daily reports with NO approver assigned, scoped to the approver's
// roster (the dr_unassigned_reports_for_email RPC). Backs the
// Home "Missing approver" panel. `all` (super_admin) drops the roster filter so
// the catch-all sees every un-assigned report org-wide. Keyed by email+scope;
// tagged "approvals" so it busts the moment an approve lands (an approved report
// leaves the un-assigned pool), matching every other approval surface.
export function getUnassignedReportsForApprover(email: string, all: boolean): Promise<UnassignedReport[]> {
  return unstable_cache(
    () => getUnassignedReportsUncached(email, all),
    ["unassigned-reports", email, all ? "all" : "own"],
    { revalidate: 60, tags: ["approvals"] },
  )();
}
