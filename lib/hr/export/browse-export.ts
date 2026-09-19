import { getEntryBrowsePage, type BrowseFilters, type BrowseRow } from "@/lib/hr/queries/approval-queries";
import type { BrowseSort } from "@/lib/hr/domain/browse-sort";
import { getReportRequirementsBatch, type ReportRequirement } from "@/lib/hr/queries/report-detail";
import { iterPagesParallel } from "@/lib/paged-all";
import { mapWithConcurrency } from "@/lib/concurrency";
import { formatPht } from "@/lib/time";
import { statedHoursNetOfBreak } from "@/lib/hr/domain/review-signals";
import { monthLabel } from "@/lib/hr/domain/export-month";
import { TIMER_EXPORT_HEADERS, timerRowsFromPages } from "./timer-export";

// The timer extract's headers/row builder live in their own module; re-export
// for the browse export route.
export { TIMER_EXPORT_HEADERS };

export { BROWSE_EXPORT_HEADERS } from "./browse-headers";
// requirementsCell lives in its own dependency-free module (unit-testable
// without the Next runtime); re-exported for existing importers.
export { requirementsCell } from "./requirements-cell";
import { requirementsCell } from "./requirements-cell";

// Requirement lookups go out in did-chunks: one .in() with a full export set
// (up to ~20k dids) would blow the GET URL limit. 4 chunks in flight.
const EXPORT_REQ_CHUNK = 200;
const PAGE_SIZE = 1000;
const EXPORT_MAX_PAGES = 200;


/** Requirement rows for one page of the export, fetched in did-chunks. */
async function reqsForRows(rows: BrowseRow[]): Promise<Record<string, ReportRequirement[]>> {
  const chunks: string[][] = [];
  for (let i = 0; i < rows.length; i += EXPORT_REQ_CHUNK) {
    chunks.push(rows.slice(i, i + EXPORT_REQ_CHUNK).map((r) => r.taskDid));
  }
  const grouped = await mapWithConcurrency(chunks, 4, getReportRequirementsBatch);
  const reqsByDid: Record<string, ReportRequirement[]> = {};
  for (const g of grouped) Object.assign(reqsByDid, g);
  return reqsByDid;
}

/** Cells in BROWSE_EXPORT_HEADERS order: the seven lead columns
 *  (LEAD_EXPORT_HEADERS), then the app's own columns. */
function rowCells(r: BrowseRow, reqs: ReportRequirement[] | undefined): (string | number | null)[] {
  return [
    r.empId,
    r.employeeName ?? r.empId,
    monthLabel(r.workDate),
    r.workDate,
    r.taskStatus,
    r.totalHours,
    requirementsCell(reqs),
    r.carrierGroup,
    r.division,
    formatPht(r.clockInEt),
    formatPht(r.submittedOnEt),
    formatPht(r.approvedOnEt),
    statedHoursNetOfBreak(r.totalHours),
    r.timedHours,
    r.assignedApprover,
    r.approvedBy,
    r.approvalLatencyDays,
    r.taskDid,
  ];
}

/**
 * The full filtered browse export, one cell-array per row, streamed: pages
 * arrive in parallel waves and each page's requirement lookups run before its
 * rows are yielded, so the consumer (CSV/NDJSON route) emits progressively
 * instead of waiting for the whole set.
 */
export async function* browseExportRows(
  f: BrowseFilters,
  sort?: BrowseSort,
): AsyncGenerator<(string | number | null)[], void, void> {
  const pages = iterPagesParallel(
    (page) => getEntryBrowsePage(f, page * PAGE_SIZE, PAGE_SIZE, sort),
    { pageSize: PAGE_SIZE, maxPages: EXPORT_MAX_PAGES, concurrency: 4 },
  );
  for await (const rows of pages) {
    const reqsByDid = await reqsForRows(rows);
    for (const r of rows) yield rowCells(r, reqsByDid[r.taskDid]);
  }
}

/** One row per timer entry behind the filtered DR Approval set: same report
 *  paging as browseExportRows, then the shared timerRowsFromPages turns each
 *  page into its drawer "Worked on this day" entries. BrowseRow already carries
 *  email/workDate/taskDid, so it drives the shared helper unchanged. */
export async function* browseTimerExportRows(
  f: BrowseFilters,
  sort?: BrowseSort,
): AsyncGenerator<(string | number | null)[], void, void> {
  yield* timerRowsFromPages(
    iterPagesParallel(
      (page) => getEntryBrowsePage(f, page * PAGE_SIZE, PAGE_SIZE, sort),
      { pageSize: PAGE_SIZE, maxPages: EXPORT_MAX_PAGES, concurrency: 4 },
    ),
  );
}
