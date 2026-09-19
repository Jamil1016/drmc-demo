/**
 * Excel cell typing for the streamed extracts. The NDJSON stream carries the
 * SAME formatted strings the CSV shows (PHT datetimes "yyyy-MM-dd hh:mm a",
 * dates "yyyy-MM-dd", both from lib/time.ts); the client-side workbook
 * builders convert them here into real typed date cells so Excel sorts,
 * filters, and pivots them as dates instead of text. Columns are recognized
 * BY HEADER NAME (the headers ride in the stream's first line), so one map
 * serves every dataset.
 */

// "Date" is the Data extracts' work-date lead column (LEAD_EXPORT_HEADERS);
// "Work date" stays for the timer-entries extract.
const DATE_HEADERS = new Set(["Date", "Work date", "Approval deadline"]);
// "Shift start (PHT)" is deliberately absent: it is a time-of-day label
// ("09:00 PM"), not an instant, and stays text.
const DATETIME_HEADERS = new Set([
  "Clock in (PHT)",
  "Submitted (PHT)",
  "Approved (PHT)",
  "Start (PHT)",
  "End (PHT)",
]);

export const EXCEL_DATE_NUMFMT = "yyyy-mm-dd";
export const EXCEL_DATETIME_NUMFMT = "yyyy-mm-dd hh:mm AM/PM";

const DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}) (AM|PM)$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Excel date serials are timezone-less wall times, and exceljs serializes a
 * JS Date from its UTC components; building the PHT wall time via Date.UTC
 * makes the sheet show exactly what the CSV/table shows. Unparseable values
 * (e.g. "no time-in" placeholders) fall back to the original text; empty
 * date cells become null so the sheet gets a blank cell, not empty text.
 */
export function toExcelCell(header: string, value: string | number | null): string | number | null | Date {
  const isDate = DATE_HEADERS.has(header);
  const isDatetime = DATETIME_HEADERS.has(header);
  if (!isDate && !isDatetime) return value;
  if (value == null || value === "") return null;
  if (typeof value !== "string") return value;
  if (isDate) {
    const m = DATE_RE.exec(value);
    if (!m) return value;
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  }
  const m = DATETIME_RE.exec(value);
  if (!m) return value;
  let h = +m[4] % 12;
  if (m[6] === "PM") h += 12;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], h, +m[5]));
}

/** Column number format for typed date/datetime columns, null for the rest. */
export function excelNumFmt(header: string): string | null {
  if (DATE_HEADERS.has(header)) return EXCEL_DATE_NUMFMT;
  if (DATETIME_HEADERS.has(header)) return EXCEL_DATETIME_NUMFMT;
  return null;
}
