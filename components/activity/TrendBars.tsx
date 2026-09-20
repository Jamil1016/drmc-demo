import type { SeriesPoint } from "@/lib/hr/queries/activity-queries";
import { bucketLabel, type Group } from "@/lib/hr/domain/activity-dashboard";

/** Presentational bar series. CSS bars, one per bucket; heights scaled to the max. */
export function TrendBars({ label, series, group, tone = "logins" }: {
  label: string; series: SeriesPoint[]; group: Group; tone?: "logins" | "approvals";
}) {
  const max = series.reduce((m, p) => (p.n > m ? p.n : m), 0);
  const color = tone === "approvals" ? "#0a7a52" : "#0e7490";
  return (
    <div className="surface" style={{ padding: "0.75rem 0.9rem" }}>
      <div className="side-label" style={{ color: "var(--muted)", marginBottom: 8 }}>{label}</div>
      {series.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--muted)" }}>No data for this range.</p>
      ) : (
        <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height: 72 }}>
          {series.map((p) => (
            <div key={p.bucket} title={`${bucketLabel(p.bucket, group)}: ${p.n}`}
                 style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
              <div style={{
                height: max > 0 ? `${Math.max(2, Math.round((p.n / max) * 100))}%` : "2%",
                background: color, opacity: 0.85, borderRadius: "2px 2px 0 0",
              }} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
