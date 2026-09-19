"use client";

import { useCallback, useState } from "react";
import { approveReports } from "@/app/(app)/approvals/actions";
import { chunk, APPROVE_CHUNK } from "@/lib/hr/domain/bulk-approve";
import type { ApproveResult } from "@/lib/hr/queries/approval-log";

export type BulkProgress = { done: number; total: number };
export type BulkOutcome = { approved: string[]; alreadyApproved: string[]; failed: ApproveResult[]; error?: string };

/**
 * Client-side bulk approve: loops approveReports over chunks of 25, tracking
 * progress. Returns the set of approved task_dids so callers can optimistically
 * mark rows "syncing" and drop them from the pending selection.
 */
export function useBulkApprove() {
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<BulkProgress>({ done: 0, total: 0 });

  const run = useCallback(async (taskDids: string[]): Promise<BulkOutcome> => {
    setRunning(true);
    setProgress({ done: 0, total: taskDids.length });
    const approved: string[] = [];
    const alreadyApproved: string[] = [];
    const failed: ApproveResult[] = [];
    try {
      for (const group of chunk(taskDids, APPROVE_CHUNK)) {
        const res = await approveReports(group);
        if ("error" in res) return { approved, alreadyApproved, failed, error: res.error };
        for (const r of res.results) {
          if (r.ok) {
            approved.push(r.taskDid);
            if (r.alreadyApproved) alreadyApproved.push(r.taskDid);
          } else failed.push(r);
        }
        setProgress((p) => ({ done: p.done + group.length, total: p.total }));
      }
      return { approved, alreadyApproved, failed };
    } finally {
      setRunning(false);
    }
  }, []);

  return { run, running, progress };
}
