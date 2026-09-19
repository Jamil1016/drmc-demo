-- =============================================================================
-- DRMC demo: reset (idempotent). Defines drmc_demo.reset_demo() and runs it once.
--
-- HOW TO APPLY: run AFTER supabase/schema.sql and supabase/seed.sql, in that
-- order. Then, in Project Settings -> API -> "Exposed schemas", make sure
-- EXACTLY these five are listed (alongside whatever other apps already use):
--     drmc_app, drmc_analytics, drmc_staging, drmc_reference, drmc_pipeline
-- and that drmc_demo is NOT listed.
--
-- reset_demo() throws away everything visitors did (approvals, batches, audit
-- rows) and reloads the invented data with dates relative to today, so the
-- approval queue always looks recent.
--
-- NIGHTLY RESET with pg_cron (run once, by hand, in the SQL editor; 19:20 UTC):
--
--     select cron.schedule('drmc-demo-reset', '20 19 * * *', $$select drmc_demo.reset_demo()$$);
--
-- To remove it:  select cron.unschedule('drmc-demo-reset');
-- The schedule line is documentation only. This file does not create the job,
-- and nothing in it references or alters any object outside the drmc_* schemas.
-- =============================================================================

create or replace function drmc_demo.reset_demo()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  truncate drmc_app.approval_batch_item,
           drmc_app.approval_batch,
           drmc_app.report_approval_log,
           drmc_app.hr_audit_log
           restart identity;
  perform drmc_demo.load_seed();
end;
$$;

revoke all on function drmc_demo.reset_demo() from public, anon, authenticated, service_role;

select drmc_demo.reset_demo();

notify pgrst, 'reload schema';
