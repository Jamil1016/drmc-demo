"use client";

/**
 * Last-resort boundary for errors thrown in the root layout itself. Must
 * render its own <html>/<body> (the layout is gone at this point), so styling
 * is inline and dependency-free.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "Arial, Helvetica, sans-serif", background: "#f1f5f9", margin: 0 }}>
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 32 }}>
          <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 32, maxWidth: 440, textAlign: "center", boxShadow: "0 8px 30px rgba(15,23,42,0.08)" }}>
            <div style={{ fontSize: 30 }} aria-hidden>⚠️</div>
            <h1 style={{ fontSize: 18, color: "#0f172a", margin: "12px 0 8px" }}>DRMC hit a snag</h1>
            <p style={{ fontSize: 14, color: "#64748b", margin: 0 }}>
              The service may be temporarily unavailable. Trying again in a few minutes usually resolves it.
            </p>
            <button
              type="button"
              onClick={() => reset()}
              style={{ marginTop: 20, padding: "8px 18px", borderRadius: 8, border: "none", background: "#0369a1", color: "#fff", fontSize: 14, cursor: "pointer" }}
            >
              Try again
            </button>
            {error.digest && (
              <p style={{ marginTop: 16, fontSize: 11, color: "#94a3b8" }}>Reference: {error.digest}</p>
            )}
          </div>
        </div>
      </body>
    </html>
  );
}
