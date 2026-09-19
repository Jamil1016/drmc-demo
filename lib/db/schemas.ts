/**
 * Every Postgres schema this app touches, in one place.
 *
 * The demo shares a Supabase project with other demos, so all of its objects
 * live in dedicated `drmc_*` schemas. These five must be on the project's
 * "Exposed schemas" list (Project Settings -> API); `drmc_demo` (seed + reset)
 * must NOT be. See supabase/schema.sql.
 */
export const DB = {
  /** App-owned state: allowlist, audit log, approval log, durable batches. */
  app: "drmc_app",
  /** Serving views and RPCs the pages read. */
  analytics: "drmc_analytics",
  /** Report requirement rows and cleaned timer entries. */
  staging: "drmc_staging",
  /** Roster-side reference data (approver assignments). */
  reference: "drmc_reference",
  /** Pipeline run log (data freshness label). */
  pipeline: "drmc_pipeline",
} as const;

export type DbSchema = (typeof DB)[keyof typeof DB];
