/** "2026-07-15" -> "2026-07": the extract's pivot-friendly Month column. */
export function monthOf(workDate: string): string {
  return workDate.slice(0, 7);
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "08. August": zero-padded number so it sorts chronologically, then the
 *  name. Empty when the date is unusable. */
export function monthLabel(workDate: string): string {
  const m = /^\d{4}-(\d{2})-\d{2}$/.exec(workDate);
  if (!m) return "";
  const idx = +m[1] - 1;
  if (idx < 0 || idx > 11) return "";
  return `${m[1]}. ${MONTH_NAMES[idx]}`;
}
