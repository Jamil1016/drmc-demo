import type { ReportRequirement } from "@/lib/hr/queries/report-detail";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";

function reqTone(status: string | null): PillTone {
  const s = (status ?? "").toLowerCase();
  if (s.includes("done") || s.includes("complete") || s.includes("approv")) return "ok";
  if (s.includes("pending") || s.includes("progress")) return "warn";
  return "neutral";
}

/** The requirement cards (hours + status pill + description), shared between
 *  ReportDetailBody's Requirements section and the pop-out timeline modal so
 *  the two renderings can never drift apart. */
export function RequirementList({ requirements }: { requirements: ReportRequirement[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {requirements.map((r, i) => (
        <li key={r.reqId ?? i} className="surface p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium" style={{ color: "var(--ink)" }}>{r.hours ?? 0} hrs</span>
            <StatusPill tone={reqTone(r.status)}>{r.status ?? "—"}</StatusPill>
          </div>
          <p className="mt-1 text-sm" style={{ color: "var(--ink-soft)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
            {r.description?.trim() || <span style={{ color: "var(--muted-soft)" }}>No description</span>}
          </p>
          {r.fileCount > 0 && (
            <p className="mt-1 text-xs" style={{ color: "var(--muted)" }} title="Files attached in the PM API; see Attachments below">
              📎 {r.fileCount} file{r.fileCount === 1 ? "" : "s"} · Req {i + 1}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
