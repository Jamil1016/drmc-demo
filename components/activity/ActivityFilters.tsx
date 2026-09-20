"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setParams } from "@/lib/hr/domain/filter-url";
import { DateRangeField } from "@/components/ui/DateRangeField";
import { ACTION_FILTER_OPTIONS } from "@/lib/hr/domain/activity-format";

const ACTOR_DEBOUNCE_MS = 250;

/**
 * Auto-applying filter bar for the activity feed, mirroring the approvals/browse
 * filter pattern: the URL query string is the source of truth, every change
 * rewrites it via router.replace, and any change resets the keyset cursor
 * (`before`) so paging restarts. Person is debounced; the action dropdown and the
 * single date control apply immediately. The action list comes from the shared
 * label map, so the dropdown always lists the same actions the feed can render.
 */
export function ActivityFilters({
  actor, action, dateFrom, dateTo,
}: {
  actor?: string; action?: string; dateFrom?: string; dateTo?: string;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const paramsRef = useRef(params);
  useEffect(() => { paramsRef.current = params; }, [params]);

  const push = useCallback((updates: Record<string, string | undefined | null>) => {
    // Any filter change invalidates the "load older" cursor, so drop it.
    const next = setParams(new URLSearchParams(paramsRef.current.toString()), { ...updates, before: null });
    const qs = next.toString();
    startTransition(() => router.replace(qs ? `/activity?${qs}` : "/activity", { scroll: false }));
  }, [router]);

  const [actorVal, setActorVal] = useState(actor ?? "");
  const [typing, setTyping] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  function onActorChange(value: string) {
    setActorVal(value);
    setTyping(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { setTyping(false); push({ actor: value }); }, ACTOR_DEBOUNCE_MS);
  }

  const busy = typing || isPending;
  useEffect(() => {
    const el = document.documentElement;
    if (busy) el.setAttribute("data-filtering", "true");
    else el.removeAttribute("data-filtering");
    return () => el.removeAttribute("data-filtering");
  }, [busy]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="flex w-72 max-w-full flex-col gap-1">
        <span className="field-label">Person (email)</span>
        <input
          value={actorVal}
          onChange={(e) => onActorChange(e.target.value)}
          placeholder="anyone"
          className="field"
        />
      </label>

      <label className="flex w-52 flex-col gap-1">
        <span className="field-label">Action</span>
        <select defaultValue={action ?? ""} onChange={(e) => push({ action: e.target.value })} className="field">
          {ACTION_FILTER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </label>

      <div className="flex flex-col gap-1">
        <span className="field-label">Date</span>
        <DateRangeField
          fromIso={dateFrom}
          toIso={dateTo}
          onApply={(from, to) => push({ from, to })}
        />
      </div>

      <span className="filter-status" data-busy={busy ? "true" : undefined} aria-hidden={!busy}>
        <span className="filter-status-dot" />
        Updating…
      </span>

      <div className="filter-progress" data-busy={busy ? "true" : undefined} aria-hidden />
    </div>
  );
}
