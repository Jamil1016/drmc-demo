/**
 * In the original app this is a deep link that opens the report in the
 * project-management system. The demo has no such system to open, so the
 * control is rendered inert: same place, same look, no destination.
 */
export function PmTaskLink({ label = "Open in PM system ↗", bare = false }: { label?: string; bare?: boolean }) {
  return (
    <span
      className={bare ? undefined : "btn-ghost"}
      aria-disabled="true"
      title="In the real app this opens the report in the project-management system. The demo is not connected to one."
      style={{ opacity: 0.55, cursor: "not-allowed", ...(bare ? { color: "var(--signal)", fontWeight: 600 } : {}) }}
    >
      {label}
    </span>
  );
}
