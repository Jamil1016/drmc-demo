import { DB } from "@/lib/db/schemas";
import { createServiceClient } from "@/lib/supabase/service";

export type BatchHeader = { batchId: string; status: "running" | "done"; total: number; approvedCount: number; failedCount: number };
export type BatchProgress = { total: number; approvedCount: number; failedCount: number; remaining: number; status: "running" | "done" };
export type BatchFailure = { taskDid: string; employeeName: string | null; workDate: string; reason: string; retryable: boolean };
export type ItemOutcome = { status: "approved" | "failed"; attempts: number; retryable: boolean; reason?: string; httpStatus?: number };

const A = DB.app;

/** Insert a batch header + one queued item per task_did. Returns the batch id.
 *  `demoOutageAfter` arms the simulated outage (lib/demo/pm-api.ts); null = off. */
export async function createBatch(approverEmail: string, taskDids: string[], demoOutageAfter: number | null = null): Promise<string> {
  const svc = createServiceClient();
  const { data, error } = await svc.schema(A).from("approval_batch")
    .insert({ approver_email: approverEmail, total: taskDids.length, demo_outage_after: demoOutageAfter })
    .select("id").single();
  if (error) throw new Error(error.message);
  const batchId = data.id as string;
  const rows = taskDids.map((task_did) => ({ batch_id: batchId, task_did }));
  const { error: e2 } = await svc.schema(A).from("approval_batch_item").insert(rows);
  if (e2) throw new Error(e2.message);
  return batchId;
}

function toHeader(r: { id: string; status: string; total: number; approved_count: number; failed_count: number }): BatchHeader {
  return { batchId: r.id, status: r.status as "running" | "done", total: r.total, approvedCount: r.approved_count, failedCount: r.failed_count };
}

export async function findActiveBatch(approverEmail: string): Promise<BatchHeader | null> {
  const svc = createServiceClient();
  const { data, error } = await svc.schema(A).from("approval_batch")
    .select("id,status,total,approved_count,failed_count")
    .eq("approver_email", approverEmail).eq("status", "running")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? toHeader(data) : null;
}

/** The approver a batch belongs to (any status), or null if the batch does not exist. */
export async function getBatchApprover(batchId: string): Promise<string | null> {
  const svc = createServiceClient();
  const { data, error } = await svc.schema(A).from("approval_batch")
    .select("approver_email").eq("id", batchId).maybeSingle();
  if (error) throw new Error(error.message);
  return (data?.approver_email as string | undefined) ?? null;
}

export async function claimChunk(batchId: string, limit: number): Promise<string[]> {
  const svc = createServiceClient();
  const { data, error } = await svc.schema(A).rpc("claim_approval_items", { p_batch_id: batchId, p_limit: limit });
  if (error) throw new Error(error.message);
  // SETOF text comes back as an array of scalars
  return ((data ?? []) as string[]);
}

export async function markItem(batchId: string, taskDid: string, o: ItemOutcome): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.schema(A).from("approval_batch_item")
    .update({ status: o.status, attempts: o.attempts, retryable: o.retryable, last_reason: o.reason ?? null, last_http_status: o.httpStatus ?? null, updated_at: new Date().toISOString() })
    .eq("batch_id", batchId).eq("task_did", taskDid);
  if (error) throw new Error(error.message);
}

export async function recomputeBatch(batchId: string): Promise<BatchProgress> {
  const svc = createServiceClient();
  const { data, error } = await svc.schema(A).rpc("recompute_batch", { p_batch_id: batchId });
  if (error) throw new Error(error.message);
  const r = (data as { total: number; approved_count: number; failed_count: number; remaining: number; status: string }[])[0];
  return { total: r.total, approvedCount: r.approved_count, failedCount: r.failed_count, remaining: r.remaining, status: r.status as "running" | "done" };
}

/** Failed items joined to the approvals view for display (employee, work date). */
export async function getBatchFailures(batchId: string): Promise<BatchFailure[]> {
  const svc = createServiceClient();
  const { data: items, error } = await svc.schema(A).from("approval_batch_item")
    .select("task_did,last_reason,retryable").eq("batch_id", batchId).eq("status", "failed");
  if (error) throw new Error(error.message);
  const rows = items ?? [];
  if (rows.length === 0) return [];
  const dids = rows.map((r) => r.task_did as string);
  const { data: meta, error: e2 } = await svc.schema(DB.analytics).from("v_daily_report_approvals")
    .select("task_did,employee_name,work_date").in("task_did", dids);
  if (e2) throw new Error(e2.message);
  const byDid = new Map((meta ?? []).map((m) => [m.task_did as string, m]));
  return rows.map((r) => {
    const m = byDid.get(r.task_did as string);
    return {
      taskDid: r.task_did as string,
      employeeName: (m?.employee_name as string | null) ?? null,
      workDate: (m?.work_date as string) ?? "",
      reason: (r.last_reason as string | null) ?? "Approval failed.",
      retryable: r.retryable as boolean,
    };
  });
}

/** Re-queue every retryable failed item and flip the batch back to running. */
export async function requeueFailed(batchId: string): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.schema(A).from("approval_batch_item")
    .update({ status: "queued", updated_at: new Date().toISOString() })
    .eq("batch_id", batchId).eq("status", "failed").eq("retryable", true);
  if (error) throw new Error(error.message);
  const { error: e2 } = await svc.schema(A).from("approval_batch")
    .update({ status: "running", updated_at: new Date().toISOString() }).eq("id", batchId);
  if (e2) throw new Error(e2.message);
}

/** Demo-only: the simulated-outage state of a batch (see lib/demo/pm-api.ts). */
export async function getBatchOutage(batchId: string): Promise<{ outageAfter: number | null; outageStage: number; processed: number }> {
  const svc = createServiceClient();
  const { data, error } = await svc.schema(A).from("approval_batch")
    .select("demo_outage_after,demo_outage_stage,approved_count,failed_count").eq("id", batchId).maybeSingle();
  if (error) throw new Error(error.message);
  return {
    outageAfter: (data?.demo_outage_after as number | null | undefined) ?? null,
    outageStage: (data?.demo_outage_stage as number | undefined) ?? 0,
    processed: ((data?.approved_count as number | undefined) ?? 0) + ((data?.failed_count as number | undefined) ?? 0),
  };
}

export async function setBatchOutageStage(batchId: string, stage: 1 | 2): Promise<void> {
  const svc = createServiceClient();
  const { error } = await svc.schema(A).from("approval_batch")
    .update({ demo_outage_stage: stage, updated_at: new Date().toISOString() }).eq("id", batchId);
  if (error) throw new Error(error.message);
}

/** How many batches were created (by anyone) since `sinceIso`. Backs the demo's
 *  server-side rate limit on batch creation. */
export async function countBatchesSince(sinceIso: string): Promise<number> {
  const svc = createServiceClient();
  const { count, error } = await svc.schema(A).from("approval_batch")
    .select("id", { count: "exact", head: true }).gte("created_at", sinceIso);
  if (error) throw new Error(error.message);
  return count ?? 0;
}
