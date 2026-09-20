-- =============================================================================
-- DRMC demo: schema (idempotent; safe to run more than once)
--
-- HOW TO APPLY (Supabase SQL editor, or psql):
--   1. run this file            supabase/schema.sql
--   2. run                      supabase/seed.sql        (defines drmc_demo.load_seed())
--   3. run                      supabase/reset_demo.sql  (defines drmc_demo.reset_demo(), loads the data)
--   4. Project Settings -> API -> "Exposed schemas": add EXACTLY
--          drmc_app, drmc_analytics, drmc_staging, drmc_reference, drmc_pipeline
--      Do NOT add drmc_demo: it holds the base seed tables and the reset function
--      and must not be reachable through the API.
--
-- ISOLATION: this project may be shared with other apps. Every object this file
-- creates lives in a drmc_* schema, and nothing here references or alters any
-- object outside the drmc_* schemas (apart from the built-in roles it grants to).
--
-- ACCESS MODEL: the app reads and writes ONLY with the service-role key, after
-- its own server-side role guard has run. So: RLS is enabled on every table with
-- NO policies (anon/authenticated can never see a row), privileges are granted
-- to service_role only, EXECUTE on every function is revoked from public, anon
-- and authenticated, and every function pins search_path = ''.
--
-- POLICY NUMBERS IN THIS FILE ARE INVENTED for the demo:
--   filing window        48 h after clock-in (60 h for a Friday work date)
--   approval window      2 days after submission
--   unpaid break         1 h netted out of stated hours
--   variance breach line 15 % untimed  (coverage <= 85 %)
-- =============================================================================

create schema if not exists drmc_app;
create schema if not exists drmc_analytics;
create schema if not exists drmc_staging;
create schema if not exists drmc_reference;
create schema if not exists drmc_pipeline;
create schema if not exists drmc_demo;

-- -----------------------------------------------------------------------------
-- drmc_demo: base seed tables (the stand-in for a warehouse). Not exposed.
-- -----------------------------------------------------------------------------
create table if not exists drmc_demo.employee (
  emp_id               text primary key,
  first_name           text not null,
  last_name            text not null,
  middle_name          text,
  nickname             text,
  full_name            text not null,          -- "Last, First"
  report_display_name  text not null,          -- "First Last", as the report tables show it
  email                text not null unique,
  position             text,
  carrier_group        text,
  carrier              text,
  cluster              text,
  division             text,
  sub_division         text,
  work_schedule        text,
  shift_schedule       text,
  shift_time_in_pht    text,
  shift_time_out_pht   text,
  employment_status    text,
  immediate_supervisor text,
  hire_date            date,
  regularization_date  date,
  resignation_date     date,
  is_active            boolean not null default true
);

create table if not exists drmc_demo.approver_group (
  label         text primary key,              -- the queue a report is assigned to
  display_label text not null,
  carrier_group text
);

create table if not exists drmc_demo.daily_report (
  task_did          text primary key,
  emp_id            text not null references drmc_demo.employee (emp_id),
  work_date         date not null,
  seed_status       text not null check (seed_status in ('in_progress', 'submitted', 'approved', 'rejected')),
  clock_in_et       timestamp,                 -- Eastern wall clock, no zone (as the source system reports it)
  submitted_on_et   timestamp,
  approved_on_et    timestamp,
  approved_by       text,
  total_hours       numeric(5, 2),             -- stated hours, break included
  assigned_approver text,                      -- approver_group.label, or null = nobody assigned
  asset_name        text,
  milestone         text,
  unique (emp_id, work_date)
);
create index if not exists daily_report_work_date_idx on drmc_demo.daily_report (work_date);
create index if not exists daily_report_status_idx on drmc_demo.daily_report (seed_status);

create table if not exists drmc_demo.schedule_change (
  id               bigint generated always as identity primary key,
  emp_id           text not null references drmc_demo.employee (emp_id),
  role             text,
  sheet_tab        text not null,
  shift_start_pht  text,
  shift_end_pht    text,
  shift_start_et   text,
  shift_end_et     text,
  shift_code       text,
  work_arrangement text,
  reg_hours        numeric(4, 1),
  rest_day         text,
  start_date       date not null,
  end_date         date,
  change_kind      text not null check (change_kind in ('one_day', 'temporary', 'ongoing')),
  notes            text
);
create index if not exists schedule_change_emp_idx on drmc_demo.schedule_change (emp_id);

-- -----------------------------------------------------------------------------
-- drmc_staging: report requirement rows and cleaned timer entries
-- -----------------------------------------------------------------------------
create table if not exists drmc_staging.stg_daily_report_hours (
  task_did            text not null,
  req_id              text not null,
  work_description    text,
  hours_worked        numeric(5, 2),
  req_status          text,
  file_uploaded_count integer not null default 0,
  primary key (task_did, req_id)
);

create table if not exists drmc_staging.stg_timer_activities_clean (
  id           bigint generated always as identity primary key,
  user_email   text not null,
  project      text,
  site_name    text,
  task         text,
  task_clean   text,
  asset_did    text,
  start_time   timestamptz not null,
  end_time     timestamptz,                    -- null = the timer is still running
  duration_min integer
);
create index if not exists stg_timer_email_start_idx
  on drmc_staging.stg_timer_activities_clean (lower(user_email), start_time);
create index if not exists stg_timer_start_idx
  on drmc_staging.stg_timer_activities_clean (start_time);

-- -----------------------------------------------------------------------------
-- drmc_reference: roster-side approver assignments
-- -----------------------------------------------------------------------------
create table if not exists drmc_reference.ref_employee_approvers (
  emp_id          text not null,
  kind            text not null default 'dr',
  rank            integer not null,
  approver_name   text not null,
  approver_email  text,
  approver_emp_id text,
  approver_group  text,
  primary key (emp_id, kind, rank)
);
create index if not exists ref_employee_approvers_email_idx
  on drmc_reference.ref_employee_approvers (lower(approver_email));

-- -----------------------------------------------------------------------------
-- drmc_app: app-owned state
-- -----------------------------------------------------------------------------
create table if not exists drmc_app.hr_app_user (
  id           bigint generated always as identity primary key,
  email        text not null unique,
  role         text not null check (role in ('viewer', 'lead', 'manager', 'hr_staff', 'super_admin')),
  is_active    boolean not null default true,
  auth_user_id uuid,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz
);

create table if not exists drmc_app.hr_audit_log (
  id          bigint generated always as identity primary key,
  actor_email text not null,
  action      text not null,
  entity      text not null,
  entity_id   text,
  detail      jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists hr_audit_log_created_idx on drmc_app.hr_audit_log (created_at desc);

-- One row per approve ATTEMPT. The partial unique index is the idempotency
-- backstop: a report can only ever have one successful approval.
create table if not exists drmc_app.report_approval_log (
  id             bigint generated always as identity primary key,
  task_did       text not null,
  approver_email text not null,
  pm_status      text,                         -- 'approved' | 'already_approved' | null on failure
  ok             boolean not null,
  http_status    integer,
  error_reason   text,
  approved_at    timestamptz not null default now()
);
create unique index if not exists report_approval_log_one_ok
  on drmc_app.report_approval_log (task_did) where ok;
create index if not exists report_approval_log_task on drmc_app.report_approval_log (task_did);

-- Durable bulk approve: a batch header plus one item per report. The browser
-- only DRIVES the batch; its state lives here, so a closed tab, a dropped
-- connection or a crashed function loses nothing.
create table if not exists drmc_app.approval_batch (
  id                uuid primary key default gen_random_uuid(),
  approver_email    text not null,
  status            text not null default 'running' check (status in ('running', 'done')),
  total             integer not null check (total between 1 and 200),
  approved_count    integer not null default 0,
  failed_count      integer not null default 0,
  -- Demo only: the "simulate an outage after N items" control (lib/demo/pm-api.ts).
  demo_outage_after integer check (demo_outage_after is null or demo_outage_after between 1 and 200),
  demo_outage_stage smallint not null default 0 check (demo_outage_stage between 0 and 2),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz
);
create index if not exists approval_batch_approver_idx on drmc_app.approval_batch (approver_email, status, created_at desc);
create index if not exists approval_batch_created_idx on drmc_app.approval_batch (created_at);

create table if not exists drmc_app.approval_batch_item (
  batch_id         uuid not null references drmc_app.approval_batch (id) on delete cascade,
  task_did         text not null,
  seq              bigint generated always as identity,
  status           text not null default 'queued' check (status in ('queued', 'processing', 'approved', 'failed')),
  attempts         integer not null default 0,
  retryable        boolean not null default false,
  last_reason      text,
  last_http_status integer,
  claimed_at       timestamptz,
  updated_at       timestamptz,
  primary key (batch_id, task_did)
);
create index if not exists approval_batch_item_claim_idx on drmc_app.approval_batch_item (batch_id, status, seq);

-- Claim the next chunk of a batch. FOR UPDATE SKIP LOCKED means two runners
-- (two tabs, a retry racing the original request) never receive the same item
-- and never wait on each other. A claim older than 2 minutes is treated as
-- abandoned (the function that made it died) and can be claimed again.
create or replace function drmc_app.claim_approval_items(p_batch_id uuid, p_limit integer)
returns setof text
language sql
security definer
set search_path = ''
as $$
  with picked as (
    select i.batch_id, i.task_did
    from drmc_app.approval_batch_item i
    where i.batch_id = p_batch_id
      and (i.status = 'queued'
           or (i.status = 'processing' and i.claimed_at < now() - interval '2 minutes'))
    order by i.seq
    limit least(greatest(coalesce(p_limit, 0), 0), 50)
    for update skip locked
  )
  update drmc_app.approval_batch_item i
     set status = 'processing', claimed_at = now(), updated_at = now()
    from picked
   where i.batch_id = picked.batch_id and i.task_did = picked.task_did
  returning i.task_did;
$$;

-- Recount a batch from its items (the items are the truth, the header is a
-- cache) and close it when nothing is left to do.
create or replace function drmc_app.recompute_batch(p_batch_id uuid)
returns table (total integer, approved_count integer, failed_count integer, remaining integer, status text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total integer; v_approved integer; v_failed integer; v_remaining integer; v_status text;
begin
  select count(*)::int,
         (count(*) filter (where i.status = 'approved'))::int,
         (count(*) filter (where i.status = 'failed'))::int,
         (count(*) filter (where i.status in ('queued', 'processing')))::int
    into v_total, v_approved, v_failed, v_remaining
    from drmc_app.approval_batch_item i
   where i.batch_id = p_batch_id;

  v_status := case when v_remaining = 0 then 'done' else 'running' end;

  update drmc_app.approval_batch b
     set approved_count = v_approved, failed_count = v_failed, status = v_status, updated_at = now()
   where b.id = p_batch_id;

  return query select v_total, v_approved, v_failed, v_remaining, v_status;
end;
$$;

-- -----------------------------------------------------------------------------
-- drmc_pipeline: data-freshness heartbeat
--
-- The real app reads the last successful run of its ingestion pipeline to label
-- how fresh the data is. The demo has no pipeline, so this is a VIEW that
-- reports a successful run on every 10-minute boundary: the label stays honest
-- about what it is (simulated) without going stale between nightly resets.
-- -----------------------------------------------------------------------------
create or replace view drmc_pipeline.pipeline_runs as
select
  n::bigint                                as id,
  'daily_reports_rolling'::text            as pipeline_name,
  'success'::text                          as status,
  tick - (n * interval '10 minutes') - interval '2 minutes' as started_at,
  tick - (n * interval '10 minutes')       as completed_at
from (select date_trunc('hour', now())
             + floor(extract(minute from now()) / 10) * interval '10 minutes' as tick) t,
     generate_series(0, 5) as n;

-- -----------------------------------------------------------------------------
-- drmc_analytics: serving views and RPCs
-- -----------------------------------------------------------------------------

-- Timer hours per member per Eastern work day. Overlapping timers are NOT
-- double counted: the hours are the length of the UNION of the closed
-- intervals. An entry belongs to the day it STARTED on, so an entry that
-- crosses midnight stays whole on its start day.
create materialized view if not exists drmc_analytics.mv_timer_day_rollup as
with entries as (
  select lower(t.user_email) as user_email,
         (t.start_time at time zone 'America/New_York')::date as work_day,
         t.start_time, t.end_time
  from drmc_staging.stg_timer_activities_clean t
),
closed as (
  select e.*,
         max(e.end_time) over (partition by e.user_email, e.work_day
                               order by e.start_time, e.end_time
                               rows between unbounded preceding and 1 preceding) as prev_max_end
  from entries e
  where e.end_time is not null
),
islands as (
  select c.*,
         sum(case when c.prev_max_end is null or c.start_time > c.prev_max_end then 1 else 0 end)
           over (partition by c.user_email, c.work_day order by c.start_time, c.end_time) as island
  from closed c
),
merged as (
  select user_email, work_day, island, min(start_time) as s, max(end_time) as e
  from islands
  group by user_email, work_day, island
),
timed as (
  select user_email, work_day, round((sum(extract(epoch from (e - s))) / 3600.0)::numeric, 2) as timed_hours
  from merged
  group by user_email, work_day
),
counts as (
  select user_email, work_day,
         count(*)::int as entry_count,
         (count(*) filter (where end_time is null))::int as open_timer_count
  from entries
  group by user_email, work_day
)
select c.user_email, c.work_day, t.timed_hours, c.open_timer_count, c.entry_count
from counts c
left join timed t using (user_email, work_day)
with no data;

create unique index if not exists mv_timer_day_rollup_pk
  on drmc_analytics.mv_timer_day_rollup (user_email, work_day);
create index if not exists mv_timer_day_rollup_day_idx
  on drmc_analytics.mv_timer_day_rollup (work_day desc);

-- The roster, one row per person.
create or replace view drmc_analytics.v_employee_directory as
select e.emp_id, e.full_name, e.report_display_name, e.first_name, e.last_name, e.middle_name,
       e.nickname, e.email, e.position, e.carrier_group, e.carrier, e.cluster, e.division,
       e.sub_division, e.work_schedule, e.shift_schedule, e.shift_time_in_pht, e.shift_time_out_pht,
       e.employment_status, e.immediate_supervisor, e.hire_date, e.regularization_date,
       e.resignation_date, e.is_active
from drmc_demo.employee e;

create or replace view drmc_analytics.v_employee_schedule_history as
select s.emp_id, e.report_display_name as member_name, s.role, s.sheet_tab,
       s.shift_start_pht, s.shift_end_pht, s.shift_start_et, s.shift_end_et, s.shift_code,
       s.work_arrangement, s.reg_hours, s.rest_day, s.start_date, s.end_date, s.change_kind, s.notes,
       (s.start_date <= current_date and (s.end_date is null or s.end_date >= current_date)) as is_current
from drmc_demo.schedule_change s
join drmc_demo.employee e using (emp_id);

-- THE serving view for every approvals surface: one row per daily report.
--
-- Approval overlay: a report is approved when the seed says so OR when the app
-- has a successful row in report_approval_log. That is what makes an approve
-- visible to every reader on the next query, without touching the base data.
-- pm_status = 'already_approved' flips the status but does NOT credit the
-- approver (someone else had already approved it).
create or replace view drmc_analytics.v_daily_report_approvals as
select
  r.emp_id,
  e.report_display_name                      as employee_name,
  e.email,
  e.position,
  e.carrier_group,
  e.division,
  r.work_date,
  extract(dow from r.work_date)::int         as work_dow,
  r.task_did,
  s.task_status,
  r.asset_name,
  r.milestone,
  r.clock_in_et,
  r.submitted_on_et,
  s.approved_on_et,
  r.total_hours,
  r.assigned_approver,
  (r.assigned_approver is null)              as no_approver_flag,
  s.approved_by,
  case when s.approved_on_et is not null and r.submitted_on_et is not null
       then (s.approved_on_et::date - r.submitted_on_et::date) end as approval_latency_days,
  case when s.task_status = 'submitted' and r.submitted_on_et is not null
       then greatest(((now() at time zone 'America/New_York')::date - r.submitted_on_et::date), 0) end
                                             as pending_wait_days,
  (s.task_status = 'submitted')              as is_awaiting_approval,
  e.shift_time_in_pht,
  t.timed_hours,
  coalesce(t.open_timer_count, 0)            as open_timer_count,
  exists (select 1 from drmc_staging.stg_timer_activities_clean h
           where lower(h.user_email) = lower(e.email))            as has_timer_history,
  v.variance_hours,
  v.coverage_pct
from drmc_demo.daily_report r
join drmc_demo.employee e using (emp_id)
left join drmc_app.report_approval_log k
       on k.task_did = r.task_did and k.ok
left join drmc_demo.employee ke
       on lower(ke.email) = lower(k.approver_email)
left join drmc_analytics.mv_timer_day_rollup t
       on t.user_email = lower(e.email) and t.work_day = r.work_date
cross join lateral (
  select
    case when k.task_did is not null and r.seed_status = 'submitted' then 'approved' else r.seed_status end as task_status,
    coalesce(r.approved_on_et,
             case when k.task_did is not null and r.seed_status = 'submitted'
                  then (k.approved_at at time zone 'America/New_York') end)                                as approved_on_et,
    coalesce(r.approved_by,
             case when k.pm_status = 'approved' and r.seed_status = 'submitted'
                  then coalesce(ke.report_display_name, k.approver_email) end)                             as approved_by
) s
cross join lateral (
  select greatest(r.total_hours - 1, 0) as stated_net          -- 1 h unpaid break
) n
cross join lateral (
  select
    case when coalesce(t.open_timer_count, 0) = 0 and t.timed_hours is not null and n.stated_net > 0
         then round(n.stated_net - t.timed_hours, 2) end                       as variance_hours,
    case when coalesce(t.open_timer_count, 0) = 0 and t.timed_hours is not null and n.stated_net > 0
         then round(100 * t.timed_hours / n.stated_net, 0) end                 as coverage_pct
) v;

-- The hours-analysis view of the same reports: stated vs timed.
create or replace view drmc_analytics.v_hr_report_review as
select a.emp_id, a.employee_name, a.email, a.position, a.carrier_group, a.division, a.work_date, a.work_dow,
       a.task_did, a.task_status, a.clock_in_et, a.submitted_on_et, a.approved_on_et,
       a.total_hours                       as stated_hours,
       greatest(a.total_hours - 1, 0)      as stated_hours_net,
       a.timed_hours, a.open_timer_count, a.has_timer_history, a.variance_hours, a.coverage_pct
from drmc_analytics.v_daily_report_approvals a;

-- Filter option lists.
create or replace view drmc_analytics.v_division_options as
select distinct e.carrier_group as division
from drmc_demo.employee e
where e.carrier_group is not null;

create or replace view drmc_analytics.v_approver_options as
select q.value, coalesce(g.display_label, q.value) as label
from (select distinct r.assigned_approver as value
        from drmc_demo.daily_report r
       where r.assigned_approver is not null) q
left join drmc_demo.approver_group g on g.label = q.value;

-- KPIs + backlog for the awaiting queue, under the same filters as the row
-- query. Wait tiers: on time <= 2 days, amber 3-5, red > 5 (lib/hr/domain/approval-sla.ts).
create or replace function drmc_analytics.approval_queue_summary(
  p_carrier_group text default null,
  p_carrier_groups text[] default null,
  p_division text default null,
  p_search text default null
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with q as (
    select a.*
    from drmc_analytics.v_daily_report_approvals a
    where a.is_awaiting_approval
      and (p_carrier_groups is null or a.carrier_group = any (p_carrier_groups))
      and (p_carrier_groups is not null or p_carrier_group is null or a.carrier_group = p_carrier_group)
      and (p_division is null or a.division = p_division)
      and (p_search is null or p_search = ''
           or a.employee_name ilike '%' || p_search || '%'
           or a.emp_id ilike '%' || p_search || '%')
  ),
  backlog as (
    select coalesce(q.assigned_approver, '(unassigned)') as grp,
           count(*)::int as waiting,
           (count(*) filter (where q.pending_wait_days between 3 and 5))::int as amber,
           (count(*) filter (where q.pending_wait_days > 5))::int as red
    from q
    group by 1
  )
  select jsonb_build_object(
    'kpis', (select jsonb_build_object(
               'awaiting', count(*)::int,
               'amber', (count(*) filter (where q.pending_wait_days between 3 and 5))::int,
               'red', (count(*) filter (where q.pending_wait_days > 5))::int,
               'oldest_wait_days', coalesce(max(q.pending_wait_days), 0)::int,
               'no_approver', (count(*) filter (where q.no_approver_flag))::int)
             from q),
    'backlog', coalesce((select jsonb_agg(jsonb_build_object(
                           'group', b.grp, 'waiting', b.waiting, 'amber', b.amber, 'red', b.red)
                         order by b.waiting desc, b.grp)
                         from backlog b), '[]'::jsonb)
  );
$$;

-- Group-grain approver scorecard. Every date-sensitive metric windows on the
-- report WORK DATE; employees (headcount) is a current snapshot.
--   filed late = submitted after the filing window (48 h after clock-in, 60 h
--                for a Friday work date); excluded from on time AND late, the
--                approver could not have been on time.
--   on time    = approved within 2 days of submission.
--   late       = approved later than that, or still waiting past it.
create or replace function drmc_analytics.approver_scorecard(p_from date default null, p_to date default null)
returns table (
  group_label text, display_label text, carrier_group text, employees integer,
  pending integer, pending_employees integer, approvers integer, approved_count integer,
  on_time_count integer, late_count integer, filed_late_count integer, avg_latency_days numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with base as (
    select a.*,
           coalesce(a.assigned_approver, '(no approver assigned)') as grp,
           (a.submitted_on_et is not null and a.clock_in_et is not null
            and a.submitted_on_et > a.clock_in_et
                + case when a.work_dow = 5 then interval '60 hours' else interval '48 hours' end) as filed_late
    from drmc_analytics.v_daily_report_approvals a
    where a.task_status in ('submitted', 'approved')
      and (p_from is null or a.work_date >= p_from)
      and (p_to is null or a.work_date <= p_to)
  ),
  head as (
    select coalesce(r.assigned_approver, '(no approver assigned)') as grp,
           count(distinct r.emp_id)::int as employees
    from drmc_demo.daily_report r
    join drmc_demo.employee e using (emp_id)
    where e.is_active
    group by 1
  )
  select
    b.grp,
    coalesce(g.display_label, b.grp),
    g.carrier_group,
    max(h.employees),
    (count(*) filter (where b.is_awaiting_approval))::int,
    (count(distinct b.emp_id) filter (where b.is_awaiting_approval))::int,
    (count(distinct b.approved_by) filter (where b.approved_by is not null))::int,
    (count(*) filter (where b.task_status = 'approved'))::int,
    (count(*) filter (where not b.filed_late and b.task_status = 'approved' and b.approval_latency_days <= 2))::int,
    (count(*) filter (where not b.filed_late
                        and ((b.task_status = 'approved' and b.approval_latency_days > 2)
                             or (b.is_awaiting_approval and b.pending_wait_days > 2))))::int,
    (count(*) filter (where b.filed_late))::int,
    round(avg(b.approval_latency_days) filter (where b.task_status = 'approved'), 1)
  from base b
  left join drmc_demo.approver_group g on g.label = b.grp
  left join head h on h.grp = b.grp
  group by b.grp, g.display_label, g.carrier_group
  order by 5 desc, 1;
$$;

-- The individuals who approve for one group (all time), most active first.
create or replace function drmc_analytics.group_approvers(p_group text)
returns table (approver text, approved_count integer)
language sql
stable
security definer
set search_path = ''
as $$
  select a.approved_by, count(*)::int
  from drmc_analytics.v_daily_report_approvals a
  where a.approved_by is not null
    and ((p_group = '(no approver assigned)' and a.assigned_approver is null)
         or a.assigned_approver = p_group)
  group by a.approved_by
  order by 2 desc, 1;
$$;

-- Approver scope, assignment first: the queues / members the roster assigns to
-- this approver ...
create or replace function drmc_analytics.dr_assigned_groups_for_email(p_email text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct x.approver_group
  from drmc_reference.ref_employee_approvers x
  where x.kind = 'dr' and x.approver_group is not null
    and lower(x.approver_email) = lower(p_email)
  order by 1;
$$;

create or replace function drmc_analytics.dr_assigned_members_for_email(p_email text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct x.emp_id
  from drmc_reference.ref_employee_approvers x
  where x.kind = 'dr' and lower(x.approver_email) = lower(p_email)
  order by 1;
$$;

-- ... and the history fallback for approvers the roster does not list: the
-- queues they have cleared a report in, and the people they have approved.
create or replace function drmc_analytics.approver_groups_for_email(p_email text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct a.assigned_approver
  from drmc_analytics.v_daily_report_approvals a
  join drmc_demo.employee e on lower(e.email) = lower(p_email)
  where a.assigned_approver is not null
    and a.approved_by = e.report_display_name
  order by 1;
$$;

create or replace function drmc_analytics.approved_members_for_email(p_email text)
returns setof text
language sql
stable
security definer
set search_path = ''
as $$
  select distinct a.emp_id
  from drmc_analytics.v_daily_report_approvals a
  join drmc_demo.employee e on lower(e.email) = lower(p_email)
  where a.approved_by = e.report_display_name
  order by 1;
$$;

-- Submitted reports with NO approver assigned, scoped to the approver's
-- assigned members (p_all = true drops the scope).
create or replace function drmc_analytics.dr_unassigned_reports_for_email(p_email text, p_all boolean default false)
returns table (
  task_did text, emp_id text, employee_name text, member_email text, work_date date,
  asset_name text, milestone text, submitted_on_et timestamp, pending_wait_days integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select a.task_did, a.emp_id, a.employee_name, a.email, a.work_date,
         a.asset_name, a.milestone, a.submitted_on_et, a.pending_wait_days
  from drmc_analytics.v_daily_report_approvals a
  where a.is_awaiting_approval
    and a.assigned_approver is null
    and (p_all or a.emp_id in (select x.emp_id
                                 from drmc_reference.ref_employee_approvers x
                                where x.kind = 'dr' and lower(x.approver_email) = lower(p_email)))
  order by a.submitted_on_et, a.task_did;
$$;

-- -----------------------------------------------------------------------------
-- DR monitoring: filing compliance
-- -----------------------------------------------------------------------------

-- One row per DUE work day: every daily report, plus every working day that has
-- timer evidence but no report at all (the timers are the proof the day was
-- worked, so leave and rest days are never flagged).
--   deadline   = clock-in + 48 h (60 h for a Friday work date)
--   matured    = the deadline has passed, so the day can be graded
--   late       = filed after the deadline
--   missing    = still not filed once the deadline has passed
create or replace view drmc_analytics.v_filing_compliance as
with due as (
  select r.emp_id, r.work_date, r.task_did, r.clock_in_et, r.submitted_on_et
    from drmc_demo.daily_report r
  union all
  select e.emp_id, t.work_day, null::text, f.first_start_et, null::timestamp
    from drmc_analytics.mv_timer_day_rollup t
    join drmc_demo.employee e on lower(e.email) = t.user_email
    cross join lateral (
      select min(x.start_time at time zone 'America/New_York') as first_start_et
        from drmc_staging.stg_timer_activities_clean x
       where lower(x.user_email) = t.user_email
         and x.start_time >= (t.work_day::timestamp at time zone 'America/New_York')
         and x.start_time <  ((t.work_day + 1)::timestamp at time zone 'America/New_York')
    ) f
   where extract(dow from t.work_day) between 1 and 5
     and t.work_day < (now() at time zone 'America/New_York')::date
     and not exists (select 1 from drmc_demo.daily_report r
                      where r.emp_id = e.emp_id and r.work_date = t.work_day)
)
select
  d.emp_id,
  e.report_display_name                        as employee_name,
  e.carrier_group,
  d.work_date,
  extract(dow from d.work_date)::int           as work_dow,
  d.task_did,
  d.clock_in_et,
  d.submitted_on_et,
  x.deadline_et,
  (x.now_et >= x.deadline_et)                  as is_matured,
  (d.submitted_on_et is not null)              as is_filed,
  (d.submitted_on_et is not null and d.submitted_on_et > x.deadline_et) as is_late,
  (d.submitted_on_et is null and x.now_et >= x.deadline_et)             as is_missing,
  case when d.submitted_on_et is not null
       then round((extract(epoch from (d.submitted_on_et - d.clock_in_et)) / 3600.0)::numeric, 1) end as filing_lag_hours,
  case when d.submitted_on_et is null and x.now_et >= x.deadline_et
       then (x.now_et::date - x.deadline_et::date) end                 as days_overdue
from due d
join drmc_demo.employee e using (emp_id)
cross join lateral (
  select d.clock_in_et + case when extract(dow from d.work_date) = 5
                              then interval '60 hours' else interval '48 hours' end as deadline_et,
         (now() at time zone 'America/New_York') as now_et
) x;

-- The DR monitoring dashboard for one work-date range: KPIs, a per-day trend and
-- the late rate per group. Rates are computed on MATURED days only. The trend
-- is clipped to the days the data covers, so an "all dates" range stays small.
create or replace function drmc_analytics.review_summary(p_from date, p_to date)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with f as (
    select c.* from drmc_analytics.v_filing_compliance c
     where c.work_date between p_from and p_to
  ),
  kp as (
    select (count(*) filter (where f.is_matured))::int                 as matured,
           (count(*) filter (where f.is_late))::int                    as late,
           (count(*) filter (where f.is_missing))::int                 as missing,
           (count(*) filter (where f.is_matured and f.is_filed))::int  as filed_matured,
           (percentile_cont(0.5) within group (order by f.filing_lag_hours) filter (where f.is_filed))::numeric as med,
           (percentile_cont(0.9) within group (order by f.filing_lag_hours) filter (where f.is_filed))::numeric as p90
    from f
  ),
  bounds as (
    select greatest(p_from, (select min(r.work_date) from drmc_demo.daily_report r)) as d_from,
           least(p_to, (now() at time zone 'America/New_York')::date)               as d_to
  ),
  days as (
    select s::date as d
    from bounds b, generate_series(b.d_from::timestamp, b.d_to::timestamp, interval '1 day') s
    where b.d_from is not null and b.d_from <= b.d_to
  ),
  trend as (
    select dd.d,
           (count(f.emp_id) filter (where f.is_late))::int                    as late,
           (count(f.emp_id) filter (where f.is_missing))::int                 as missing,
           (count(f.emp_id) filter (where f.is_filed))::int                   as filed_n,
           (count(f.emp_id) filter (where f.is_filed and not f.is_late))::int as on_time,
           bool_and(f.is_matured)                                             as matured
    from days dd
    left join f on f.work_date = dd.d
    group by dd.d
  ),
  grp as (
    select f.carrier_group,
           count(*)::int                                as n,
           (count(*) filter (where f.is_late))::int     as late
    from f
    where f.is_matured and f.is_filed
    group by f.carrier_group
  )
  select jsonb_build_object(
    'kpis', (select jsonb_build_object(
               'matured', kp.matured,
               'late', kp.late,
               'on_time_pct', case when kp.filed_matured > 0
                                   then round(100.0 * (kp.filed_matured - kp.late) / kp.filed_matured, 1) end,
               'missing', kp.missing,
               'median_lag_hours', round(kp.med, 1),
               'p90_lag_hours', round(kp.p90, 1),
               'high_variance', (select count(*)::int
                                   from drmc_analytics.v_daily_report_approvals a
                                  where a.work_date between p_from and p_to
                                    and a.coverage_pct <= 85))
             from kp),
    'trend', coalesce((select jsonb_agg(jsonb_build_object(
                         'd', t.d, 'late', t.late, 'missing', t.missing,
                         'filed_n', t.filed_n, 'on_time', t.on_time, 'matured', t.matured)
                       order by t.d) from trend t), '[]'::jsonb),
    'groups', coalesce((select jsonb_agg(jsonb_build_object(
                          'carrier_group', g.carrier_group, 'n', g.n, 'late', g.late,
                          'late_pct', round(100.0 * g.late / g.n, 1))
                        order by (1.0 * g.late / g.n) desc, g.carrier_group)
                        from grp g), '[]'::jsonb)
  );
$$;

-- The unfiled pile as of now (no date range): total, the oldest, five age
-- buckets by days past the filing deadline, and the oldest few rows to chase.
create or replace function drmc_analytics.review_backlog()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with m as (
    select c.* from drmc_analytics.v_filing_compliance c where c.is_missing
  ),
  b(ord, label, lo, hi) as (
    values (1, '0-2d', 0, 2), (2, '3-5d', 3, 5), (3, '6-10d', 6, 10), (4, '11-20d', 11, 20), (5, '21d+', 21, 100000)
  )
  select jsonb_build_object(
    'total', (select count(*)::int from m),
    'oldest_days', (select max(m.days_overdue)::int from m),
    'buckets', (select jsonb_agg(jsonb_build_object(
                  'label', b.label,
                  'n', (select count(*)::int from m where m.days_overdue between b.lo and b.hi))
                order by b.ord) from b),
    'oldest', coalesce((select jsonb_agg(jsonb_build_object(
                          'employee_name', o.employee_name, 'carrier_group', o.carrier_group,
                          'work_date', o.work_date, 'days_overdue', o.days_overdue)
                        order by o.days_overdue desc, o.work_date, o.employee_name)
                        from (select m.* from m order by m.days_overdue desc, m.work_date, m.employee_name limit 8) o),
                       '[]'::jsonb)
  );
$$;

-- Approver-side compliance, as of now. Same rules as approver_scorecard:
-- on time = approved within 2 days of submission; late = approved later, or
-- still waiting past 2 days; a report filed late is excluded from grading.
--   periods  the last 8 work weeks (Monday start), oldest first. A week closes
--            for grading two days after it ends; until then it is "in flight".
--   overdue  every report waiting past the window right now, by days over.
create or replace function drmc_analytics.approval_compliance()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  -- Named columns, not a.*: this CTE is read three times, so it is materialized,
  -- and a.* would compute every column of the view for every report.
  with base as (
    select a.task_did, a.task_status, a.is_awaiting_approval, a.approval_latency_days, a.pending_wait_days,
           date_trunc('week', a.work_date)::date as week_start,
           (a.submitted_on_et is not null and a.clock_in_et is not null
            and a.submitted_on_et > a.clock_in_et
                + case when a.work_dow = 5 then interval '60 hours' else interval '48 hours' end) as filed_late
    from drmc_analytics.v_daily_report_approvals a
    where a.task_status in ('submitted', 'approved')
  ),
  today as (select (now() at time zone 'America/New_York')::date as d),
  weeks as (
    select (date_trunc('week', t.d)::date - 7 * n) as week_start
    from today t, generate_series(0, 7) n
  ),
  periods as (
    select w.week_start,
           (count(b.task_did) filter (where not b.filed_late and b.task_status = 'approved' and b.approval_latency_days <= 2))::int as on_time,
           (count(b.task_did) filter (where not b.filed_late
                  and ((b.task_status = 'approved' and b.approval_latency_days > 2)
                       or (b.is_awaiting_approval and b.pending_wait_days > 2))))::int as late,
           (count(b.task_did) filter (where b.filed_late))::int as filed_late,
           (count(b.task_did) filter (where not b.filed_late and b.is_awaiting_approval and b.pending_wait_days <= 2))::int as pending_not_due
    from weeks w
    left join base b on b.week_start = w.week_start
    group by w.week_start
  ),
  od as (
    select b.filed_late, (b.pending_wait_days - 2) as days_over
    from base b
    where b.is_awaiting_approval and b.pending_wait_days > 2
  )
  select jsonb_build_object(
    'today', (select t.d from today t),
    'periods', (select jsonb_agg(jsonb_build_object(
                  'period_start', p.week_start, 'period_end', p.week_start + 6, 'deadline', p.week_start + 8,
                  'on_time', p.on_time, 'late', p.late, 'filed_late', p.filed_late,
                  'pending_not_due', p.pending_not_due)
                order by p.week_start) from periods p),
    'overdue', (select jsonb_build_object(
                  'total', (count(*) filter (where not od.filed_late))::int,
                  'oldest_days', (max(od.days_over) filter (where not od.filed_late))::int,
                  'b1_2', (count(*) filter (where not od.filed_late and od.days_over between 1 and 2))::int,
                  'b3_5', (count(*) filter (where not od.filed_late and od.days_over between 3 and 5))::int,
                  'b6_10', (count(*) filter (where not od.filed_late and od.days_over between 6 and 10))::int,
                  'b11p', (count(*) filter (where not od.filed_late and od.days_over >= 11))::int,
                  'filed_late_pending', (count(*) filter (where od.filed_late))::int)
                from od),
    'due_soon', (select count(*)::int from base b
                  where not b.filed_late and b.is_awaiting_approval and b.pending_wait_days <= 2)
  );
$$;

-- -----------------------------------------------------------------------------
-- Activity log dashboard
-- -----------------------------------------------------------------------------

-- App usage for one date range, from the audit log: KPIs, two bucketed series
-- (day / week / month, on Asia/Manila calendar days), the most active approvers
-- and the most common failure reasons (from the approve-attempt log). The series
-- start is clipped to the first audit row, so a wide range stays small.
create or replace function drmc_analytics.activity_dashboard(p_from date, p_to date, p_group text default 'day')
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with u as (
    select case when p_group in ('day', 'week', 'month') then p_group else 'day' end as unit
  ),
  log as (
    select l.actor_email, l.action,
           (l.created_at at time zone 'Asia/Manila')::date as d,
           case when l.action like 'approval.%' and jsonb_typeof(l.detail -> 'approved') = 'number'
                then (l.detail ->> 'approved')::int else 0 end as approved,
           case when l.action like 'approval.%' and jsonb_typeof(l.detail -> 'failed') = 'number'
                then (l.detail ->> 'failed')::int else 0 end as failed
    from drmc_app.hr_audit_log l
    where (l.created_at at time zone 'Asia/Manila')::date between p_from and p_to
  ),
  bounds as (
    select greatest(p_from, (select min((l.created_at at time zone 'Asia/Manila')::date) from drmc_app.hr_audit_log l)) as d_from,
           least(p_to, (now() at time zone 'Asia/Manila')::date) as d_to
  ),
  buckets as (
    select distinct date_trunc(u.unit, s)::date as bucket
    from u, bounds b, generate_series(b.d_from::timestamp, b.d_to::timestamp, interval '1 day') s
    where b.d_from is not null and b.d_from <= b.d_to
  ),
  series as (
    select k.bucket,
           coalesce(sum(case when l.action = 'auth.sign_in' then 1 else 0 end), 0)::int as logins,
           coalesce(sum(l.approved), 0)::int as approvals
    from buckets k
    cross join u
    left join log l on date_trunc(u.unit, l.d::timestamp)::date = k.bucket
    group by k.bucket
  )
  select jsonb_build_object(
    'kpis', (select jsonb_build_object(
               'logins', (count(*) filter (where log.action = 'auth.sign_in'))::int,
               'active_users', count(distinct log.actor_email)::int,
               'approvals', coalesce(sum(log.approved), 0)::int,
               'failures', coalesce(sum(log.failed), 0)::int)
             from log),
    'logins_series', coalesce((select jsonb_agg(jsonb_build_object('bucket', s.bucket, 'n', s.logins) order by s.bucket) from series s), '[]'::jsonb),
    'approvals_series', coalesce((select jsonb_agg(jsonb_build_object('bucket', s.bucket, 'n', s.approvals) order by s.bucket) from series s), '[]'::jsonb),
    'top_approvers', coalesce((select jsonb_agg(jsonb_build_object('email', t.actor_email, 'n', t.n) order by t.n desc, t.actor_email)
                                 from (select log.actor_email, sum(log.approved)::int as n
                                         from log group by 1 having sum(log.approved) > 0
                                        order by 2 desc, 1 limit 5) t), '[]'::jsonb),
    'top_failures', coalesce((select jsonb_agg(jsonb_build_object('reason', t.reason, 'http_status', t.http_status, 'n', t.n) order by t.n desc, t.reason)
                                from (select coalesce(k.error_reason, 'unknown') as reason, k.http_status, count(*)::int as n
                                        from drmc_app.report_approval_log k
                                       where not k.ok
                                         and (k.approved_at at time zone 'Asia/Manila')::date between p_from and p_to
                                       group by 1, 2 order by 3 desc, 1 limit 5) t), '[]'::jsonb)
  );
$$;

-- -----------------------------------------------------------------------------
-- Security: RLS everywhere, no policies, service_role only.
-- -----------------------------------------------------------------------------
do $$
declare
  r record;
begin
  -- RLS on every table in every drmc_* schema (no policies are ever created).
  for r in
    select n.nspname, c.relname
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where c.relkind = 'r' and n.nspname like 'drmc\_%'
  loop
    execute format('alter table %I.%I enable row level security', r.nspname, r.relname);
  end loop;

  -- Functions: nobody but service_role may execute.
  for r in
    select p.oid::regprocedure as sig, n.nspname
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname like 'drmc\_%'
  loop
    execute format('revoke all on function %s from public, anon, authenticated, service_role', r.sig);
    if r.nspname <> 'drmc_demo' then
      execute format('grant execute on function %s to service_role', r.sig);
    end if;
  end loop;
end;
$$;

-- Schemas: anon/authenticated get nothing, not even USAGE.
revoke all on schema drmc_app, drmc_analytics, drmc_staging, drmc_reference, drmc_pipeline, drmc_demo
  from public, anon, authenticated;
revoke all on all tables in schema drmc_app, drmc_analytics, drmc_staging, drmc_reference, drmc_pipeline, drmc_demo
  from public, anon, authenticated;
revoke all on all sequences in schema drmc_app, drmc_analytics, drmc_staging, drmc_reference, drmc_pipeline, drmc_demo
  from public, anon, authenticated;

-- service_role: the five API schemas. drmc_demo is deliberately absent; the
-- views and SECURITY DEFINER functions above read it on the caller's behalf.
grant usage on schema drmc_app, drmc_analytics, drmc_staging, drmc_reference, drmc_pipeline to service_role;
grant select, insert, update, delete on all tables in schema drmc_app to service_role;
grant usage, select on all sequences in schema drmc_app to service_role;
grant select on all tables in schema drmc_analytics, drmc_staging, drmc_reference, drmc_pipeline to service_role;

-- Reset is run by pg_cron (as the owner), never through the API.
revoke all on schema drmc_demo from service_role;

notify pgrst, 'reload schema';
