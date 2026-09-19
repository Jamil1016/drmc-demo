import { test, expect } from "@playwright/test";
import { listScheduleHistory, toScheduleHistoryRow } from "./schedule-history-queries";

const DB_ROW = {
  emp_id: "250901",
  member_name: "Ada Lindqvist",
  role: "DA",
  sheet_tab: "DA",
  shift_start_pht: "1 PM",
  shift_end_pht: "10 PM",
  shift_start_et: "1 AM",
  shift_end_et: "10 AM",
  shift_code: "DS",
  work_arrangement: "5DWW",
  reg_hours: 9,
  rest_day: null,
  start_date: "2025-09-22",
  end_date: null,
  change_kind: "ongoing",
  notes: "New schedule starting Sept 22 (with approval from Merj)",
  is_current: true,
};

// Minimal stub matching the .schema(...).from(...).select(...).eq(...).order(...)+ chain.
// `error` (when given) is returned from the query instead of rows.
function stubClient(
  capture: Record<string, unknown>,
  rows: unknown[],
  error: { message: string } | null = null,
) {
  const orders: [string, { ascending: boolean }][] = [];
  const thenable = () => Promise.resolve(error ? { data: null, error } : { data: rows, error: null });
  const orderable = {
    order: (col: string, opts: { ascending: boolean }) => {
      orders.push([col, opts]);
      capture.orders = orders;
      return orderable;
    },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => thenable().then(res, rej),
  };
  return {
    schema: (s: string) => {
      capture.schema = s;
      return {
        from: (t: string) => {
          capture.table = t;
          return {
            select: (cols: string) => {
              capture.cols = cols;
              return {
                eq: (col: string, val: string) => {
                  capture.eqCol = col;
                  capture.eqVal = val;
                  return orderable;
                },
              };
            },
          };
        },
      };
    },
  } as unknown as Parameters<typeof listScheduleHistory>[1];
}

test("toScheduleHistoryRow maps snake_case to camelCase with nulls preserved", () => {
  const row = toScheduleHistoryRow(DB_ROW as unknown as Record<string, unknown>);
  expect(row).toEqual({
    empId: "250901",
    memberName: "Ada Lindqvist",
    role: "DA",
    sheetTab: "DA",
    shiftStartPht: "1 PM",
    shiftEndPht: "10 PM",
    shiftStartEt: "1 AM",
    shiftEndEt: "10 AM",
    shiftCode: "DS",
    workArrangement: "5DWW",
    regHours: 9,
    restDay: null,
    startDate: "2025-09-22",
    endDate: null,
    changeKind: "ongoing",
    notes: "New schedule starting Sept 22 (with approval from Merj)",
    isCurrent: true,
  });
});

test("toScheduleHistoryRow coerces is_current and blank optionals", () => {
  const row = toScheduleHistoryRow({
    ...DB_ROW,
    is_current: false,
    reg_hours: null,
    notes: null,
    shift_start_pht: "",
  } as unknown as Record<string, unknown>);
  expect(row.isCurrent).toBe(false);
  expect(row.regHours).toBe(null);
  expect(row.notes).toBe(null);
  // '' (blank PHT-start PK sentinel from the loader) normalizes to null for display.
  expect(row.shiftStartPht).toBe(null);
});

test("listScheduleHistory queries the analytics view newest-first for the member", async () => {
  const capture: Record<string, unknown> = {};
  const rows = await listScheduleHistory("250901", stubClient(capture, [DB_ROW]));
  expect(capture.schema).toBe("drmc_analytics");
  expect(capture.table).toBe("v_employee_schedule_history");
  expect(capture.eqCol).toBe("emp_id");
  expect(capture.eqVal).toBe("250901");
  const orders = capture.orders as [string, { ascending: boolean }][];
  expect(orders[0]).toEqual(["start_date", { ascending: false }]);
  // Deterministic tie-breakers so same-day rows keep a stable order and key.
  expect(orders.map(([c]) => c)).toEqual(["start_date", "end_date", "shift_start_pht"]);
  expect(rows).not.toBeNull();
  expect(rows).toHaveLength(1);
  expect(rows![0].empId).toBe("250901");
});

test("listScheduleHistory degrades to null (not []) when the read fails", async () => {
  const errors: unknown[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => {
    errors.push(a);
  };
  try {
    const rows = await listScheduleHistory(
      "250901",
      stubClient({}, [], { message: "permission denied for view v_employee_schedule_history" }),
    );
    expect(rows).toBeNull();
    expect(errors).toHaveLength(1);
  } finally {
    console.error = orig;
  }
});
