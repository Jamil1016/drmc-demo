"use server";

import { updateTag } from "next/cache";
import { requireUser, requireMinRole, assertMutationAllowed } from "@/lib/auth/require-user";
import { getReportDetail, getReportRequirements, getReportRequirementsBatch, getDayActivitiesBatch, type ReportDetail, type ReportRequirement, type DayActivity } from "@/lib/hr/queries/report-detail";
import type { DayActivityPair } from "@/lib/hr/domain/day-activities-prefetch";
import { getApprovableTaskDids, getEntryBrowsePage, getGroupPending, getGroupApprovers, getBrowseRowByTaskDid, fetchTaskStatuses, type BrowseFilters, type BrowseRow, type PendingRow, type GroupApprover } from "@/lib/hr/queries/approval-queries";
import type { BrowseSort } from "@/lib/hr/domain/browse-sort";
import { getPmApiSession, invalidatePmApiSession } from "@/lib/pm-api/session-cache";
import { approveTaskInPmApi } from "@/lib/pm-api/approve";
import { recordApproval, approvedTaskDids, type ApproveResult } from "@/lib/hr/queries/approval-log";
import { APPROVE_CHUNK } from "@/lib/hr/domain/bulk-approve";
import { logActivity } from "@/lib/hr/audit";
import { summarizeApproveResults } from "@/lib/hr/domain/approve-audit";
import {
  createBatch, findActiveBatch, recomputeBatch,
  getBatchFailures, requeueFailed, getBatchApprover,
  type BatchHeader, type BatchFailure,
} from "@/lib/hr/queries/approval-batch";
import { simulatedPmApiLogin } from "@/lib/demo/pm-api";
import { sanitizeOutageAfter } from "@/lib/demo/outage";
import { pmApiPort, processBatchChunk } from "@/lib/hr/approvals/process-chunk";
import { checkBatchCreationLimit, MAX_BATCH_ITEMS } from "@/lib/demo/rate-limit";

/** Fetch one daily report's full detail for the browse drawer (read-only). */
export async function fetchReportDetail(taskDid: string): Promise<ReportDetail | null> {
  await requireUser();
  return getReportDetail(taskDid);
}

/**
 * The row + full detail for one report, so a surface WITHOUT a BrowseRow (the
 * Home "Missing approver" panel) can open the same ReportDetailDrawer that DR
 * Approval uses. One round trip: the authentic PendingRow (BROWSE_COLS shape)
 * plus the report detail. Read-only (requireUser); approving is separately
 * gated inside the drawer's own action.
 */
export async function fetchReportForDrawer(
  taskDid: string,
): Promise<{ row: PendingRow | null; detail: ReportDetail | null }> {
  await requireUser();
  const [row, detail] = await Promise.all([
    getBrowseRowByTaskDid(taskDid),
    getReportDetail(taskDid),
  ]);
  return { row, detail };
}

/** Requirement rows for the Browse hover peek (read-only). */
export async function fetchReportRequirements(taskDid: string): Promise<ReportRequirement[]> {
  await requireUser();
  return getReportRequirements(taskDid);
}

/**
 * Requirement rows for many reports at once, keyed by task_did (read-only).
 * Used by Browse to prefetch the hover-card requirements AND the drawer's
 * "Worked on this day" timer log for a loaded page in ONE action (one auth
 * chain), so both render instantly instead of paying a round trip on first
 * interaction with each row.
 */
export async function fetchBrowsePrefetch(
  pairs: DayActivityPair[],
): Promise<{ requirements: Record<string, ReportRequirement[]>; dayActivities: Record<string, DayActivity[]> }> {
  await requireUser();
  // One browse page is 100 rows; anything bigger is a caller bug, not a use case.
  const scoped = pairs.slice(0, 200);
  const [requirements, dayActivities] = await Promise.all([
    getReportRequirementsBatch(scoped.map((p) => p.taskDid)),
    getDayActivitiesBatch(scoped),
  ]);
  return { requirements, dayActivities };
}

/** Next page of browse rows for infinite scroll. The sort is re-sanitized in
 *  the query layer (this is a server action, so it arrives untrusted). */
export async function fetchBrowsePage(filters: BrowseFilters, offset: number, limit: number, sort?: BrowseSort): Promise<BrowseRow[]> {
  await requireUser();
  return getEntryBrowsePage(filters, offset, limit, sort);
}

/** Reports awaiting approval for one approver group (for the scorecard panel). */
export async function fetchGroupPending(groupLabel: string, from?: string, to?: string): Promise<PendingRow[]> {
  await requireUser();
  return getGroupPending(groupLabel, from, to);
}

/** The approvers who work one group's daily reports (for the scorecard panel header). */
export async function fetchGroupApprovers(groupLabel: string): Promise<GroupApprover[]> {
  await requireUser();
  return getGroupApprovers(groupLabel);
}

// The Data (CSV) / Data (Excel) extracts live on the streaming route
// POST /api/export/browse (lib/hr/export/browse-export.ts) so the client can
// show live row progress.

/**
 * Approve one chunk of daily reports in the PM API as the current user. The CLIENT
 * sends <= 25 task_dids per call and loops, so this never runs long enough to
 * time out. Idempotent: task_dids already approved-here are skipped. Each item
 * gets its own result; a single failure never aborts the rest.
 */
export async function approveReports(taskDidsIn: string[]): Promise<{ results: ApproveResult[] } | { error: string }> {
  await assertMutationAllowed("approval.approve");
  // Approving is a lead-and-up capability (super_admin, hr_staff, manager, lead).
  const user = await requireMinRole("lead");
  // Defensive clamp: the client sends chunks of APPROVE_CHUNK; never trust it to.
  const taskDids = [...new Set(taskDidsIn)].slice(0, APPROVE_CHUNK);
  if (taskDids.length === 0) return { results: [] };

  // Reuse a cached PM API session across the many chunks of a bulk approve so we
  // log in once, not once per 25-report chunk (see session-cache.ts).
  const http = pmApiPort();
  const login = () => simulatedPmApiLogin(user.email);
  let session;
  try {
    session = await getPmApiSession(user.email, login);
  } catch {
    return { error: "Could not sign in to the PM API. Try again in a moment." };
  }

  const already = await approvedTaskDids(taskDids);
  const statuses = await fetchTaskStatuses(taskDids);
  const results: ApproveResult[] = [];
  for (const taskDid of taskDids) {
    if (already.has(taskDid)) { results.push({ taskDid, ok: true }); continue; }
    if (statuses.get(taskDid) !== "submitted") {
      // The serving view already shows it approved: the goal state is reached
      // (someone approved it first). Success, not an error -- just say so.
      if (statuses.get(taskDid) === "approved") {
        await recordApproval({ taskDid, approverEmail: user.email, ok: true, alreadyApproved: true });
        results.push({ taskDid, ok: true, alreadyApproved: true });
      } else {
        results.push({ taskDid, ok: false, reason: "Report is not awaiting approval." });
      }
      continue;
    }
    let r = await approveTaskInPmApi(http, session, taskDid);
    // A 401 means the cached token expired mid-run: drop it, re-login once, retry.
    if (!r.ok && r.httpStatus === 401) {
      invalidatePmApiSession(user.email);
      try {
        session = await getPmApiSession(user.email, login);
        r = await approveTaskInPmApi(http, session, taskDid);
      } catch { /* keep the original 401 result */ }
    }
    await recordApproval({ taskDid, approverEmail: user.email, ok: r.ok, alreadyApproved: r.ok ? r.alreadyApproved : undefined, httpStatus: r.ok ? undefined : r.httpStatus, reason: r.ok ? undefined : r.reason });
    results.push(r.ok ? { taskDid, ok: true, alreadyApproved: r.alreadyApproved } : { taskDid, ok: false, reason: r.reason });
  }
  const summary = summarizeApproveResults(results);
  if (summary.count > 0) {
    // The serving view overlays report_approval_log, so the row-level status
    // flips for everyone on the next (uncached) read. Bust the "approvals" tag
    // too so the cached counts / queue summary / scorecard reflect the approve
    // within a second instead of trailing it by up to the 45s TTL.
    updateTag("approvals");
    await logActivity({
      actorEmail: user.email,
      action: "approval.approve",
      entity: "report",
      entityId: null,
      detail: { approved: summary.count, failed: summary.failed },
    });
  }
  return { results };
}

/** Every submitted (approvable) task_did matching the current Browse filter. */
export async function fetchApprovableTaskDids(filters: BrowseFilters): Promise<string[]> {
  await requireUser();
  return getApprovableTaskDids(filters);
}

/** Which of these task_dids are already approved-here (for optimistic UI on load). */
export async function fetchApprovedTaskDids(taskDids: string[]): Promise<string[]> {
  await requireUser();
  return [...(await approvedTaskDids(taskDids))];
}

/**
 * Create (or adopt) a durable approval batch. Reports already approved-here are
 * returned so the UI can mark them done; only reports still awaiting approval are
 * queued. If a running batch already exists for this approver, it is returned.
 *
 * `demo.outageAfter` is the "simulate an outage after N items" control on the
 * confirm dialog (see lib/demo/pm-api.ts). It is a clamped integer, never text.
 */
export async function startApprovalBatch(
  taskDidsIn: string[],
  demo?: { outageAfter?: number | null },
): Promise<{ batchId: string; alreadyApproved: string[] } | { error: string }> {
  await assertMutationAllowed("approval.batch.start");
  const user = await requireMinRole("lead");
  const taskDids = [...new Set(taskDidsIn)];
  if (taskDids.length === 0) return { error: "Nothing selected." };
  if (taskDids.length > MAX_BATCH_ITEMS) {
    return { error: `The demo approves at most ${MAX_BATCH_ITEMS} reports per batch. Narrow the selection and try again.` };
  }

  const existing = await findActiveBatch(user.email);
  const already = await approvedTaskDids(taskDids);
  const statuses = await fetchTaskStatuses(taskDids);
  // "Already approved" from the UI's point of view = approved-here (log) OR the
  // serving view already shows it approved (someone approved it first and the
  // client row is stale). Both get marked done, neither is an error.
  const alreadyApproved = taskDids.filter((d) => already.has(d) || statuses.get(d) === "approved");
  const alreadySet = new Set(alreadyApproved);
  if (existing) {
    // A batch is already running for this approver. Do NOT silently swap this new
    // selection onto it: those reports would never be queued, yet the UI would drive
    // the unrelated batch to completion and show a normal success. If everything
    // selected is already approved there is nothing new to queue, so adopting the
    // running batch is harmless; otherwise tell the user to wait rather than lose it.
    const needsQueuing = taskDids.some((d) => !alreadySet.has(d));
    if (needsQueuing) {
      return { error: "An approval is already running on the shared demo account. Wait for it to finish (or press Resume), then approve the rest." };
    }
    return { batchId: existing.batchId, alreadyApproved };
  }

  const approvable = taskDids.filter((d) => !alreadySet.has(d) && statuses.get(d) === "submitted");
  if (approvable.length === 0) return { batchId: "", alreadyApproved };

  const limit = await checkBatchCreationLimit();
  if (!limit.ok) return { error: limit.message };

  const batchId = await createBatch(user.email, approvable, sanitizeOutageAfter(demo?.outageAfter));
  return { batchId, alreadyApproved };
}

/** Approve the next claimed chunk of a batch in the PM API, committing each outcome. */
export async function processApprovalBatch(
  batchId: string,
): Promise<{ approved: number; failed: number; alreadyApproved: number; total: number; remaining: number; done: boolean } | { error: string }> {
  await assertMutationAllowed("approval.batch.process");
  const user = await requireMinRole("lead");
  if (!batchId) return { error: "No batch." };
  if (await getBatchApprover(batchId) !== user.email) return { error: "Not authorized." };

  // The chunk itself (claim -> approve through the PM API port -> commit each
  // outcome) lives in lib/hr/approvals/process-chunk.ts so it can be exercised
  // against a real database without a Next.js request.
  const chunk = await processBatchChunk(batchId, user.email);
  if ("error" in chunk) return { error: chunk.error };
  const { claimed, alreadyCount } = chunk;

  const p = await recomputeBatch(batchId);
  // If this call actually approved anything, bust the cached approval surfaces so the
  // counts / queue summary / scorecard track the overlay instead of trailing it
  // by up to 45s. Row-level status is uncached and already live.
  if (claimed > 0) updateTag("approvals");
  if (p.status === "done" && claimed > 0) {
    await logActivity({
      actorEmail: user.email,
      action: "approval.bulk_approve",
      entity: "approval_batch",
      entityId: batchId,
      detail: { total: p.total, approved: p.approvedCount, failed: p.failedCount },
    });
  }
  // alreadyApproved counts THIS chunk only; the client accumulates across chunks.
  return { approved: p.approvedCount, failed: p.failedCount, alreadyApproved: alreadyCount, total: p.total, remaining: p.remaining, done: p.status === "done" };
}

export async function getActiveApprovalBatch(): Promise<BatchHeader | null> {
  const user = await requireMinRole("lead");
  return findActiveBatch(user.email);
}

export async function fetchBatchFailures(batchId: string): Promise<BatchFailure[]> {
  const user = await requireMinRole("lead");
  if (!batchId) return [];
  if (await getBatchApprover(batchId) !== user.email) return [];
  return getBatchFailures(batchId);
}

export async function retryFailedApprovals(batchId: string): Promise<{ ok: true } | { error: string }> {
  await assertMutationAllowed("approval.batch.retry");
  const user = await requireMinRole("lead");
  if (!batchId) return { error: "No batch." };
  if (await getBatchApprover(batchId) !== user.email) return { error: "Not authorized." };
  await requeueFailed(batchId);
  return { ok: true };
}
