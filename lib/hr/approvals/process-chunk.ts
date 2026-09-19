import { fetchTaskStatuses } from "@/lib/hr/queries/approval-queries";
import { getPmApiSession, invalidatePmApiSession } from "@/lib/pm-api/session-cache";
import type { PmApiHttpLite } from "@/lib/pm-api/approve";
import { approveWithRetry, type PmApiSessionProvider } from "@/lib/pm-api/approve-with-retry";
import { recordApproval } from "@/lib/hr/queries/approval-log";
import { APPROVE_CHUNK, isTransientPmApiFailure, describeFailure } from "@/lib/hr/domain/bulk-approve";
import { claimChunk, markItem, getBatchOutage, setBatchOutageStage } from "@/lib/hr/queries/approval-batch";
import { createSimulatedPmApi, simulatedPmApiLogin } from "@/lib/demo/pm-api";
import { planOutage } from "@/lib/demo/outage";

/**
 * The PM API port. The demo user is treated as already connected (there is no
 * credential form in this build), and the only implementation of the port is
 * the simulated one. `statusOf` reads the same serving view the pages read, so
 * the simulation agrees with the screen.
 */
export function pmApiPort(outageItems = 0, latency?: () => Promise<void>): PmApiHttpLite {
  return createSimulatedPmApi({
    outageItems,
    latency,
    statusOf: async (taskDid) => (await fetchTaskStatuses([taskDid])).get(taskDid) ?? null,
  });
}

export type ChunkResult = { claimed: number; alreadyCount: number } | { error: string };

/**
 * One chunk of a durable approval batch: claim up to APPROVE_CHUNK items
 * (SKIP LOCKED, so concurrent runners never share an item), approve each
 * through the PM API port with retries, and COMMIT EACH OUTCOME as it happens.
 * Whatever kills this function mid-chunk, the database already knows which
 * items are done; the rest become claimable again and nothing is approved twice
 * (report_approval_log allows one successful row per report).
 *
 * Authorization is the caller's job (the server action checks the role, the
 * batch owner and the demo mutation allowlist before calling this).
 */
export async function processBatchChunk(
  batchId: string,
  approverEmail: string,
  opts: { latency?: () => Promise<void>; sleep?: (ms: number) => Promise<void> } = {},
): Promise<ChunkResult> {
  const user = { email: approverEmail };
  // Demo-only: where (if anywhere) the simulated outage lands in this chunk.
  const outage = await getBatchOutage(batchId);
  const plan = planOutage(outage, APPROVE_CHUNK);
  if (plan.kind === "drop") {
    // Behave like a dropped connection: nothing claimed, nothing lost. The batch
    // stays "running" in Postgres and the client offers Resume.
    await setBatchOutageStage(batchId, 1);
    throw new Error("Simulated outage: the connection to the PM API was lost.");
  }

  const http = pmApiPort(plan.kind === "fail" ? plan.items : 0, opts.latency);
  const login = () => simulatedPmApiLogin(user.email);
  let session: Awaited<ReturnType<typeof getPmApiSession>>;
  try { session = await getPmApiSession(user.email, login); }
  catch { return { error: "Could not sign in to the PM API. Try again in a moment." }; }
  const provider: PmApiSessionProvider = {
    get: () => session,
    refresh: async () => { invalidatePmApiSession(user.email); session = await getPmApiSession(user.email, login); return session; },
  };

  let alreadyCount = 0;
  const claimed = await claimChunk(batchId, plan.kind === "limit" ? plan.claimLimit : APPROVE_CHUNK);
  if (claimed.length > 0) {
    const statuses = await fetchTaskStatuses(claimed);
    for (const taskDid of claimed) {
      if (statuses.get(taskDid) !== "submitted") {
        // Already approved: goal state reached (by someone else, or directly in
        // the project-management system). A done item, not a failure.
        if (statuses.get(taskDid) === "approved") {
          await markItem(batchId, taskDid, { status: "approved", attempts: 0, retryable: false, reason: "Already approved in the PM API." });
          await recordApproval({ taskDid, approverEmail: user.email, ok: true, alreadyApproved: true });
          alreadyCount++;
        } else {
          await markItem(batchId, taskDid, { status: "failed", attempts: 0, retryable: false, reason: "No longer awaiting approval, already handled in the PM API." });
        }
        continue;
      }
      const r = await approveWithRetry(http, provider, taskDid, opts.sleep);
      if (r.ok) {
        await markItem(batchId, taskDid, { status: "approved", attempts: r.attempts, retryable: false, reason: r.alreadyApproved ? "Already approved in the PM API." : undefined });
        await recordApproval({ taskDid, approverEmail: user.email, ok: true, alreadyApproved: r.alreadyApproved });
        if (r.alreadyApproved) alreadyCount++;
      } else {
        const retryable = isTransientPmApiFailure(r.httpStatus);
        await markItem(batchId, taskDid, { status: "failed", attempts: r.attempts, retryable, reason: describeFailure(r.httpStatus, r.reason), httpStatus: r.httpStatus });
        await recordApproval({ taskDid, approverEmail: user.email, ok: false, httpStatus: r.httpStatus, reason: r.reason });
      }
    }
  }
  if (plan.kind === "fail") await setBatchOutageStage(batchId, 2); // the outage is over
  return { claimed: claimed.length, alreadyCount };
}
