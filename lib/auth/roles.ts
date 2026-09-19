// Pure, client-safe role model. Kept separate from session.ts (which imports
// server-only Supabase clients) so both server guards and client components
// (e.g. the Sidebar) can import the rank helper.

export type AppRole = "super_admin" | "hr_staff" | "manager" | "lead" | "viewer";

// Higher rank = more privilege. Drives "X and up" capability gates.
// viewer < lead < manager < hr_staff < super_admin.
//
// `lead` is what the role formerly called `manager` became (unchanged
// capabilities). The `manager` name was reused for a higher tier that adds
// Hours Analysis on top of everything a lead can do.
export const ROLE_RANK: Record<AppRole, number> = {
  viewer: 0,
  lead: 1,
  manager: 2,
  hr_staff: 3,
  super_admin: 4,
};

/** Every role, ordered by non-decreasing rank. Single source of truth for the
 *  role picker and any exhaustive iteration, so a new role is added in exactly
 *  two places (here and ROLE_RANK) instead of the four hand-copied unions this
 *  replaced. Those copies were narrower than AppRole and therefore stayed
 *  assignable, so a missed one compiled clean and silently dropped the role
 *  from the picker. */
export const ALL_ROLES: readonly AppRole[] = [
  "viewer",
  "lead",
  "manager",
  "hr_staff",
  "super_admin",
];

/** True when `role` is at least as privileged as `min` (e.g. roleAtLeast(role, "manager")).
 *  Fails CLOSED on an unrecognized role: ROLE_RANK[x] is undefined and
 *  `undefined >= n` is false, so an unknown value clears no gate at all. */
export function roleAtLeast(role: AppRole, min: AppRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/** Capability: approve daily reports in the PM API. Lead and up. */
export function canApprove(role: AppRole): boolean {
  return roleAtLeast(role, "lead");
}
