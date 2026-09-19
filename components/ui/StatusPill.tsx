export type PillTone = "ok" | "bad" | "warn" | "info" | "neutral";

export function StatusPill({ tone, children }: { tone: PillTone; children: React.ReactNode }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

/** Active / Inactive pill — the directory + employee status convention. */
export function ActiveStatus({ active }: { active: boolean }) {
  return <StatusPill tone={active ? "ok" : "bad"}>{active ? "Active" : "Inactive"}</StatusPill>;
}
