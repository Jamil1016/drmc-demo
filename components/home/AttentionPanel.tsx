import Link from "next/link";

// Rendered only when scope is "own" or "org" (the page decides). Shows the
// pending approvals call to action.
export function AttentionPanel({
  pending,
  browseHref = "/approvals/browse",
}: {
  pending: number;
  browseHref?: string;
}) {
  return (
    <section
      aria-labelledby="attention-panel-heading"
      className="surface p-5"
      style={{ background: "color-mix(in srgb, var(--warn) 8%, var(--card))", borderColor: "color-mix(in srgb, var(--warn) 35%, var(--rule))" }}
    >
      <h2 id="attention-panel-heading" className="text-sm font-semibold" style={{ color: "var(--warn)" }}>
        Needs your attention
      </h2>
      {pending > 0 ? (
        <div className="mt-2">
          <Link href={browseHref} className="btn-primary">
            Review {pending} {pending === 1 ? "report" : "reports"} awaiting approval
          </Link>
        </div>
      ) : (
        <p className="mt-2" style={{ color: "var(--warn)" }}>You&apos;re all caught up.</p>
      )}
    </section>
  );
}
