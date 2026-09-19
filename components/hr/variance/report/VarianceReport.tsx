// components/hr/variance/report/VarianceReport.tsx
// Server component: renders the full Hours Variance management report (cover
// page + 3 sections)
// from a VarianceReportModel.
import { ReportTrendChart, ReportMonthlyTrendChart, ReportGroupBoxPlot } from "@/components/hr/variance/report/report-charts";
import { trendChartMode, monthlyTrendStats, type MonthlyTrendStat } from "@/lib/hr/domain/variance-agg";
import {
  precedingWindow,
  type VarianceReportModel,
  type ReportKpi,
  type ReportGroupRow,
  type WatchlistRow,
} from "@/lib/hr/domain/variance-report-model";

const NDASH = "–";
const MDASH = "—";
const MIDDOT = "·";
const GE = "≥";
const LE = "≤";
const MINUS = "−";
const DIVIDE = "÷";

/** Trend/change arrows as inline SVG, NOT font glyphs: the next/font latin
 *  subsets don't cover the arrow codepoints, so character arrows would print
 *  in a fallback font (or as empty boxes on a machine without one). currentColor
 *  inherits the surrounding up/down class color. */
function Arrow({ dir }: { dir: "up" | "down" | "right" }) {
  const rotate = dir === "up" ? 0 : dir === "down" ? 180 : 90;
  return (
    <svg
      className="arrow-ic"
      width={9}
      height={9}
      viewBox="0 0 10 10"
      style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
      aria-hidden="true"
    >
      <path d="M5 0.5 L9 4.8 H6.3 V9.5 H3.7 V4.8 H1 Z" fill="currentColor" />
    </svg>
  );
}
const NBSP = " ";

function fmtNum(n: number): string {
  return n.toLocaleString("en-US");
}

function pctText(v: number | null): string {
  return v == null ? "n/a" : `${v}%`;
}

function fmtShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`),
  );
}

/** Reporting-period label, e.g. "Jun 1 - Jun 25, 2026". `from`/`to` are
 *  date-only (no time component), so this is a calendar-date format, not a
 *  UTC-instant-to-ET conversion. */
function fmtDateRange(from: string, to: string): string {
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" }).format(
    new Date(`${from}T00:00:00Z`),
  );
  return `${fmtShortDate(from)} ${NDASH} ${fmtShortDate(to)}, ${year}`;
}

function windowDays(from: string, to: string): number {
  return Math.round((new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000) + 1;
}

function deltaClass(sentiment: ReportKpi["sentiment"]): string {
  return sentiment === "bad" ? "delta up-bad" : sentiment === "good" ? "delta down-good" : "delta flat";
}

function statusLabel(status: ReportGroupRow["status"]): string {
  return status === "red" ? "At risk" : status === "amber" ? "Watch" : "On track";
}

function trendArrowClass(trend: WatchlistRow["trend"]): string {
  // The CSS classes are named by direction of variance (good/bad), not by
  // arrow glyph: "up" = green/good, "down" = red/bad. A rising trend (more
  // variance) is bad, so it maps to "down"; by design.
  return trend === "up" ? "down" : trend === "down" ? "up" : "";
}

function trendArrowDir(trend: WatchlistRow["trend"]): "up" | "down" | "right" {
  return trend === "up" ? "up" : trend === "down" ? "down" : "right";
}

/** Short, model-derived caption under the trend chart (first vs. last daily
 *  median in the window). Not present as a distinct model field; derived here
 *  the same way `bottomLine` derives its narrative below. */
function trendNote(series: VarianceReportModel["trend"]): string {
  if (series.length < 2) return "Not enough daily data points to chart a trend for this range.";
  const first = series[0].value;
  const last = series[series.length - 1].value;
  const diff = Math.round((last - first) * 10) / 10;
  if (Math.abs(diff) < 0.5) return `Variance held steady over the window: median stayed near ${Math.round(last)}%.`;
  const dir = diff > 0 ? "trending up" : "trending down";
  return `Variance ${dir} over the window: median moved from ~${Math.round(first)}% to ~${Math.round(last)}%.`;
}

/** Monthly-mode counterpart of trendNote: first vs last monthly median. */
function monthlyTrendNote(months: MonthlyTrendStat[]): string {
  const withMed = months.filter((m) => m.med != null);
  if (withMed.length < 2) return "Not enough monthly data points to chart a trend for this range.";
  const first = withMed[0];
  const last = withMed[withMed.length - 1];
  const diff = Math.round(((last.med ?? 0) - (first.med ?? 0)) * 10) / 10;
  const dir = Math.abs(diff) < 0.5 ? "held steady" : diff > 0 ? "trended up" : "trended down";
  return `Monthly median variance ${dir}: ~${Math.round(first.med ?? 0)}% (${first.label}) to ~${Math.round(last.med ?? 0)}% (${last.label}). Whiskers span each month's best and worst day; the dashed line is the month's day-to-day spread (sample std dev).`;
}

function bottomLine(m: VarianceReportModel): string {
  const worst = m.groups
    .filter((g) => g.inScope && g.reportCount > 0)
    .sort((a, b) => (b.medianVariancePct ?? 0) - (a.medianVariancePct ?? 0))[0];
  const dir = m.kpis.unworkedHours.sentiment === "bad" ? "rose" : m.kpis.unworkedHours.sentiment === "good" ? "fell" : "held steady";
  const worstTxt = worst ? `${worst.group} (${worst.breachPct}% breach rate, ${worst.unworkedHours} variance hours)` : "the production team";
  return `Variance hours ${dir} period over period. The variance concentrates in ${worstTxt}: the top ${m.concentration.topN} members hold ${m.concentration.topSharePct}% of all variance hours. Recommendation: targeted coaching for the watchlist leaders and a timer-hygiene review before the next cycle.`;
}

/** An empty movers table reads as a bug, so say WHY nobody is
 *  listed. basis "half" means the preceding window had zero rows and even the
 *  within-period first-vs-second-half fallback found no member with >=2
 *  reports on each side. */
function MoversEmptyState({ model }: { model: VarianceReportModel }) {
  const prior = precedingWindow(model.scope.from, model.scope.to);
  return (
    <div className="panel-legend" style={{ padding: "10px 0 4px" }}>
      {model.movers.basis === "half"
        ? `No prior-period data exists (the window before this range, ${fmtDateRange(prior.from, prior.to)}, is before the timer coverage history), and no member has at least 2 reports in each half of the period — movers can't be ranked.`
        : "No members have at least 2 reports in both this period and the prior one, so movers can't be ranked."}
    </div>
  );
}

const SEGMENT_COLORS = ["var(--accent-strong)", "var(--accent)", "var(--accent-wash)"];

function Masthead({ model }: { model: VarianceReportModel }) {
  return (
    <div className="masthead">
      <div className="mast-left">
        <div className="logo-mark">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG mark, nothing to optimize */}
          <img alt="Example Co" src="/example-mark-navy.svg" />
        </div>
        <div>
          <div className="mast-eyebrow">Example Co {MIDDOT} HR Operations</div>
          <div className="mast-title">Hours Analysis {MDASH} Management Report</div>
        </div>
      </div>
      <div className="mast-right">
        Reporting period
        <br />
        <b>{fmtDateRange(model.scope.from, model.scope.to)}</b>
        <div className="gen">Generated {model.scope.generatedEt}</div>
      </div>
    </div>
  );
}

function ScopeRow({ model }: { model: VarianceReportModel }) {
  return (
    <div className="scope">
      <span style={{ fontWeight: 700, color: "var(--muted)", textTransform: "uppercase", letterSpacing: ".06em", fontSize: 9.5 }}>
        Scope
      </span>
      <span className="chip">
        Groups: <b>{model.scope.groups.length ? model.scope.groups.join(", ") : "All"}</b>
      </span>
      <span className="chip">
        Position: <b>{model.scope.positions.length ? model.scope.positions.join(", ") : "All"}</b>
      </span>
      <span className="chip">
        Status: <b>{model.scope.includeInactive ? "All (incl. inactive)" : "Active only"}</b>
      </span>
      <span className="chip">
        Working days: <b>{model.scope.workingDays}</b>
      </span>
      <span className="chip">
        Reports: <b>{fmtNum(model.kpis.reportCount.value ?? 0)}</b>
      </span>
    </div>
  );
}

/** Full-page navy cover: report title, the covered period as the centerpiece,
 *  scope chips and generated timestamp. Unnumbered; the three content
 *  sections keep their "Section N of 3" footers. */
function CoverPage({ model }: { model: VarianceReportModel }) {
  return (
    <section className="page cover">
      <div className="cover-body">
        <div className="logo-mark">
          {/* eslint-disable-next-line @next/next/no-img-element -- static SVG mark, nothing to optimize */}
          <img alt="Example Co" src="/example-mark-navy.svg" />
        </div>
        <div className="cover-eyebrow">Example Co {MIDDOT} HR Operations</div>
        <div className="cover-title">Hours Analysis</div>
        <div className="cover-sub">Management Report</div>
        <div className="cover-period">
          <div className="lbl">Period covered</div>
          <div className="rng">{fmtDateRange(model.scope.from, model.scope.to)}</div>
        </div>
        <div className="cover-scope">
          <span className="chip">
            Groups: <b>{model.scope.groups.length ? model.scope.groups.join(", ") : "All"}</b>
          </span>
          <span className="chip">
            Position: <b>{model.scope.positions.length ? model.scope.positions.join(", ") : "All"}</b>
          </span>
          <span className="chip">
            Status: <b>{model.scope.includeInactive ? "All (incl. inactive)" : "Active only"}</b>
          </span>
          <span className="chip">
            Working days: <b>{model.scope.workingDays}</b>
          </span>
          <span className="chip">
            Reports: <b>{fmtNum(model.kpis.reportCount.value ?? 0)}</b>
          </span>
          <span className="chip">
            Members: <b>{model.activeMembers}</b>
          </span>
        </div>
        <div className="gen">Generated {model.scope.generatedEt}</div>
      </div>
      <div className="foot">
        <span>DRMC {MIDDOT} Hours Analysis Management Report</span>
        <span>Cover {MIDDOT} Demo data</span>
      </div>
    </section>
  );
}

function KpiTile({
  label,
  value,
  unit,
  sub,
  kpi,
}: {
  label: string;
  value: number | null;
  unit: string;
  sub: string;
  kpi: ReportKpi;
}) {
  return (
    <div className="kpi">
      <div className="lab">{label}</div>
      <div className="val">
        {value == null ? "n/a" : fmtNum(value)}
        {value != null && unit && <small>{unit}</small>}
      </div>
      <div className="sub">{sub}</div>
      <div className={deltaClass(kpi.sentiment)}>{kpi.deltaLabel}</div>
    </div>
  );
}

function EmptyState({ model }: { model: VarianceReportModel }) {
  return (
    <section className="page">
      <Masthead model={model} />
      <ScopeRow model={model} />
      <div className="pad">
        <div className="panel" style={{ textAlign: "center", padding: "48px 24px", color: "var(--muted)" }}>
          No production reports in the selected range.
        </div>
      </div>
      <div className="foot">
        <span>DRMC {MIDDOT} Hours Analysis Management Report</span>
        <span>Section 1 of 1 {MIDDOT} Demo data</span>
      </div>
    </section>
  );
}

export function VarianceReport({ model }: { model: VarianceReportModel }) {
  if (model.kpis.reportCount.value === 0) {
    return <EmptyState model={model} />;
  }

  // 3+ calendar months: the daily line overplots, so the trend panel switches
  // to per-month min-max whiskers + median + a spread (sd) series.
  const trendMode = trendChartMode(model.scope.from, model.scope.to);
  const trendMonths =
    trendMode === "monthly" ? monthlyTrendStats(model.trend, model.scope.from, model.scope.to) : [];
  const groupCols = 5;

  return (
    <>
      {/* ============ COVER ============ */}
      <CoverPage model={model} />

      {/* ============ PAGE 1 - EXECUTIVE SUMMARY ============ */}
      <section className="page">
        <Masthead model={model} />
        <ScopeRow model={model} />

        <div className="pad">
          <div className="sec-head">
            <span className="sec-kicker">01</span>
            <span className="sec-title">Executive Summary</span>
            <span className="sec-sub">deltas vs. prior {windowDays(model.scope.from, model.scope.to)}-day period</span>
          </div>

          <div className="kpis">
            <KpiTile
              label="Variance hours"
              value={model.kpis.unworkedHours.value}
              unit="h"
              sub="reported time the timer can't back up"
              kpi={model.kpis.unworkedHours}
            />
            <KpiTile
              label="Productivity"
              value={model.kpis.productivity.value}
              unit="%"
              sub="median coverage of stated hours"
              kpi={model.kpis.productivity}
            />
            <KpiTile
              label="Breach rate"
              value={model.kpis.breachRate.value}
              unit="%"
              sub={`of reports at variance ${GE} 15%`}
              kpi={model.kpis.breachRate}
            />
            <KpiTile
              label="Reports reviewed"
              value={model.kpis.reportCount.value}
              unit=""
              sub={`across ${model.activeMembers} members`}
              kpi={model.kpis.reportCount}
            />
          </div>

          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <span className="panel-t">
                {trendMode === "monthly" ? "Monthly variance range & hours" : "Daily median variance %"}
              </span>
              <span className="panel-legend">
                {trendMode === "monthly" ? (
                  <>
                    whisker = month min{NDASH}max {MIDDOT} diamond = monthly median {MIDDOT} dashed = spread (sd,
                    right axis) {MIDDOT} bars = variance hrs
                  </>
                ) : (
                  <>
                    {MDASH} median{NBSP}
                    {NBSP}
                    {MIDDOT}
                    {MIDDOT}
                    {MIDDOT} 15% breach target
                  </>
                )}
              </span>
            </div>
            <div className="chart-wrap">
              {trendMode === "monthly" ? (
                <ReportMonthlyTrendChart months={trendMonths} hours={model.monthly} />
              ) : (
                <ReportTrendChart series={model.trend} />
              )}
            </div>
            <div className="panel-legend" style={{ marginTop: 6 }}>
              {trendMode === "monthly" ? monthlyTrendNote(trendMonths) : trendNote(model.trend)}
            </div>
          </div>

          {/* In monthly mode the chart above already carries the per-month
              story (range, median, spread, hours bars), so the strip would be
              redundant; it renders only alongside the
              daily line, where it is the sole monthly summary. */}
          {trendMode === "daily" && (
            <div className="panel monthly-panel">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span className="panel-t">Monthly average variance</span>
                <span className="panel-legend">mean of per-report variance % {MIDDOT} other figures use medians</span>
              </div>
              <div className="monthly-strip">
                {model.monthly.map((mo) => (
                  <span className="mo" key={mo.month}>
                    <b>{mo.label}</b>
                    {mo.partial && <span className="part"> (partial)</span>}
                    <span className="stat">{mo.avgVariancePct == null ? "n/a" : `${mo.avgVariancePct}%`} avg</span>
                    <span className="stat">{fmtNum(mo.varianceHours)}h</span>
                    <span className="stat">{fmtNum(mo.reportCount)} reports</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="sec-head" style={{ marginBottom: 8 }}>
            <span className="sec-title" style={{ fontSize: 13 }}>
              By carrier group
            </span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Group</th>
                <th className="r">Reports</th>
                <th className="r">Median variance</th>
                <th className="r">Breach %</th>
                <th className="r">Variance hrs</th>
                <th style={{ textAlign: "center" }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {model.groups.map((g) =>
                g.inScope ? (
                  <tr key={g.group}>
                    <td className="grp-name">{g.group}</td>
                    <td className="r">{fmtNum(g.reportCount)}</td>
                    <td className="r">{pctText(g.medianVariancePct)}</td>
                    <td className="r">{g.breachPct}%</td>
                    <td className="r">{fmtNum(g.unworkedHours)}h</td>
                    <td style={{ textAlign: "center" }}>
                      <span className="rag">
                        <span className={`dot ${g.status}`}></span>
                        {statusLabel(g.status)}
                      </span>
                    </td>
                  </tr>
                ) : (
                  <tr key={g.group}>
                    <td className="grp-name" style={{ color: "var(--muted-soft)" }}>
                      {g.group}
                    </td>
                    <td className="r" colSpan={groupCols} style={{ color: "var(--muted-soft)", fontStyle: "italic" }}>
                      excluded by current filter
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>

          <div className="bottomline" style={{ marginTop: 16 }}>
            <b>Bottom line.</b> {bottomLine(model)}
          </div>
        </div>

        <div className="foot">
          <span>DRMC {MIDDOT} Hours Analysis Management Report</span>
          <span>Section 1 of 3 {MIDDOT} Demo data</span>
        </div>
      </section>

      {/* ============ PAGE 2 - ANALYSIS ============ */}
      <section className="page">
        <div className="pad" style={{ paddingTop: "0.5in" }}>
          <div className="sec-head">
            <span className="sec-kicker">02</span>
            <span className="sec-title">Analysis</span>
            <span className="sec-sub">where the variance concentrates &amp; who&apos;s moving</span>
          </div>

          <div className="panel">
            <div className="panel-t" style={{ marginBottom: 10 }}>
              Concentration of variance hours
            </div>
            <div className="conc">
              <div className="big">{model.concentration.topSharePct}%</div>
              <div className="txt">
                of all variance hours come from just the <b>top {model.concentration.topN} members</b> (of{" "}
                {model.activeMembers}). This is a focused coaching problem, not a team-wide one.
              </div>
            </div>
            <div className="stackbar">
              {model.concentration.segments.map((s, i) => (
                <i key={s.label} style={{ width: `${s.pct}%`, background: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
              ))}
            </div>
            <div className="panel-legend" style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 12 }}>
              {model.concentration.segments.map((s, i) => (
                <span key={s.label} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 2,
                      display: "inline-block",
                      background: SEGMENT_COLORS[i % SEGMENT_COLORS.length],
                      border: "1px solid var(--rule-strong)",
                    }}
                  />
                  {s.label}: {s.pct}%
                </span>
              ))}
              <span style={{ color: "var(--muted-soft)" }}>
                share of all variance hours {MIDDOT} members ranked worst-first
              </span>
            </div>
          </div>

          <div className="panel">
            <div className="panel-t" style={{ marginBottom: 4 }}>
              Member distribution by group
            </div>
            <div className="panel-legend" style={{ marginBottom: 8 }}>
              each box = Q1{NDASH}Q3 of members&apos; median variance %; line = group median; shaded = breach band ({GE}15%)
            </div>
            <ReportGroupBoxPlot rows={model.distribution} />
          </div>

          <div className="twocol">
            <div className="panel" style={{ marginBottom: 0 }}>
              <div className="panel-t" style={{ marginBottom: 8 }}>
                {model.movers.basis === "half" ? "Movers within this period" : "Movers vs prior period"}
              </div>
              {model.movers.improved.length === 0 && model.movers.regressed.length === 0 ? (
                <MoversEmptyState model={model} />
              ) : (
                <>
                  <table>
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th className="r">Median var</th>
                        <th className="r">Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {model.movers.improved.map((m) => (
                        <tr key={m.empId}>
                          <td>
                            <b>{m.employeeName}</b> {MIDDOT} {m.displayGroup}
                          </td>
                          <td className="r">{m.medianVariancePct}%</td>
                          <td className="r up">
                            <Arrow dir="down" /> {Math.abs(m.deltaPts)}
                          </td>
                        </tr>
                      ))}
                      {model.movers.regressed.map((m) => (
                        <tr key={m.empId}>
                          <td>
                            <b>{m.employeeName}</b> {MIDDOT} {m.displayGroup}
                          </td>
                          <td className="r">{m.medianVariancePct}%</td>
                          <td className="r down">
                            <Arrow dir="up" /> {Math.abs(m.deltaPts)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="panel-legend" style={{ marginTop: 6 }}>
                    green = improved {MIDDOT} red = regressed
                    {model.movers.basis === "half" && (
                      <>
                        {" "}
                        {MIDDOT} first vs second half of the period (no prior-period data exists before this range)
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            <div className="panel" style={{ marginBottom: 0 }}>
              <div className="panel-t" style={{ marginBottom: 8 }}>
                Breach rate by position
              </div>
              <table>
                <thead>
                  <tr>
                    <th>Position</th>
                    <th className="r">Members</th>
                    <th className="r">Breach %</th>
                  </tr>
                </thead>
                <tbody>
                  {model.positions.map((p) => (
                    <tr key={p.position}>
                      <td>{p.position}</td>
                      <td className="r">{p.members}</td>
                      <td className="r">{p.breachPct}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="panel-legend" style={{ marginTop: 6 }}>
                sorted by breach % {MIDDOT} highest first
              </div>
            </div>
          </div>

          <div className="caveats">
            <b>Definitions &amp; caveats.</b>
            <ul>
              <li>
                <b>Variance</b> = stated hours net {MINUS} timer-backed hours. <b>Coverage</b> = timed {DIVIDE} stated. A
                report <b>breaches</b> at coverage {LE} 85% (variance {GE} 15%).
              </li>
              <li>Production team only (Carrier A / Carrier C / Carrier B carrier groups). Weekends and unfiled days are excluded at source.</li>
              <li>
                A timer gap is <b>not</b> proof of idle time; it flags reported hours the timer can&apos;t corroborate and
                warrants review, not conclusion.
              </li>
              <li>Variance hours count only positive variance (under-tracking); over-tracked days are not netted against it.</li>
            </ul>
          </div>
        </div>
        <div className="foot">
          <span>DRMC {MIDDOT} Hours Analysis Management Report</span>
          <span>Section 2 of 3 {MIDDOT} Demo data</span>
        </div>
      </section>

      {/* ============ PAGE 3 - APPENDIX / WATCHLIST ============ */}
      <section className="page">
        <div className="pad" style={{ paddingTop: "0.5in" }}>
          <div className="sec-head">
            <span className="sec-kicker">Appendix A</span>
            <span className="sec-title">Member Watchlist</span>
            <span className="sec-sub">
              all members {MIDDOT} worst to best {MIDDOT} {model.watchlist.length} of {model.activeMembers} shown
            </span>
          </div>

          <div className="demo-notice">
            <span className="dot red"></span> Demo data {MDASH} every name on this page is invented
          </div>

          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Member</th>
                <th>Group</th>
                <th>Position</th>
                <th className="r">Reports</th>
                <th className="r">Median var</th>
                <th className="r">Breach %</th>
                <th className="r">Variance hrs</th>
                <th className="r">Trend vs prior</th>
              </tr>
            </thead>
            <tbody>
              {model.watchlist.map((w, i) => {
                const prev = model.watchlist[i - 1];
                const flip = Boolean(prev && prev.breach && !w.breach);
                return (
                  <tr key={w.empId} className={flip ? "brch-flip" : undefined}>
                    <td className="r">{i + 1}</td>
                    <td>
                      <b>{w.employeeName}</b>
                    </td>
                    <td>{w.displayGroup}</td>
                    <td>{w.position ?? MDASH}</td>
                    <td className="r">{w.reportCount}</td>
                    <td className="r">{w.medianVariancePct}%</td>
                    <td className="r">{w.breachPct}%</td>
                    <td className="r">{fmtNum(w.unworkedHours)}h</td>
                    <td
                      className={`r ${trendArrowClass(w.trend)}`}
                      style={w.trend === "flat" ? { color: "var(--muted)" } : undefined}
                    >
                      <Arrow dir={trendArrowDir(w.trend)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="panel-legend" style={{ marginTop: 10 }}>
            Trend arrow compares each member&apos;s median variance to the prior period. <Arrow dir="up" /> regressed{" "}
            {MIDDOT} <Arrow dir="down" /> improved {MIDDOT} <Arrow dir="right" /> steady.
          </div>
        </div>
        <div className="foot">
          <span>DRMC {MIDDOT} Hours Analysis Management Report</span>
          <span>Section 3 of 3 {MIDDOT} Demo data</span>
        </div>
      </section>
    </>
  );
}
