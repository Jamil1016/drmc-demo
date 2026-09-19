// Cell order is the export's public contract, keep it stable. Lives in its
// own dependency-free module so workbook builders (and their tests) can import
// it without pulling in the Next server runtime.

/** The seven lead columns every Data extract opens with, named and ordered
 *  so the file pastes straight into a tracker spreadsheet. "Hours Worked" = the
 *  RAW stated hours as filed (no 1h break deduction, so it agrees with the
 *  requirement hours); the net-of-break figure the variance math uses follows
 *  as "Stated hours (net of break)". "Date" is the work date. */
export const LEAD_EXPORT_HEADERS = [
  "ID Number", "Employee Name", "Month", "Date", "Task Status", "Hours Worked",
  "Requirement Description",
] as const;

export const BROWSE_EXPORT_HEADERS = [
  ...LEAD_EXPORT_HEADERS,
  "Carrier group", "Division",
  "Clock in (PHT)", "Submitted (PHT)", "Approved (PHT)", "Stated hours (net of break)", "Timed hours",
  "Approver group", "Approved by", "Approval latency (days)", "Task DID",
];
