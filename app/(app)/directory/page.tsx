import { requireUser } from "@/lib/auth/require-user";
import { listDirectory } from "@/lib/hr/queries/directory-queries";
import { getTeamMemberIds } from "@/lib/hr/queries/home-queries";
import { DirectoryBrowser } from "@/components/employees/DirectoryBrowser";

export default async function DirectoryPage(
  { searchParams }: { searchParams: Promise<{ cg?: string | string[]; approver?: string }> }
) {
  await requireUser();
  const sp = await searchParams;
  const cgRaw = sp.cg;
  const carrierGroups = Array.isArray(cgRaw) ? cgRaw : cgRaw ? [cgRaw] : undefined;

  // Approver drill-down (from the Home "Team members" tile): the people the
  // roster assigns to this approver, falling back to the people they have
  // personally approved. Same resolution the tile counts with, so the
  // list length matches the tile value. Shown active-or-not to match that count.
  if (sp.approver) {
    const { ids: empIds, assigned } = await getTeamMemberIds(sp.approver);
    const rows = await listDirectory({ empIds });
    return (
      <DirectoryBrowser
        rows={rows}
        filterNotice={{
          label: `Showing ${rows.length} ${assigned ? "assigned" : "approved"} team ${rows.length === 1 ? "member" : "members"}`,
          clearHref: "/directory",
        }}
      />
    );
  }

  if (carrierGroups && carrierGroups.length) {
    const rows = await listDirectory({ activeOnly: true, carrierGroups });
    return (
      <DirectoryBrowser
        rows={rows}
        filterNotice={{
          label: `Showing ${rows.length} team ${rows.length === 1 ? "member" : "members"}`,
          clearHref: "/directory",
        }}
      />
    );
  }

  const rows = await listDirectory();
  return <DirectoryBrowser rows={rows} />;
}
