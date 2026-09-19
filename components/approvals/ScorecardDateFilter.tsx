"use client";

import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { setParams } from "@/lib/hr/domain/filter-url";
import { DateRangeField } from "@/components/ui/DateRangeField";

/**
 * Calendar-only date filter for the scorecard. Optional; on apply it writes
 * `from`/`to` (yyyy-MM-dd) to the URL and the server page re-queries the RPC.
 * Filters by the report's work date. Clearing both reverts to all-time.
 */
export function ScorecardDateFilter({ from, to }: { from?: string; to?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const push = useCallback(
    (updates: Record<string, string | undefined | null>) => {
      const next = setParams(new URLSearchParams(params.toString()), updates);
      const qs = next.toString();
      router.replace(qs ? `/approvals/scorecard?${qs}` : "/approvals/scorecard", { scroll: false });
    },
    [router, params],
  );
  return (
    <DateRangeField
      fromIso={from}
      toIso={to}
      onApply={(f, t) => push({ from: f, to: t })}
    />
  );
}
