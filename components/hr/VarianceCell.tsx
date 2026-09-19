import { varianceTier, varianceLabel } from "@/lib/hr/domain/review-signals";
import { VARIANCE_TOOLTIP } from "@/lib/hr/domain/review-columns";

/**
 * Stated-vs-timer variance cell used by the DR Approval grid:
 * "+1.2h · 15%" (hours untimed, untimed share), red only at the 85% coverage
 * line, italic muted when timers exceeded the stated hours, a dash when no
 * variance could be computed (open timer, no timer rollup, no stated hours).
 */
export function VarianceCell({ varianceHours, coveragePct }: { varianceHours: number | null; coveragePct: number | null }) {
  const tier = varianceTier(varianceHours, coveragePct);
  const label = varianceLabel(varianceHours, coveragePct);
  if (tier === "none" || !label) {
    return <span style={{ color: "var(--muted-soft)" }}>—</span>;
  }
  const color =
    tier === "red" ? "var(--bad)" : tier === "under" ? "var(--muted)" : "var(--ink-soft)";
  const weight = tier === "red" ? 600 : 400;
  return (
    <span title={VARIANCE_TOOLTIP} style={{ color, fontWeight: weight, fontStyle: tier === "under" ? "italic" : undefined }}>
      {label}
    </span>
  );
}
