"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useLinkStatus } from "next/link";

/**
 * Navigation feedback for the App Router. Every page here is a dynamic server
 * render against the database, so a click sits for a few hundred ms with no
 * acknowledgment and reads as "dead". This gives two immediate signals:
 *   1. A thin top progress bar that appears the instant a navigation starts and
 *      completes when the new route commits (driven by the sidebar links via
 *      useLinkStatus, plus a history.pushState patch for content navigations).
 *   2. A per-item spinner + highlight on the exact link clicked (<NavPending />).
 *
 * Completion keys on `pathname` (not searchParams) so it needs no Suspense
 * boundary; query-only URL changes don't start the bar (the pushState patch is
 * gated on a real path change), so the bar can never get stuck.
 */

type NavProgressCtx = { start: () => void };
const NavProgressContext = createContext<NavProgressCtx>({ start: () => {} });

/** Call `start()` to show the top bar; it auto-completes on the next route change. */
export function useNavProgress(): NavProgressCtx {
  return useContext(NavProgressContext);
}

/**
 * Rendered INSIDE a <Link> (so it can read useLinkStatus). Shows a spinner while
 * that link's navigation is pending and nudges the top bar to start. Pass
 * `disabled` for the already-active link so re-clicking it shows nothing.
 */
export function NavPending({ disabled = false }: { disabled?: boolean }) {
  const { pending } = useLinkStatus();
  const { start } = useNavProgress();
  const active = pending && !disabled;

  useEffect(() => {
    if (active) start();
  }, [active, start]);

  if (!active) return null;
  return <span className="nav-spin" aria-hidden="true" />;
}

export function NavProgress({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const pathname = usePathname();
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (hideTimer.current) { clearTimeout(hideTimer.current); hideTimer.current = null; }
    if (safetyTimer.current) { clearTimeout(safetyTimer.current); safetyTimer.current = null; }
  };

  const start = useCallback(() => {
    clearTimers();
    setState("loading");
    // Fail-safe: never let the bar hang if a route change signal never arrives.
    safetyTimer.current = setTimeout(() => setState("idle"), 10000);
  }, []);

  // Complete when the path actually changes (skip the initial mount).
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    setState((s) => (s === "loading" ? "done" : "idle"));
  }, [pathname]);

  // After reaching "done", let the fill finish then hide.
  useEffect(() => {
    if (state !== "done") return;
    if (safetyTimer.current) { clearTimeout(safetyTimer.current); safetyTimer.current = null; }
    hideTimer.current = setTimeout(() => setState("idle"), 280);
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, [state]);

  // Catch navigations that don't come from a nav link (router.push, back/forward).
  // Only start on a real path change so query-only updates never strand the bar.
  useEffect(() => {
    const origPush = history.pushState;
    const startIfPathChanges = (url: unknown) => {
      try {
        if (typeof url === "string" || url instanceof URL) {
          const next = new URL(String(url), window.location.origin);
          // Defer start() to a microtask: Next's <Link> calls history.pushState
          // from inside a useInsertionEffect, where React forbids scheduling
          // state updates. The hop moves our setState out of that phase.
          if (next.pathname !== window.location.pathname) queueMicrotask(start);
        }
      } catch { /* ignore malformed URLs */ }
    };
    history.pushState = function (this: History, ...args: Parameters<History["pushState"]>) {
      startIfPathChanges(args[2]);
      return origPush.apply(this, args);
    };
    const onPop = () => start();
    window.addEventListener("popstate", onPop);
    return () => {
      history.pushState = origPush;
      window.removeEventListener("popstate", onPop);
      clearTimers();
    };
  }, [start]);

  return (
    <NavProgressContext.Provider value={{ start }}>
      <div className="nav-progress" data-state={state} aria-hidden="true">
        <div className="nav-progress-fill" />
      </div>
      {children}
    </NavProgressContext.Provider>
  );
}
