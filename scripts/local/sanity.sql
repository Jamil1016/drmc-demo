-- Local verification only: the numbers the README quotes.
--   docker compose -f docker-compose.local.yml exec -T db psql -U postgres -f - < scripts/local/sanity.sql
\pset pager off
\echo '== row counts'
select 'employees' as what, count(*) from drmc_demo.employee
union all select 'active employees', count(*) from drmc_demo.employee where is_active
union all select 'approvers (distinct)', count(distinct approver_email) from drmc_reference.ref_employee_approvers
union all select 'daily reports', count(*) from drmc_demo.daily_report
union all select 'requirement rows', count(*) from drmc_staging.stg_daily_report_hours
union all select 'timer entries', count(*) from drmc_staging.stg_timer_activities_clean
union all select 'timer entries still running', count(*) from drmc_staging.stg_timer_activities_clean where end_time is null
union all select 'timer entries crossing ET midnight', count(*) from drmc_staging.stg_timer_activities_clean
           where (start_time at time zone 'America/New_York')::date <> (end_time at time zone 'America/New_York')::date
union all select 'timer day rollup rows', count(*) from drmc_analytics.mv_timer_day_rollup
union all select 'schedule changes', count(*) from drmc_demo.schedule_change
union all select 'app users', count(*) from drmc_app.hr_app_user;

\echo '== working days covered'
select count(distinct work_date) as working_days, min(work_date) as first_day, max(work_date) as last_day from drmc_demo.daily_report;

\echo '== report status (through the serving view)'
select task_status, count(*), round(100.0 * count(*) / sum(count(*)) over (), 1) as pct
from drmc_analytics.v_daily_report_approvals group by 1 order by 2 desc;

\echo '== awaiting approval: age distribution (days waiting)'
select case when pending_wait_days <= 2 then '0-2 on time' when pending_wait_days <= 5 then '3-5 amber' else '6+ red' end as tier,
       count(*), min(pending_wait_days) as min_days, max(pending_wait_days) as max_days
from drmc_analytics.v_daily_report_approvals where is_awaiting_approval group by 1 order by 1;

\echo '== awaiting approval: by work date, newest 12 days'
select work_date, count(*) from drmc_analytics.v_daily_report_approvals
where is_awaiting_approval group by 1 order by 1 desc limit 12;

\echo '== filed late (past the 48 h / 60 h window) and no-approver reports'
select (count(*) filter (where submitted_on_et > clock_in_et + case when work_dow = 5 then interval '60 hours' else interval '48 hours' end)) as filed_late,
       (count(*) filter (where no_approver_flag and is_awaiting_approval)) as awaiting_without_approver
from drmc_analytics.v_daily_report_approvals;

\echo '== days worked (timers) with no report filed'
select count(*) as missing_report_days
from drmc_analytics.mv_timer_day_rollup t
join drmc_demo.employee e on lower(e.email) = t.user_email
left join drmc_demo.daily_report r on r.emp_id = e.emp_id and r.work_date = t.work_day
where r.task_did is null;

\echo '== hours variance: breach rate per group (coverage <= 85 %)'
select carrier_group, count(*) as reports,
       round(avg(100 - coverage_pct), 1) as avg_untimed_pct,
       round(100.0 * count(*) filter (where coverage_pct <= 85) / count(*), 1) as breach_rate_pct
from drmc_analytics.v_hr_report_review where coverage_pct is not null group by 1 order by 1;

\echo '== overlap check: summed durations vs union of intervals (union must be <=)'
select round(sum(duration_min) / 60.0, 1) as summed_hours,
       (select round(sum(timed_hours), 1) from drmc_analytics.mv_timer_day_rollup) as union_hours
from drmc_staging.stg_timer_activities_clean where end_time is not null;

\echo '== scorecard (all time)'
select * from drmc_analytics.approver_scorecard(null, null);

\echo '== queue summary'
select jsonb_pretty(drmc_analytics.approval_queue_summary(null, null, null, null));

\echo '== demo user scope'
select array(select drmc_analytics.dr_assigned_groups_for_email('demo@example.com')) as assigned_groups,
       (select count(*) from drmc_analytics.dr_assigned_members_for_email('demo@example.com')) as assigned_members,
       (select count(*) from drmc_analytics.dr_unassigned_reports_for_email('demo@example.com', false)) as unassigned_reports_in_scope;

\echo '== freshness heartbeat'
select pipeline_name, status, completed_at, now() - completed_at as age from drmc_pipeline.pipeline_runs order by completed_at desc limit 1;

\echo '== security: tables without RLS, and any grant to anon/authenticated/public (both must be empty)'
select n.nspname, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relkind = 'r' and n.nspname like 'drmc\_%' and not c.relrowsecurity;
select table_schema, table_name, grantee, privilege_type from information_schema.role_table_grants
where table_schema like 'drmc\_%' and grantee in ('anon', 'authenticated', 'PUBLIC');
select n.nspname, p.proname, 'search_path not pinned' as problem from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname like 'drmc\_%' and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
select n.nspname, p.proname, r.rolname as can_execute
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
cross join (select rolname from pg_roles where rolname in ('anon', 'authenticated')) r
where n.nspname like 'drmc\_%' and has_function_privilege(r.rolname, p.oid, 'execute');

\echo '== anon has no access (each statement must fail with permission denied)'
set role anon;
select count(*) from drmc_analytics.v_daily_report_approvals;
select count(*) from drmc_app.hr_app_user;
select drmc_analytics.approval_queue_summary(null, null, null, null);
select drmc_demo.reset_demo();
reset role;
\echo '== service_role cannot reach drmc_demo (must fail)'
set role service_role;
select count(*) from drmc_demo.employee;
select drmc_demo.reset_demo();
reset role;
