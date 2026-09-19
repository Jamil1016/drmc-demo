import { colorForLabel } from "@/lib/hr/domain/group";

/** Subtle colored dot + group name + count badge: the header above each grouped table. */
export function GroupBar({ label, count }: { label: string; count: number }) {
  return (
    <div className="group-bar">
      <span className="group-dot" data-color={colorForLabel(label)} />
      <span className="group-name">{label}</span>
      <span className="group-count">{count}</span>
    </div>
  );
}
