import type { MemberApprover } from "@/lib/hr/queries/member-approver-queries";

/** A member's daily-report approvers, as assigned on the roster. Read-only. */
export function MemberApprovers({ approvers }: { approvers: MemberApprover[] }) {
  return (
    <section aria-labelledby="approvers-heading" className="surface p-5">
      <h2 id="approvers-heading" className="text-sm font-semibold" style={{ color: "var(--ink)" }}>
        DR Approvers
      </h2>
      <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
        Who approves this person&apos;s daily reports. Assignments come from the roster and are read-only.
      </p>

      <ul className="mt-3 flex flex-col" style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {approvers.length === 0 && (
          <li className="text-sm" style={{ color: "var(--muted)" }}>No approvers on record.</li>
        )}
        {approvers.map((a, i) => (
          <li
            key={a.email ?? a.name}
            className="flex items-center justify-between gap-3"
            style={{ padding: "0.5rem 0", borderTop: i === 0 ? undefined : "1px solid var(--rule)" }}
          >
            <span className="flex min-w-0 items-center gap-2">
              <span className="cell-strong truncate">{a.name}</span>
              {a.email && <span className="truncate text-xs" style={{ color: "var(--muted)" }}>{a.email}</span>}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
