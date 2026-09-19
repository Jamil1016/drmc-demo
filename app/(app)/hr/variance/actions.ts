"use server";
import { requireMinRole } from "@/lib/auth/require-user";
import { getDayActivitiesBatch, getReportRequirements } from "@/lib/hr/queries/report-detail";
import type { DayActivity, ReportRequirement } from "@/lib/hr/queries/report-detail";

/** Fetch the day-timeline modal payload for one report (timer activity + the
 *  report's requirements). manager-gated. Read-only.
 *
 *  MUST stay in step with the /hr/variance page gate. This action backs the
 *  drill-down modal, so a stricter gate here lets the dashboard render and then
 *  errors when a row is clicked. */
export async function getVarianceDayDetail(
  taskDid: string,
  email: string | null,
  workDate: string,
): Promise<{ dayActivities: DayActivity[]; requirements: ReportRequirement[] }> {
  await requireMinRole("manager");
  const [byTask, requirements] = await Promise.all([
    getDayActivitiesBatch([{ taskDid, email, workDate }]),
    getReportRequirements(taskDid),
  ]);
  return { dayActivities: byTask[taskDid] ?? [], requirements };
}
