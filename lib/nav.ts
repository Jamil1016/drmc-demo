import { roleAtLeast, type AppRole } from "@/lib/auth/roles";

export type NavIcon = "home" | "directory" | "scorecard" | "browse" | "approvals" | "activity";

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

// Hours Analysis (route /hr/variance) is the manager+ tier; this mirrors the
// page gate, so everyone who sees the item can open it.
const HR: NavSection = {
  label: "HR",
  items: [{ href: "/hr/variance", label: "Hours Analysis", icon: "activity" }],
};

// Gating: HR is manager and up; Workspace + Compliance are visible to all roles.
// Every item here is a route that exists in this build (pinned by nav.test.ts).
export function navSectionsFor(role: AppRole): NavSection[] {
  const sections: NavSection[] = [WORKSPACE, COMPLIANCE];
  if (roleAtLeast(role, "manager")) sections.push(HR);
  return sections;
}
