"use client";

import { useEffect, useId, useRef } from "react";

export function ConfirmDialog({
  open, title, body, confirmLabel = "Confirm", busy = false, onConfirm, onCancel,
}: {
  open: boolean; title: string; body: React.ReactNode; confirmLabel?: string; busy?: boolean;
  onConfirm: () => void; onCancel: () => void;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Move focus into the dialog on open so keyboard users land inside it.
  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  // Escape cancels (unless busy); Tab is trapped within the dialog so focus can't
  // wander onto the dimmed page behind the overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      // While open, this dialog OWNS Escape: always swallow it so an ancestor
      // (drawer, action-center modal) never closes underneath an in-flight
      // confirm; cancel only when not busy.
      if (e.key === "Escape") { e.stopPropagation(); if (!busy) onCancel(); return; }
      if (e.key !== "Tab") return;
      const focusables = panelRef.current?.querySelectorAll<HTMLElement>("button:not([disabled])");
      if (!focusables || focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    // Capture so this runs before ancestor Escape handlers (e.g. a parent drawer).
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, busy, onCancel]);

  if (!open) return null;
  return (
    <div className="drawer-overlay" style={{ display: "grid", placeItems: "center", zIndex: 60 }} onClick={busy ? undefined : onCancel}>
      <div
        ref={panelRef}
        className="surface p-5"
        style={{ maxWidth: 420, width: "90%" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={titleId} className="font-semibold" style={{ color: "var(--ink)" }}>{title}</h3>
        <div className="mt-2 text-sm" style={{ color: "var(--muted)" }}>{body}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="btn-ghost">Cancel</button>
          <button ref={confirmRef} onClick={onConfirm} disabled={busy} className="btn-signal">{busy ? "Working…" : confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
