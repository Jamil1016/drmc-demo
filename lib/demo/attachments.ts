import type { ReportRequirement } from "@/lib/hr/domain/types";
import { buildAttachmentItems, type AttachmentItem, type RequirementFile } from "@/lib/hr/domain/attachment-preview";

/**
 * Report attachments in the demo. The original app lists each requirement's
 * files from the project-management system and proxies their bytes. Here the
 * listing is derived from the seeded `file_uploaded_count` on each requirement
 * row, and every file is one of a handful of generated placeholder images
 * (scripts/make-placeholders.mjs). The drawer, thumbnails and lightbox are the
 * real components; only the source of the listing and the bytes is simulated.
 */
export const DEMO_PLACEHOLDER_COUNT = 5;

/** Small stable string hash (FNV-1a), so a given file always maps to the same image. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

export function demoPlaceholderPath(fileId: string): string {
  return `/demo-attachments/placeholder-${(hash(fileId) % DEMO_PLACEHOLDER_COUNT) + 1}.png`;
}

export function demoAttachmentItems(taskDid: string, requirements: ReportRequirement[]): AttachmentItem[] {
  const listed = new Map<string, RequirementFile[]>();
  for (const r of requirements) {
    if (!r.reqId || r.fileCount <= 0) continue;
    const n = Math.min(r.fileCount, 6);
    listed.set(
      r.reqId,
      Array.from({ length: n }, (_, i) => ({
        fileId: `${r.reqId}-f${i + 1}`,
        filename: `site-photo-${i + 1}.png`,
        mimeType: "image/png",
      })),
    );
  }
  return buildAttachmentItems(taskDid, requirements, listed);
}
