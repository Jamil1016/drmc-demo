// Shared CSV cell formatting for server-action exports (Browse export, HR
// review export, ...). Kept dependency-free so any action.ts can import it.
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  // Neutralize spreadsheet formula injection: a cell starting with one of these
  // is treated as a formula by Excel/Sheets, so prefix it with a quote.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
