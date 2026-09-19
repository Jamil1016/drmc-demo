"use client";

import { useEffect, useState } from "react";
import type { ReportRequirement } from "@/lib/hr/queries/report-detail";
import type { AttachmentItem } from "@/lib/hr/domain/attachment-preview";
import { attachmentSummary } from "@/lib/hr/domain/attachment-summary";
import { AttachmentLightbox } from "@/components/approvals/AttachmentLightbox";
import { getAttachments, AttachmentsFetchError } from "@/lib/hr/domain/attachments-client";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "ready"; items: AttachmentItem[]; unlisted: number[] };

/** The drawer's Attachments section: every file attached to the entry in
 *  the PM API, image files as thumbnails (click = full-size lightbox), anything
 *  else as a name chip with a download link. Each tile carries the 1-based
 *  requirement position so the mapping to the requirement cards above holds.
 *  Reads through the shared client cache (warmed by the browse grid's hover
 *  dwell), so a click after a hover finds the listing already in flight. Rendered only when the count says there is
 *  something to show, so entries without files pay nothing. */
export function AttachmentsSection({ taskDid, requirements }: { taskDid: string; requirements: ReportRequirement[] | null }) {
  const total = attachmentSummary(requirements).total;
  const [state, setState] = useState<State>({ kind: "loading" });
  const [open, setOpen] = useState<number | null>(null);
  // Images whose direct link (Storage derivative or ~300 s presigned S3
  // original) failed: those tiles fall back to the proxied /file route.
  const [directFailed, setDirectFailed] = useState<ReadonlySet<string>>(() => new Set());
  const markDirectFailed = (fileId: string) => setDirectFailed((prev) => { if (prev.has(fileId)) return prev; const next = new Set(prev); next.add(fileId); return next; });
  const srcFor = (item: AttachmentItem) => (item.previewUrl && !directFailed.has(item.fileId) ? item.previewUrl : item.url);

  // The parent keys this component by taskDid, so a new row mounts fresh in
  // the loading state; no reset needed here.
  useEffect(() => {
    if (total === 0) return;
    let cancelled = false;
    getAttachments(taskDid)
      .then((body) => { if (!cancelled) setState({ kind: "ready", items: body.files, unlisted: body.unlisted ?? [] }); })
      .catch((e: unknown) => {
        if (cancelled) return;
        const message = e instanceof AttachmentsFetchError ? e.message : "Could not load attachments. Check your connection and try again.";
        setState({ kind: "error", message });
      });
    return () => { cancelled = true; };
  }, [taskDid, total]);

  if (total === 0) return null;
  const items = state.kind === "ready" ? state.items : [];
  // What the lightbox can page through: every image, plus PDFs that have a
  // cached copy to show. Strip a failed direct link so the lightbox opens the
  // proxied bytes straight away instead of erroring first.
  const viewables = items
    .filter((i) => i.kind === "image" || (i.kind === "pdf" && !!i.displayUrl))
    .map((i) => (directFailed.has(i.fileId) ? { ...i, previewUrl: undefined, displayUrl: undefined } : i));

  return (
    <section>
      <div className="side-label mb-2" style={{ color: "var(--muted)" }}>
        Attachments{state.kind === "ready" ? ` (${items.length})` : ` (${total})`}
      </div>
      {state.kind === "loading" && (
        <div className="flex gap-2" aria-busy="true" aria-label="Loading attachments">
          {Array.from({ length: Math.min(total, 4) }).map((_, i) => <div key={i} className="attach-thumb attach-thumb-skeleton" />)}
        </div>
      )}
      {state.kind === "error" && <p className="text-sm" style={{ color: "var(--bad)" }}>{state.message}</p>}
      {state.kind === "ready" && state.unlisted.length > 0 && (
        <p className="mb-2 text-xs" style={{ color: "var(--warn, #8a5a00)" }}>
          the PM API did not answer for requirement{state.unlisted.length === 1 ? "" : "s"} {state.unlisted.join(", ")}; those files are not shown. Reopen to retry.
        </p>
      )}
      {state.kind === "ready" && items.length === 0 && (
        <p className="text-sm" style={{ color: "var(--muted)" }}>The PM API lists no current file for this entry (the count may be stale).</p>
      )}
      {state.kind === "ready" && items.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {items.map((item) => {
            const badge = <span className="attach-badge">Req {item.reqIndex}</span>;
            if (item.kind === "image") {
              // By id: `images` holds mapped copies, so identity lookup would miss.
              const idx = viewables.findIndex((i) => i.fileId === item.fileId);
              return (
                <li key={item.fileId}>
                  <button
                    type="button"
                    className="attach-thumb"
                    onClick={() => setOpen(idx)}
                    title={`${item.filename} · expand`}
                    aria-label={`Expand ${item.filename}`}
                  >
                    {/* Same-origin API bytes; next/image would need a remote allow list for nothing. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={srcFor(item)}
                      alt={item.filename}
                      loading="lazy"
                      onError={() => { if (srcFor(item) !== item.url) markDirectFailed(item.fileId); }}
                    />
                    {badge}
                    <span className="attach-expand" aria-hidden>⤢</span>
                  </button>
                </li>
              );
            }
            if (item.kind === "pdf" && item.displayUrl) {
              const idx = viewables.findIndex((i) => i.fileId === item.fileId);
              return (
                <li key={item.fileId}>
                  <button
                    type="button"
                    className="attach-thumb attach-file"
                    onClick={() => setOpen(idx)}
                    title={`${item.filename} · open`}
                    aria-label={`Open ${item.filename}`}
                  >
                    <span className="attach-ext">PDF</span>
                    <span className="attach-name">{item.filename}</span>
                    {badge}
                    <span className="attach-expand" aria-hidden>⤢</span>
                  </button>
                </li>
              );
            }
            return (
              <li key={item.fileId}>
                <a
                  href={`${item.url}&download=1`}
                  className="attach-thumb attach-file"
                  title={`${item.filename} · download`}
                >
                  <span className="attach-ext">{extLabel(item.filename)}</span>
                  <span className="attach-name">{item.filename}</span>
                  {badge}
                  <span className="attach-expand" aria-hidden>↓</span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
      {open !== null && viewables[open] && (
        <AttachmentLightbox images={viewables} index={open} onIndex={setOpen} onClose={() => setOpen(null)} onDirectFailed={markDirectFailed} />
      )}
    </section>
  );
}

function extLabel(filename: string): string {
  const m = /\.([a-z0-9]{1,5})$/i.exec(filename);
  return m ? m[1].toUpperCase() : "FILE";
}
