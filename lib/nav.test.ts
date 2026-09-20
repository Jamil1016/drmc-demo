import { test, expect } from "@playwright/test";
import { existsSync } from "node:fs";
import path from "node:path";
import { navSectionsFor } from "./nav";
import { ALL_ROLES, type AppRole } from "./auth/roles";

function sectionLabels(role: AppRole): string[] {
  return navSectionsFor(role).map((s) => s.label);
}

test("viewer and lead see Workspace + Compliance only", () => {
  expect(sectionLabels("viewer")).toEqual(["Workspace", "Compliance"]);
  expect(sectionLabels("lead")).toEqual(["Workspace", "Compliance"]);
});

test("manager and up also see HR (DR Monitoring, Hours Analysis) and Admin (Activity)", () => {
  for (const role of ["manager", "hr_staff", "super_admin"] as AppRole[]) {
    expect(sectionLabels(role)).toEqual(["Workspace", "Compliance", "HR", "Admin"]);
    const hr = navSectionsFor(role).find((s) => s.label === "HR")!;
    expect(hr.items.map((i) => i.label)).toEqual(["DR Monitoring", "Hours Analysis"]);
    const admin = navSectionsFor(role).find((s) => s.label === "Admin")!;
    expect(admin.items.map((i) => i.href)).toEqual(["/activity"]);
  }
});

test("every nav item points at a page that exists in this build", () => {
  const appDir = path.resolve(process.cwd(), "app", "(app)");
  for (const role of ALL_ROLES) {
    for (const item of navSectionsFor(role).flatMap((s) => s.items)) {
      const page = path.join(appDir, ...item.href.split("/").filter(Boolean), "page.tsx");
      expect(existsSync(page), `${item.href} -> ${page}`).toBe(true);
    }
  }
});
