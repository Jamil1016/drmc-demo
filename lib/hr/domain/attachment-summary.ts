import type { ReportRequirement } from "./types";

/**
 * Summarize how many files a report has attached in the PM API, for the Browse hover
 * card's "has file(s) to review" indicator. Informational only; not a check that
 * a required file is present. Report total = sum of per-requirement file counts.
 */
export function attachmentSummary(
  items: ReportRequirement[] | null | undefined,
): { total: number; label: string | null } {
  const total = (items ?? []).reduce((n, r) => n + (r.fileCount || 0), 0);
  if (total <= 0) return { total: 0, label: null };
  return { total, label: `${total} file${total === 1 ? "" : "s"}` };
}
