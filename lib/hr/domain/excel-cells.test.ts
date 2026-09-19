import { test, expect } from "@playwright/test";
import { toExcelCell, excelNumFmt, EXCEL_DATE_NUMFMT, EXCEL_DATETIME_NUMFMT } from "./excel-cells";

test("work date becomes a UTC-midnight Date (Excel wall-time serial)", () => {
  const v = toExcelCell("Work date", "2026-07-10");
  expect(v).toBeInstanceOf(Date);
  expect((v as Date).toISOString()).toBe("2026-07-10T00:00:00.000Z");
});

test("PHT datetime strings become wall-time Dates, 12-hour edges included", () => {
  const pm = toExcelCell("Clock in (PHT)", "2026-07-10 08:23 PM") as Date;
  expect(pm.toISOString()).toBe("2026-07-10T20:23:00.000Z");
  const noon = toExcelCell("Submitted (PHT)", "2026-07-10 12:05 PM") as Date;
  expect(noon.toISOString()).toBe("2026-07-10T12:05:00.000Z");
  const midnight = toExcelCell("Approved (PHT)", "2026-07-10 12:05 AM") as Date;
  expect(midnight.toISOString()).toBe("2026-07-10T00:05:00.000Z");
});

test("timer entry Start/End and Approval deadline are typed too", () => {
  expect(toExcelCell("Start (PHT)", "2026-07-10 09:00 PM")).toBeInstanceOf(Date);
  expect(toExcelCell("End (PHT)", "2026-07-11 01:30 AM")).toBeInstanceOf(Date);
  expect(toExcelCell("Approval deadline", "2026-07-14")).toBeInstanceOf(Date);
});

test("empty date cells become null (blank cell), not empty text", () => {
  expect(toExcelCell("Approved (PHT)", "")).toBeNull();
  expect(toExcelCell("End (PHT)", "")).toBeNull();
});

test("non-date columns pass through untouched", () => {
  expect(toExcelCell("Employee", "Omar Said")).toBe("Omar Said");
  expect(toExcelCell("Stated hours", 8.5)).toBe(8.5);
  expect(toExcelCell("Month", "2026-07")).toBe("2026-07");
  expect(toExcelCell("Requirements", "")).toBe("");
});

test("unparseable values in date columns fall back to the original text", () => {
  expect(toExcelCell("Work date", "not a date")).toBe("not a date");
  expect(toExcelCell("Clock in (PHT)", "no time-in")).toBe("no time-in");
});

test("numFmt only for date/datetime columns", () => {
  expect(excelNumFmt("Work date")).toBe(EXCEL_DATE_NUMFMT);
  expect(excelNumFmt("Date")).toBe(EXCEL_DATE_NUMFMT);
  expect(toExcelCell("Date", "2026-08-01")).toBeInstanceOf(Date);
  expect(excelNumFmt("Clock in (PHT)")).toBe(EXCEL_DATETIME_NUMFMT);
  expect(excelNumFmt("Shift start (PHT)")).toBeNull(); // time-of-day label, stays text
  expect(excelNumFmt("Employee")).toBeNull();
});

test("exceljs roundtrip: typed date cell survives write + read as a real date", async () => {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("t");
  ws.addRow(["Work date", "Clock in (PHT)"]);
  ws.addRow([toExcelCell("Work date", "2026-07-10"), toExcelCell("Clock in (PHT)", "2026-07-10 08:23 PM")]);
  const buf = await wb.xlsx.writeBuffer();

  const wb2 = new ExcelJS.Workbook();
  await wb2.xlsx.load(buf as ArrayBuffer);
  const cell = wb2.getWorksheet("t")!.getCell("A2");
  expect(cell.value).toBeInstanceOf(Date);
  expect((cell.value as Date).toISOString()).toBe("2026-07-10T00:00:00.000Z");
  const dt = wb2.getWorksheet("t")!.getCell("B2");
  expect(dt.value).toBeInstanceOf(Date);
  expect((dt.value as Date).toISOString()).toBe("2026-07-10T20:23:00.000Z");
});
