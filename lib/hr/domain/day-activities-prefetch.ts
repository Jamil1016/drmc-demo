import { formatInTimeZone } from "date-fns-tz";
import type { DayActivity } from "./types";

/** (taskDid, email, workDate) triple the day-activities batch query needs. */
export type DayActivityPair = {
  taskDid: string;
  email: string | null;
  workDate: string; // yyyy-MM-dd (ET work day, same as the report row)
};

/** Raw stg_timer_activities_clean row shape returned by the batch query. */
export type TimerActivityRow = {
  user_email: string | null;
  start_time: string | null;
  end_time: string | null;
  duration_min: number | null;
  project: string | null;
  site_name: string | null;
  task: string | null;
  task_clean: string | null;
  asset_did: string | null;
};

/**
 * Group one window-query's timer rows back onto the reports that asked for
 * them: a row belongs to a pair when the emails match case-insensitively AND
 * the row's start_time falls on the pair's ET work day (same attribution rule
 * as getReportDetail: PH night shifts stay on their ET start date). Every
 * requested taskDid gets an entry — [] when nothing was logged — so the cache
 * can tell "fetched, none" apart from "not fetched yet".
 */
export function groupDayActivities(
  pairs: DayActivityPair[],
  rows: TimerActivityRow[],
): Record<string, DayActivity[]> {
  const out: Record<string, DayActivity[]> = {};
  for (const p of pairs) out[p.taskDid] = [];
  // email(lower) -> ET day -> taskDids expecting that combination
  const wanted = new Map<string, string[]>();
  for (const p of pairs) {
    if (!p.email) continue;
    const key = `${p.email.toLowerCase()}|${p.workDate}`;
    const list = wanted.get(key);
    if (list) list.push(p.taskDid);
    else wanted.set(key, [p.taskDid]);
  }
  for (const r of rows) {
    if (!r.user_email || !r.start_time) continue;
    const etDay = formatInTimeZone(new Date(r.start_time), "America/New_York", "yyyy-MM-dd");
    const dids = wanted.get(`${r.user_email.toLowerCase()}|${etDay}`);
    if (!dids) continue;
    const activity: DayActivity = {
      start: r.start_time,
      end: r.end_time,
      durationMin: r.duration_min,
      project: r.project,
      siteName: r.site_name,
      task: r.task_clean ?? r.task,
      assetDid: r.asset_did,
    };
    for (const did of dids) out[did].push(activity);
  }
  return out;
}
