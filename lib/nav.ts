import { roleAtLeast, type AppRole } from "@/lib/auth/roles";

export type NavIcon = "home" | "directory" | "scorecard" | "browse" | "approvals" | "activity" | "flag";

export type NavItem = { href: string; label: string; icon: NavIcon };
export type NavSection = { label: string; items: NavItem[] };

const WORKSPACE: NavSection = {
  label: "Workspace",
  items: [
    { href: "/", label: "Home", icon: "home" },
    { href: "/directory", label: "Directory", icon: "directory" },
  ],
};

const COMPLIANCE: NavSection = {
  label: "Compliance",
  items: [
    { href: "/approvals", label: "Awaiting Approval", icon: "approvals" },
    { href: "/approvals/scorecard", label: "Approval Performance", icon: "scorecard" },
    { href: "/approvals/browse", label: "DR Approval", icon: "browse" },
  ],
};

// DR Monitoring (route /hr) and Hours Analysis (route /hr/variance) are the
// manager+ tier; this mirrors the page gates, so everyone who sees an item can
// open it.
const HR: NavSection = {
  label: "HR",
  items: [
    { href: "/hr", label: "DR Monitoring", icon: "flag" },
    { href: "/hr/variance", label: "Hours Analysis", icon: "activity" },
  ],
};

// The activity log is manager+ here as well: the demo visitor is a manager, and
// the log holds nothing beyond who signed in and who approved what.
const ADMIN: NavSection = {
  label: "Admin",
  items: [{ href: "/activity", label: "Activity", icon: "activity" }],
};

// Gating: HR and Admin are manager and up; Workspace + Compliance are visible
// to all roles. Every item here is a route that exists in this build (pinned by
// nav.test.ts).
export function navSectionsFor(role: AppRole): NavSection[] {
  const sections: NavSection[] = [WORKSPACE, COMPLIANCE];
  if (roleAtLeast(role, "manager")) sections.push(HR, ADMIN);
  return sections;
}
