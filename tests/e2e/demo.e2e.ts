import { test, expect, type Page } from "@playwright/test";
import pg from "pg";

const DB_URL = process.env.LOCAL_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:54339/postgres";

async function sql<T = Record<string, unknown>>(query: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: DB_URL });
  await client.connect();
  try {
    return (await client.query(query, params)).rows as T[];
  } finally {
    await client.end();
  }
}

/** Collect page errors and error-level console messages. */
function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error" && !/Failed to load resource|favicon/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return errors;
}

test.beforeAll(async () => { await sql("select drmc_demo.reset_demo()"); });
test.afterAll(async () => { await sql("select drmc_demo.reset_demo()"); });

test("sign-in page: real design, demo banner, Enter demo instead of single sign-on", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/signin");
  await expect(page.getByTestId("demo-banner")).toContainText("Every person, team, client and number here is invented");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Everyone at Example Co");
  await expect(page.getByTestId("enter-demo")).toBeVisible();
  await expect(page.getByText(/google/i)).toHaveCount(0);
  await page.getByTestId("enter-demo").click();
  await expect(page).toHaveURL(/\/$/);
  expect(errors).toEqual([]);
});

test("navigation only offers routes that exist; removed routes are 404", async ({ page }) => {
  await page.goto("/");
  const hrefs = await page.locator("aside nav a").evaluateAll((as) => as.map((a) => a.getAttribute("href")));
  expect(hrefs).toEqual(["/", "/directory", "/approvals", "/approvals/scorecard", "/approvals/browse", "/hr", "/hr/variance", "/activity"]);
  for (const href of hrefs) expect((await page.request.get(href!)).status(), href!).toBe(200);
  const removed = [
    "/hr/reports", "/hr/compliance", "/hr/explanations", "/hr/approver-overrides", "/org", "/users",
    "/settings", "/settings/tickets", "/employees/260001/edit",
    "/api/cron/report-reminders", "/api/cron/dr-extract", "/api/cron/member-weekly", "/api/cron/attachment-warm",
    "/api/gmail/connect", "/api/gmail/callback", "/auth/callback", "/hr/variance/report/pdf", "/hr/member-week",
    "/hr/explain", "/api/export/review", "/api/attachments/batch",
  ];
  for (const gone of removed) expect((await page.request.get(gone)).status(), gone).toBe(404);
  // "/employees/new" now falls into the read-only profile route, where "new" is
  // just an unknown employee id: the not-found page, not a form.
  await page.goto("/employees/new");
  await expect(page.getByText(/could not be found|not found|404/i).first()).toBeVisible();
  await expect(page.locator("form input[type=text], form input[type=email]")).toHaveCount(0);
});

test("home: role-aware KPIs for the demo manager", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/");
  await expect(page.getByTestId("demo-banner")).toBeVisible();
  await expect(page.getByText("Members you approve")).toBeVisible();
  await expect(page.getByText("Pending approvals (your groups)")).toBeVisible();
  await expect(page.getByText("On-time rate (your groups)")).toBeVisible();
  await expect(page.getByText(/Missing approver \(\d+\)/)).toBeVisible();
  await expect(page.getByText(/Data synced/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("directory and a read-only profile with approvers and schedule history", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/directory");
  await expect(page.getByText("Ada Lindqvist").first()).toBeVisible();
  await expect(page.getByRole("link", { name: /add employee/i })).toHaveCount(0);
  await page.goto("/employees/260001");
  await expect(page.getByRole("heading", { name: "Ada Lindqvist" })).toBeVisible();
  await expect(page.getByText("DR Approvers")).toBeVisible();
  await expect(page.getByText("kasper.abernathy@example.com")).toBeVisible();
  await expect(page.getByText(/Temporary/).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /edit|add approver|offboard/i })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("awaiting queue and scorecard", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/approvals");
  await expect(page.getByText("Awaiting approval", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Backlog by approver group")).toBeVisible();
  await page.goto("/approvals/scorecard");
  await expect(page.getByText("Group C Rural").first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("report detail drawer with requirements, timeline and placeholder attachments", async ({ page }) => {
  const errors = watchErrors(page);
  const [withFiles] = await sql<{ task_did: string; name: string }>(
    `select r.task_did, e.report_display_name as name from drmc_demo.daily_report r join drmc_demo.employee e using (emp_id)
      where exists (select 1 from drmc_staging.stg_daily_report_hours h where h.task_did = r.task_did and h.file_uploaded_count > 0)
        and r.seed_status = 'approved' order by r.work_date desc, r.task_did limit 1`);
  await page.goto(`/approvals/browse?search=${encodeURIComponent(withFiles.name.split(" ")[1])}&status=approved`);
  await page.getByText(withFiles.name).first().click();
  await expect(page.getByText(/Worked on this day/)).toBeVisible();
  await expect(page.getByText(/Requirements/).first()).toBeVisible();
  await expect(page.getByText(/Attachments \(\d+\)/)).toBeVisible();
  const thumb = page.locator('img[src*="/api/attachments/entry/"]').first();
  await expect(thumb).toBeVisible();
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByText(/Open in PM system/)).toBeVisible();
  expect(errors).toEqual([]);
});

test("hours analysis: heatmap, the group with a story, print view", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/hr/variance");
  await expect(page.getByRole("heading", { name: /Hours Analysis/i }).first()).toBeVisible();
  await expect(page.getByText("Carrier C").first()).toBeVisible();
  await expect(page.locator("svg").first()).toBeVisible();
  await page.goto("/hr/variance/report");
  await expect(page.getByText(/Demo data/).first()).toBeVisible();
  expect(errors).toEqual([]);
});

test("DR monitoring: KPI band, both backlogs, daily trends, group rates, weekly approval compliance", async ({ page }) => {
  const errors = watchErrors(page);
  await page.goto("/hr");
  await expect(page.getByRole("heading", { name: "DR Monitoring" })).toBeVisible();
  for (const label of ["On-time filing", "Late filings", "Missing reports", "Median filing lag", "High variance"]) {
    await expect(page.locator(".kpi-tile", { hasText: label })).toBeVisible();
  }
  await expect(page.locator(".kpi-tile", { hasText: "On-time filing" }).locator(".kpi-tile-value")).toHaveText(/^\d+(\.\d)?%$/);
  // Thirty days of bars in each daily chart, and a delta against the previous period.
  await expect(page.getByText("Late + missing rate per day")).toBeVisible();
  expect(await page.locator("a.trend-day").count()).toBeGreaterThanOrEqual(56);
  await expect(page.locator(".kpi-tile-delta").first()).toBeVisible();
  await expect(page.getByText("Unfiled backlog · as of now (all dates)")).toBeVisible();
  expect(await page.getByTestId("backlog-oldest").locator("li").count()).toBeGreaterThan(0);
  await expect(page.getByText("Overdue approvals · as of now")).toBeVisible();
  await expect(page.locator(".group-rate-row")).toHaveCount(4);
  await expect(page.getByText("Approval compliance per week")).toBeVisible();
  await expect(page.getByText(/Last week \d+% on time/)).toBeVisible();
  // Nothing from the pages this build leaves out.
  await expect(page.locator('a[href^="/hr/reports"], a[href^="/hr/compliance"], a[href^="/hr/explanations"]')).toHaveCount(0);

  // A group row drills into that group's reports; clearing the range shows all dates.
  await page.locator(".group-rate-row").first().click();
  await expect(page).toHaveURL(/\/approvals\/browse\?.*carrierGroup=/);
  await page.goto("/hr?range=all");
  await expect(page.getByRole("heading", { name: "DR Monitoring" })).toBeVisible();
  await expect(page.locator(".kpi-tile-delta")).toHaveCount(0); // no "previous period" for all dates
  expect(errors).toEqual([]);
});

test("activity: seeded history, filters, and a visitor's own approve lands in the log", async ({ page }) => {
  const errors = watchErrors(page);
  await sql("select drmc_demo.reset_demo()");
  await page.goto("/activity");
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  for (const label of ["Logins", "Active users", "Approvals in-app", "Failure rate"]) {
    await expect(page.locator(".kpi-tile", { hasText: label }).first()).toBeVisible();
  }
  const seeded = (await sql<{ n: number }>("select count(*)::int n from drmc_app.hr_audit_log"))[0].n;
  await expect(page.locator("table.data-table tbody tr")).toHaveCount(seeded);
  await expect(page.getByText("Most active approvers")).toBeVisible();
  await expect(page.getByText(/No in-app failures/)).toBeVisible();

  await page.getByLabel("Action").selectOption("approval.bulk_approve");
  await expect(page).toHaveURL(/action=approval\.bulk_approve/);
  const bulk = (await sql<{ n: number }>("select count(*)::int n from drmc_app.hr_audit_log where action = 'approval.bulk_approve'"))[0].n;
  await expect(page.locator("table.data-table tbody tr")).toHaveCount(bulk);
  await expect(page.locator("table.data-table tbody tr").first()).toContainText(/\d+ of \d+ approved/);
  await page.getByRole("button", { name: "week" }).click();
  await expect(page).toHaveURL(/group=week/);

  // Approve one report from its detail drawer, then find it in the log under the demo user.
  const [waiting] = await sql<{ name: string }>(
    `select e.report_display_name as name from drmc_demo.daily_report r join drmc_demo.employee e using (emp_id)
      where r.seed_status = 'submitted' and r.assigned_approver is not null order by r.work_date desc, r.task_did limit 1`);
  await page.goto(`/approvals/browse?search=${encodeURIComponent(waiting.name.split(" ")[1])}&status=submitted`);
  await page.getByText(waiting.name).first().click();
  await page.getByRole("button", { name: "Approve", exact: true }).first().click();
  await expect(page.getByText("Approve in the PM API")).toBeVisible();
  await page.getByRole("button", { name: "Approve", exact: true }).last().click();
  await expect.poll(async () =>
    (await sql<{ n: number }>("select count(*)::int n from drmc_app.hr_audit_log where actor_email = 'demo@example.com' and action = 'approval.approve'"))[0].n,
  { timeout: 60_000 }).toBe(1);
  await page.goto("/activity?actor=demo@example.com");
  await expect(page.locator("table.data-table tbody tr")).toHaveCount(1);
  await expect(page.locator("table.data-table tbody tr").first()).toContainText("Approved reports");
  await expect(page.locator("table.data-table tbody tr").first()).toContainText("1 approved");
  await sql("select drmc_demo.reset_demo()");
  expect(errors).toEqual([]);
});

test("bulk approve: simulated outage, then Resume, then Retry, with database cross-checks", async ({ page }) => {
  await sql("select drmc_demo.reset_demo()");
  const group = "Daily Report Approvers - Group A";
  const expected = (await sql<{ n: number }>(
    "select count(*)::int n from drmc_analytics.v_daily_report_approvals where is_awaiting_approval and assigned_approver = $1", [group]))[0].n;
  expect(expected).toBeGreaterThan(30);
  expect(expected).toBeLessThanOrEqual(200);

  await page.goto(`/approvals/browse?status=submitted&ag=${encodeURIComponent(group)}`);
  await page.getByLabel(/Select all/).click(); // selection resolves server-side, then the box checks
  const approve = page.getByRole("button", { name: `Approve ${expected} selected` });
  await expect(approve).toBeVisible({ timeout: 30_000 });
  await approve.click();

  await expect(page.getByTestId("outage-control")).toBeVisible();
  await page.getByRole("button", { name: "After 25" }).click();
  await page.getByRole("button", { name: `Approve ${expected}`, exact: true }).click();

  // 1. The run stops at 25 as if the connection dropped; the batch is intact in Postgres.
  await expect(page.getByText(/Connection lost while approving/)).toBeVisible({ timeout: 120_000 });
  const mid = (await sql<{ status: string; approved_count: number }>(
    "select status, approved_count from drmc_app.approval_batch order by created_at desc limit 1"))[0];
  expect(mid).toEqual({ status: "running", approved_count: 25 });

  // 2. Resume: continues from the database; 5 items exhaust their retries on 503s.
  await page.getByRole("button", { name: "Resume" }).click();
  await expect(page.getByText(/5 couldn.t be approved/)).toBeVisible({ timeout: 180_000 });
  const retry = page.getByRole("button", { name: "Retry 5 selected" });
  await expect(retry).toBeVisible();

  // 3. Retry: the outage is over.
  await retry.click();
  await expect.poll(async () => (await sql<{ status: string; failed_count: number }>(
    "select status, failed_count from drmc_app.approval_batch order by created_at desc limit 1"))[0],
  { timeout: 120_000 }).toEqual({ status: "done", failed_count: 0 });
  await expect(page.getByText(/5 couldn.t be approved/)).toHaveCount(0);

  const batch = (await sql<{ total: number; approved_count: number; failed_count: number }>(
    "select total, approved_count, failed_count from drmc_app.approval_batch order by created_at desc limit 1"))[0];
  expect(batch).toEqual({ total: expected, approved_count: expected, failed_count: 0 });
  const ok = (await sql<{ reports: number; rows: number }>(
    "select count(distinct task_did)::int reports, count(*)::int rows from drmc_app.report_approval_log where ok"))[0];
  expect(ok).toEqual({ reports: expected, rows: expected }); // no report approved twice
  const left = (await sql<{ n: number }>(
    "select count(*)::int n from drmc_analytics.v_daily_report_approvals where is_awaiting_approval and assigned_approver = $1", [group]))[0].n;
  expect(left).toBe(0);
  const audit = (await sql<{ n: number }>("select count(*)::int n from drmc_app.hr_audit_log where action = 'approval.bulk_approve'"))[0].n;
  expect(audit).toBeGreaterThanOrEqual(1);
});
