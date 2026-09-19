/**
 * Production-team scope for the Hours Analysis dashboard. Carrier groups are
 * stored as prefixed strings, and Carrier C is split into two (Fiber + Rural).
 * These four raw values are the ONLY ones this page
 * queries. They collapse to three display groups for the UI. Keep every scope
 * literal here - never inline a carrier-group string elsewhere.
 */
export const PRODUCTION_CARRIER_GROUPS = [
  "Group A - Carrier A",
  "Group B - Carrier B",
  "Group C - Carrier C/Fiber",
  "Group C - Carrier C/Rural",
] as const;

export const DISPLAY_GROUPS = ["Carrier A", "Carrier C", "Carrier B"] as const;
export type DisplayGroup = (typeof DISPLAY_GROUPS)[number];

const RAW_TO_DISPLAY: Record<string, DisplayGroup> = {
  "Group A - Carrier A": "Carrier A",
  "Group B - Carrier B": "Carrier B",
  "Group C - Carrier C/Fiber": "Carrier C",
  "Group C - Carrier C/Rural": "Carrier C",
};

/** Map a raw carrier_group string to its display group, or null if the row is
 *  outside the production scope (or has no carrier group). */
export function displayGroupForCarrier(raw: string | null): DisplayGroup | null {
  if (raw == null) return null;
  return RAW_TO_DISPLAY[raw] ?? null;
}
