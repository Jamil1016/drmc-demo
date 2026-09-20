export type NormalizedActivityQuery = {
  actor?: string;
  action?: string;
  from?: string;
  to?: string;
  before?: number;
  limit: number;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function cleanStr(v: string | undefined): string | undefined {
  const s = (v ?? "").trim();
  return s ? s : undefined;
}

function validDate(v: string | undefined): string | undefined {
  const s = cleanStr(v);
  return s && DATE_RE.test(s) ? s : undefined;
}

function posInt(v: string | undefined): number | undefined {
  const s = cleanStr(v);
  if (!s || !/^\d+$/.test(s)) return undefined;
  const n = Number(s);
  return n > 0 ? n : undefined;
}

export function normalizeActivityQuery(raw: Record<string, string | undefined>): NormalizedActivityQuery {
  const limitRaw = posInt(raw.limit);
  const q: NormalizedActivityQuery = { limit: limitRaw ? Math.min(limitRaw, 100) : 50 };
  // The actor filter becomes an ilike pattern, so keep it to characters an email
  // can hold: no pattern wildcards, no filter syntax.
  const actor = cleanStr(raw.actor)?.toLowerCase().replace(/[^a-z0-9@._+-]/g, "");
  if (actor) q.actor = actor;
  const action = cleanStr(raw.action);
  if (action && action in ACTION_LABELS) q.action = action;
  const from = validDate(raw.from);
  if (from) q.from = from;
  const to = validDate(raw.to);
  if (to) q.to = to;
  q.before = posInt(raw.before);
  return q;
}

/** Min id of a full page (there may be older rows); null when the page is short or empty. */
export function nextActivityCursor(rows: { id: number }[], limit: number): number | null {
  if (rows.length < limit || rows.length === 0) return null;
  return rows.reduce((min, r) => (r.id < min ? r.id : min), rows[0].id);
}

// Single source of truth for action labels: drives BOTH the feed's Action
// column (formatActionLabel) and the activity filter dropdown
// (ACTION_FILTER_OPTIONS). These are the actions this build writes; add a
// newly-audited action here and it shows up labeled in both places.
const ACTION_LABELS: Record<string, string> = {
  "auth.sign_in": "Signed in",
  "approval.approve": "Approved reports",
  "approval.bulk_approve": "Bulk approved reports",
};

/** Turn an unmapped `namespace.some_action` into "Some action" so a newly-added
 *  audited action still reads cleanly before anyone adds it to ACTION_LABELS. */
function humanizeAction(action: string): string {
  const tail = action.includes(".") ? action.slice(action.indexOf(".") + 1) : action;
  const words = tail.replace(/_/g, " ").trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : action;
}

export function formatActionLabel(action: string): string {
  return ACTION_LABELS[action] ?? humanizeAction(action);
}

/** Options for the activity filter's action dropdown, derived from the single
 *  ACTION_LABELS source of truth so the filter can never drift from the feed
 *  labels. "All actions" leads; the rest are sorted by label. */
export const ACTION_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All actions" },
  ...Object.entries(ACTION_LABELS)
    .map(([value, label]) => ({ value, label }))
    .sort((a, b) => a.label.localeCompare(b.label)),
];

export type ActivityLike = {
  action: string;
  entity: string;
  entity_id: string | null;
  detail: unknown;
};

function asRecord(detail: unknown): Record<string, unknown> {
  return detail && typeof detail === "object" ? (detail as Record<string, unknown>) : {};
}

const count = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Generic "key: value" dump, the fallback for actions that have no special case. */
function detailDump(detail: unknown): string {
  return Object.entries(asRecord(detail))
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(", ");
}

/**
 * Human-readable "object" of an activity row: WHAT the action affected, built
 * from the detail payload. Approves read as counts ("36 of 39 approved, 3
 * failed"), a sign-in shows the role it was granted, and an unknown action
 * falls back to a compact key:value dump.
 */
export function formatActivityObject(row: ActivityLike): string {
  const d = asRecord(row.detail);
  switch (row.action) {
    case "auth.sign_in": {
      const role = typeof d.role === "string" ? d.role : undefined;
      if (d.outcome === "granted") return role ? `granted · ${role}` : "granted";
      return "";
    }
    case "approval.approve":
    case "approval.bulk_approve": {
      const approved = count(d.approved);
      const failed = count(d.failed);
      const total = count(d.total);
      if (approved === null) return detailDump(row.detail);
      const head = total !== null ? `${approved} of ${total} approved` : `${approved} approved`;
      return failed ? `${head}, ${failed} failed` : head;
    }
    default:
      return detailDump(row.detail);
  }
}
