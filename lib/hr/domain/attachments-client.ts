import type { AttachmentItem } from "./attachment-preview";
import { getOrFetch } from "./detail-cache";

/**
 * Browser-side promise cache for the drawer's Attachments listing, shared by
 * the hover warm-up (BrowseReports) and the AttachmentsSection itself, so a
 * click after a dwell reuses the in-flight or resolved request. Entries expire
 * after ATTACHMENTS_CLIENT_TTL_MS: a cold listing carries ~300 s presigned S3
 * links, so anything older is refetched rather than handed a dead link.
 */

export const ATTACHMENTS_CLIENT_TTL_MS = 4 * 60 * 1000;

export type AttachmentsResult = { files: AttachmentItem[]; source: string; unlisted?: number[] };
export class AttachmentsFetchError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; this.name = "AttachmentsFetchError"; }
}

const cache = new Map<string, Promise<AttachmentsResult>>();
const stamps = new Map<string, number>();

export async function fetchAttachmentsRaw(taskDid: string, warm = false): Promise<AttachmentsResult> {
  const res = await fetch(`/api/attachments/entry/${encodeURIComponent(taskDid)}/files${warm ? "?warm=1" : ""}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new AttachmentsFetchError(body?.error ?? `Could not load attachments (${res.status}).`, res.status);
  }
  return (await res.json()) as AttachmentsResult;
}

/** Shared, TTL-bounded fetch. `fetcher` and `nowMs` are injectable for tests. */
export function getAttachments(
  taskDid: string,
  fetcher: (taskDid: string) => Promise<AttachmentsResult> = fetchAttachmentsRaw,
  nowMs: number = Date.now(),
): Promise<AttachmentsResult> {
  const at = stamps.get(taskDid);
  if (at !== undefined && nowMs - at > ATTACHMENTS_CLIENT_TTL_MS) { cache.delete(taskDid); stamps.delete(taskDid); }
  if (!cache.has(taskDid)) stamps.set(taskDid, nowMs);
  return getOrFetch(cache, taskDid, () => fetcher(taskDid));
}

/** Fire-and-forget warm-up for a row the user is dwelling on. Errors are
 *  swallowed. `warm=1` tells the route to skip derivative rendering, so a mouse
 *  sweep never fans image work across the server. */
export function warmAttachments(taskDid: string): void {
  void getAttachments(taskDid, (id) => fetchAttachmentsRaw(id, true)).catch(() => {});
}

/** Test-only. */
export function _resetAttachmentsClientCache(): void {
  cache.clear();
  stamps.clear();
}
