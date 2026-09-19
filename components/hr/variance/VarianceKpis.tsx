import type { Kpis } from "@/lib/hr/domain/variance-agg";

/** The three roll-up KPIs for the current scope, as gradient tiles (Option 3
 *  design). Variance hours is the cost signal (warm value); Timer hours is the
 *  timer-backed total against the declared total; Total DR submitted is the scope size, with the breaching
 *  count (the follow-up worklist) on its sub-line. `scopeLabel` is
 *  accepted for call-site compatibility but the scope is shown by the controls,
 *  not repeated on the tiles. */
export function VarianceKpis({ kpis }: { kpis: Kpis; scopeLabel?: string }) {
  const varianceDays = Math.round(kpis.unworkedHours / 24);
  return (
    <div className="kpis">
      <div className="kpi">
        <div className="k">Variance hours</div>
        <div className="v warn">
          +{kpis.unworkedHours}h
          {varianceDays >= 1 && (
            <span className="alt"> or {varianceDays} day{varianceDays === 1 ? "" : "s"}</span>
          )}
        </div>
        <div className="d">Variance between timer and declared hours</div>
      </div>
      <div className="kpi">
        <div className="k">Timer hours</div>
        <div className="v">{kpis.timedHours}h</div>
        <div className="d">of {kpis.declaredHours}h total declared</div>
      </div>
      <div className="kpi">
        <div className="k">Total DR submitted</div>
        <div className="v">{kpis.reportCount}</div>
        <div className="d">{kpis.breaching} breaching at 15% or more</div>
      </div>
    </div>
  );
}
