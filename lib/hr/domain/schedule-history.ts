// Schedule history domain logic for the directory member page.
// Rows come from the v_employee_schedule_history serving view.
// Framework-free on purpose (house rule: domain logic in lib/hr/domain/,
// rendering in components/).
import type { PillTone } from "@/components/ui/StatusPill";
import type { DisplayZone } from "@/lib/time";
import { formatWorkDate } from "@/lib/time";

export type ScheduleChangeKind = "one_day" | "temporary" | "ongoing";

export type ScheduleHistoryRow = {
  empId: string;
  memberName: string;
  role: string | null;
  sheetTab: string;
  shiftStartPht: string | null;
  shiftEndPht: string | null;
  shiftStartEt: string | null;
  shiftEndEt: string | null;
  shiftCode: string | null; // "DS" | "NS" as recorded
  workArrangement: string | null; // "5DWW" | "4DWW" as written
  regHours: number | null;
  restDay: string | null;
  startDate: string; // yyyy-MM-dd
  endDate: string | null; // null = open-ended
  changeKind: ScheduleChangeKind;
  notes: string | null; // verbatim notes (approver, reason, exceptions)
  isCurrent: boolean;
};

const KIND_LABELS: Record<ScheduleChangeKind, string> = {
  one_day: "One day",
  temporary: "Temporary",
  ongoing: "Ongoing",
};

const KIND_TONES: Record<ScheduleChangeKind, PillTone> = {
  one_day: "info",
  temporary: "warn",
  ongoing: "neutral",
};

export function kindLabel(k: ScheduleChangeKind): string {
  return KIND_LABELS[k] ?? k;
}

export function kindTone(k: ScheduleChangeKind): PillTone {
  return KIND_TONES[k] ?? "neutral";
}

export function dateRangeLabel(
  row: Pick<ScheduleHistoryRow, "startDate" | "endDate" | "changeKind">,
): string {
  const start = formatWorkDate(row.startDate);
  if (row.changeKind === "one_day") return start;
  if (row.changeKind === "ongoing" || !row.endDate) return `${start} onwards`;
  return `${start} to ${formatWorkDate(row.endDate)}`;
}

export function shiftWindowLabel(row: ScheduleHistoryRow, zone: DisplayZone): string {
  const [start, end] =
    zone === "ET"
      ? [row.shiftStartEt, row.shiftEndEt]
      : [row.shiftStartPht, row.shiftEndPht];
  if (!start || !end) return "";
  return `${start} to ${end} ${zone}`;
}
