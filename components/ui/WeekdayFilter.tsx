"use client";

// Weekday toggle row for the work-date filter. Values use Postgres
// extract(dow) numbering (0=Sun..6=Sat) so they map straight to the
// hr_review_page / hr_review_count `p_dows` param without translation.
// Empty selection = all days. Click chips to keep only those weekdays
// (e.g. Sat + Sun for weekend work, or Mon + Wed).

export const WEEKDAYS: { dow: number; label: string; full: string }[] = [
  { dow: 0, label: "Sun", full: "Sunday" },
  { dow: 1, label: "Mon", full: "Monday" },
  { dow: 2, label: "Tue", full: "Tuesday" },
  { dow: 3, label: "Wed", full: "Wednesday" },
  { dow: 4, label: "Thu", full: "Thursday" },
  { dow: 5, label: "Fri", full: "Friday" },
  { dow: 6, label: "Sat", full: "Saturday" },
];

export function WeekdayFilter({
  selected,
  onChange,
  wrap = false,
}: {
  selected: number[];
  onChange: (dows: number[]) => void;
  /** Two-row (4 + 3) layout for wider hosts; default is a single 7-chip row. */
  wrap?: boolean;
}) {
  function toggle(dow: number) {
    const next = selected.includes(dow)
      ? selected.filter((d) => d !== dow)
      : [...selected, dow].sort((a, b) => a - b);
    onChange(next);
  }

  return (
    // Single 7-chip row by default (see .weekday-grid); `wrap` switches to a
    // 4-column two-row layout for the wider filter bar above the table.
    <div
      className={wrap ? "weekday-grid weekday-grid--wrap" : "weekday-grid"}
      role="group"
      aria-label="Filter by day of week"
    >
      {WEEKDAYS.map(({ dow, label, full }) => {
        const isActive = selected.includes(dow);
        return (
          <button
            key={dow}
            type="button"
            className="chip chip--dow"
            data-active={isActive ? "true" : undefined}
            aria-pressed={isActive}
            title={`Show only ${full} reports`}
            onClick={() => toggle(dow)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
