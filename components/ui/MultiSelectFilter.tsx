"use client";

import { useEffect, useRef, useState } from "react";
import { sameSelection } from "@/lib/hr/domain/multi-select";

export type MultiOption = { value: string; label: string };

/**
 * Multi-select filter control: a `.field`-styled trigger that opens a checkbox
 * popover (outside click / Escape closes, same pattern as DateRangeField).
 * Empty selection means "all". Checkbox clicks edit a local DRAFT; the parent's
 * onChange fires ONCE when the popover closes, and only when the selection
 * really changed. Before this, every checkbox click pushed a full URL
 * navigation, so picking 4 divisions cost 4 server renders and 4 table
 * remounts; now it costs one.
 */
export function MultiSelectFilter({
  label,
  allLabel,
  options,
  selected,
  onChange,
  width = "13rem",
}: {
  label: string;
  /** Trigger text when nothing is selected, e.g. "All divisions". */
  allLabel: string;
  options: MultiOption[];
  selected: string[];
  onChange: (values: string[]) => void;
  width?: string;
}) {
  const [open, setOpen] = useState(false);
  // Local selection while the popover is open; null when closed (prop is live).
  const [draft, setDraft] = useState<string[] | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const shown = draft ?? selected;

  function openPopover() {
    setDraft(selected);
    setOpen(true);
  }

  function commitClose() {
    setOpen(false);
    if (draft && !sameSelection(draft, selected)) onChange(draft);
    setDraft(null);
  }

  // The close listeners need the LATEST draft/selected, but re-registering per
  // keystroke is wasteful; a ref keeps one stable listener per open session.
  const commitRef = useRef(commitClose);
  commitRef.current = commitClose;

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) commitRef.current();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") commitRef.current();
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const summary =
    shown.length === 0
      ? allLabel
      : shown.length === 1
        ? (options.find((o) => o.value === shown[0])?.label ?? shown[0])
        : `${shown.length} selected`;

  function toggle(value: string) {
    setDraft((prev) => {
      const cur = prev ?? selected;
      return cur.includes(value) ? cur.filter((v) => v !== value) : [...cur, value];
    });
  }

  return (
    <div className="relative flex flex-col gap-1" style={{ width }} ref={wrapRef}>
      <span className="field-label">{label}</span>
      <button
        type="button"
        className="field"
        aria-haspopup="listbox"
        aria-expanded={open}
        data-active={shown.length > 0 ? "true" : undefined}
        onClick={() => (open ? commitClose() : openPopover())}
        style={{ textAlign: "left", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, cursor: "pointer" }}
      >
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: shown.length ? undefined : "var(--muted)" }}>
          {summary}
        </span>
        <span aria-hidden style={{ fontSize: "0.6rem", color: "var(--muted)", flexShrink: 0 }}>▼</span>
      </button>

      {open && (
        <div
          className="surface"
          role="listbox"
          aria-multiselectable="true"
          style={{
            position: "absolute", top: "100%", left: 0, marginTop: 6, zIndex: 60,
            minWidth: "100%", maxWidth: "22rem", maxHeight: 300, overflowY: "auto",
            padding: "0.35rem", boxShadow: "0 10px 30px rgba(15, 23, 42, 0.18)",
          }}
        >
          <button
            type="button"
            onClick={() => setDraft([])}
            disabled={shown.length === 0}
            style={{
              display: "block", width: "100%", textAlign: "left", padding: "0.3rem 0.45rem",
              borderRadius: 6, border: 0, background: "none", cursor: shown.length ? "pointer" : "default",
              fontSize: "0.75rem", color: shown.length ? "var(--signal)" : "var(--muted-soft)",
            }}
          >
            {shown.length > 0 ? `Clear (${shown.length})` : allLabel}
          </button>
          {options.map((o) => (
            <label
              key={o.value}
              className="flex items-center gap-2"
              style={{ padding: "0.3rem 0.45rem", borderRadius: 6, cursor: "pointer", fontSize: "0.82rem", color: "var(--ink)" }}
            >
              <input type="checkbox" checked={shown.includes(o.value)} onChange={() => toggle(o.value)} />
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={o.label}>
                {o.label}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
