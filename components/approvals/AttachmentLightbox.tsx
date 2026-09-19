"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { AttachmentItem } from "@/lib/hr/domain/attachment-preview";

/** Full-size view of one attached image with prev/next across the entry's
 *  images. Same stacked-modal rule as DayTimelineModal: it OWNS Escape while
 *  open (capture + stopPropagation) so closing it never closes the drawer. */
export function AttachmentLightbox({ images, index, onIndex, onClose, onDirectFailed }: {
  images: AttachmentItem[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** The direct S3 link for this file failed (expired); the parent strips it so
   *  the next render uses the proxied route. */
  onDirectFailed?: (fileId: string) => void;
}) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  // The file id whose bytes failed to load; compared against the current item
  // so moving to another image clears the message without an effect.
  const [failedId, setFailedId] = useState<string | null>(null);
  const item = images[index];
  const many = images.length > 1;
  const failed = item ? failedId === item.fileId : false;

  useEffect(() => { closeRef.current?.focus(); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.stopPropagation(); onClose(); }
      else if (many && e.key === "ArrowRight") { e.stopPropagation(); onIndex((index + 1) % images.length); }
      else if (many && e.key === "ArrowLeft") { e.stopPropagation(); onIndex((index - 1 + images.length) % images.length); }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [index, images.length, many, onClose, onIndex]);

  if (!item) return null;
  return (
    <div className="drawer-overlay" style={{ display: "grid", placeItems: "center", zIndex: 60, background: "rgba(15, 23, 42, 0.78)" }} onClick={onClose}>
      <div
        className="flex flex-col"
        style={{ width: "min(92vw, 1400px)", height: "92vh" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        {/* Click-to-close: the frame itself lets clicks fall through to the
            overlay; only the header bar, the image and the arrows swallow them,
            so clicking the empty stage beside the picture closes the lightbox. */}
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3 text-white" onClick={(e) => e.stopPropagation()}>
          <div className="min-w-0">
            <h3 id={titleId} className="truncate text-sm font-semibold">{item.filename}</h3>
            <p className="mt-0.5 text-xs" style={{ color: "rgba(255,255,255,0.7)" }}>
              Requirement {item.reqIndex}{many ? ` · ${index + 1} of ${images.length}` : ""}{item.kind === "pdf" ? " · PDF" : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href={`${item.url}&download=1`} className="btn-ghost" style={{ color: "#fff", borderColor: "rgba(255,255,255,0.35)", background: "transparent" }}>
              Download
            </a>
            <button ref={closeRef} onClick={onClose} className="text-xl leading-none" style={{ color: "#fff" }} aria-label="Close">✕</button>
          </div>
        </div>
        <div className="relative flex min-h-0 flex-1 items-center justify-center">
          {many && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onIndex((index - 1 + images.length) % images.length); }}
              className="lightbox-nav"
              style={{ left: 0 }}
              aria-label="Previous image"
            >‹</button>
          )}
          {item.kind === "pdf" && item.displayUrl ? (
            // The browser's own PDF viewer, loaded from the Storage origin (a
            // signed URL of the cached copy), so nothing in the PDF runs in ours.
            <iframe
              key={item.fileId}
              src={item.displayUrl}
              title={item.filename}
              onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", height: "100%", border: 0, borderRadius: 6, background: "#fff" }}
            />
          ) : failed ? (
            <p className="text-sm" style={{ color: "rgba(255,255,255,0.8)" }} onClick={(e) => e.stopPropagation()}>
              This image could not be loaded from the PM API. <a href={`${item.url}&download=1`} className="underline">Download it</a> instead.
            </p>
          ) : (
            // Plain <img>: the bytes come from our own same-origin API route, not
            // a remote host next/image would need in its allow list.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={`${item.fileId}:${item.displayUrl ?? item.previewUrl ? "direct" : "proxy"}`}
              src={item.displayUrl ?? item.previewUrl ?? item.url}
              alt={item.filename}
              onError={() => { if ((item.displayUrl ?? item.previewUrl) && onDirectFailed) onDirectFailed(item.fileId); else setFailedId(item.fileId); }}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain", borderRadius: 6, background: "#fff" }}
            />
          )}
          {many && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onIndex((index + 1) % images.length); }}
              className="lightbox-nav"
              style={{ right: 0 }}
              aria-label="Next image"
            >›</button>
          )}
        </div>
      </div>
    </div>
  );
}
