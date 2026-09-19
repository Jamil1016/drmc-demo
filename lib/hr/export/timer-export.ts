import { getDayActivitiesBatch } from "@/lib/hr/queries/report-detail";
import { monthOf } from "@/lib/hr/domain/export-month";
import { formatPhtInstant } from "@/lib/time";

// Timer-entries extract: rows come from the same source as the drawer's
// "Worked on this day" data. Depends only on leaf helpers, so the export lib
// does not form a cycle importing it.
export const TIMER_EXPORT_HEADERS = [
  "Emp ID", "Employee", "Division", "Work date", "Month", "Task DID",
  "Project", "Site", "Asset DID", "Task",
  "Start (PHT)", "End (PHT)", "Duration (min)", "Open entry (1/0)",
];

/** The minimal report-row shape the timer export needs (BrowseRow satisfies
 *  it), so any paged report stream can drive timerRowsFromPages. */
export type TimerReportRow = {
  empId: string;
  employeeName: string | null;
  carrierGroup: string | null;
  workDate: string;
  taskDid: string;
  email: string | null;
};

/**
 * One row per timer entry behind a stream of report pages: each page's entries
 * come from the drawer's own getDayActivitiesBatch (so the extract shows exactly
 * what the "Worked on this day" panel shows). Task DID is the join key back to
 * the data extract; missing-report rows keep their entries (the timer evidence is
 * why those rows exist).
 */
export async function* timerRowsFromPages(
  pages: AsyncIterable<TimerReportRow[]>,
): AsyncGenerator<(string | number | null)[], void, void> {
  for await (const rows of pages) {
    const actsByDid = await getDayActivitiesBatch(
      rows.map((r) => ({ taskDid: r.taskDid, email: r.email, workDate: r.workDate })),
    );
    for (const r of rows) {
      for (const a of actsByDid[r.taskDid] ?? []) {
        yield [
          r.empId,
          r.employeeName ?? r.empId,
          r.carrierGroup,
          r.workDate,
          monthOf(r.workDate),
          r.taskDid,
          a.project,
          a.siteName,
          a.assetDid,
          a.task,
          // start/end are true UTC instants (timestamptz), NOT the ET-naive
          // *_et columns formatPht is for: format them the same way the
          // "Worked on this day" drawer does (formatPhtInstant), so the extract
          // matches the panel and stays correct even if PostgREST ever serializes
          // the timestamptz without an offset (formatPht would misread it as ET).
          formatPhtInstant(a.start),
          formatPhtInstant(a.end),
          a.durationMin,
          a.end == null ? 1 : 0,
        ];
      }
    }
  }
}
