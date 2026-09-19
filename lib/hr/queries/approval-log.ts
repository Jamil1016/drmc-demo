import { DB } from "@/lib/db/schemas";
import { createServiceClient } from "@/lib/supabase/service";

export type ApproveResult = { taskDid: string; ok: boolean; alreadyApproved?: boolean; reason?: string };

export async function recordApproval(row: {
  taskDid: string; approverEmail: string; ok: boolean; alreadyApproved?: boolean; httpStatus?: number; reason?: string;
}): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.schema(DB.app).from("report_approval_log").insert({
    task_did: row.taskDid,
    approver_email: row.approverEmail,
    // "already_approved" = the report turned out to be approved in the PM API already
    // (by someone else / directly in the PM API). It flips the app's status overlay
    // like a normal approve but must NOT credit this user as the approver
    // (the serving view keys attribution on pm_status = 'approved').
    pm_status: row.ok ? (row.alreadyApproved ? "already_approved" : "approved") : null,
    ok: row.ok,
    http_status: row.httpStatus ?? null,
    error_reason: row.reason ?? null,
  });
  // A duplicate successful row (partial unique index) is not an error worth
  // failing the batch over: the task is already approved. Postgres unique_violation = 23505.
  if (error && error.code !== "23505") throw new Error(error.message);
}

/** Of the given task_dids, which already have a SUCCESSFUL approve logged. */
export async function approvedTaskDids(taskDids: string[]): Promise<Set<string>> {
  if (taskDids.length === 0) return new Set();
  const svc = createServiceClient();
  const { data, error } = await svc.schema(DB.app).from("report_approval_log")
    .select("task_did").eq("ok", true).in("task_did", taskDids);
  if (error) throw new Error(error.message);
  return new Set(((data ?? []) as { task_did: string }[]).map((r) => r.task_did));
}
