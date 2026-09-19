"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { BrowseRow, BrowseFilters } from "@/lib/hr/queries/approval-queries";
import { compareBrowseRows, sanitizeBrowseSort, type BrowseSortKey, type SortDir } from "@/lib/hr/domain/browse-sort";
import { setParams } from "@/lib/hr/domain/filter-url";
import { canAdoptPolledRows } from "@/lib/hr/domain/poll-sync";
import type { ReportDetail, ReportRequirement, DayActivity } from "@/lib/hr/queries/report-detail";
import { fetchReportDetail, fetchBrowsePage, fetchApprovableTaskDids, fetchApprovedTaskDids, fetchReportRequirements, fetchBrowsePrefetch } from "@/app/(app)/approvals/actions";
import { getOrFetch, DETAIL_WARM_MS } from "@/lib/hr/domain/detail-cache";
import { warmAttachments } from "@/lib/hr/domain/attachments-client";
import { EntryBrowseTable } from "./EntryBrowseTable";
import { ReportDetailDrawer } from "./ReportDetailDrawer";
import { RequirementsHoverCard } from "./RequirementsHoverCard";
import { useApprovalBatch } from "./useApprovalBatch";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { OutageControl } from "@/components/demo/OutageControl";

export function BrowseReports({
  initialRows,
  filters,
  pageSize,
  total,
  canApprove,
  groupOptions,
  approverOptions,
}: {
  initialRows: BrowseRow[];
  filters: BrowseFilters;
  pageSize: number;
  total: number;
  /** Lead and up. When false, no approve/select controls render at all. */
  canApprove: boolean;
  /** Division options for the Division column-header filter. */
  groupOptions?: string[];
  /** Approver-group options for the Approver column-header filter. */
  approverOptions?: { value: string; label: string }[];
}) {
  // The URL (sort/dir params) is the source of truth for the header sort, but
  // it is updated via history.replaceState — NOT a router navigation — so a
  // sort click never pays a full server page render. The effect below reorders
  // the already-loaded rows in place (instant when the whole filtered set is
  // loaded) or refetches page 1 through one server action.
  const params = useSearchParams();
  const sort = sanitizeBrowseSort(params.get("sort") ?? undefined, params.get("dir") ?? undefined) ?? null;
  const [rows, setRows] = useState(initialRows);
  const [resorting, setResorting] = useState(false);
  const [offset, setOffset] = useState(initialRows.length);
  const [hasMore, setHasMore] = useState(initialRows.length < total);
  const [loadingMore, setLoadingMore] = useState(false);

  // LiveRefresh polls router.refresh() every 60s: the server re-renders and
  // passes fresh page-1 rows down as a NEW initialRows reference. Adopt them
  // while the user is still on page 1 so the table actually reflects the
  // "Live" badge (approvals/status changes land without a manual reload).
  // Once the user has infinite-scrolled, keep their loaded rows untouched.
  useEffect(() => {
    if (!canAdoptPolledRows({ offset, pageSize, loadingMore, busy: resorting })) return;
    setRows(initialRows);
    setOffset(initialRows.length);
    setHasMore(initialRows.length < total);
    // Adopt exactly when the server hands down a new page-1 snapshot; the
    // guard values are read fresh per render, not reacted to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialRows]);

  // Detail drawer state
  const [selected, setSelected] = useState<BrowseRow | null>(null);
  const [detail, setDetail] = useState<ReportDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  // Requirements snapshot from the page prefetch, captured at open time so the
  // drawer's Requirements section renders instantly while the detail loads.
  const [cachedReqs, setCachedReqs] = useState<ReportRequirement[] | null>(null);
  const [cachedDayActs, setCachedDayActs] = useState<DayActivity[] | null>(null);
  // Full-detail promise cache: warmed on hover dwell, shared with open() so a
  // click after a hover reuses the same in-flight (or resolved) request.
  const detailCacheRef = useRef<Map<string, Promise<ReportDetail | null>>>(new Map());
  const openDidRef = useRef<string | null>(null);

  const [selectedDids, setSelectedDids] = useState<Set<string>>(new Set());
  const [approvedDids, setApprovedDids] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [bulkTargets, setBulkTargets] = useState<string[]>([]);
  // Demo-only: "simulate an outage after N items" (0 = off). See lib/demo/pm-api.ts.
  const [outageAfter, setOutageAfter] = useState(0);
  const [bulkError, setBulkError] = useState<string | null>(null);
  const { start: startBatch, retry: retryBatch, resume: resumeBatch, running: bulkRunning, progress: bulkProgress, failures, error: bulkDriveError, alreadyCount } = useApprovalBatch();
  const [selectAll, setSelectAll] = useState(false);
  const [selecting, setSelecting] = useState(false);

  // Requirements hover peek (lazy-fetched + cached per task_did). Anchored to the
  // cursor, so it sits beside the mouse (rows are full-width, so a row-rect anchor
  // would push the card off-screen and flip it to the left).
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null);
  const [hoverItems, setHoverItems] = useState<ReportRequirement[] | null>(null);
  const [hoverLoading, setHoverLoading] = useState(false);
  const reqCacheRef = useRef<Map<string, ReportRequirement[]>>(new Map());
  const dayActsCacheRef = useRef<Map<string, DayActivity[]>>(new Map());
  const hoverPointRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warmTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverDidRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (warmTimerRef.current) clearTimeout(warmTimerRef.current);
  }, []);

  // Prefetch requirements for every loaded row (initial page + each infinite-
  // scroll append) so the hover card is instant instead of paying a server-action
  // round trip per first hover of a row. The on-hover fetch below stays as a
  // fallback for rows hovered before their prefetch lands. Dids are tracked in
  // prefetchedRef the moment they're requested so a rows-change mid-flight
  // doesn't refetch them; a failed chunk is un-tracked so it can retry.
  const prefetchedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const missing = rows
      .filter((r) => !prefetchedRef.current.has(r.taskDid) && !reqCacheRef.current.has(r.taskDid));
    if (missing.length === 0) return;
    missing.forEach((r) => prefetchedRef.current.add(r.taskDid));
    let live = true;
    (async () => {
      for (let i = 0; i < missing.length; i += 50) {
        const chunk = missing.slice(i, i + 50);
        try {
          const { requirements, dayActivities } = await fetchBrowsePrefetch(
            chunk.map((r) => ({ taskDid: r.taskDid, email: r.email, workDate: r.workDate })),
          );
          if (!live) return;
          for (const [did, items] of Object.entries(requirements)) reqCacheRef.current.set(did, items);
          for (const [did, items] of Object.entries(dayActivities)) dayActsCacheRef.current.set(did, items);
        } catch {
          chunk.forEach((r) => prefetchedRef.current.delete(r.taskDid));
        }
      }
    })();
    return () => { live = false; };
  }, [rows]);

  function onRowHover(taskDid: string, x: number, y: number) {
    hoverPointRef.current = { x, y };
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverDidRef.current = taskDid;
    // A short dwell means the user is aiming at this row; warm the full detail
    // (incl. the timer log) ahead of the card so even a quick click opens complete.
    if (warmTimerRef.current) clearTimeout(warmTimerRef.current);
    warmTimerRef.current = setTimeout(() => {
      void getOrFetch(detailCacheRef.current, taskDid, () => fetchReportDetail(taskDid)).catch(() => {});
      // Attachments too, but only when the prefetched requirement rows say the
      // entry has files: the listing costs the PM API calls on a cold entry.
      const reqs = reqCacheRef.current.get(taskDid);
      if (reqs && reqs.some((r) => r.fileCount > 0)) warmAttachments(taskDid);
    }, DETAIL_WARM_MS);
    hoverTimerRef.current = setTimeout(async () => {
      setHoverPoint(hoverPointRef.current);
      const cached = reqCacheRef.current.get(taskDid);
      if (cached) { setHoverItems(cached); setHoverLoading(false); return; }
      setHoverItems(null); setHoverLoading(true);
      try {
        const items = await fetchReportRequirements(taskDid);
        reqCacheRef.current.set(taskDid, items);
        if (hoverDidRef.current === taskDid) { setHoverItems(items); setHoverLoading(false); }
      } catch { if (hoverDidRef.current === taskDid) { setHoverPoint(null); setHoverLoading(false); } }
    }, 350);
  }

  // Keep the anchor at the latest cursor position until the debounce fires.
  function onRowMove(x: number, y: number) { hoverPointRef.current = { x, y }; }

  function onRowHoverEnd() {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (warmTimerRef.current) clearTimeout(warmTimerRef.current);
    hoverDidRef.current = null;
    setHoverPoint(null);
    setHoverItems(null);
    setHoverLoading(false);
  }

  // Esc clears the checkbox selection (unless the drawer/dialog is open, which
  // handle Esc themselves).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || selected || confirmOpen) return;
      setSelectedDids((prev) => (prev.size ? new Set() : prev));
      setSelectAll(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, confirmOpen]);

  const anchorRef = useRef<number | null>(null);

  function toggle(did: string, index?: number) {
    if (typeof index === "number") anchorRef.current = index;
    setSelectAll(false); // a manual per-row change means "not all" anymore
    setSelectedDids((prev) => { const n = new Set(prev); if (n.has(did)) n.delete(did); else n.add(did); return n; });
  }

  // Shift+click: add every submitted, not-yet-approved row between the last
  // interacted row (anchor) and this one, inclusive.
  function selectRangeTo(index: number) {
    const anchor = anchorRef.current ?? index;
    const lo = Math.min(anchor, index);
    const hi = Math.max(anchor, index);
    const dids = rows.slice(lo, hi + 1)
      .filter((r) => r.taskStatus.toLowerCase() === "submitted" && !approvedDids.has(r.taskDid))
      .map((r) => r.taskDid);
    setSelectAll(false);
    setSelectedDids((prev) => new Set([...prev, ...dids]));
    anchorRef.current = index;
  }

  // Select-all checkbox: when checked, select every submitted row matching the CURRENT
  // filter (across pagination, not just loaded rows); when cleared, deselect all.
  async function onToggleSelectAll(checked: boolean) {
    if (!checked) { setSelectAll(false); setSelectedDids(new Set()); return; }
    setSelecting(true);
    try {
      const dids = await fetchApprovableTaskDids(filters);
      setSelectedDids(new Set(dids.filter((d) => !approvedDids.has(d))));
      setSelectAll(true);
    } finally { setSelecting(false); }
  }

  function openConfirm(targets: string[]) { setBulkTargets(targets); setBulkError(null); setConfirmOpen(true); }

  async function doApprove() {
    const out = await startBatch(bulkTargets, { outageAfter: outageAfter > 0 ? outageAfter : null });
    setConfirmOpen(false);
    if (out.error) { setBulkError(out.error); return; }
    setApprovedDids((prev) => new Set([...prev, ...out.alreadyApproved]));
  }

  // On load + when rows change, reconcile already-approved-here rows so they
  // show the syncing marker even before the pipeline refreshes.
  useEffect(() => {
    if (!canApprove) return; // viewers can't approve, so no syncing markers to reconcile
    const submitted = rows.filter((r) => r.taskStatus.toLowerCase() === "submitted").map((r) => r.taskDid);
    if (submitted.length === 0) return;
    let live = true;
    fetchApprovedTaskDids(submitted).then((dids) => { if (live && dids.length) { dids.forEach((d) => detailCacheRef.current.delete(d)); setApprovedDids((prev) => new Set([...prev, ...dids])); } });
    return () => { live = false; };
  }, [rows, canApprove]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollBoxRef = useRef<HTMLDivElement | null>(null);

  const loadMore = useCallback(async () => {
    setLoadingMore(true);
    try {
      const next = await fetchBrowsePage(filters, offset, pageSize, sort ?? undefined);
      setRows((prev) => [...prev, ...next]);
      setOffset((o) => o + next.length);
      if (next.length < pageSize) setHasMore(false);
    } catch (e) {
      // A transient failure just stops this page; the sentinel retries on the
      // next scroll instead of surfacing an unhandled rejection.
      console.error("browse loadMore failed", e);
    } finally {
      setLoadingMore(false);
    }
  }, [filters, sort, offset, pageSize]);

  // Header sort: rewrite the sort/dir URL params via history.replaceState (Next
  // syncs useSearchParams to it) so the link stays shareable without a server
  // round trip. The ColumnHeader popover passes an explicit direction (Sort ↑ /
  // Sort ↓), so there is no toggle here; re-sorting by work_date desc (the
  // default) clears the params to keep deep-link URLs canonical.
  const onSetSort = useCallback(
    (key: BrowseSortKey, dir: SortDir) => {
      const isDefault = key === "work_date" && dir === "desc";
      const next = setParams(new URLSearchParams(params.toString()), {
        sort: isDefault ? undefined : key,
        dir: isDefault ? undefined : dir,
      });
      const qs = next.toString();
      window.history.replaceState(null, "", qs ? `/approvals/browse?${qs}` : "/approvals/browse");
    },
    [params],
  );

  // Apply a sort change to the rows. When every matching row is already loaded
  // (hasMore false — e.g. a filtered set of a few dozen), reorder client-side
  // with the comparator that mirrors the server ordering: instant, no request.
  // Otherwise refetch page 1 in the new order through the one server action.
  // initialRows arrive server-sorted per the URL, so the ref starts in sync.
  const sortSig = sort ? `${sort.key}.${sort.dir}` : "";
  const appliedSortRef = useRef(sortSig);
  const resortTokenRef = useRef(0);
  useEffect(() => {
    if (appliedSortRef.current === sortSig) return;
    appliedSortRef.current = sortSig;
    scrollBoxRef.current?.scrollTo({ top: 0 });
    if (!hasMore) {
      setRows((prev) => [...prev].sort((a, b) => compareBrowseRows(a, b, sort ?? undefined)));
      return;
    }
    const token = ++resortTokenRef.current;
    setResorting(true);
    fetchBrowsePage(filters, 0, pageSize, sort ?? undefined)
      .then((next) => {
        if (token !== resortTokenRef.current) return;
        setRows(next);
        setOffset(next.length);
        setHasMore(next.length < total);
      })
      .catch((e) => {
        // Keep the current rows on a transient failure; the 60s poll or the
        // next sort change re-syncs them.
        console.error("browse re-sort failed", e);
      })
      .finally(() => {
        if (token === resortTokenRef.current) setResorting(false);
      });
  }, [sortSig, sort, hasMore, filters, pageSize, total]);

  // Load the next page when the sentinel scrolls into view.
  useEffect(() => {
    if (!hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && !loadingMore) loadMore(); },
      { root: scrollBoxRef.current, rootMargin: "500px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadingMore, loadMore]);

  async function open(row: BrowseRow) {
    openDidRef.current = row.taskDid;
    setSelected(row);
    setDetail(null);
    setCachedReqs(reqCacheRef.current.get(row.taskDid) ?? null);
    setCachedDayActs(dayActsCacheRef.current.get(row.taskDid) ?? null);
    setLoadingDetail(true);
    try {
      const d = await getOrFetch(detailCacheRef.current, row.taskDid, () => fetchReportDetail(row.taskDid));
      if (openDidRef.current === row.taskDid) setDetail(d);
    } finally {
      if (openDidRef.current === row.taskDid) setLoadingDetail(false);
    }
  }
  function close() {
    openDidRef.current = null;
    setSelected(null);
    setDetail(null);
    setCachedReqs(null);
    setCachedDayActs(null);
  }

  const failureByDid = new Map(failures.map((f) => [f.taskDid, f]));
  const retryableCount = failures.filter((f) => f.retryable).length;

  return (
    <>
      {canApprove && (
        <>
          <div className="mb-2 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
              <input
                type="checkbox"
                checked={selectAll}
                disabled={bulkRunning || selecting}
                onChange={(e) => onToggleSelectAll(e.target.checked)}
              />
              {selecting ? "Selecting…" : "Select all"}
              {selectedDids.size > 0 ? ` (${selectedDids.size})` : ""}
            </label>
            {(selectedDids.size > 0 || bulkRunning || retryableCount > 0) && (
              <button
                className="btn-ghost"
                style={{ color: "var(--signal)", borderColor: "var(--signal)", opacity: bulkRunning ? 0.5 : undefined }}
                disabled={bulkRunning}
                onClick={() => { if (retryableCount > 0) { void retryBatch(); } else { openConfirm([...selectedDids]); } }}
              >
                {bulkRunning
                  ? `Approving ${bulkProgress.done}/${bulkProgress.total}…`
                  : retryableCount > 0 ? `Retry ${retryableCount} selected` : `Approve ${selectedDids.size} selected`}
              </button>
            )}
          </div>
          <p className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
            Only reports awaiting approval can be selected. Rows in other states show a dash instead of a checkbox.
          </p>
          {bulkError && <p role="alert" className="mb-2 text-xs" style={{ color: "var(--bad)" }}>{bulkError}</p>}
          {bulkDriveError && (
            <div role="alert" className="mb-2 flex items-center justify-between gap-3 text-xs" style={{ color: "var(--bad)" }}>
              <span>{bulkDriveError}</span>
              <button className="btn-ghost shrink-0" style={{ color: "var(--signal)", borderColor: "var(--signal)" }} disabled={bulkRunning} onClick={() => void resumeBatch()}>Resume</button>
            </div>
          )}
          {failures.length > 0 && (
            <div className="mb-2 flex items-start gap-2 rounded-lg p-3 text-xs" style={{ border: "1px solid var(--bad)", background: "var(--bad-wash, #fbecea)", color: "#7a2a22" }}>
              <strong style={{ color: "var(--bad)" }}>{failures.length} couldn&apos;t be approved.</strong>
              <span>They&apos;re tinted and kept checked below so you can retry or open them in the PM API. The rest approved and are syncing.</span>
            </div>
          )}
          {!bulkRunning && alreadyCount > 0 && (
            <div className="mb-2 flex items-start gap-2 rounded-lg p-3 text-xs" style={{ border: "1px solid var(--ok)", color: "var(--ok)" }}>
              <strong>{alreadyCount} {alreadyCount === 1 ? "was" : "were"} already approved in the PM API.</strong>
              <span style={{ color: "var(--muted)" }}>Nothing to fix: someone approved {alreadyCount === 1 ? "it" : "them"} first, so {alreadyCount === 1 ? "it's" : "they're"} marked approved here.</span>
            </div>
          )}
        </>
      )}

      <div ref={scrollBoxRef} className="surface browse-viewport" style={resorting ? { opacity: 0.55, pointerEvents: "none" } : undefined}>
        <EntryBrowseTable
          rows={rows}
          onSelect={open}
          selectedTaskDid={selected?.taskDid ?? null}
          selectable={canApprove}
          selectedDids={selectedDids}
          onToggle={toggle}
          onRangeSelect={selectRangeTo}
          onRowHover={onRowHover}
          onRowMove={onRowMove}
          onRowHoverEnd={onRowHoverEnd}
          approvedDids={approvedDids}
          failureByDid={failureByDid}
          sort={sort}
          onSetSort={onSetSort}
          groupOptions={groupOptions}
          approverOptions={approverOptions}
        />
        <div ref={sentinelRef} />
        <div className="py-3 text-center text-xs" style={{ color: "var(--muted)" }}>
          {hasMore
            ? loadingMore
              ? "Loading more…"
              : `Showing ${rows.length.toLocaleString()} of ${total.toLocaleString()}`
            : `All ${rows.length.toLocaleString()} loaded`}
        </div>
      </div>
      {selected && (
        <ReportDetailDrawer
          row={selected}
          detail={detail}
          loading={loadingDetail && !detail}
          cachedRequirements={cachedReqs}
          cachedDayActivities={cachedDayActs}
          canApprove={canApprove}
          onClose={close}
          onApproved={(did) => { detailCacheRef.current.delete(did); setApprovedDids((prev) => new Set([...prev, did])); close(); }}
        />
      )}
      <ConfirmDialog
        open={confirmOpen}
        title="Approve in the PM API"
        body={
          <>
            <p>
              Approve {bulkTargets.length} report(s) as you. The PM API behind this demo is simulated; the
              approvals themselves are real writes to the demo database and are reset nightly.
            </p>
            <OutageControl value={outageAfter} onChange={setOutageAfter} total={bulkTargets.length} />
          </>
        }
        confirmLabel={`Approve ${bulkTargets.length}`}
        busy={bulkRunning}
        onConfirm={doApprove}
        onCancel={() => setConfirmOpen(false)}
      />
      <RequirementsHoverCard items={hoverItems} loading={hoverLoading} point={hoverPoint} />
    </>
  );
}
