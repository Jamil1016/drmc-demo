import Link from "next/link";

export type KpiTile = { label: string; value: number | string; tone?: "amber" | "red"; href?: string };

/**
 * Gradient overview band (navy to teal) with the page title and a row of KPI
 * tiles. Used on the approvals overview for brand presence above the queue.
 */
export function KpiBand({
  title,
  description,
  tiles,
  action,
  markTone = false,
}: {
  title: string;
  description?: string;
  tiles: KpiTile[];
  action?: React.ReactNode;
  /**
   * When true, a toned tile also renders an sr-only "(needs attention)"
   * suffix, for pages whose tones are
   * conditional/meaningful (e.g. Home). Defaults to false because most
   * KpiBand consumers (approvals overview, scorecard) assign tones
   * decoratively/unconditionally, so the marker would be a false alarm there.
   */
  markTone?: boolean;
}) {
  const gridCols = Math.min(Math.max(tiles.length, 1), 5);
  return (
    <div className="kpi-band">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="kpi-band-title">{title}</h1>
          {description && <p className="kpi-band-desc">{description}</p>}
        </div>
        {action}
      </div>
      {/* 2 columns on mobile; from sm: up, sized to the tile count via
          --kpi-cols so 1-4 tiles (Home) have no dead trailing columns and 5
          tiles (approvals pages) fill the row exactly like the original
          grid-cols-5. Scoped here (not globals.css) since only KpiBand
          needs it. */}
      <style>{`.kpi-tile-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } @media (min-width: 640px) { .kpi-tile-grid { grid-template-columns: repeat(var(--kpi-cols), minmax(0, 1fr)); } }`}</style>
      <div
        className="mt-5 grid gap-3 kpi-tile-grid"
        style={{ "--kpi-cols": gridCols } as React.CSSProperties}
      >
        {tiles.map((t) => {
          const toneMarker = t.tone && markTone ? (
            <>
              {t.label}
              <span
                style={{
                  position: "absolute",
                  width: 1,
                  height: 1,
                  padding: 0,
                  margin: -1,
                  overflow: "hidden",
                  clip: "rect(0, 0, 0, 0)",
                  whiteSpace: "nowrap",
                  border: 0,
                }}
              >
                {" "}
                (needs attention)
              </span>
            </>
          ) : (
            t.label
          );

          return t.href ? (
            <Link
              key={t.label}
              href={t.href}
              className="kpi-tile kpi-tile-link cursor-pointer"
              data-tone={t.tone}
              aria-label={t.tone && markTone ? `${t.label}: ${t.value} (needs attention)` : `${t.label}: ${t.value}`}
            >
              <div className="kpi-tile-value">{t.value}</div>
              <div className="kpi-tile-label">{toneMarker}</div>
            </Link>
          ) : (
            <div key={t.label} className="kpi-tile" data-tone={t.tone}>
              <div className="kpi-tile-value">{t.value}</div>
              <div className="kpi-tile-label">{toneMarker}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
