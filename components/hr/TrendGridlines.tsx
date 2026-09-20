import { gridTicks } from "@/lib/hr/domain/trend-axis";

/**
 * Horizontal reference gridlines drawn behind a bar plot: one line per tick
 * from 0 to `max`, each with a small value label at the left. Rendered
 * absolutely (pointer-events: none) so it adds no layout width, and the two
 * stacked daily trend charts stay column-aligned. Place inside a
 * position:relative plot container.
 */
export function TrendGridlines({
  max,
  steps = 2,
  format = (n: number) => String(Math.round(n)),
}: {
  max: number;
  steps?: number;
  format?: (n: number) => string;
}) {
  const ticks = gridTicks(max, steps);
  if (ticks.length === 0) return null;
  return (
    <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
      {ticks.map((t) => (
        <div key={t} className="trend-gridline" style={{ bottom: `${(t / max) * 100}%` }}>
          <span className="trend-gridline-label">{format(t)}</span>
        </div>
      ))}
    </div>
  );
}
