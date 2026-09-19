import { DB } from "@/lib/db/schemas";
import { createServiceClient } from "@/lib/supabase/service";
import { withDbRetry } from "@/lib/hr/db-retry";
import type { DirectoryEntry, DirectoryRow } from "../domain/types";

// The Directory is read-only and sourced from the authoritative, auto-synced
// roster via the v_employee_directory serving view. One row per employee; no
// version history.

const DIR_COLS =
  "emp_id, full_name, report_display_name, first_name, last_name, middle_name, nickname, email, position, " +
  "carrier_group, carrier, cluster, division, sub_division, work_schedule, shift_schedule, " +
  "shift_time_in_pht, shift_time_out_pht, employment_status, immediate_supervisor, " +
  "hire_date, regularization_date, resignation_date, is_active";

/** Map a raw view row to the full read-only profile shape. */
function toEntry(r: Record<string, unknown>): DirectoryEntry {
  return {
    empId: r.emp_id as string,
    fullName: (r.full_name as string) ?? null,
    reportDisplayName: (r.report_display_name as string) ?? null,
    firstName: (r.first_name as string) ?? null,
    lastName: (r.last_name as string) ?? null,
    middleName: (r.middle_name as string) ?? null,
    nickname: (r.nickname as string) ?? null,
    email: r.email as string,
    position: (r.position as string) ?? null,
    carrierGroup: (r.carrier_group as string) ?? null,
    carrier: (r.carrier as string) ?? null,
    cluster: (r.cluster as string) ?? null,
    division: (r.division as string) ?? null,
    subDivision: (r.sub_division as string) ?? null,
    workSchedule: (r.work_schedule as string) ?? null,
    shiftSchedule: (r.shift_schedule as string) ?? null,
    shiftTimeInPht: (r.shift_time_in_pht as string) ?? null,
    shiftTimeOutPht: (r.shift_time_out_pht as string) ?? null,
    employmentStatus: (r.employment_status as string) ?? null,
    immediateSupervisor: (r.immediate_supervisor as string) ?? null,
    hireDate: (r.hire_date as string) ?? null,
    regularizationDate: (r.regularization_date as string) ?? null,
    resignationDate: (r.resignation_date as string) ?? null,
    isActive: r.is_active as boolean,
  };
}

export async function listDirectory(
  opts?: { search?: string; activeOnly?: boolean; carrierGroups?: string[]; empIds?: string[] }
): Promise<DirectoryRow[]> {
  const svc = createServiceClient();
  // An explicit (even empty) empIds set means "restrict to exactly these people"
  // — an empty set must return nobody, not the whole roster.
  if (opts?.empIds && opts.empIds.length === 0) return [];
  let q = svc.schema(DB.analytics).from("v_employee_directory")
    .select(DIR_COLS)
    .order("full_name");
  if (opts?.activeOnly) q = q.eq("is_active", true);
  if (opts?.carrierGroups && opts.carrierGroups.length) q = q.in("carrier_group", opts.carrierGroups);
  if (opts?.empIds && opts.empIds.length) q = q.in("emp_id", opts.empIds);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  // The analytics view isn't in the generated DB types, so supabase-js infers an
  // error-row type; cast to the raw shape and map it ourselves.
  const raw = (data ?? []) as unknown as Record<string, unknown>[];
  let rows = raw.map((r) => ({
    empId: r.emp_id as string,
    fullName: (r.full_name as string) ?? null,
    reportDisplayName: (r.report_display_name as string) ?? null,
    email: r.email as string,
    position: (r.position as string) ?? null,
    carrierGroup: (r.carrier_group as string) ?? null,
    division: (r.division as string) ?? null,
    immediateSupervisor: (r.immediate_supervisor as string) ?? null,
    isActive: r.is_active as boolean,
  })) as DirectoryRow[];
  if (opts?.search) {
    const s = opts.search.toLowerCase();
    rows = rows.filter((e) =>
      (e.reportDisplayName ?? "").toLowerCase().includes(s) ||
      (e.fullName ?? "").toLowerCase().includes(s) ||
      e.email.toLowerCase().includes(s) ||
      e.empId.includes(s) ||
      (e.carrierGroup ?? "").toLowerCase().includes(s)
    );
  }
  return rows;
}

/**
 * Count active employees without fetching their rows. Used by the Home page
 * roster tile, which previously called listDirectory({activeOnly:true}) and
 * only read .length, pulling every directory column for every active
 * employee on each load.
 */
export async function countActiveEmployees(): Promise<number> {
  const svc = createServiceClient();
  const { count, error } = await svc.schema(DB.analytics).from("v_employee_directory")
    .select("emp_id", { count: "exact", head: true })
    .eq("is_active", true);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function getDirectoryEntry(empId: string): Promise<DirectoryEntry | null> {
  const svc = createServiceClient();
  const data = await withDbRetry(async () => {
    const { data: row, error } = await svc.schema(DB.analytics).from("v_employee_directory")
      .select(DIR_COLS).eq("emp_id", empId).maybeSingle();
    if (error) throw new Error(error.message);
    return row;
  });
  if (!data) return null;
  return toEntry(data as unknown as Record<string, unknown>);
}
