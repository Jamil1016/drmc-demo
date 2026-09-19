"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BrowseFilters } from "@/lib/hr/queries/approval-queries";
import { sanitizeBrowseSort } from "@/lib/hr/domain/browse-sort";
import { approverGroupLabel } from "@/lib/hr/domain/approver-label";
import { createSequenceCounter, createNdjsonDecoder } from "@/lib/hr/domain/stream-progress";
import { toExcelCell, excelNumFmt } from "@/lib/hr/domain/excel-cells";

const CRLF = new Uint8Array([0x0d, 0x0a]);

const LARGE_EXPORT = 5000;
// exceljs builds the ENTIRE workbook in browser memory (rows + workbook +
// serialized buffer at once); past this many rows that can freeze the tab.
// CSV streams-friendly text and keeps no cap beyond the soft warning.
const EXCEL_MAX_ROWS = 50_000;

// "timers-*": one row per timer entry
// behind the filtered reports (the drawer's "Worked on this day" data), whose
// count is only known as it streams (total unknown up front).
type Kind = "csv" | "excel" | "timers-csv" | "timers-excel";

const isTimer = (k: Kind): k is "timers-csv" | "timers-excel" =>
  k === "timers-csv" || k === "timers-excel";

const KIND_META: Record<Kind, { label: string; confirm: string; verb: string }> = {
  csv:            { label: "Data (CSV)",            confirm: "Extract browse report (CSV)",   verb: "Download CSV" },
  excel:          { label: "Data (Excel)",          confirm: "Extract browse report (Excel)", verb: "Download Excel" },
  "timers-csv":   { label: "Timer entries (CSV)",   confirm: "Extract timer entries (CSV)",   verb: "Download CSV" },
  "timers-excel": { label: "Timer entries (Excel)", confirm: "Extract timer entries (Excel)", verb: "Download Excel" },
};

// Grouped dropdown.
const MENU_GROUPS: { section: string; kinds: Kind[] }[] = [
  { section: "Data", kinds: ["csv", "excel"] },
  { section: "Timer entries", kinds: ["timers-csv", "timers-excel"] },
];

function summarize(f: BrowseFilters): [string, string][] {
  const out: [string, string][] = [];
  if (f.search) out.push(["Employee", f.search]);
  const divisions = f.carrierGroups?.length ? f.carrierGroups.join(", ") : f.carrierGroup;
  if (divisions) out.push(["Division", divisions]);
  const statuses = f.statuses?.length ? f.statuses.join(", ") : f.status;
  if (statuses) out.push(["Status", statuses]);
  if (f.assignedApprover?.length) out.push(["Approver", f.assignedApprover.map((a) => approverGroupLabel(a) ?? a).join(", ")]);
  if (f.dateFrom || f.dateTo) out.push(["Work date", `${f.dateFrom || "earliest"} → ${f.dateTo || "latest"}`]);
  return out;
}

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** "Extract" split control: dropdown of export kinds, then the same
 *  confirm-modal flow the old Extract CSV button had. */
export function ExtractMenu({ filters, total }: { filters: BrowseFilters; total: number }) {
  const params = useSearchParams();
  // Sort straight from the URL: header sorting updates it via history.replaceState
  // (no server render), so a prop from the server page could be stale on extract.
  const sort = sanitizeBrowseSort(params.get("sort") ?? undefined, params.get("dir") ?? undefined);
  const [menuOpen, setMenuOpen] = useState(false);
  const [kind, setKind] = useState<Kind | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Live download progress while ANY extract streams: rows for
  // Data, entries for timers (whose total is unknown until it streams, so
  // `total: 0` = counting up); `phase` labels the Excel post-download build.
  const [progress, setProgress] = useState<{ done: number; total: number; mb: number; unit: "rows" | "entries"; phase?: string } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const parts = summarize(filters);
  const stamp = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [menuOpen]);

  useEffect(() => {
    if (kind === null) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !busy) setKind(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [kind, busy]);

  /** POST to the streaming export route; non-ok responses carry a JSON error. */
  async function openExportStream(dataset: "data" | "timers", format: "csv" | "table"): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    const res = await fetch("/api/export/browse", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filters, sort, dataset, format }),
    });
    if (!res.ok || !res.body) {
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(body?.error ?? `Extract failed (${res.status}).`);
    }
    return res.body.getReader();
  }

  function baseName(dataset: "data" | "timers"): string {
    return dataset === "data" ? `browse-reports-${stamp}` : `browse-timers-${stamp}`;
  }

  async function downloadCsv(dataset: "data" | "timers") {
    // The route streams the CSV text; each data row is preceded by exactly one
    // CRLF (cells can contain bare \n but the row terminator is \r\n), so the
    // running CRLF count IS the rows received. Data has a known total to clamp
    // against; timers count up (total unknown until it streams).
    const knownTotal = dataset === "data" ? total : 0;
    const unit: "rows" | "entries" = dataset === "data" ? "rows" : "entries";
    const reader = await openExportStream(dataset, "csv");
    const countCrlf = createSequenceCounter(CRLF);
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    let seen = 0;
    setProgress({ done: 0, total: knownTotal, mb: 0, unit });
    for (;;) {
      const { done: eof, value } = await reader.read();
      if (eof) break;
      if (!value || value.length === 0) continue;
      chunks.push(value);
      bytes += value.length;
      seen = countCrlf(value);
      setProgress({ done: knownTotal > 0 ? Math.min(seen, knownTotal) : seen, total: knownTotal, mb: bytes / (1024 * 1024), unit });
    }
    setProgress({ done: knownTotal > 0 ? knownTotal : seen, total: knownTotal, mb: bytes / (1024 * 1024), unit });
    saveBlob(new Blob(["﻿", ...(chunks as BlobPart[])], { type: "text/csv;charset=utf-8;" }), `${baseName(dataset)}.csv`);
  }

  async function downloadExcel(dataset: "data" | "timers") {
    // NDJSON: first line {"headers": [...]}, then one JSON array per row.
    // Line counting is exact here (JSON escapes embedded newlines).
    const knownTotal = dataset === "data" ? total : 0;
    const unit: "rows" | "entries" = dataset === "data" ? "rows" : "entries";
    const reader = await openExportStream(dataset, "table");
    const decoder = createNdjsonDecoder();
    let headers: string[] = [];
    const rows: (string | number | null)[][] = [];
    let bytes = 0;
    setProgress({ done: 0, total: knownTotal, mb: 0, unit });
    const takeLine = (line: string) => {
      if (headers.length === 0) headers = (JSON.parse(line) as { headers: string[] }).headers;
      else rows.push(JSON.parse(line) as (string | number | null)[]);
    };
    for (;;) {
      const { done: eof, value } = await reader.read();
      if (eof) break;
      if (!value || value.length === 0) continue;
      bytes += value.length;
      for (const line of decoder.push(value)) takeLine(line);
      // Data-Excel is blocked before download (row total is known); timer-Excel
      // has no upfront count, so enforce the workbook cap mid-stream.
      if (dataset === "timers" && rows.length > EXCEL_MAX_ROWS) {
        await reader.cancel().catch(() => {});
        throw new Error(`Over ${EXCEL_MAX_ROWS.toLocaleString()} timer entries; narrow the filter (date range or division) and try again.`);
      }
      setProgress({ done: knownTotal > 0 ? Math.min(rows.length, knownTotal) : rows.length, total: knownTotal, mb: bytes / (1024 * 1024), unit });
    }
    for (const line of decoder.flush()) takeLine(line);
    setProgress({ done: rows.length, total: knownTotal, mb: bytes / (1024 * 1024), unit, phase: "Building workbook" });
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(dataset === "data" ? "Browse reports" : "Timer entries", { views: [{ state: "frozen", ySplit: 1 }] });
    ws.addRow(headers).font = { bold: true };
    // Date/datetime strings become typed date cells (with number formats set
    // per column below) so Excel sorts and pivots them as dates, not text.
    for (const r of rows) ws.addRow(r.map((v, i) => toExcelCell(headers[i], v)));
    ws.columns.forEach((col, i) => {
      col.width = Math.min(40, Math.max(12, String(headers[i]).length + 4));
      const fmt = excelNumFmt(headers[i]);
      if (fmt) col.numFmt = fmt;
    });
    const buf = await wb.xlsx.writeBuffer();
    saveBlob(new Blob([new Uint8Array(buf)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), `${baseName(dataset)}.xlsx`);
  }

  async function run() {
    if (!kind) return;
    setBusy(true);
    setError(null);
    setProgress(null);
    try {
      if (kind === "csv") await downloadCsv("data");
      else if (kind === "excel") await downloadExcel("data");
      else if (kind === "timers-csv") await downloadCsv("timers");
      else await downloadExcel("timers");
      setKind(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Extract failed.");
    } finally {
      setBusy(false);
    }
  }

  // Data-Excel is blocked before download because its row total is known;
  // timer-Excel is not (its cap is enforced mid-stream in downloadExcel).
  const dataExcelBlocked = kind === "excel" && total > EXCEL_MAX_ROWS;

  return (
    <>
      <div className="relative" ref={menuRef}>
        <button type="button" onClick={() => setMenuOpen((v) => !v)} className="btn-primary">Extract ▾</button>
        {menuOpen && (
          <div className="surface absolute right-0 z-20 mt-1 flex w-52 flex-col rounded-lg p-1 shadow-lg">
            {MENU_GROUPS.map((group) => (
              <div key={group.section} className="flex flex-col">
                <div className="px-3 pt-2 pb-1 text-[0.65rem] font-semibold uppercase tracking-wide" style={{ color: "var(--muted-soft)" }}>
                  {group.section}
                </div>
                {group.kinds.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className="rounded-md px-3 py-2 text-left text-sm hover:bg-black/5"
                    style={{ color: "var(--ink)" }}
                    onClick={() => { setMenuOpen(false); setError(null); setKind(k); }}
                  >
                    {KIND_META[k].label}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {kind !== null && (
        <div className="modal-overlay" onClick={() => !busy && setKind(null)}>
          <div className="modal-card surface p-5" role="dialog" aria-label="Confirm extract" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-bold" style={{ color: "var(--ink)" }}>{KIND_META[kind].confirm}</h2>
            <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
              {isTimer(kind) ? (
                <>Timer entries for the <strong style={{ color: "var(--ink)" }}>{total.toLocaleString()}</strong> filtered {total === 1 ? "report" : "reports"} will be extracted (the entry count shows as it streams).</>
              ) : (
                <>This will download <strong style={{ color: "var(--ink)" }}>{total.toLocaleString()}</strong> {total === 1 ? "row" : "rows"}.</>
              )}
            </p>

            <div className="mt-3">
              <div className="field-label mb-1">Filter</div>
              {parts.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--ink-soft)" }}>No filter, the entire dataset.</p>
              ) : (
                <ul className="flex flex-col gap-1 text-sm" style={{ color: "var(--ink-soft)" }}>
                  {parts.map(([k, v]) => (
                    <li key={k}><span style={{ color: "var(--muted)" }}>{k}:</span> {v}</li>
                  ))}
                </ul>
              )}
            </div>

            {total > LARGE_EXPORT && !dataExcelBlocked && (
              <p className="mt-3 rounded-lg p-2 text-xs" style={{ background: "#fdf0d9", color: "#8a5a00" }}>
                That&apos;s a large export and may take a moment. Consider narrowing the filter (employee, group, or date range) first.
              </p>
            )}

            {dataExcelBlocked && (
              <p className="mt-3 rounded-lg p-2 text-xs" style={{ background: "#fde3e1", color: "#8f2620" }}>
                Excel is limited to {EXCEL_MAX_ROWS.toLocaleString()} rows per extract (the workbook is built in your browser&apos;s memory). Narrow the filter, or use Data (CSV) for the full set.
              </p>
            )}

            {progress !== null && (
              <div className="mt-3">
                <div className="flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
                  <span>
                    {progress.total > 0
                      ? `${progress.done.toLocaleString()} of ${progress.total.toLocaleString()} ${progress.unit}`
                      : `${progress.done.toLocaleString()} ${progress.unit}`}
                    {progress.phase ? ` · ${progress.phase}…` : ""}
                  </span>
                  <span>{progress.mb.toFixed(1)} MB</span>
                </div>
                {progress.total > 0 && (
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border)" }}>
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{
                        width: `${Math.round((progress.done / progress.total) * 100)}%`,
                        background: "var(--accent)",
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {error && (
              <p className="mt-3 rounded-lg p-2 text-xs" style={{ background: "#fde3e1", color: "#8f2620" }}>{error}</p>
            )}

            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={() => setKind(null)} disabled={busy}>Cancel</button>
              <button
                type="button"
                className="btn-primary"
                onClick={run}
                disabled={busy || dataExcelBlocked || total === 0}
              >
                {busy ? "Extracting…"
                  : dataExcelBlocked ? "Over the limit"
                  : total === 0 ? "Nothing to extract" : KIND_META[kind].verb}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
