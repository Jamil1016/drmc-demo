/** Display label for an approver group. Almost every group is named
 * "Daily Report Approvers - <team>"; the prefix carries no information in a
 * column that is already about approvers, so show only the team part.
 * Filtering/CSV keep the raw value — this is display-only. */
const APPROVER_PREFIX = /^daily report approvers\s*-\s*/i;

export function approverGroupLabel(name: string | null): string | null {
  if (!name) return null;
  const stripped = name.replace(APPROVER_PREFIX, "").trim();
  return stripped || name;
}
