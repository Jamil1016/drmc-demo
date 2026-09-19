export type Group = { id: number; name: string; is_active: boolean };
export type Division = { id: number; name: string; sub_division: "TS" | "Non-TS"; is_active: boolean };

// --- Approval-cockpit row shapes ---
// Domain model types describing the data the pure logic operates on. Defined here
// (not in the query modules) so domain/ never depends on queries/; the query
// modules import these to type their return values and re-export them for callers.

/**
 * One approver-group row on the scorecard. On-time / late are measured against the
 * approval window (approved within 2 days of submission).
 * `filedLateCount` (employee submitted after the filing window) is tracked separately and
 * excluded from onTime/late so the approver isn't blamed for a late filing.
 */
export type ScorecardRow = {
  groupLabel: string;
  displayLabel: string;
  carrierGroup: string | null;
  employees: number | null;
  pending: number;
  pendingEmployees: number;
  approvers: number;
  approvedCount: number;
  onTimeCount: number;
  lateCount: number;
  filedLateCount: number;
  avgLatencyDays: number | null;
};

/** One daily-report row in the Browse table. */
export type BrowseRow = {
  empId: string;
  employeeName: string | null;
  email: string | null;
  carrierGroup: string | null;
  division: string | null;
  workDate: string;
  taskStatus: string;
  clockInEt: string | null;
  submittedOnEt: string | null;
  approvedOnEt: string | null;
  totalHours: number | null;
  assignedApprover: string | null;
  approvedBy: string | null;
  approvalLatencyDays: number | null;
  taskDid: string;
  shiftTimeInPht: string | null;
  /** Timer rollup: closed timer hours for the member's work day. */
  timedHours: number | null;
  openTimerCount: number;
  hasTimerHistory: boolean;
  /** Stated-vs-timer variance: the SAME expressions Hours Analysis reads from
   *  v_hr_report_review, so the two pages agree row for row. Both null with an
   *  open timer, no timer rollup, or no stated hours. */
  varianceHours: number | null;
  coveragePct: number | null;
};

/** A browse row awaiting approval, plus how long it has been waiting. */
export type PendingRow = BrowseRow & { pendingWaitDays: number | null };

/** One requirement line of a daily report (for the Browse hover peek + detail). */
export type ReportRequirement = {
  reqId: string | null;
  description: string | null;
  hours: number | null;
  status: string | null;
  /** Files uploaded against this requirement in the PM API (0 or 1 today). */
  fileCount: number;
};

/** One clean timer block the member logged during the report's ET work day. */
export type DayActivity = {
  start: string | null; // timestamptz (UTC)
  end: string | null;   // timestamptz (UTC)
  durationMin: number | null;
  project: string | null;
  siteName: string | null;
  /** Already the CLEANED task name (`task_clean`, numeric prefix stripped), with
   *  the raw name only as a fallback. */
  task: string | null;
  assetDid: string | null;
};

export type EmployeeInput = {
  empId: string;
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  fullName: string | null;
  nickname: string | null;
  email: string;
  position: string | null;
  groupId: number | null;
  divisionId: number | null;
  cluster: string | null;
  carrier: string | null;
  role2: string | null;
  workSchedule: string | null;
  shiftSchedule: string | null;
  restDay: string | null;
  employmentStatus: string | null;
  isActive: boolean;
  hireDate: string | null;
  resignationDate: string | null;
};

export type VersionInsert = {
  employee_id?: number;
  effective_from: string;
  effective_to: string | null;
  first_name: string | null;
  last_name: string | null;
  middle_name: string | null;
  full_name: string | null;
  nickname: string | null;
  email: string;
  position: string | null;
  group_id: number | null;
  division_id: number | null;
  cluster: string | null;
  carrier: string | null;
  role2: string | null;
  work_schedule: string | null;
  shift_schedule: string | null;
  rest_day: string | null;
  employment_status: string | null;
  is_active: boolean;
  hire_date: string | null;
  resignation_date: string | null;
  changed_by: string;
  change_reason: string | null;
};

export type EmployeeListRow = {
  employeeId: number;
  empId: string;
  fullName: string | null;
  email: string;
  position: string | null;
  groupName: string | null;
  divisionName: string | null;
  isActive: boolean;
};

// --- Directory (read-only) row shapes ---
// The Directory reads the authoritative, auto-synced roster via the
// analytics.v_employee_directory serving view. These shapes mirror that view.
// Keyed by emp_id (text) — the source has one row per employee, no version history.

/** One person in the Directory list. Grouped by carrierGroup; shows the supervisor column. */
export type DirectoryRow = {
  empId: string;
  fullName: string | null;
  /** The the PM API display name parsed from the employee's latest daily report
   *  ("FullName_<emp_id>"), or null when they have no parseable report. The UI
   *  shows this over fullName so the Directory matches the report tables. */
  reportDisplayName: string | null;
  email: string;
  position: string | null;
  carrierGroup: string | null;
  division: string | null;
  immediateSupervisor: string | null;
  isActive: boolean;
};

/** A single person's full read-only profile. */
export type DirectoryEntry = DirectoryRow & {
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  nickname: string | null;
  carrier: string | null;
  cluster: string | null;
  subDivision: string | null;
  workSchedule: string | null;
  shiftSchedule: string | null;
  shiftTimeInPht: string | null;
  shiftTimeOutPht: string | null;
  employmentStatus: string | null;
  hireDate: string | null;
  regularizationDate: string | null;
  resignationDate: string | null;
};

export type EmployeeVersion = VersionInsert & { id: number; created_at: string };

/** A version with the carrier group + division resolved to names (for display). */
export type EmployeeVersionView = EmployeeVersion & {
  groupName: string | null;
  divisionName: string | null;
};

export type EmployeeDetail = {
  employeeId: number;
  empId: string;
  current: EmployeeVersionView;
  history: EmployeeVersionView[];
};
