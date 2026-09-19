import { requireMinRolePage } from "@/lib/auth/require-user";
import { getVarianceRows } from "@/lib/hr/queries/variance-queries";
import { getTimerRollupHealth } from "@/lib/hr/queries/timer-rollup-health";
import { parseVarianceParams, scopeVarianceRows } from "@/lib/hr/domain/variance-filters";
import { precedingWindow, buildVarianceReportModel } from "@/lib/hr/domain/variance-report-model";
import { VarianceReport } from "@/components/hr/variance/report/VarianceReport";
import { PrintTrigger } from "./PrintTrigger";
import { formatInTimeZone } from "date-fns-tz";
import "./report.css";

export const dynamic = "force-dynamic";

type SP = { dateFrom?: string; dateTo?: string; group?: string; inactive?: string; position?: string; print?: string };

export default async function VarianceReportPage({ searchParams }: { searchParams: Promise<SP> }) {
  // Same gate as /hr/variance, whose "Print report" link opens this page.
  await requireMinRolePage("manager");
  const sp = await searchParams;
  const params = parseVarianceParams(sp);
  const prior = precedingWindow(params.from, params.to);

  const [curAll, priAll, timerHealth] = await Promise.all([
    getVarianceRows(params.from, params.to),
    getVarianceRows(prior.from, prior.to),
    getTimerRollupHealth(),
  ]);

  // When the timer rollup MV is empty, every coverage_pct is NULL and the source
  // query returns nothing, which would otherwise render as a misleading "no
  // production activity" report. That is a transient refresh window, not real
  // data, so say so explicitly. This matters more for a printout that gets
  // circulated than for the live page (which a reader can just reload). Mirrors the same
  // guard on /hr/variance (page.tsx).
  if (timerHealth.empty) {
    return (
      <div className="variance-report">
        <section className="page">
          <div className="pad">
            <div className="panel" style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
              Timer data is refreshing. Regenerate this report in a minute.
            </div>
          </div>
        </section>
      </div>
    );
  }
  const current = scopeVarianceRows(curAll, params);
  const priorRows = scopeVarianceRows(priAll, params);
  const generatedEt = formatInTimeZone(new Date(), "America/New_York", "MMM d, yyyy · h:mm a 'ET'");

  const model = buildVarianceReportModel({ current, prior: priorRows, params, generatedEt });

  return (
    <div className="variance-report">
      <PrintTrigger enabled={sp.print === "1"} />
      <VarianceReport model={model} />
    </div>
  );
}
