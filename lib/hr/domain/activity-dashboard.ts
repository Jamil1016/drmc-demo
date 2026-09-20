export type Group = "day" | "week" | "month";

const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

/** Narrow a raw `group` URL param; anything else means "pick a default". */
export function parseGroup(raw: string | undefined): Group | undefined {
  return raw === "day" || raw === "week" || raw === "month" ? raw : undefined;
}

/** Smart default grouping from the (inclusive) range length. */
export function defaultGroup(fromIso: string, toIso: string): Group {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  const days = Math.round((to - from) / 86_400_000) + 1;
  if (days <= 31) return "day";
  if (days <= 180) return "week";
  return "month";
}

/** Label a bucket start (yyyy-MM-dd). Month => "Jul 2026"; day/week => "Jul 4". */
export function bucketLabel(bucketIso: string, group: Group): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(bucketIso);
  if (!m) return bucketIso;
  const [, y, mo, d] = m;
  const mon = MON[Number(mo) - 1] ?? mo;
  return group === "month" ? `${mon} ${y}` : `${mon} ${Number(d)}`;
}

/** Integer failure-rate percent; 0 when there are no attempts. */
export function failRate(approvals: number, failures: number): number {
  const total = approvals + failures;
  return total > 0 ? Math.round((failures / total) * 100) : 0;
}
