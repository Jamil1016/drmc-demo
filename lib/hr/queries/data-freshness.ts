import { DB } from "@/lib/db/schemas";
import { unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/service";
import { withDbRetry } from "@/lib/hr/db-retry";

/**
 * Timestamp (timestamptz ISO, UTC) of the last time the underlying daily-report
 * data was refreshed, i.e. the most recent SUCCESSFUL
 * `daily_reports_rolling` pipeline run. This is the real data freshness the UI
 * should show, not the in-app poll time: the in-app auto-refresh only re-reads
 * the DB, while this pipeline (every ~10 min) is the only thing that lands new
 * the PM API data. Returns null if no successful run is found.
 *
 * `pipeline` is on the PostgREST exposed-schema list, so the service-role client
 * reaches `pipeline.pipeline_runs` directly with no migration or view.
 */
async function fetchLastDataRefresh(): Promise<string | null> {
  const svc = createServiceClient();
  return withDbRetry(async () => {
    const { data, error } = await svc
      .schema(DB.pipeline)
      .from("pipeline_runs")
      .select("completed_at")
      .eq("pipeline_name", "daily_reports_rolling")
      .eq("status", "success")
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ completed_at: string | null }>();
    if (error) throw new Error(error.message);
    return data?.completed_at ?? null;
  });
}

/**
 * Cached for 120s across requests. The value only changes when the
 * `daily_reports_rolling` pipeline lands a new run (~every 10 min), and it is
 * read on ~5 pages plus re-read by the 60s LiveRefresh poll on each of them, so
 * an uncached read means many redundant DB hits per minute per user. A 120s TTL
 * lags real freshness by at most ~2 min against a 10-min pipeline cadence, which
 * is invisible in the "last refreshed" label but cuts the DB load sharply.
 * The read THROWS on failure so an error is never cached for the full TTL.
 */
const readLastDataRefresh = unstable_cache(
  fetchLastDataRefresh,
  ["last-data-refresh:daily_reports_rolling"],
  { revalidate: 120 },
);

/**
 * Freshness-label lookup on a table the ETL is actively WRITING during exactly
 * the windows that time out — it must never take a page down. Every caller
 * already renders a "no successful run" state for null, so degrade to that.
 */
export async function getLastDataRefresh(): Promise<string | null> {
  try {
    return await readLastDataRefresh();
  } catch (e) {
    console.error("getLastDataRefresh: degraded to null:", e);
    return null;
  }
}
