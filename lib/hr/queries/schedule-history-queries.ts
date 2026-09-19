// Reads the v_employee_schedule_history serving view: per-member
// schedule-change history. Analytics views are not
// in the generated DB types, so rows are cast and hand-mapped (house pattern,
// see directory-queries.ts).
import { DB } from "@/lib/db/schemas";
import { createServiceClient } from "@/lib/supabase/service";
import { withDbRetry } from "@/lib/hr/db-retry";
import type {
  ScheduleChangeKind,
  ScheduleHistoryRow,
} from "@/lib/hr/domain/schedule-history";

const COLS =
  "emp_id, member_name, role, sheet_tab, shift_start_pht, shift_end_pht, " +
  "shift_start_et, shift_end_et, shift_code, work_arrangement, reg_hours, " +
  "rest_day, start_date, end_date, change_kind, notes, is_current";

type Client = ReturnType<typeof createServiceClient>;

// Supplemental section on the member page: a failed read (after the one
// withDbRetry attempt) degrades to null so the profile still renders, the same
// way getDailyReportInstructions does. null = "unavailable", [] = "no changes".
export async function listScheduleHistory(
  empId: string,
  svc: Client = createServiceClient(),
): Promise<ScheduleHistoryRow[] | null> {
  try {
    return await readScheduleHistory(empId, svc);
  } catch (e) {
    console.error("listScheduleHistory: degraded to null:", e);
    return null;
  }
}

async function readScheduleHistory(
  empId: string,
  svc: Client,
): Promise<ScheduleHistoryRow[]> {
  const data = await withDbRetry(async () => {
    const { data: rows, error } = await svc
      .schema(DB.analytics)
      .from("v_employee_schedule_history")
      .select(COLS)
      .eq("emp_id", empId)
      .order("start_date", { ascending: false })
      // Same-day ties (a one-day row re-entered, split shifts) render in a
      // stable order and never share a React key.
      .order("end_date", { ascending: false, nullsFirst: true })
      .order("shift_start_pht", { ascending: true });
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
  return (data as unknown as Record<string, unknown>[]).map(toScheduleHistoryRow);
}

function text(v: unknown): string | null {
  const s = v == null ? "" : String(v);
  return s === "" ? null : s;
}

export function toScheduleHistoryRow(r: Record<string, unknown>): ScheduleHistoryRow {
  return {
    empId: String(r.emp_id),
    memberName: String(r.member_name ?? ""),
    role: text(r.role),
    sheetTab: String(r.sheet_tab ?? ""),
    shiftStartPht: text(r.shift_start_pht),
    shiftEndPht: text(r.shift_end_pht),
    shiftStartEt: text(r.shift_start_et),
    shiftEndEt: text(r.shift_end_et),
    shiftCode: text(r.shift_code),
    workArrangement: text(r.work_arrangement),
    regHours: r.reg_hours == null ? null : Number(r.reg_hours),
    restDay: text(r.rest_day),
    startDate: String(r.start_date),
    endDate: r.end_date == null ? null : String(r.end_date),
    changeKind: (r.change_kind as ScheduleChangeKind) ?? "temporary",
    notes: text(r.notes),
    isCurrent: Boolean(r.is_current),
  };
}
