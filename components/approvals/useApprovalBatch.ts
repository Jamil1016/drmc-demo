"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startApprovalBatch, processApprovalBatch, getActiveApprovalBatch,
  fetchBatchFailures, retryFailedApprovals,
} from "@/app/(app)/approvals/actions";
import type { BatchFailure } from "@/lib/hr/queries/approval-batch";

type Progress = { done: number; total: number };

export function useApprovalBatch() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Progress>({ done: 0, total: 0 });
  const [failures, setFailures] = useState<BatchFailure[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Reports that turned out to be ALREADY approved in the PM API (someone got there
  // first). Not errors -- surfaced as a neutral notice, not the red failure box.
  const [alreadyCount, setAlreadyCount] = useState(0);
  const driving = useRef(false);

  // Drive a batch to completion, one server-claimed chunk at a time.
  const drive = useCallback(async (id: string) => {
    if (driving.current) return;
    driving.current = true;
    setRunning(true);
    setError(null);
    try {
      for (;;) {
        const res = await processApprovalBatch(id);
        if ("error" in res) { setError(res.error); break; }
        setProgress({ done: res.approved + res.failed, total: res.total });
        if (res.alreadyApproved > 0) setAlreadyCount((n) => n + res.alreadyApproved);
        if (res.done) break;
      }
      setFailures(await fetchBatchFailures(id));
    } catch {
      // A network/server error dropped the request mid-run. The batch is still
      // intact and resumable in the DB (idempotent, server-claimed chunks), so
      // surface a retry affordance instead of silently freezing the progress bar.
      setError("Connection lost while approving. Click Resume to continue where it left off.");
      try { setFailures(await fetchBatchFailures(id)); } catch { /* best effort */ }
    } finally {
      driving.current = false;
      setRunning(false);
    }
  }, []);

  const start = useCallback(async (taskDids: string[], demo?: { outageAfter?: number | null }): Promise<{ alreadyApproved: string[]; error?: string }> => {
    const res = await startApprovalBatch(taskDids, demo);
    if ("error" in res) return { alreadyApproved: [], error: res.error };
    setAlreadyCount(res.alreadyApproved.length);
    if (!res.batchId) return { alreadyApproved: res.alreadyApproved }; // nothing approvable
    setBatchId(res.batchId);
    void drive(res.batchId);
    return { alreadyApproved: res.alreadyApproved };
  }, [drive]);

  const resume = useCallback(async () => {
    const active = await getActiveApprovalBatch();
    if (!active) return;
    setError(null);
    setAlreadyCount(0);
    setBatchId(active.batchId);
    setProgress({ done: active.approvedCount + active.failedCount, total: active.total });
    setFailures(await fetchBatchFailures(active.batchId));
    void drive(active.batchId);
  }, [drive]);

  const retry = useCallback(async () => {
    if (!batchId) return;
    const res = await retryFailedApprovals(batchId);
    if ("error" in res) return;
    setFailures([]);
    void drive(batchId);
  }, [batchId, drive]);

  // On mount, adopt and resume any active batch for this approver.
  useEffect(() => { void resume(); }, [resume]);

  return { start, resume, retry, running, progress, failures, batchId, error, alreadyCount };
}
