import { requireUser } from "@/lib/auth/require-user";
import { canApprove } from "@/lib/auth/roles";
import { getEntryBrowsePage, getEntryBrowseCount, listApproverGroups, type BrowseFilters } from "@/lib/hr/queries/approval-queries";
import { sanitizeBrowseSort } from "@/lib/hr/domain/browse-sort";
import { parseStatedRange } from "@/lib/hr/domain/stated-hours-filter";
import { getLastDataRefresh } from "@/lib/hr/queries/data-freshness";
import { listDivisionOptions } from "@/lib/hr/queries/division-options";
import { BrowseReports } from "@/components/approvals/BrowseReports";
import { ApprovalFilters as Filters } from "@/components/approvals/ApprovalFilters";
import { ExtractMenu } from "@/components/approvals/ExtractMenu";
import { PageHeader } from "@/components/ui/PageHeader";
import { BackToTop } from "@/components/ui/BackToTop";
import { LiveRefresh } from "@/components/ui/LiveRefresh";
import { formatDataRefresh } from "@/lib/time";
import { getDisplayZone } from "@/lib/display-zone.server";

// Bulk approve server actions run under THIS page's function config: a chunk of
// 25 simulated PM API calls takes several seconds, so give it headroom.
export const maxDuration = 60;

type SearchParams = {
  carrierGroup?: string;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  /** Deep-link scope to one or more assigned_approver queues (ag = assigned-approver group; may repeat). */
  ag?: string | string[];
  /** Comma-joined weekday filter, extract(dow) numbering 0=Sun..6=Sat. */
  dows?: string;
  shMin?: string;
  shMax?: string;
  sort?: string;
  dir?: string;
};

const PAGE_SIZE = 100;

/** Comma-joined multi-value param -> string[] (undefined when absent/empty). */
function csvList(raw?: string): string[] | undefined {
  const vals = raw?.split(",").map((s) => s.trim()).filter(Boolean);
  return vals && vals.length ? vals : undefined;
}

/** Assigned-approver param -> string[]. Accepts BOTH conventions: the top bar and
 *  the Approver column header write a single comma-joined `ag` (ag=a,b), while
 *  older deep links may repeat it (ag=a&ag=b). Split-and-flatten handles either. */
function agList(raw?: string | string[]): string[] | undefined {
  const parts = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  const vals = parts.flatMap((s) => s.split(",")).map((s) => s.trim()).filter(Boolean);
  return vals.length ? vals : undefined;
}

/** Comma-joined weekday param -> validated dow numbers (0=Sun..6=Sat). Drops
 *  empties before Number() so a bare "" never becomes 0 (= Sunday). */
function dowList(raw?: string): number[] | undefined {
  const vals = (raw ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean)
    .map(Number).filter((n) => Number.isInteger(n) && n >= 0 && n <= 6);
  return vals.length ? vals : undefined;
}

export default async function BrowsePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const user = await requireUser();
  const zone = await getDisplayZone();
  const approver = canApprove(user.role);
  const sp = await searchParams;
  const assignedApprover = agList(sp.ag);
  const carrierGroups = csvList(sp.carrierGroup);
  const statuses = csvList(sp.status);
  const stated = parseStatedRange(sp.shMin, sp.shMax);
  const filters: BrowseFilters = {
    carrierGroups,
    search: sp.search,
    statuses,
    dateFrom: sp.dateFrom,
    dateTo: sp.dateTo,
    dows: dowList(sp.dows),
    assignedApprover,
    statedMin: stated.min,
    statedMax: stated.max,
  };
  const sort = sanitizeBrowseSort(sp.sort, sp.dir);

  const [rows, total, divisions, approverGroups, lastRefresh] = await Promise.all([
    getEntryBrowsePage(filters, 0, PAGE_SIZE, sort),
    getEntryBrowseCount(filters),
    listDivisionOptions(),
    listApproverGroups(),
    getLastDataRefresh(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="DR Approval"
        count={total}
      >
        <LiveRefresh label={formatDataRefresh(lastRefresh, zone)} />
      </PageHeader>
      <Filters
        basePath="/approvals/browse"
        search={sp.search}
        showStatus
        dateFrom={sp.dateFrom}
        dateTo={sp.dateTo}
        dows={filters.dows}
        showDate
        wideSearch
        showDivision={false}
        statuses={statuses}
        approvers={assignedApprover}
        approverOptions={approverGroups}
        actions={<ExtractMenu filters={filters} total={total} />}
      />
      <div className="filter-dim">
        {/* Key on the FILTERS only: a sort change is handled client-side inside
            BrowseReports (history.replaceState, no navigation) and must not
            remount it — that would drop loaded rows and selections. */}
        <BrowseReports
          key={JSON.stringify(filters)}
          initialRows={rows}
          filters={filters}
          pageSize={PAGE_SIZE}
          total={total}
          canApprove={approver}
          groupOptions={divisions}
          approverOptions={approverGroups}
        />
      </div>
      <BackToTop />
    </div>
  );
}
