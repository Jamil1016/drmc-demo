import type { ReportRequirement } from "./types";

/**
 * Pure shaping for the report drawer's Attachments section: which files
 * render as inline thumbnails, and the flat item list the client draws.
 */

/** One file attached to a requirement, as listed by the project-management system. */
export type RequirementFile = { fileId: string; filename: string; mimeType: string | null };

export type AttachmentItem = {
  reqId: string;
  /** 1-based position of the requirement in the report's full requirement list (the "Req 2" badge). */
  reqIndex: number;
  fileId: string;
  filename: string;
  mimeType: string | null;
  /** image = thumbnail + lightbox; pdf = chip that opens the browser's PDF viewer
   *  in the lightbox once cached (download chip until then); file = download chip. */
  kind: "image" | "pdf" | "file";
  /** Same-origin URL that streams the bytes (append &download=1 for an attachment disposition). */
  url: string;
  /** Images only: a short-lived presigned link from the project-management system. The browser loads the
   *  thumbnail from here directly; on error it falls back to `url`. */
  previewUrl?: string;
  /** Images only: what the lightbox shows (1600px WebP derivative from Storage,
   *  or the presigned original when no derivative exists yet). Falls back to `url`. */
  displayUrl?: string;
};

// Only raster formats every evergreen browser renders in <img>. TIFF/HEIC are
// not; SVG is left out on purpose (it can carry script). Decided from the MIME
// type ALONE: a filename extension is spoofable apart from the bytes, and the
// /file route serves inline only when the type it actually sends is in this set.
const IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/bmp", "image/avif"]);

/** Lower-cased media type without parameters; "" for null/blank. */
export function normalizeMime(mimeType: string | null | undefined): string {
  return (mimeType ?? "").toLowerCase().split(";")[0].trim();
}

export function isPreviewableImage(mimeType: string | null | undefined): boolean {
  return IMAGE_MIME.has(normalizeMime(mimeType));
}

export function isPdf(mimeType: string | null | undefined): boolean {
  return normalizeMime(mimeType) === "application/pdf";
}

export function attachmentKind(mimeType: string | null | undefined): AttachmentItem["kind"] {
  if (isPreviewableImage(mimeType)) return "image";
  if (isPdf(mimeType)) return "pdf";
  return "file";
}

export function attachmentFileUrl(taskDid: string, reqId: string, fileId: string): string {
  const qs = new URLSearchParams({ req: reqId, file: fileId });
  return `/api/attachments/entry/${encodeURIComponent(taskDid)}/file?${qs}`;
}

/** Flatten per-requirement file listings into display items, in requirement order. */
export function buildAttachmentItems(
  taskDid: string,
  requirements: ReportRequirement[],
  listed: Map<string, RequirementFile[]>,
): AttachmentItem[] {
  const out: AttachmentItem[] = [];
  requirements.forEach((r, i) => {
    if (!r.reqId) return;
    for (const f of listed.get(r.reqId) ?? []) {
      out.push({
        reqId: r.reqId,
        reqIndex: i + 1,
        fileId: f.fileId,
        filename: f.filename,
        mimeType: f.mimeType,
        kind: attachmentKind(f.mimeType),
        url: attachmentFileUrl(taskDid, r.reqId, f.fileId),
      });
    }
  });
  return out;
}
