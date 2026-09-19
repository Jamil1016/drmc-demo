import type { ReportRequirement } from "@/lib/hr/queries/report-detail";

/** One spreadsheet cell listing the report's requirement descriptions, one
 *  per line (the per-line "9h ·" hours prefix was dropped: the
 *  tracker wants the text only; hours live in "Hours Worked"). csvCell quotes
 *  the newlines so the lines stay inside a single cell. */
export function requirementsCell(reqs: ReportRequirement[] | undefined): string {
  if (!reqs || reqs.length === 0) return "";
  return reqs
    .map((q) => (q.description ?? "").trim())
    .filter(Boolean)
    .join("\n");
}
