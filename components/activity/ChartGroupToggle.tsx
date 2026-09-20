"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setParams } from "@/lib/hr/domain/filter-url";
import type { Group } from "@/lib/hr/domain/activity-dashboard";

const GROUPS: Group[] = ["day", "week", "month"];

/** Day/Week/Month toggle. Writes ?group= to the URL, preserving other params. */
export function ChartGroupToggle({ group }: { group: Group }) {
  const router = useRouter();
  const params = useSearchParams();
  const set = useCallback((g: Group) => {
    const next = setParams(new URLSearchParams(params.toString()), { group: g });
    const qs = next.toString();
    router.replace(qs ? `/activity?${qs}` : "/activity", { scroll: false });
  }, [router, params]);

  return (
    <div className="flex gap-1" role="group" aria-label="Chart grouping">
      {GROUPS.map((g) => (
        <button
          key={g}
          type="button"
          onClick={() => set(g)}
          aria-pressed={g === group}
          style={{
            fontSize: "0.72rem", textTransform: "capitalize", padding: "3px 9px",
            borderRadius: 7, border: "1px solid var(--rule)",
            background: g === group ? "var(--signal)" : "var(--card)",
            color: g === group ? "#fff" : "var(--muted)", cursor: "pointer",
          }}
        >{g}</button>
      ))}
    </div>
  );
}
