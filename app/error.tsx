"use client";

import { useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

/**
 * Friendly app-level error boundary: server-component crashes (most commonly
 * the data service being unreachable)
 * show a branded, actionable card instead of Next's bare "This page couldn't
 * load". The digest is surfaced small for support without leaking internals.
 *
 * Recovery is automatic. Pages poll via LiveRefresh, and when one of those
 * background refreshes hits a transient DB failure (statement timeout during
 * a pipeline/MV-refresh window) this boundary replaces the page — unmounting
 * LiveRefresh with it — so without a retry loop the error would latch until a
 * manual reload. We retry on the same 60s visible-tab cadence LiveRefresh
 * uses, plus immediately when the tab regains focus.
 *
 * reset() alone re-renders from the errored RSC payload, so for server-side
 * crashes it fails instantly even after the DB recovers; every retry (button
 * included) must pair router.refresh() with reset().
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [isRetrying, startTransition] = useTransition();
  const retry = useRef(() => {});
  retry.current = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  useEffect(() => {
    console.error("app error boundary:", error);
  }, [error]);

  useEffect(() => {
    // A failed retry mounts a fresh boundary (and a fresh interval), so the
    // 60s tick is also the natural backoff between attempts.
    const tick = () => {
      if (!document.hidden) retry.current();
    };
    const id = setInterval(tick, 60_000);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  const likelyOutage = /fetch failed|ECONN|timeout|522|503|PGRST002|schema cache|allowlist lookup/i.test(
    `${error.message} ${error.digest ?? ""}`,
  );

  // data-error-boundary: stable machine-readable marker. The PDF renderer
  // (lib/hr/report/pdf.ts) races on it to fail fast when the report page
  // crashes into this boundary instead of idling out its content wait.
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-8" data-error-boundary>
      <div className="surface p-8 text-center" style={{ maxWidth: 460 }}>
        <div className="text-3xl" aria-hidden>⚠️</div>
        <h1 className="mt-3 text-lg font-bold" style={{ color: "var(--ink)" }}>
          Something went wrong loading this page
        </h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          {likelyOutage
            ? "The data service is not responding right now. This usually clears within a few minutes; your data is safe."
            : "This is usually a brief data-service hiccup. The page retries automatically every minute, or you can retry now."}
        </p>
        <div className="mt-5 flex items-center justify-center gap-2">
          <button type="button" className="btn-primary" onClick={() => retry.current()} disabled={isRetrying}>
            {isRetrying ? "Retrying…" : "Try again"}
          </button>
          <Link href="/" className="btn-ghost">Go home</Link>
        </div>
        {error.digest && (
          <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
            Reference: {error.digest}
          </p>
        )}
      </div>
    </div>
  );
}
