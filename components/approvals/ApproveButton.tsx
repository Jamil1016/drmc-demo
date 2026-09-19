"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useBulkApprove } from "./useBulkApprove";

/** Single-report approve. Shows a confirm, approves in the PM API, then calls onApproved. */
export function ApproveButton({ taskDid, onApproved }: { taskDid: string; onApproved?: (taskDid: string) => void }) {
  const { run, running } = useBulkApprove();
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirm() {
    setErr(null);
    const out = await run([taskDid]);
    setOpen(false);
    if (out.error) { setErr(out.error); return; }
    if (out.failed.length) { setErr(out.failed[0].reason ?? "The PM API rejected the approval."); return; }
    // out.alreadyApproved (someone approved it in the PM API first) lands here too:
    // the goal state is reached, so the row flips to approved like any success.
    onApproved?.(taskDid);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        disabled={running}
        className="btn-ghost"
        style={{ color: "var(--signal)", borderColor: "var(--signal)", opacity: running ? 0.5 : undefined }}
      >
        Approve
      </button>
      {err && <span className="ml-2 text-xs" style={{ color: "var(--bad)" }}>{err}</span>}
      <ConfirmDialog
        open={open}
        title="Approve in the PM API"
        body="This approves the daily report as you. The PM API behind this demo is simulated; the approval itself is a real write to the demo database and is reset nightly."
        confirmLabel="Approve"
        busy={running}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}
