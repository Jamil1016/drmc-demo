import { shortDate } from "@/lib/hr/domain/trend-axis";

/**
 * Shared x-axis for the stacked daily trend charts: one flex cell per day (same
 * `flex: 1` + gap as the bars so labels sit under their column), with a `M/D`
 * label on the first day, the last day, and every `every`-th day between.
 * The two charts share one day domain, so this is rendered once, under the
 * lower chart, and reads for both.
 */
export function TrendDateAxis({ days, every = 5 }: { days: string[]; every?: number }) {
  if (days.length === 0) return null;
  const last = days.length - 1;
  return (
    <div className="trend-dateaxis" aria-hidden>
      {days.map((d, i) => {
        const show = i === 0 || i === last || i % every === 0;
        return (
          <span key={d} className="trend-dateaxis-cell">
            {show ? shortDate(d) : ""}
          </span>
        );
      })}
    </div>
  );
}
