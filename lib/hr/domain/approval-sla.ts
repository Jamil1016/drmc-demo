export const SLA = { onTimeMaxDays: 2, amberMaxDays: 5 } as const;

export type SlaBucket = "on_time" | "amber" | "red";

export function bucketFor(days: number | null): SlaBucket {
  if (days === null || days <= SLA.onTimeMaxDays) return "on_time";
  if (days <= SLA.amberMaxDays) return "amber";
  return "red";
}
