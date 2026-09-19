"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { decideFromProbe } from "@/lib/hr/domain/live-refresh-policy";
import { useDisplayZone } from "@/components/layout/DisplayZoneProvider";
import { zoneLabel } from "@/lib/time";

/**
 * Keeps a server-rendered page in sync without a manual reload. On an interval
 * it calls router.refresh(), which re-runs the server component, swaps in fresh
 * DB data, and preserves scroll position and active filters (no full reload).
 *
 * Each tick is HEALTH-GATED: the client first probes /api/health/data and only
 * refreshes when the data service answers. A background refresh that fails
 * server-side replaces the page the user is reading with the error boundary,
 * so when the DB is struggling (statement timeouts during pipeline/MV windows)
 * the right move is to keep the working page, flip the badge to an amber
 * "Reconnecting" state, and try again next tick. Policy (incl. the 401 →
 * still-refresh sign-out path) lives in lib/hr/domain/live-refresh-policy.ts.
 *
 * Polling pauses while the tab is hidden and resumes (with an immediate tick)
 * when the tab becomes visible again, so it never polls a tab nobody is viewing.
 *
 * `label` is the data-freshness text (the pipeline's last successful run, in
 * the user's display zone), computed on the server and passed in; the zone
 * name in the tooltip comes from context so it follows the PHT | ET toggle.
 * It reflects when the DATA last changed, not when we last polled: the poll
 * only re-reads the DB, while the ~10-min pipeline is the only thing that
 * lands new data.
 */

/** Client-side ceiling on the probe round trip: the endpoint self-limits at
 *  4s, this also covers a hung serverless function or dropped connection. */
const PROBE_FETCH_TIMEOUT_MS = 8000;

async function probeDataService(): Promise<number | "network-error"> {
  try {
    const res = await fetch("/api/health/data", {
      cache: "no-store",
      signal: AbortSignal.timeout(PROBE_FETCH_TIMEOUT_MS),
    });
    return res.status;
  } catch {
    return "network-error";
  }
}

export function LiveRefresh({ label, intervalMs = 60_000 }: { label: string; intervalMs?: number }) {
  const router = useRouter();
  const { zone } = useDisplayZone();
  const tz = zoneLabel(zone);
  const [isPending, startTransition] = useTransition();
  const [stale, setStale] = useState(false);
  const tick = useRef(() => {});
  const inFlight = useRef(false);
  const keepY = useRef<number | null>(null);

  // Keep the latest tick closure in a ref so the effect below can stay
  // mounted once (stable interval) while always calling the current router.
  tick.current = () => {
    if (inFlight.current) return; // a slow probe must not stack ticks
    inFlight.current = true;
    void probeDataService()
      .then((status) => {
        const decision = decideFromProbe(status);
        setStale(decision.stale);
        if (decision.refresh) {
          // Pages that mirror drill state into the URL via a raw
          // history.replaceState(null, ...) (Hours Variance drills, Browse
          // header sort) desync Next's internal history entry; the next
          // router.refresh() then treats the entry as a fresh navigation and
          // scrolls the window to the top. Remember where the user was and put
          // them back if the refresh commit yanked them to exactly 0.
          keepY.current = window.scrollY;
          startTransition(() => router.refresh());
        }
      })
      .finally(() => {
        inFlight.current = false;
      });
  };

  // Restore the pre-refresh scroll position once the refresh transition
  // commits, but ONLY if the commit reset the window to exactly the top while
  // the user had been somewhere below it (the desync symptom above). A user
  // who genuinely sits at the top, or who scrolled mid-refresh, is untouched.
  useEffect(() => {
    if (isPending || keepY.current === null) return;
    const y = keepY.current;
    keepY.current = null;
    if (y > 0 && window.scrollY === 0) window.scrollTo(0, y);
  }, [isPending]);

  useEffect(() => {
    const onTick = () => {
      if (!document.hidden) tick.current();
    };
    const id = setInterval(onTick, intervalMs);
    document.addEventListener("visibilitychange", onTick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onTick);
    };
  }, [intervalMs]);

  const title = stale
    ? `The data service is busy right now. Showing the last loaded data${label ? ` (updated ${label} ${tz})` : ""}; retrying every minute.`
    : label
      ? `Underlying data last refreshed ${label} (${tz})`
      : "Live";

  return (
    <span
      className={stale ? "live-badge live-badge--stale" : "live-badge"}
      title={title}
      // Exposed as data attributes so tests and tooling can read the exact
      // freshness the user could see.
      data-last-refreshed={label || undefined}
      data-live-stale={stale ? "true" : undefined}
    >
      <span className={stale ? "live-dot live-dot--stale" : "live-dot"} aria-hidden />
      <span>{stale ? "Reconnecting" : "Live"}</span>
      {label && (
        <span className="live-sep">
          · Data updated <strong>{label}</strong>
        </span>
      )}
    </span>
  );
}
