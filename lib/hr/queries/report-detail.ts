import { DB } from "@/lib/db/schemas";
import { createServiceClient } from "@/lib/supabase/service";
import { withDbRetry } from "@/lib/hr/db-retry";
import { etDayRangeUtc } from "@/lib/time";
import { groupRequirementsByTask } from "../domain/requirements-prefetch";
import { groupDayActivities, type DayActivityPair, type TimerActivityRow } from "../domain/day-activities-prefetch";
// Row shapes live in the domain layer; import to type return values, re-export for callers.
import type { ReportRequirement, DayActivity } from "../domain/types";
export type { ReportRequirement, DayActivity };

/**
 * Just the requirement rows for one report, for the Browse hover peek. Same
 * source and shape as ReportDetail.requirements, without the heavier detail joins.
 */
export async function getReportRequirements(taskDid: string): Promise<ReportRequirement[]> {
  const svc = createServiceClient();
  // Retry-once like the batch variant: this read now sits on the hot path of
  // the attachment routes too.
  const data = await withDbRetry(async () => {
    const { data, error } = await svc
      .schema(DB.staging)
      .from("stg_daily_report_hours")
      .select("req_id, work_description, hours_worked, req_status, file_uploaded_count")
      .eq("task_did", taskDid)
      .order("req_id");
    if (error) throw new Error(error.message);
    return data;
  });
  return (data ?? []).map((r) => ({
    reqId: r.req_id,
    description: r.work_description,
    hours: r.hours_worked,
    status: r.req_status,
    fileCount: r.file_uploaded_count ?? 0,
  }));
}

/**
 * Requirement rows for MANY reports in one query, keyed by task_did, for the
 * Browse hover-card prefetch. Every requested did gets an entry ([] when the
 * report has no rows) so callers can cache "fetched, none" distinctly.
 */
export async function getReportRequirementsBatch(
  taskDids: string[],
): Promise<Record<string, ReportRequirement[]>> {
  if (taskDids.length === 0) return {};
  const svc = createServiceClient();
  const data = await withDbRetry(async () => {
    const { data: rows, error } = await svc
      .schema(DB.staging)
      .from("stg_daily_report_hours")
      .select("task_did, req_id, work_description, hours_worked, req_status, file_uploaded_count")
      .in("task_did", taskDids)
      .order("task_did")
      .order("req_id");
    if (error) throw new Error(error.message);
    return rows;
  });
  return groupRequirementsByTask(taskDids, data ?? []);
}

/**
 * "Worked on this day" timer blocks for MANY reports in one window query,
 * keyed by task_did — the Browse page prefetch that makes the drawer's timer
 * section as instant as Requirements. One query covers the page's whole ET
 * date window (`ilikeAnyOf` = case-insensitive email match, same semantics as
 * getReportDetail's per-report `ilike`); rows are attributed back to reports
 * by lower(email) + ET day in groupDayActivities. Every requested did gets an
 * entry ([] = "fetched, none").
 */
export async function getDayActivitiesBatch(
  pairs: DayActivityPair[],
): Promise<Record<string, DayActivity[]>> {
  if (pairs.length === 0) return {};
  // Chunk date-sorted so each chunk queries a tight ET window (browse pages
  // are work_date-sorted, so a 50-pair chunk usually spans a day or two).
  const sorted = [...pairs].sort((a, b) => a.workDate.localeCompare(b.workDate));
  const chunks: DayActivityPair[][] = [];
  for (let i = 0; i < sorted.length; i += 50) chunks.push(sorted.slice(i, i + 50));
  const grouped = await Promise.all(chunks.map(fetchDayActivitiesChunk));
  return Object.assign({}, ...grouped) as Record<string, DayActivity[]>;
}

async function fetchDayActivitiesChunk(
  pairs: DayActivityPair[],
): Promise<Record<string, DayActivity[]>> {
  const emails = [...new Set(pairs.map((p) => p.email).filter((e): e is string => Boolean(e)))];
  if (emails.length === 0) return groupDayActivities(pairs, []);
  const { startIso } = etDayRangeUtc(pairs[0].workDate);
  const { endIso } = etDayRangeUtc(pairs[pairs.length - 1].workDate);
  const svc = createServiceClient();
  // Range-paginate: PostgREST silently caps a response at 1000 rows (the old
  // dashboard rowcap bug) and a busy window can exceed it.
  const rows: TimerActivityRow[] = [];
  const PAGE = 1000;
  await withDbRetry(async () => {
    rows.length = 0; // retry restarts cleanly
    for (let page = 0; page < 10; page++) {
      const { data, error } = await svc
        .schema(DB.staging)
        .from("stg_timer_activities_clean")
        .select("user_email, project, site_name, task, task_clean, asset_did, start_time, end_time, duration_min")
        .ilikeAnyOf("user_email", emails)
        .gte("start_time", startIso)
        .lt("start_time", endIso)
        .order("start_time")
        .order("user_email")
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) throw new Error(error.message);
      rows.push(...((data ?? []) as TimerActivityRow[]));
      if ((data ?? []).length < PAGE) break;
    }
  });
  return groupDayActivities(pairs, rows);
}

export type ReportDetail = {
  taskDid: string;
  empId: string;
  employeeName: string | null;
  email: string | null;
  position: string | null;
  carrierGroup: string | null;
  division: string | null;
  workDate: string;
  taskStatus: string;
  assetName: string | null;
  milestone: string | null;
  totalHours: number | null;
  clockInEt: string | null;
  submittedOnEt: string | null;
  approvedOnEt: string | null;
  approvedBy: string | null;
  assignedApprover: string | null;
  approvalLatencyDays: number | null;
  pendingWaitDays: number | null;
  requirements: ReportRequirement[];
  dayActivities: DayActivity[];
};

type HeadRow = {
  emp_id: string; employee_name: string | null; email: string | null; position: string | null;
  carrier_group: string | null; division: string | null; work_date: string;
  task_status: string; asset_name: string | null; milestone: string | null;
  total_hours: number | null; clock_in_et: string | null; submitted_on_et: string | null;
  approved_on_et: string | null; approved_by: string | null; assigned_approver: string | null;
  approval_latency_days: number | null; pending_wait_days: number | null;
};

export async function getReportDetail(taskDid: string): Promise<ReportDetail | null> {
  const svc = createServiceClient();

  // The requirements query only needs taskDid, so it runs alongside the head
  // lookup; only the timer query has to wait for the head row (email/work_date).
  const [{ data: head, error: headErr }, { data: reqs, error: reqErr }] = await Promise.all([
    svc
      .schema(DB.analytics)
      .from("v_daily_report_approvals")
      .select(
        "emp_id, employee_name, email, position, carrier_group, division, work_date, task_status, asset_name, milestone, total_hours, clock_in_et, submitted_on_et, approved_on_et, approved_by, assigned_approver, approval_latency_days, pending_wait_days",
      )
      .eq("task_did", taskDid)
      .limit(1)
      .maybeSingle<HeadRow>(),
    svc.schema(DB.staging).from("stg_daily_report_hours")
      .select("req_id, work_description, hours_worked, req_status, file_uploaded_count")
      .eq("task_did", taskDid).order("req_id"),
  ]);
  if (headErr) throw new Error(headErr.message);
  if (reqErr) throw new Error(reqErr.message);
  if (!head) return null;

  // Everything the member logged during this report's ET work day. The PH night
  // shift (evening -> next-day morning) falls within one ET calendar day, and
  // the boundary follows US daylight saving automatically.
  const { startIso, endIso } = etDayRangeUtc(head.work_date);

  const { data: acts, error: actErr } = head.email
    ? await svc.schema(DB.staging).from("stg_timer_activities_clean")
        .select("project, site_name, task, task_clean, asset_did, start_time, end_time, duration_min")
        .ilike("user_email", head.email)
        .gte("start_time", startIso)
        .lt("start_time", endIso)
        .order("start_time")
    : { data: [], error: null };
  if (actErr) throw new Error(actErr.message);

  return {
    taskDid,
    empId: head.emp_id,
    employeeName: head.employee_name,
    email: head.email,
    position: head.position,
    carrierGroup: head.carrier_group,
    division: head.division,
    workDate: head.work_date,
    taskStatus: head.task_status,
    assetName: head.asset_name,
    milestone: head.milestone,
    totalHours: head.total_hours,
    clockInEt: head.clock_in_et,
    submittedOnEt: head.submitted_on_et,
    approvedOnEt: head.approved_on_et,
    approvedBy: head.approved_by,
    assignedApprover: head.assigned_approver,
    approvalLatencyDays: head.approval_latency_days,
    pendingWaitDays: head.pending_wait_days,
    requirements: (reqs ?? []).map((r) => ({
      reqId: r.req_id,
      description: r.work_description,
      hours: r.hours_worked,
      status: r.req_status,
      fileCount: r.file_uploaded_count ?? 0,
    })),
    dayActivities: (acts ?? []).map((a) => ({
      start: a.start_time,
      end: a.end_time,
      durationMin: a.duration_min,
      project: a.project,
      siteName: a.site_name,
      task: a.task_clean ?? a.task,
      assetDid: a.asset_did,
    })),
  };
}
