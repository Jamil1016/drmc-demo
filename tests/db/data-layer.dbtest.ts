import "./next-shim";
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { resetDemo, withPg } from "./helpers";
import { DB } from "@/lib/db/schemas";
import { NO_REALTIME } from "@/lib/supabase/no-realtime";

import {
  getApprovalQueuePage, getApprovalQueueSummary, getApproverScorecard, getEntryBrowsePage,
  getEntryBrowseCount, getEntryBrowseAll, listApproverGroups, getApprovableTaskDids,
  getGroupPending, getBrowseRowByTaskDid, fetchTaskStatuses, getGroupApprovers,
} from "@/lib/hr/queries/approval-queries";
import { getReportDetail, getReportRequirements, getReportRequirementsBatch, getDayActivitiesBatch } from "@/lib/hr/queries/report-detail";
import { listDirectory, countActiveEmployees, getDirectoryEntry } from "@/lib/hr/queries/directory-queries";
import { getMemberApprovers } from "@/lib/hr/queries/member-approver-queries";
import { listScheduleHistory } from "@/lib/hr/queries/schedule-history-queries";
import { getApproverGroupsForEmail, getTeamMemberIds, getUnassignedReportsForApprover } from "@/lib/hr/queries/home-queries";
import { getVarianceRows } from "@/lib/hr/queries/variance-queries";
import { getTimerRollupHealth } from "@/lib/hr/queries/timer-rollup-health";
import { getLastDataRefresh } from "@/lib/hr/queries/data-freshness";
import { listDivisionOptions } from "@/lib/hr/queries/division-options";
import { getReviewSummary, getReviewBacklog, getApprovalCompliance } from "@/lib/hr/queries/review-queries";
import { queryActivityLog, getActivityDashboard } from "@/lib/hr/queries/activity-queries";
import { browseExportRows, browseTimerExportRows, BROWSE_EXPORT_HEADERS, TIMER_EXPORT_HEADERS } from "@/lib/hr/export/browse-export";
import { logActivity } from "@/lib/hr/audit";
import {
  createBatch, findActiveBatch, getBatchApprover, recomputeBatch, getBatchFailures,
  requeueFailed, countBatchesSince, getBatchOutage,
} from "@/lib/hr/queries/approval-batch";
import { approvedTaskDids } from "@/lib/hr/queries/approval-log";
import { processBatchChunk } from "@/lib/hr/approvals/process-chunk";
import { checkBatchCreationLimit } from "@/lib/demo/rate-limit";
import { PRODUCTION_CARRIER_GROUPS } from "@/lib/hr/domain/production-scope";

const DEMO = "demo@example.com";
const fast = { latency: async () => {}, sleep: async () => {} };

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await resetDemo();
});
test.afterAll(async () => {
  await resetDemo();
});

// ---------------------------------------------------------------- reads ----

test("home: approver scope, team members, unassigned reports, freshness, roster count", async () => {
  const groups = await getApproverGroupsForEmail(DEMO);
  expect(groups).toEqual(["Daily Report Approvers - Group A", "Daily Report Approvers - Group B"]);

  const team = await getTeamMemberIds(DEMO);
  expect(team.assigned).toBe(true);
  expect(team.ids.length).toBe(22);

  const unassigned = await getUnassignedReportsForApprover(DEMO, false);
  expect(unassigned.length).toBeGreaterThan(0);
  for (const r of unassigned) expect(team.ids).toContain(r.empId);
  const all = await getUnassignedReportsForApprover(DEMO, true);
  expect(all.length).toBeGreaterThanOrEqual(unassigned.length);

  expect(await countActiveEmployees()).toBe(40);

  const refreshed = await getLastDataRefresh();
  expect(refreshed).not.toBeNull();
  expect(Date.now() - new Date(refreshed!).getTime()).toBeLessThan(11 * 60 * 1000);
});

test("directory: list, filters, profile, approvers, schedule history", async () => {
  const everyone = await listDirectory();
  expect(everyone.length).toBe(42);
  expect(everyone.every((e) => e.email.endsWith("@example.com"))).toBe(true);

  const active = await listDirectory({ activeOnly: true, carrierGroups: ["Group A - Carrier A"] });
  expect(active.length).toBeGreaterThan(5);
  expect(active.every((e) => e.isActive && e.carrierGroup === "Group A - Carrier A")).toBe(true);
  expect(await listDirectory({ empIds: [] })).toEqual([]);
  expect((await listDirectory({ search: "lindqvist" })).length).toBe(1);

  const entry = await getDirectoryEntry("260001");
  expect(entry?.reportDisplayName).toBe("Ada Lindqvist");
  expect(entry?.shiftTimeInPht).toBeTruthy();
  expect(await getDirectoryEntry("nope")).toBeNull();

  const approvers = await getMemberApprovers("260001");
  expect(approvers.map((a) => a.email)).toEqual(["kasper.abernathy@example.com", DEMO]);

  const history = await listScheduleHistory("260001");
  expect(history).not.toBeNull();
  expect(history!.length).toBeGreaterThanOrEqual(2);
  expect(history!.some((h) => h.changeKind === "temporary" && h.isCurrent)).toBe(true);
});

test("approvals queue: summary RPC agrees with the row query, filters apply to both", async () => {
  const summary = await getApprovalQueueSummary({});
  const viaSql = await withPg(async (c) =>
    (await c.query("select count(*)::int n from drmc_analytics.v_daily_report_approvals where is_awaiting_approval")).rows[0].n as number);
  expect(summary.kpis.awaiting).toBe(viaSql);
  expect(summary.kpis.awaiting).toBeGreaterThan(150);
  expect(summary.backlog.reduce((n, g) => n + g.waiting, 0)).toBe(summary.kpis.awaiting);

  const page = await getApprovalQueuePage({}, 200);
  expect(page.length).toBe(Math.min(200, summary.kpis.awaiting));
  for (let i = 1; i < page.length; i++) {
    expect(page[i - 1].pendingWaitDays ?? 0).toBeGreaterThanOrEqual(page[i].pendingWaitDays ?? 0);
  }

  const scoped = await getApprovalQueueSummary({ carrierGroups: ["Group B - Carrier B"], search: "a" });
  const scopedRows = await getApprovalQueuePage({ carrierGroups: ["Group B - Carrier B"], search: "a" }, 1000);
  expect(scoped.kpis.awaiting).toBe(scopedRows.length);
  expect(scopedRows.every((r) => r.carrierGroup === "Group B - Carrier B")).toBe(true);
});

test("browse grid: page, exact count, sort, every filter, select-all ids, single row", async () => {
  const total = await getEntryBrowseCount({});
  expect(total).toBeGreaterThan(2200);
  const first = await getEntryBrowsePage({}, 0, 100);
  expect(first.length).toBe(100);
  const second = await getEntryBrowsePage({}, 100, 100);
  expect(new Set([...first, ...second].map((r) => r.taskDid)).size).toBe(200);

  const byHours = await getEntryBrowsePage({}, 0, 50, { key: "timed_hours", dir: "desc" });
  for (let i = 1; i < byHours.length; i++) expect(byHours[i - 1].timedHours ?? -1).toBeGreaterThanOrEqual(byHours[i].timedHours ?? -1);

  const from = first[first.length - 1].workDate;
  const filters = {
    carrierGroups: ["Group A - Carrier A", "Group B - Carrier B"], statuses: ["submitted"], dateFrom: from,
    dows: [1, 2, 3, 4, 5], assignedApprover: ["Daily Report Approvers - Group A"], statedMin: 7, statedMax: 9, search: "a",
  };
  const filtered = await getEntryBrowsePage(filters, 0, 1000);
  expect(filtered.length).toBe(await getEntryBrowseCount(filters));
  for (const r of filtered) {
    expect(r.taskStatus).toBe("submitted");
    expect(r.assignedApprover).toBe("Daily Report Approvers - Group A");
    expect(r.workDate >= from).toBe(true);
    expect((r.totalHours ?? 0) - 1).toBeGreaterThanOrEqual(7);
    expect((r.totalHours ?? 0) - 1).toBeLessThanOrEqual(9);
  }

  const approvable = await getApprovableTaskDids({});
  expect(approvable.length).toBe((await getApprovalQueueSummary({})).kpis.awaiting);

  const row = await getBrowseRowByTaskDid(approvable[0]);
  expect(row?.taskStatus).toBe("submitted");
  expect(row?.pendingWaitDays).not.toBeNull();

  expect((await listApproverGroups()).map((g) => g.label)).toEqual(["Group A", "Group B", "Group C Fiber", "Group C Rural"]);
  expect(await listDivisionOptions()).toContain("Group C - Carrier C/Rural");

  const everything = await getEntryBrowseAll({ statuses: ["rejected"] });
  expect(everything.length).toBe(await getEntryBrowseCount({ statuses: ["rejected"] }));
});

test("report detail: head, requirements, the day's timer entries, and the batch prefetch", async () => {
  const [row] = await getEntryBrowsePage({ statuses: ["approved"] }, 0, 1);
  const detail = await getReportDetail(row.taskDid);
  expect(detail?.employeeName).toBe(row.employeeName);
  expect(detail!.requirements.length).toBeGreaterThanOrEqual(2);
  expect(detail!.dayActivities.length).toBeGreaterThanOrEqual(4);
  expect(detail!.assetName).toContain(row.empId);
  expect(await getReportDetail("nope")).toBeNull();

  expect((await getReportRequirements(row.taskDid)).length).toBe(detail!.requirements.length);
  const rows = await getEntryBrowsePage({}, 0, 60);
  const reqs = await getReportRequirementsBatch(rows.map((r) => r.taskDid));
  expect(Object.keys(reqs).length).toBe(60);
  const acts = await getDayActivitiesBatch(rows.map((r) => ({ taskDid: r.taskDid, email: r.email, workDate: r.workDate })));
  expect(Object.keys(acts).length).toBe(60);
  expect(acts[row.taskDid] ?? detail!.dayActivities).toBeTruthy();
  const sample = rows.find((r) => r.taskDid in acts && acts[r.taskDid].length > 0)!;
  expect((await getReportDetail(sample.taskDid))!.dayActivities.length).toBe(acts[sample.taskDid].length);
});

test("scorecard: RPC rows, group panel reads", async () => {
  const rows = await getApproverScorecard();
  expect(rows.map((r) => r.displayLabel).sort()).toEqual(["(no approver assigned)", "Group A", "Group B", "Group C Fiber", "Group C Rural"]);
  const a = rows.find((r) => r.displayLabel === "Group A")!;
  expect(a.pending).toBeGreaterThan(0);
  expect(a.onTimeCount + a.lateCount + a.filedLateCount).toBeGreaterThan(0);
  expect(a.approvers).toBe(2);

  const windowed = await getApproverScorecard("2000-01-01", "2000-01-31");
  expect(windowed).toEqual([]);

  const pending = await getGroupPending(a.groupLabel);
  expect(pending.length).toBe(a.pending);
  const noApprover = await getGroupPending("(no approver assigned)");
  expect(noApprover.every((r) => r.assignedApprover === null)).toBe(true);

  const approvers = await getGroupApprovers(a.groupLabel);
  expect(approvers.map((x) => x.name).sort()).toEqual(["Demo Manager", "Kasper Abernathy"]);
});

test("hours analysis: variance rows, the group with a story, rollup health", async () => {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const rows = await getVarianceRows(from, to);
  expect(rows.length).toBeGreaterThan(2000);
  expect(new Set(rows.map((r) => r.carrierGroup))).toEqual(new Set(PRODUCTION_CARRIER_GROUPS));
  const breachRate = (g: string) => {
    const mine = rows.filter((r) => r.carrierGroup === g);
    return mine.filter((r) => r.breach).length / mine.length;
  };
  expect(breachRate("Group C - Carrier C/Rural")).toBeGreaterThan(0.5);
  expect(breachRate("Group A - Carrier A")).toBeLessThan(0.05);
  expect(rows.some((r) => !r.isActive)).toBe(true);

  const health = await getTimerRollupHealth();
  expect(health.empty).toBe(false);
  expect(health.maxWorkDay).not.toBeNull();
});

test("DR monitoring: the filing view grades every due day by the 48 h / 60 h rule", async () => {
  await withPg(async (c) => {
    const one = async (q: string) => (await c.query(q)).rows[0].n as number;
    const v = "drmc_analytics.v_filing_compliance";
    expect(await one(`select count(*)::int n from ${v}`)).toBeGreaterThan(2000);
    // The deadline is clock-in + 48 h, 60 h for a Friday work date.
    expect(await one(`select count(*)::int n from ${v}
      where deadline_et <> clock_in_et + case when work_dow = 5 then interval '60 hours' else interval '48 hours' end`)).toBe(0);
    // A day with timers but no report row is due too, on working days only, and never for a manager.
    expect(await one(`select count(*)::int n from ${v} where task_did is null`)).toBeGreaterThan(10);
    expect(await one(`select count(*)::int n from ${v} where task_did is null and work_dow not between 1 and 5`)).toBe(0);
    expect(await one(`select count(*)::int n from ${v} f join drmc_demo.employee e using (emp_id) where e.position = 'Delivery Manager'`)).toBe(0);
    // Late and missing are exclusive, and both need a matured day.
    expect(await one(`select count(*)::int n from ${v} where (is_late and is_missing) or ((is_late or is_missing) and not is_matured)`)).toBe(0);
    expect(await one(`select count(*)::int n from ${v} where is_missing and days_overdue is null`)).toBe(0);
    // One row per person per day.
    expect(await one(`select count(*)::int n from (select 1 from ${v} group by emp_id, work_date having count(*) > 1) d`)).toBe(0);
  });
});

test("DR monitoring: summary, backlog and approver compliance RPCs agree with the views", async () => {
  const to = new Date().toISOString().slice(0, 10);
  const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const s = await getReviewSummary(from, to);
  await withPg(async (c) => {
    const direct = (await c.query(
      `select (count(*) filter (where is_matured))::int matured, (count(*) filter (where is_late))::int late,
              (count(*) filter (where is_missing))::int missing
         from drmc_analytics.v_filing_compliance where work_date between $1 and $2`, [from, to])).rows[0];
    expect({ matured: s.kpis.matured, late: s.kpis.late, missing: s.kpis.missing }).toEqual(direct);
  });
  expect(s.kpis.matured).toBeGreaterThan(500);
  expect(s.kpis.late).toBeGreaterThan(0);
  expect(s.kpis.onTimePct).toBeGreaterThan(80);
  expect(s.kpis.medianLagHours).toBeGreaterThan(8);
  expect(s.kpis.p90LagHours!).toBeGreaterThanOrEqual(s.kpis.medianLagHours!);
  expect(s.kpis.highVariance).toBeGreaterThan(0);
  // One trend point per calendar day, in order; the day sums are the KPIs.
  expect(s.trend.length).toBeGreaterThanOrEqual(28);
  expect(s.trend.map((t) => t.d)).toEqual([...s.trend.map((t) => t.d)].sort());
  expect(s.trend.reduce((n, t) => n + t.late, 0)).toBe(s.kpis.late);
  expect(s.trend.reduce((n, t) => n + t.missing, 0)).toBe(s.kpis.missing);
  expect(s.trend.every((t) => t.onTime + t.late === t.filedN)).toBe(true);
  expect(s.trend.some((t) => t.matured === null)).toBe(true); // weekends: nothing due
  expect(s.groups.map((g) => g.carrierGroup).sort()).toEqual([...PRODUCTION_CARRIER_GROUPS].sort());
  expect(s.groups.map((g) => g.latePct)).toEqual([...s.groups.map((g) => g.latePct)].sort((a, b) => b - a));

  // "All dates" queries from a far floor; the trend is clipped to the data.
  const all = await getReviewSummary("2000-01-01", to);
  expect(all.kpis.matured).toBeGreaterThan(s.kpis.matured);
  expect(all.trend.length).toBeLessThan(120);
  // A range with no data is empty, not an error.
  const none = await getReviewSummary("2001-01-01", "2001-01-31");
  expect(none.kpis).toMatchObject({ matured: 0, late: 0, missing: 0, onTimePct: null, medianLagHours: null });
  expect(none.trend).toEqual([]);

  const b = await getReviewBacklog();
  expect(b.total).toBe(all.kpis.missing);
  expect(b.buckets.map((x) => x.label)).toEqual(["0-2d", "3-5d", "6-10d", "11-20d", "21d+"]);
  expect(b.buckets.reduce((n, x) => n + x.n, 0)).toBe(b.total);
  expect(b.oldest.length).toBe(Math.min(8, b.total));
  expect(b.oldest[0].daysOverdue).toBe(b.oldestDays);
  expect(b.oldest.every((o) => o.employeeName && o.workDate)).toBe(true);

  const a = await getApprovalCompliance();
  expect(a.periods.length).toBe(8);
  expect(a.periods.map((p) => p.periodStart)).toEqual([...a.periods.map((p) => p.periodStart)].sort());
  expect(a.periods.every((p) => new Date(`${p.periodStart}T12:00:00Z`).getUTCDay() === 1)).toBe(true);
  expect(a.periods[a.periods.length - 1].deadline >= a.today).toBe(true); // the current week is in flight
  expect(a.periods[0].deadline < a.today).toBe(true);
  expect(a.periods[0].onTime).toBeGreaterThan(a.periods[0].late);
  const o = a.overdue;
  expect(o.b1_2 + o.b3_5 + o.b6_10 + o.b11p).toBe(o.total);
  expect(o.total).toBeGreaterThan(0);
  await withPg(async (c) => {
    const waiting = (await c.query(
      `select (count(*) filter (where pending_wait_days > 2))::int past, (count(*) filter (where pending_wait_days <= 2))::int inside
         from drmc_analytics.v_daily_report_approvals where is_awaiting_approval`)).rows[0];
    expect(o.total + o.filedLatePending).toBe(waiting.past);
    expect(a.dueSoon).toBeLessThanOrEqual(waiting.inside);
    expect(a.dueSoon).toBeGreaterThan(0);
  });
});

test("activity: seeded history, feed filters with keyset paging, dashboard RPC", async () => {
  const to = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const from = new Date(Date.now() - 29 * 86_400_000).toISOString().slice(0, 10);
  const seeded = await withPg(async (c) => (await c.query(
    `select count(*)::int n, (count(*) filter (where actor_email = $1))::int demo,
            (count(*) filter (where created_at > now()))::int future,
            count(distinct actor_email)::int actors, count(distinct action)::int actions,
            coalesce(sum((detail ->> 'approved')::int), 0)::int approved
       from drmc_app.hr_audit_log`, [DEMO])).rows[0]);
  expect(seeded.n).toBeGreaterThanOrEqual(30);
  expect(seeded.n).toBeLessThanOrEqual(70);
  expect(seeded).toMatchObject({ demo: 0, future: 0, actors: 5, actions: 3 });

  // Newest first, and the keyset cursor walks the whole log without overlap.
  const page1 = await queryActivityLog({ limit: 20 });
  expect(page1.length).toBe(20);
  expect(page1.map((r) => r.id)).toEqual([...page1.map((r) => r.id)].sort((x, y) => y - x));
  const page2 = await queryActivityLog({ limit: 100, before: page1[page1.length - 1].id });
  expect(page1.length + page2.length).toBe(seeded.n);
  expect(page2.every((r) => r.id < page1[page1.length - 1].id)).toBe(true);
  const bulk = await queryActivityLog({ limit: 100, action: "approval.bulk_approve" });
  expect(bulk.length).toBeGreaterThan(0);
  expect(bulk.every((r) => r.action === "approval.bulk_approve" && r.entity === "approval_batch" && r.entity_id)).toBe(true);
  const one = await queryActivityLog({ limit: 100, actor: "priya" });
  expect(one.length).toBeGreaterThan(0);
  expect(one.every((r) => r.actor_email === "priya.everhart@example.com")).toBe(true);
  expect(await queryActivityLog({ limit: 100, from: "2001-01-01", to: "2001-01-02" })).toEqual([]);

  const d = await getActivityDashboard(from, to, "day");
  expect(d.kpis).toEqual({
    logins: (await queryActivityLog({ limit: 100, action: "auth.sign_in" })).length,
    active_users: 5, approvals: seeded.approved, failures: 0,
  });
  expect(d.logins_series.length).toBe(d.approvals_series.length);
  expect(d.logins_series.reduce((n, p) => n + p.n, 0)).toBe(d.kpis.logins);
  expect(d.approvals_series.reduce((n, p) => n + p.n, 0)).toBe(d.kpis.approvals);
  expect(d.top_approvers.length).toBe(5);
  expect(d.top_approvers.reduce((n, p) => n + p.n, 0)).toBe(d.kpis.approvals);
  expect(d.top_failures).toEqual([]);
  // Coarser buckets hold the same totals; an unknown grouping falls back to days.
  const w = await getActivityDashboard(from, to, "week");
  expect(w.logins_series.length).toBeLessThan(d.logins_series.length);
  expect(w.logins_series.reduce((n, p) => n + p.n, 0)).toBe(d.kpis.logins);
  const odd = await getActivityDashboard(from, to, "decade" as never);
  expect(odd.logins_series.length).toBe(d.logins_series.length);

  // A visitor's own approve shows up in the KPIs and the leaderboard.
  await logActivity({ actorEmail: DEMO, action: "approval.bulk_approve", entity: "approval_batch", entityId: "t", detail: { total: 500, approved: 497, failed: 3 } });
  const after = await getActivityDashboard(from, to, "day");
  expect(after.kpis).toMatchObject({ active_users: 6, approvals: seeded.approved + 497, failures: 3 });
  expect(after.top_approvers[0]).toEqual({ email: DEMO, n: 497 });
  await resetDemo();
});

test("exports: data rows and timer rows stream in header order", async () => {
  const filters = { statuses: ["rejected"] };
  const data: (string | number | null)[][] = [];
  for await (const r of browseExportRows(filters)) data.push(r);
  expect(data.length).toBe(await getEntryBrowseCount(filters));
  expect(data[0].length).toBe(BROWSE_EXPORT_HEADERS.length);
  const timers: (string | number | null)[][] = [];
  for await (const r of browseTimerExportRows(filters)) timers.push(r);
  expect(timers.length).toBeGreaterThan(data.length * 3);
  expect(timers[0].length).toBe(TIMER_EXPORT_HEADERS.length);
});

test("anon key reaches nothing, and drmc_demo is not exposed even to the service role", async () => {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false }, realtime: NO_REALTIME,
  });
  for (const [schema, table] of [[DB.analytics, "v_daily_report_approvals"], [DB.app, "hr_app_user"], [DB.staging, "stg_timer_activities_clean"]] as const) {
    const res = await anon.schema(schema).from(table).select("*").limit(1);
    expect(res.error, `${schema}.${table}`).not.toBeNull();
  }
  expect((await anon.schema(DB.analytics).rpc("approver_scorecard", { p_from: null, p_to: null })).error).not.toBeNull();

  const svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false }, realtime: NO_REALTIME,
  });
  const hidden = await svc.schema("drmc_demo" as typeof DB.app).from("employee").select("*").limit(1);
  expect(hidden.error?.code).toBe("PGRST106"); // schema not exposed
});

// ------------------------------------------ bulk approve: outage -> resume -> retry

test("durable bulk approve survives a simulated outage: nothing lost, nothing approved twice", async () => {
  await resetDemo();
  const before = (await getApprovalQueueSummary({})).kpis.awaiting;
  const targets = (await getApprovableTaskDids({})).slice(0, 60);
  expect(targets.length).toBe(60);

  expect((await checkBatchCreationLimit()).ok).toBe(true);
  const batchId = await createBatch(DEMO, targets, 40); // outage after 40 items
  expect(await getBatchApprover(batchId)).toBe(DEMO);
  expect((await findActiveBatch(DEMO))?.batchId).toBe(batchId);
  expect(await countBatchesSince(new Date(Date.now() - 60_000).toISOString())).toBe(1);

  // Chunk 1: a full chunk of 25.
  expect(await processBatchChunk(batchId, DEMO, fast)).toEqual({ claimed: 25, alreadyCount: 0 });
  let p = await recomputeBatch(batchId);
  expect(p).toMatchObject({ total: 60, approvedCount: 25, failedCount: 0, remaining: 35, status: "running" });

  // Chunk 2: clamped to 15, so the run stops exactly at the outage point.
  expect(await processBatchChunk(batchId, DEMO, fast)).toEqual({ claimed: 15, alreadyCount: 0 });
  p = await recomputeBatch(batchId);
  expect(p).toMatchObject({ approvedCount: 40, remaining: 20, status: "running" });

  // Chunk 3: the connection "drops". Nothing claimed, the batch is intact.
  await expect(processBatchChunk(batchId, DEMO, fast)).rejects.toThrow(/Simulated outage/);
  p = await recomputeBatch(batchId);
  expect(p).toMatchObject({ approvedCount: 40, failedCount: 0, remaining: 20, status: "running" });
  expect((await findActiveBatch(DEMO))?.batchId).toBe(batchId); // what Resume adopts
  expect((await getBatchOutage(batchId)).outageStage).toBe(1);

  // RESUME: the next chunk hits 503s on its first 5 items (3 attempts each), the rest succeed.
  expect(await processBatchChunk(batchId, DEMO, fast)).toEqual({ claimed: 20, alreadyCount: 0 });
  p = await recomputeBatch(batchId);
  expect(p).toMatchObject({ approvedCount: 55, failedCount: 5, remaining: 0, status: "done" });
  const failures = await getBatchFailures(batchId);
  expect(failures.length).toBe(5);
  expect(failures.every((f) => f.retryable && f.employeeName && f.workDate)).toBe(true);
  expect(await findActiveBatch(DEMO)).toBeNull();

  // RETRY: requeue the retryable failures; the outage is over.
  await requeueFailed(batchId);
  expect((await findActiveBatch(DEMO))?.batchId).toBe(batchId);
  expect(await processBatchChunk(batchId, DEMO, fast)).toEqual({ claimed: 5, alreadyCount: 0 });
  p = await recomputeBatch(batchId);
  expect(p).toMatchObject({ total: 60, approvedCount: 60, failedCount: 0, remaining: 0, status: "done" });
  expect(await processBatchChunk(batchId, DEMO, fast)).toEqual({ claimed: 0, alreadyCount: 0 }); // idempotent no-op

  // Database cross-checks.
  await withPg(async (c) => {
    const ok = (await c.query("select task_did, count(*)::int n from drmc_app.report_approval_log where ok group by 1")).rows;
    expect(ok.length).toBe(60);
    expect(ok.every((r) => r.n === 1)).toBe(true); // no report approved twice
    const failed = (await c.query("select count(*)::int n, count(distinct task_did)::int d from drmc_app.report_approval_log where not ok and http_status = 503")).rows[0];
    expect(failed).toEqual({ n: 5, d: 5 });
    const items = (await c.query("select status, count(*)::int n, max(attempts) a from drmc_app.approval_batch_item where batch_id = $1 group by 1", [batchId])).rows;
    expect(items).toEqual([{ status: "approved", n: 60, a: 1 }]);
    const view = (await c.query("select count(*)::int n from drmc_analytics.v_daily_report_approvals where task_did = any($1) and task_status = 'approved' and approved_by = 'Demo Manager' and approved_on_et is not null", [targets])).rows[0].n;
    expect(view).toBe(60);
  });
  expect((await approvedTaskDids(targets)).size).toBe(60);
  expect((await fetchTaskStatuses(targets.slice(0, 5))).get(targets[0])).toBe("approved");
  expect((await getApprovalQueueSummary({})).kpis.awaiting).toBe(before - 60);

  // A second batch over the SAME reports: everything is already approved, and the
  // one-successful-row index holds even if a runner tries.
  const again = await createBatch(DEMO, targets.slice(0, 10), null);
  expect(await processBatchChunk(again, DEMO, fast)).toEqual({ claimed: 10, alreadyCount: 10 });
  await withPg(async (c) => {
    const dup = (await c.query("select count(*)::int n from (select task_did from drmc_app.report_approval_log where ok group by 1 having count(*) > 1) x")).rows[0].n;
    expect(dup).toBe(0);
  });
});

test("audit rows are written, and the batch table enforces the 200-item ceiling", async () => {
  await logActivity({ actorEmail: DEMO, action: "approval.bulk_approve", entity: "approval_batch", entityId: "test", detail: { total: 1 } });
  await withPg(async (c) => {
    const n = (await c.query("select count(*)::int n from drmc_app.hr_audit_log where actor_email = $1", [DEMO])).rows[0].n;
    expect(n).toBe(1);
  });
  const tooMany = Array.from({ length: 201 }, (_, i) => `X-${i}`);
  await expect(createBatch(DEMO, tooMany, null)).rejects.toThrow(/check constraint|violates/i);
});

test("rate limit: the 11th batch inside the window is refused", async () => {
  await resetDemo();
  const dids = await getApprovableTaskDids({});
  for (let i = 0; i < 10; i++) {
    expect((await checkBatchCreationLimit()).ok).toBe(true);
    const id = await createBatch(DEMO, [dids[i]], null);
    await processBatchChunk(id, DEMO, fast);
    await recomputeBatch(id);
  }
  const refused = await checkBatchCreationLimit();
  expect(refused.ok).toBe(false);
});
