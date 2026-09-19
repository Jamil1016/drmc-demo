"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { BrowseRow } from "@/lib/hr/queries/approval-queries";
import type { ReportDetail, ReportRequirement, DayActivity } from "@/lib/hr/queries/report-detail";
import { Avatar } from "@/components/ui/Avatar";
import { StatusPill, type PillTone } from "@/components/ui/StatusPill";
import { formatWorkDateWithDay } from "@/lib/time";
import { ReportDetailBody, DetailActions } from "@/components/approvals/ReportDetailBody";
import { WorkedOnThisDay } from "@/components/approvals/WorkedOnThisDay";

function statusTone(status: string): PillTone {
  const s = status.toLowerCase();
  if (s.includes("approv")) return "ok";
  if (s.includes("reject") || s.includes("declin")) return "bad";
  if (s.includes("submit") || s.includes("pending") || s.includes("review")) return "info";
  return "neutral";
}

const DRAWER_MIN = 420;
// SSR/first-paint placeholder only; the real opening width is measured on
// mount (80% of the viewport) so the drawer lands in the split layout.
const DRAWER_DEFAULT = 540;
// v2: key bumped when the default changed to 80% of the viewport, so widths
// saved under the old narrow default don't mask the new opening size.
const DRAWER_STORAGE_KEY = "hr-drawer-width-v2";
// Wide enough for two ~430px columns: the drawer switches to a split layout
// with the entry details on the left and "Worked on this day" on the right.
const DRAWER_SPLIT_MIN = 860;

// The app renders under `html { zoom: var(--app-zoom) }`, so a pixel width on
// the panel paints scaled by the zoom while window.innerWidth does not. Divide
// viewport-derived widths by the zoom so they occupy the intended visual share.
function appZoom(): number {
  const z = Number(getComputedStyle(document.documentElement).getPropertyValue("--app-zoom"));
  return z > 0 ? z : 1;
}

function defaultDrawerWidth(): number {
  if (typeof window === "undefined") return DRAWER_DEFAULT;
  return Math.round((window.innerWidth * 0.8) / appZoom());
}

function maxDrawerWidth(): number {
  if (typeof window === "undefined") return 1024;
  return Math.round((window.innerWidth * 0.95) / appZoom());
}

function clampWidth(w: number): number {
  const max = maxDrawerWidth();
  // The 420px floor would overflow a ~360px phone, pushing the close button and
  // content off-screen. Cap the effective minimum at the viewport so the drawer
  // is always fully visible; keep the 420 floor only when it fits.
  return Math.min(Math.max(w, Math.min(DRAWER_MIN, max)), max);
}

export function ReportDetailDrawer({
  row, detail, loading, cachedRequirements = null, cachedDayActivities = null, canApprove = false, onClose, onApproved,
}: {
  row: BrowseRow; detail: ReportDetail | null; loading: boolean; cachedRequirements?: ReportRequirement[] | null; cachedDayActivities?: DayActivity[] | null; canApprove?: boolean; onClose: () => void; onApproved?: (taskDid: string) => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [width, setWidth] = useState<number>(DRAWER_DEFAULT);
  const [dragging, setDragging] = useState(false);
  // Layout effect: the measured width must land before paint, or the drawer
  // visibly flashes at the SSR placeholder width on open.
  useLayoutEffect(() => {
    const saved = Number(window.localStorage.getItem(DRAWER_STORAGE_KEY));
    setWidth(clampWidth(saved > 0 ? saved : defaultDrawerWidth()));
  }, []);
  // Re-clamp when the window shrinks while the drawer is open (snap to half
  // screen, undock from a monitor): a stale wide width on this right-anchored
  // panel would push its left edge and the resize handle off-screen, with no
  // way to recover short of closing the drawer.
  useEffect(() => {
    const onWindowResize = () => setWidth((w) => clampWidth(w));
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, []);

  const onResizeStart = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);
    document.body.setAttribute("data-drawer-resizing", "true");
    const onMove = (ev: PointerEvent) => {
      setWidth(clampWidth(window.innerWidth - ev.clientX));
    };
    const onUp = () => {
      setDragging(false);
      document.body.removeAttribute("data-drawer-resizing");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setWidth((w) => { window.localStorage.setItem(DRAWER_STORAGE_KEY, String(w)); return w; });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, []);

  const name = row.employeeName ?? row.empId;
  const split = width >= DRAWER_SPLIT_MIN;
  // Same instant-from-prefetch resolution ReportDetailBody uses internally —
  // the split layout renders these sections in the right column itself.
  const requirements = detail?.requirements ?? cachedRequirements;
  const dayActivities = detail?.dayActivities ?? cachedDayActivities;

  const header = (
    <div className="flex items-start justify-between gap-3 border-b p-5" style={{ borderColor: "var(--rule)" }}>
      <div className="flex items-start gap-3">
        <Avatar name={name} />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-semibold" style={{ color: "var(--ink)" }}>{name}</span>
            <StatusPill tone={statusTone(row.taskStatus)}>{row.taskStatus}</StatusPill>
          </div>
          <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
            {(detail?.position ?? "—")} · {row.carrierGroup ?? "—"}
          </div>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Work date {formatWorkDateWithDay(row.workDate)} · {row.totalHours ?? 0} hrs
          </div>
        </div>
      </div>
      {!split && (
        <button onClick={onClose} className="text-lg leading-none" style={{ color: "var(--muted)" }} aria-label="Close">✕</button>
      )}
    </div>
  );

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} aria-hidden />
      <aside
        className="drawer-panel"
        role="dialog"
        aria-label="Daily report detail"
        style={{ width, ...(split ? { overflow: "hidden" } : null) }}
        data-resizing={dragging ? "true" : undefined}
      >
        <div
          className="drawer-resize"
          data-dragging={dragging ? "true" : undefined}
          onPointerDown={onResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize panel"
        />
        {split ? (
          /* Wide split layout: details + requirements left, actions + timer log right. */
          <div className="grid h-full" style={{ gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)" }}>
            <div className="min-h-0 overflow-y-auto">
              {header}
              <ReportDetailBody row={row} detail={detail} loading={loading} cachedRequirements={cachedRequirements} cachedDayActivities={cachedDayActivities} canApprove={canApprove} onApproved={onApproved} splitLayout />
            </div>
            <div className="min-h-0 overflow-y-auto border-l" style={{ borderColor: "var(--rule)" }}>
              <div className="flex items-center justify-between gap-2 p-5 pb-0">
                <DetailActions row={row} requirements={requirements} canApprove={canApprove} onApproved={onApproved} />
                <button onClick={onClose} className="text-lg leading-none" style={{ color: "var(--muted)" }} aria-label="Close">✕</button>
              </div>
              <div className="p-5">
                <WorkedOnThisDay dayActivities={dayActivities} loading={loading} clockInEt={row.clockInEt} statedHours={row.totalHours} memberName={row.employeeName} workDate={row.workDate} requirements={requirements} />
              </div>
            </div>
          </div>
        ) : (
          <>
            {header}
            <ReportDetailBody row={row} detail={detail} loading={loading} cachedRequirements={cachedRequirements} cachedDayActivities={cachedDayActivities} canApprove={canApprove} onApproved={onApproved} />
          </>
        )}
      </aside>
    </>
  );
}
