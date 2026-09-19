// components/hr/variance/VarianceWorkspace.tsx
"use client";
import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  computeKpis,
  mondayWeekStart,
  personStats,
  type VarianceRow,
  type ColMode,
} from "@/lib/hr/domain/variance-agg";
import type { DisplayGroup } from "@/lib/hr/domain/production-scope";
import { etNaiveInstantMs, formatWorkDate } from "@/lib/time";
import { DayTimelineModal } from "@/components/approvals/DayTimelineModal";
import type { DayActivity, ReportRequirement } from "@/lib/hr/queries/report-detail";
import { getVarianceDayDetail } from "@/app/(app)/hr/variance/actions";
import { VarianceKpis } from "./VarianceKpis";
import { VarianceDistribution } from "./VarianceDistribution";
import { VarianceMemberDist } from "./VarianceMemberDist";
import { VarianceTrend } from "./VarianceTrend";
import { VarianceHeatmap, type HeatMetric, type HeatCellClick } from "./VarianceHeatmap";
import { VarianceFocusPanel } from "./VarianceFocusPanel";

type FocusCell = { weekStart: string; dayIso: string | null } | null;
type FocusPerson = { empId: string; name: string } | null;

/** Client shell for the Hours Variance dashboard (Option 3 console layout):
 *  owns the drill state (scopeGroup / focusCell / focusPerson), mirrors it
 *  into the URL, and wires the member-distribution dot-histogram, group box
 *  plot, heatmap, 30-day trend, persistent focus rail, and day-timeline modal
 *  together so KPIs/trend/rail always read the current drill scope. */
export function VarianceWorkspace(props: {
  rows: VarianceRow[];
  from: string;
  to: string;
  view: "group" | "member";
  currentWeekStart: string;
  initialDrill: { group?: DisplayGroup; empId?: string; weekStart?: string; dayIso?: string | null };
  initialColMode: ColMode;
  initialMetric: HeatMetric;
}) {
  const { rows, from, to, view, currentWeekStart } = props;
  const router = useRouter();
  // Group navigation goes through the router (the `group` param is a real,
  // shareable filter read by the top bar). Wrap those router.replace calls in a
  // transition -- exactly like VarianceControls -- so Next keeps the current
  // console on screen during the server round-trip instead of flashing the
  // full-page app/(app)/loading.tsx skeleton (the "strobe" on group/Overview
  // clicks). The client drill state is set outside the transition, so the view
  // still updates instantly.
  const [, startTransition] = useTransition();

  const nameOf = useCallback(
    (empId: string) => rows.find((r) => r.empId === empId)?.employeeName ?? empId,
    [rows],
  );

  // The member's carrier is client-side context (breadcrumb + member-dist
  // scope), NOT the shared `group` URL filter, so drilling a member never
  // lights up the top-bar carrier filter. On a reloaded/shared member URL the
  // `group` param is absent, so derive the scope from the member instead.
  const [scopeGroup, setScopeGroup] = useState<DisplayGroup | null>(
    props.initialDrill.group
      ?? (props.initialDrill.empId
        ? (rows.find((r) => r.empId === props.initialDrill.empId)?.displayGroup ?? null)
        : null),
  );
  const [focusCell, setFocusCell] = useState<FocusCell>(
    props.initialDrill.weekStart ? { weekStart: props.initialDrill.weekStart, dayIso: props.initialDrill.dayIso ?? null } : null,
  );
  const [focusPerson, setFocusPerson] = useState<FocusPerson>(
    props.initialDrill.empId ? { empId: props.initialDrill.empId, name: nameOf(props.initialDrill.empId) } : null,
  );
  const [colMode, setColMode] = useState<ColMode>(props.initialColMode);
  const [metric, setMetric] = useState<HeatMetric>(props.initialMetric);

  const [modal, setModal] = useState<{ activities: DayActivity[]; requirements: ReportRequirement[] | null; failed: boolean; clockInMs: number | null; statedHours: number | null; name: string | null; workDate: string } | null>(null);

  // NOTE: the `group` URL param is shared with the top-bar carrier filter (VarianceControls).
  // On reload/share of a drilled URL, `group` is read as a hard row filter, so the group box plot
  // scopes to that one carrier (the live in-session view keeps all 3 groups visible). Intentional; non-corrupting.
  // Mirror drill/toggle state into the URL without a server round-trip.
  // Fields are nullable (not just optional): every drill transition below
  // clears sibling params by passing `null` explicitly, so the type has to
  // accept string | null, not just string | undefined.
  const mirror = useCallback(
    (over: Partial<{ group: string | null; member: string | null; cell: string | null; col: string | null; metric: string | null }>) => {
      const p = new URLSearchParams(window.location.search);
      const set = (k: string, v: string | null | undefined) => (v ? p.set(k, v) : p.delete(k));
      if ("group" in over) set("group", over.group ?? null);
      if ("member" in over) set("member", over.member ?? null);
      if ("cell" in over) set("cell", over.cell ?? null);
      if ("col" in over) set("col", over.col ?? null);
      if ("metric" in over) set("metric", over.metric ?? null);
      window.history.replaceState(null, "", `${window.location.pathname}?${p.toString()}`);
    },
    [],
  );

  const cellParam = (c: FocusCell) => (c ? (c.dayIso ?? c.weekStart) : null);

  // The `group` param is a server-side FILTER shared with the top filter bar
  // (VarianceControls) and used to filter the rows the page fetches. So changing
  // it must be a real navigation (router.replace), not the client-only
  // replaceState `mirror` uses for finer drills -- otherwise the top bar and the
  // filtered rows go stale (e.g. clicking a group again wouldn't clear the top
  // bar). Selecting/clearing a group resets the finer drill (member/cell).
  const navGroup = useCallback((g: DisplayGroup | null) => {
    // Reset the client drill state HERE instead of leaning on a remount to do
    // it. The workspace only remounts when the page's `group`-based key actually
    // changes, but a member picked from the rail sets `group` via
    // history.replaceState (mirror) with no server render, so the mounted key
    // never picked up that group. "Overview" then navigates to the empty-group
    // state the key is already on -> no key change -> no remount -> focusPerson
    // stayed stuck and the click looked like a no-op. Setting state explicitly
    // makes group/Overview navigation deterministic; when the key DOES change
    // and a real remount happens, it re-inits from the same URL and agrees.
    setScopeGroup(g);
    setFocusPerson(null);
    setFocusCell(null);
    const p = new URLSearchParams(window.location.search);
    if (g) p.set("group", g); else p.delete("group");
    p.delete("member"); p.delete("cell");
    const qs = p.toString();
    startTransition(() => router.replace(qs ? `/hr/variance?${qs}` : "/hr/variance", { scroll: false }));
  }, [router, startTransition]);

  // ---- drill transitions ----
  // Each handler is a toggle: re-clicking the entry that is already highlighted
  // deselects it (drops back to the parent scope) instead of being a no-op.
  const selectGroup = useCallback((g: DisplayGroup) => {
    // Re-click the active group → clear the filter; else filter to it. The
    // navigation re-renders the page, so the top bar, the row filter, and the
    // drill all move together (workspace remounts from the new `group` param).
    if (scopeGroup === g && !focusPerson) navGroup(null);
    else navGroup(g);
  }, [scopeGroup, focusPerson, navGroup]);

  const selectCell = useCallback((g: DisplayGroup, weekStart: string, dayIso: string | null) => {
    const sameCell = focusCell?.weekStart === weekStart && (focusCell?.dayIso ?? null) === (dayIso ?? null);
    if (scopeGroup === g && !focusPerson && sameCell) {
      // re-click the highlighted cell → drop the cell, keep the group scope
      setFocusCell(null);
      mirror({ cell: null });
      return;
    }
    setScopeGroup(g); setFocusCell({ weekStart, dayIso }); setFocusPerson(null);
    mirror({ group: g, member: null, cell: dayIso ?? weekStart });
  }, [scopeGroup, focusPerson, focusCell, mirror]);

  const selectPerson = useCallback((empId: string) => {
    if (focusPerson?.empId === empId) {
      // re-click the highlighted member → drop back to the group scope
      setFocusPerson(null);
      mirror({ member: null });
      return;
    }
    const g = rows.find((r) => r.empId === empId)?.displayGroup ?? scopeGroup;
    setFocusPerson({ empId, name: nameOf(empId) });
    if (g) setScopeGroup(g);
    // Deliberately do NOT write `group`: the member's carrier is client scope
    // only, so selecting a member never populates the top-bar carrier filter.
    mirror({ member: empId, cell: cellParam(focusCell) });
  }, [rows, scopeGroup, focusPerson, focusCell, nameOf, mirror]);

  const memberOpen = useCallback((empId: string) => {
    if (focusPerson?.empId === empId) {
      // re-click the highlighted heatmap row (member view) → clear the member
      setFocusPerson(null); setFocusCell(null);
      mirror({ member: null, cell: null });
      return;
    }
    const g = rows.find((r) => r.empId === empId)?.displayGroup ?? null;
    setFocusPerson({ empId, name: nameOf(empId) }); setScopeGroup(g); setFocusCell(null);
    // Client scope only; don't touch the top-bar carrier filter (see selectPerson).
    mirror({ member: empId, cell: null });
  }, [rows, focusPerson, nameOf, mirror]);

  const selectPersonDate = useCallback((empId: string, weekStart: string, dayIso: string | null) => {
    const sameCell = focusCell?.weekStart === weekStart && (focusCell?.dayIso ?? null) === (dayIso ?? null);
    if (focusPerson?.empId === empId && sameCell) {
      // re-click the highlighted member cell → drop the cell, keep the member
      setFocusCell(null);
      mirror({ cell: null });
      return;
    }
    const g = rows.find((r) => r.empId === empId)?.displayGroup ?? null;
    setFocusPerson({ empId, name: nameOf(empId) }); setScopeGroup(g); setFocusCell({ weekStart, dayIso });
    // Client scope only; don't touch the top-bar carrier filter (see selectPerson).
    mirror({ member: empId, cell: dayIso ?? weekStart });
  }, [rows, focusPerson, focusCell, nameOf, mirror]);

  const reset = useCallback(() => {
    // "Overview": clear the group filter too (navigates, so the top bar clears
    // and all groups come back), not just the client drill state.
    navGroup(null);
  }, [navGroup]);

  // Re-select the current cell crumb: drop back from person-level to the
  // cell-scoped ranked list (no-op if no cell is drilled).
  const selectCellCrumb = useCallback(() => {
    if (!focusCell || !scopeGroup) return;
    selectCell(scopeGroup, focusCell.weekStart, focusCell.dayIso);
  }, [focusCell, scopeGroup, selectCell]);

  const changeColMode = useCallback((c: ColMode) => { setColMode(c); mirror({ col: c }); }, [mirror]);
  const changeMetric = useCallback((m: HeatMetric) => { setMetric(m); mirror({ metric: m }); }, [mirror]);

  // ---- scoped rows (KPIs, trend, and the focus rail all follow the drill) ----
  const scopedRows = useMemo(() => {
    let rs = rows;
    if (focusPerson) rs = rs.filter((r) => r.empId === focusPerson.empId);
    else if (scopeGroup) rs = rs.filter((r) => r.displayGroup === scopeGroup);
    if (focusCell) {
      rs = focusCell.dayIso
        ? rs.filter((r) => r.workDate === focusCell.dayIso)
        : rs.filter((r) => mondayWeekStart(r.workDate) === focusCell.weekStart);
    }
    return rs;
  }, [rows, scopeGroup, focusPerson, focusCell]);

  const kpis = useMemo(() => computeKpis(scopedRows), [scopedRows]);

  const cellLabel = focusCell ? (focusCell.dayIso ? formatWorkDate(focusCell.dayIso) : `week of ${formatWorkDate(focusCell.weekStart)}`) : null;
  const scopeLabel = (focusPerson?.name ?? scopeGroup ?? "all 3 carriers") + (cellLabel ? ` · ${cellLabel}` : "");
  const active = scopeGroup != null || focusPerson != null;

  // Member distribution: the member pool for the current scope. Narrows by the
  // drilled group and by a selected week/day cell (so the caption's cell label
  // matches the dots), but never collapses to a single person.
  const memberDistPeople = useMemo(() => {
    let rs = scopeGroup ? rows.filter((r) => r.displayGroup === scopeGroup) : rows;
    if (focusCell) {
      rs = focusCell.dayIso
        ? rs.filter((r) => r.workDate === focusCell.dayIso)
        : rs.filter((r) => mondayWeekStart(r.workDate) === focusCell.weekStart);
    }
    return personStats(rs);
  }, [rows, scopeGroup, focusCell]);
  const distScopeLabel = (scopeGroup ? `${scopeGroup} members` : "All members") + (cellLabel ? ` · ${cellLabel}` : "");

  const openDay = useCallback(async (taskDid: string) => {
    const r = rows.find((x) => x.taskDid === taskDid);
    if (!r) return;
    setModal({ activities: [], requirements: null, failed: false, clockInMs: etNaiveInstantMs(r.clockInEt), statedHours: r.statedHours ?? null, name: r.employeeName, workDate: r.workDate });
    try {
      const detail = await getVarianceDayDetail(taskDid, r.email, r.workDate);
      setModal((m) => (m ? { ...m, activities: detail.dayActivities, requirements: detail.requirements } : m));
    } catch {
      // Event-handler errors never reach the error boundary; without this the
      // modal would sit on its loading state forever.
      setModal((m) => (m ? { ...m, failed: true } : m));
    }
  }, [rows]);

  return (
    <>
      <VarianceKpis kpis={kpis} scopeLabel={scopeLabel} />
      <div className="console">
        <div className="left">
          <VarianceMemberDist
            people={memberDistPeople}
            scopeLabel={distScopeLabel}
            highlightEmpId={focusPerson?.empId ?? null}
            onMemberClick={selectPerson}
          />
          {view === "group" && (
            <VarianceDistribution
              rows={rows}
              selectedGroup={scopeGroup ?? null}
              onGroupClick={selectGroup}
              onPersonClick={selectPerson}
            />
          )}
          <VarianceHeatmap
            rows={rows}
            from={from}
            to={to}
            view={view}
            colMode={colMode}
            metric={metric}
            currentWeekStart={currentWeekStart}
            selected={active ? { group: scopeGroup ?? undefined, empId: focusPerson?.empId, weekStart: focusCell?.weekStart, dayIso: focusCell?.dayIso ?? null } : null}
            onRowClick={(t) => (t.kind === "group" ? selectGroup(t.group) : memberOpen(t.empId))}
            onCellClick={(t: HeatCellClick) =>
              t.kind === "group" ? selectCell(t.group, t.weekStart, t.dayIso) : selectPersonDate(t.empId, t.weekStart, t.dayIso)
            }
            onMetricChange={changeMetric}
            onColModeChange={changeColMode}
          />
        </div>
        <div className="right">
          <VarianceTrend rows={scopedRows} scopeLabel={scopeLabel} from={from} to={to} />
          <aside className="rail">
            <VarianceFocusPanel
              scopedRows={scopedRows}
              scopeGroup={scopeGroup ?? null}
              focusPerson={focusPerson}
              cellLabel={cellLabel}
              onReset={reset}
              onSelectGroup={selectGroup}
              onSelectCell={selectCellCrumb}
              onSelectPerson={selectPerson}
              onOpenDay={openDay}
            />
          </aside>
        </div>
      </div>

      <DayTimelineModal
        open={modal != null}
        onClose={() => setModal(null)}
        loadFailed={modal?.failed ?? false}
        dayActivities={modal?.activities ?? []}
        clockInMs={modal?.clockInMs ?? null}
        statedHours={modal?.statedHours ?? null}
        memberName={modal?.name ?? null}
        workDate={modal?.workDate ?? null}
        requirements={modal?.requirements ?? null}
      />
    </>
  );
}
