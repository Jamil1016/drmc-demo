import { DB } from "@/lib/db/schemas";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { withDbRetry } from "@/lib/hr/db-retry";

export type TimerRollupHealth = {
  /** True when analytics.mv_timer_day_rollup has zero rows. This is the
   *  pathological state that blanks every timer-based HR surface (all
   *  coverage_pct goes NULL): the pg_cron CONCURRENTLY refresh occasionally
   *  lands a bad/empty rebuild and, with ~30% "job startup timeout" failures,
   *  recovery can lag several minutes. Callers use this to show a "refreshing"
   *  notice instead of an empty dashboard. */
  empty: boolean;
  /** Most recent work_day present in the rollup (yyyy-MM-dd), or null when empty. */
  maxWorkDay: string | null;
};

/**
 * Cheap health probe for the timer-day rollup MV. One indexed row read
 * (order by work_day desc limit 1) tells us both whether the MV is populated
 * and how fresh it is. The timer MV feeds coverage_pct on the variance
 * dashboard, so an empty MV = a blank page.
 */
async function fetchTimerRollupHealth(): Promise<TimerRollupHealth> {
  const svc = createServiceClient();
  return withDbRetry(async () => {
    const { data, error } = await svc
      .schema(DB.analytics)
      .from("mv_timer_day_rollup")
      .select("work_day")
      .order("work_day", { ascending: false })
      .limit(1)
      .maybeSingle<{ work_day: string | null }>();
    if (error) throw new Error(error.message);
    return { empty: data == null, maxWorkDay: data?.work_day ?? null };
  });
}

/**
 * Cached 60s under the shared "hr-review" tag (same freshness contract as
 * getVarianceRows), so the extra probe adds at most one DB read per minute.
 * The read THROWS on failure so an error is never cached for the full TTL.
 */
const readTimerRollupHealth = unstable_cache(
  fetchTimerRollupHealth,
  ["timer-rollup-health"],
  { revalidate: 60, tags: ["hr-review"] },
);

/**
 * The probe exists to detect MV-rebuild windows — it must never take the page
 * down itself. If even the retried read fails, degrade to "populated/unknown"
 * (empty:false) so the dashboard renders normally instead of erroring or
 * falsely claiming a rebuild is in progress.
 */
export async function getTimerRollupHealth(): Promise<TimerRollupHealth> {
  try {
    return await readTimerRollupHealth();
  } catch (e) {
    console.error("getTimerRollupHealth: degraded to non-empty default:", e);
    return { empty: false, maxWorkDay: null };
  }
}
