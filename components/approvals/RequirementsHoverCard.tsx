"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { ReportRequirement } from "@/lib/hr/queries/report-detail";
import { placeCard } from "@/lib/hr/domain/hover-card";
import { attachmentSummary } from "@/lib/hr/domain/attachment-summary";

const CARD_W = 600;

/** Floating "Requirements" peek shown when a Browse row is hovered. Pure
 * presentation: positioning + rendering only; the parent owns fetching/caching.
 * pointer-events are off so the card never steals the row's hover. */
export function RequirementsHoverCard({
  items,
  loading,
  point,
}: {
  items: ReportRequirement[] | null;
  loading: boolean;
  point: { x: number; y: number } | null;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    if (!point) { setPos(null); return; }
    const h = ref.current?.offsetHeight ?? 200;
    // Mouse/viewport coordinates are NOT scaled by the app-wide `zoom`, but this
    // fixed card's left/top are. Convert everything into the zoomed layout space
    // so the card lands at the cursor.
    const zoom = parseFloat(getComputedStyle(document.documentElement).zoom as unknown as string) || 1;
    const x = point.x / zoom;
    const y = point.y / zoom;
    // Anchor to the cursor (a zero-size anchor at the mouse point) so the card
    // sits just to the right of the pointer, flipping left only near the edge.
    setPos(placeCard(
      { top: y, bottom: y, left: x, right: x },
      { w: window.innerWidth / zoom, h: window.innerHeight / zoom },
      { w: CARD_W, h },
    ));
  }, [point, items, loading]);

  if (!point) return null;

  return (
    <div
      ref={ref}
      className="surface"
      role="tooltip"
      style={{
        position: "fixed",
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        width: CARD_W,
        maxHeight: "calc(60vh / var(--app-zoom, 1))",
        overflowY: "auto",
        zIndex: 70,
        padding: "0.75rem 0.9rem",
        boxShadow: "0 10px 30px rgba(15, 23, 42, 0.18)",
        pointerEvents: "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.68rem", textTransform: "uppercase", letterSpacing: "0.04em", color: "var(--muted)", marginBottom: "0.45rem" }}>
        <span>Requirements</span>
        {!loading && attachmentSummary(items).label && (
          <span
            title="Has file(s) attached in the PM API"
            style={{ display: "inline-flex", alignItems: "center", gap: "0.15rem", textTransform: "none", letterSpacing: "normal", color: "var(--ink)" }}
          >
            📎 {attachmentSummary(items).label}
          </span>
        )}
      </div>
      {loading ? (
        <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>Loading…</div>
      ) : !items || items.length === 0 ? (
        <div style={{ fontSize: "0.8rem", color: "var(--muted)" }}>No requirements logged.</div>
      ) : (
        <ul style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          {items.map((r, i) => (
            <li key={r.reqId ?? i}>
              <div style={{ fontSize: "0.8rem", color: "var(--ink)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                {r.fileCount > 0 && <span title="File attached in the PM API">📎 </span>}
                {r.description ?? "—"}
              </div>
              <div style={{ fontSize: "0.7rem", color: "var(--muted)" }}>
                {(r.status ?? "—")}{r.hours != null ? ` · ${r.hours} hrs` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
