import { test, expect } from "@playwright/test";
import {
  dateRangeLabel,
  kindLabel,
  kindTone,
  shiftWindowLabel,
  type ScheduleHistoryRow,
} from "./schedule-history";

function row(overrides: Partial<ScheduleHistoryRow> = {}): ScheduleHistoryRow {
  return {
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
    ...overrides,
  };
}

test("kindLabel maps every kind", () => {
  expect(kindLabel("one_day")).toBe("One day");
  expect(kindLabel("temporary")).toBe("Temporary");
  expect(kindLabel("ongoing")).toBe("Ongoing");
});

test("kindTone maps every kind to a pill tone", () => {
  expect(kindTone("one_day")).toBe("info");
  expect(kindTone("temporary")).toBe("warn");
  expect(kindTone("ongoing")).toBe("neutral");
});

test("dateRangeLabel: one_day shows the single date", () => {
  const r = row({ startDate: "2026-09-03", endDate: "2026-09-03", changeKind: "one_day" });
  expect(dateRangeLabel(r)).toBe("09-03-2026");
});

test("dateRangeLabel: ongoing shows onwards", () => {
  expect(dateRangeLabel(row())).toBe("09-22-2025 onwards");
});

test("dateRangeLabel: temporary shows the range", () => {
  const r = row({ startDate: "2025-09-01", endDate: "2025-09-19", changeKind: "temporary" });
  expect(dateRangeLabel(r)).toBe("09-01-2025 to 09-19-2025");
});

test("shiftWindowLabel picks the zone's window", () => {
  expect(shiftWindowLabel(row(), "PHT")).toBe("1 PM to 10 PM PHT");
  expect(shiftWindowLabel(row(), "ET")).toBe("1 AM to 10 AM ET");
});

test("shiftWindowLabel with a missing half returns empty", () => {
  const r = row({ shiftStartPht: null });
  expect(shiftWindowLabel(r, "PHT")).toBe("");
  // Blank PHT-start rows are stored as '' by the loader (PK column).
  const blank = row({ shiftStartPht: "" });
  expect(shiftWindowLabel(blank, "PHT")).toBe("");
});
