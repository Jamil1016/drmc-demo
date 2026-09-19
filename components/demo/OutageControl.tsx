"use client";

import { DEMO_OUTAGE_CHOICES, DEMO_OUTAGE_FAILED_ITEMS } from "@/lib/demo/outage";

/**
 * Demo-only control on the bulk-approve dialog: make the simulated PM API fail
 * part-way through, so the durable batch can be seen doing its job. The run
 * stops after N items as if the connection dropped (press Resume), then the
 * next few items fail with 503s after their retries (press Retry).
 * Buttons, not a <select>, so the dialog's focus trap covers them.
 */
export function OutageControl({ value, onChange, total }: { value: number; onChange: (n: number) => void; total: number }) {
  return (
    <div className="mt-4 rounded-md p-3" style={{ border: "1px dashed var(--rule-strong)", background: "var(--paper)" }} data-testid="outage-control">
      <div className="text-xs font-semibold" style={{ color: "var(--ink)" }}>Demo: simulate an outage</div>
      <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Simulate an outage after N items">
        {DEMO_OUTAGE_CHOICES.map((n) => (
          <button
            key={n}
            type="button"
            className="chip"
            data-active={value === n}
            disabled={n > 0 && n >= total}
            onClick={() => onChange(n)}
            style={n > 0 && n >= total ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
          >
            {n === 0 ? "Off" : `After ${n}`}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
        {value === 0
          ? "Pick a point to watch the batch survive a failure: nothing is lost and nothing is approved twice."
          : `After ${value} items the connection drops (Resume continues from the database), then ${DEMO_OUTAGE_FAILED_ITEMS} items fail with 503s and can be retried.`}
      </p>
    </div>
  );
}
