-- =============================================================================
-- DRMC demo: seed (idempotent). Defines drmc_demo.load_seed().
--
-- Apply AFTER supabase/schema.sql. This file only DEFINES the loaders;
-- supabase/reset_demo.sql calls it. Everything it writes is INVENTED: people,
-- teams, clients, sites, tasks and numbers. Nothing here references or alters
-- any object outside the drmc_* schemas.
--
-- Deterministic: there is no random(). Every "random" choice is a hash of a
-- stable key (drmc_demo.h / drmc_demo.u), and every date is relative to
-- current_date, so two loads on the same day produce the same data and the
-- queue always looks recent.
--
-- Shape: 42 people in 4 production groups (+ 2 managers), 6 approvers, the last
-- 60 working days of daily reports (~2,400, ~12 % awaiting approval and
-- concentrated in the last two weeks, some filed late, a few missing), ~13k
-- timer entries (some overlapping, late-shift entries crossing midnight, a few
-- still running), one group whose stated hours run ahead of its timers so the
-- heatmap has a story, schedule history, and the demo user.
-- =============================================================================

-- Stable pseudo-random helpers: a hash of the key, not random().
create or replace function drmc_demo.h(p_key text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select (('x' || substr(md5(p_key), 1, 7))::bit(28)::int);
$$;

create or replace function drmc_demo.u(p_key text)
returns numeric
language sql
immutable
set search_path = ''
as $$
  select ((('x' || substr(md5(p_key), 1, 7))::bit(28)::int) % 100000) / 100000.0;
$$;

create or replace function drmc_demo.load_seed()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  first_names text[] := array[
    'Ada','Bram','Chidi','Dalia','Emeka','Freya','Goran','Hana','Idris','Jonas',
    'Keiko','Lior','Mira','Nils','Oksana','Pablo','Quinn','Rania','Soren','Tamsin',
    'Ulla','Viktor','Wren','Xavi','Yara','Zane','Anouk','Bastien','Callum','Dorit',
    'Elio','Fumiko','Gideon','Helga','Ilya','Jorun','Kasper','Leila','Matteo','Nadia',
    'Demo','Priya'];
  last_names text[] := array[
    'Lindqvist','Okafor','Marchetti','Novak','Haddad','Brennan','Kowalski','Tanabe','Rosenthal','Dubois',
    'Petrov','Ishikawa','Moreau','Janssen','Oyelaran','Varga','Castellano','Eriksen','Mbeki','Halloran',
    'Fontaine','Sorensen','Achterberg','Bianchi','Horvat','Lemaire','Nyberg','Quaranta','Richter','Salminen',
    'Tesfaye','Ullmann','Vasquez','Whitlock','Yilmaz','Zielinski','Abernathy','Brightwater','Coldwell','Dunmore',
    'Manager','Everhart'];
  positions text[] := array[
    'Field Analyst I','Field Analyst II','Field Analyst III','Field Associate I','Field Associate II','Project Coordinator'];
  site_a text[] := array['Amber','Birch','Cedar','Dune','Elm','Fern','Granite','Harbor','Iron','Juniper','Kestrel','Larch'];
  site_b text[] := array['Hollow','Landing','Ridge','Crossing','Meadow','Quarry','Terrace','Wharf'];
  prod_tasks text[] := array[
    'Design Review','Drawing Update','Data Prep Complete','Data Entry Complete',
    'Package Assembly','Quality Check','Revision Complete','Site Audit'];
  overhead_tasks text[] := array['General Admin','Training','Coaching Session','Tools and Automation','Team Meeting'];
begin
  truncate drmc_staging.stg_timer_activities_clean,
           drmc_staging.stg_daily_report_hours,
           drmc_reference.ref_employee_approvers,
           drmc_demo.schedule_change,
           drmc_demo.daily_report,
           drmc_demo.approver_group,
           drmc_demo.employee
           restart identity cascade;

  -- ---------------------------------------------------------------- groups
  insert into drmc_demo.approver_group (label, display_label, carrier_group) values
    ('Daily Report Approvers - Group A', 'Group A', 'Group A - Carrier A'),
    ('Daily Report Approvers - Group B', 'Group B', 'Group B - Carrier B'),
    ('Daily Report Approvers - Group C Fiber', 'Group C Fiber', 'Group C - Carrier C/Fiber'),
    ('Daily Report Approvers - Group C Rural', 'Group C Rural', 'Group C - Carrier C/Rural');

  -- ------------------------------------------------------------- employees
  -- n 1-10 Group A, 11-20 Group B, 21-28 Group C Fiber, 29-36 Group C Rural,
  -- 37-40 the four team leads, 41 the demo user (a manager), 42 a second manager.
  insert into drmc_demo.employee (
    emp_id, first_name, last_name, middle_name, nickname, full_name, report_display_name, email,
    position, carrier_group, carrier, cluster, division, sub_division, work_schedule, shift_schedule,
    shift_time_in_pht, shift_time_out_pht, employment_status, immediate_supervisor,
    hire_date, regularization_date, resignation_date, is_active)
  select
    '26' || lpad(n::text, 4, '0'),
    first_names[n], last_names[n], null, first_names[n],
    last_names[n] || ', ' || first_names[n],
    first_names[n] || ' ' || last_names[n],
    case when n = 41 then 'demo@example.com'
         else lower(first_names[n] || '.' || last_names[n]) || '@example.com' end,
    case when n between 37 and 40 then 'Team Lead'
         when n >= 41 then 'Delivery Manager'
         else positions[1 + (n % 6)] end,
    g.carrier_group, g.carrier, g.cluster,
    case when n >= 41 then 'Operations' else 'Delivery' end,
    case when n >= 41 then 'Management' else 'Production' end,
    '5 days / week',
    case when n <= 36 and n % 6 = 0 then 'Late shift' else 'Day shift' end,
    case when n <= 36 and n % 6 = 0 then '4:00 AM' else '8:00 PM' end,
    case when n <= 36 and n % 6 = 0 then '1:00 PM' else '5:00 AM' end,
    case when n % 9 = 0 then 'Probationary' else 'Regular' end,
    g.lead_name,
    current_date - (400 + (n * 37) % 900),
    case when n % 9 = 0 then null else current_date - (220 + (n * 37) % 900) end,
    case when n in (7, 23) then current_date - 18 end,
    n not in (7, 23)
  from generate_series(1, 42) n
  cross join lateral (
    select
      case when n between 1 and 10 or n = 37 then 'Group A - Carrier A'
           when n between 11 and 20 or n = 38 then 'Group B - Carrier B'
           when n between 21 and 28 or n = 39 then 'Group C - Carrier C/Fiber'
           when n between 29 and 36 or n = 40 then 'Group C - Carrier C/Rural'
           else 'Operations' end as carrier_group,
      case when n between 1 and 10 or n = 37 then 'Carrier A'
           when n between 11 and 20 or n = 38 then 'Carrier B'
           when n between 21 and 36 or n in (39, 40) then 'Carrier C' end as carrier,
      case when n % 2 = 0 then 'Cluster East' else 'Cluster West' end as cluster,
      case when n between 1 and 10 then first_names[37] || ' ' || last_names[37]
           when n between 11 and 20 then first_names[38] || ' ' || last_names[38]
           when n between 21 and 28 then first_names[39] || ' ' || last_names[39]
           when n between 29 and 36 then first_names[40] || ' ' || last_names[40]
           when n in (37, 38) then first_names[41] || ' ' || last_names[41]
           when n in (39, 40) then first_names[42] || ' ' || last_names[42] end as lead_name
  ) g;

  -- ------------------------------------------------ approver assignments
  -- rank 1 = the group's team lead, rank 2 = a manager. The demo user manages
  -- Groups A and B, so Home shows them as "your groups".
  insert into drmc_reference.ref_employee_approvers (emp_id, kind, rank, approver_name, approver_email, approver_emp_id, approver_group)
  select m.emp_id, 'dr', r.rank, a.report_display_name, a.email, a.emp_id, ag.label
  from drmc_demo.employee m
  join drmc_demo.approver_group ag on ag.carrier_group = m.carrier_group
  cross join (values (1), (2)) r(rank)
  join drmc_demo.employee a
    on a.emp_id = case
         when r.rank = 1 then case m.carrier_group
           when 'Group A - Carrier A' then '260037' when 'Group B - Carrier B' then '260038'
           when 'Group C - Carrier C/Fiber' then '260039' else '260040' end
         else case when m.carrier_group in ('Group A - Carrier A', 'Group B - Carrier B') then '260041' else '260042' end
       end
  where m.position <> 'Delivery Manager' and m.emp_id <> a.emp_id;

  -- --------------------------------------------------------- daily reports
  with days as (
    select d::date as work_date, row_number() over (order by d desc) as d_idx
    from generate_series(current_date - 100, current_date - 1, interval '1 day') d
    where extract(dow from d) between 1 and 5
  ),
  grid as (
    select e.*, d.work_date, d.d_idx,
           'DR-' || e.emp_id || '-' || to_char(d.work_date, 'YYYYMMDD') as task_did
    from drmc_demo.employee e
    join days d on d.d_idx <= 60
    where e.position <> 'Delivery Manager'
      and d.work_date >= e.hire_date
      and (e.resignation_date is null or d.work_date <= e.resignation_date)
  ),
  shaped as (
    select g.*,
           drmc_demo.u(g.task_did || 'status') as us,
           drmc_demo.u(g.task_did || 'late')   as ul,
           drmc_demo.u(g.task_did || 'appr')   as ua,
           drmc_demo.h(g.task_did || 'clock')  as hc,
           (g.work_date + make_interval(mins =>
              case when g.shift_schedule = 'Late shift'
                   then 15 * 60 + 30 + drmc_demo.h(g.task_did || 'clock') % 60
                   else 8 * 60 + drmc_demo.h(g.task_did || 'clock') % 120 end))::timestamp as clock_in_et,
           (8.5 + (drmc_demo.h(g.task_did || 'hours') % 4) * 0.5)::numeric(5, 2) as total_hours
    from grid g
    where drmc_demo.u(g.task_did || 'missing') >= 0.015           -- ~1.5 % of days have no report at all
  ),
  statused as (
    select s.*,
           case
             when s.d_idx = 1 then case when s.us < 0.12 then 'in_progress' when s.us < 0.92 then 'submitted' else 'approved' end
             when s.d_idx <= 5 then case when s.us < 0.90 then 'submitted' else 'approved' end
             when s.d_idx <= 10 then case when s.us < 0.35 then 'submitted' else 'approved' end
             when s.d_idx <= 25 then case when s.us < 0.012 then 'rejected' when s.us < 0.045 then 'submitted' else 'approved' end
             else case when s.us < 0.012 then 'rejected' when s.us < 0.016 then 'submitted' else 'approved' end
           end as seed_status
    from shaped s
  ),
  timed as (
    select t.*,
           case when t.seed_status = 'in_progress' then null
                when t.d_idx > 5 and t.ul < 0.06                  -- filed late: past the 48 h / 60 h window
                  then t.clock_in_et + make_interval(mins => (50 + drmc_demo.h(t.task_did || 'lag') % 40) * 60)
                else t.clock_in_et + make_interval(mins => (t.total_hours * 60)::int + 5 + drmc_demo.h(t.task_did || 'lag') % 175)
           end as submitted_on_et
    from statused t
  )
  insert into drmc_demo.daily_report (
    task_did, emp_id, work_date, seed_status, clock_in_et, submitted_on_et, approved_on_et,
    approved_by, total_hours, assigned_approver, asset_name, milestone)
  select
    t.task_did, t.emp_id, t.work_date, t.seed_status, t.clock_in_et, t.submitted_on_et,
    case when t.seed_status = 'approved' then
      least(
        t.submitted_on_et + make_interval(mins =>
          case when t.d_idx <= 10 then 240 + drmc_demo.h(t.task_did || 'apl') % 900          -- 4-19 h
               when t.ua < 0.80 then 240 + drmc_demo.h(t.task_did || 'apl') % 2160           -- 4-40 h
               when t.ua < 0.92 then 2880 + drmc_demo.h(t.task_did || 'apl') % 1440          -- 2-3 days
               else 5760 + drmc_demo.h(t.task_did || 'apl') % 5760 end),                     -- 4-8 days
        (now() at time zone 'America/New_York') - interval '1 hour')
    end,
    case when t.seed_status = 'approved' then
      case when drmc_demo.u(t.task_did || 'who') < 0.75 then t.immediate_supervisor
           else (select a.approver_name from drmc_reference.ref_employee_approvers a
                  where a.emp_id = t.emp_id and a.rank = 2) end
    end,
    t.total_hours,
    case when (t.seed_status = 'submitted' and t.d_idx <= 10 and drmc_demo.u(t.task_did || 'noappr') < 0.035)
           or drmc_demo.u(t.task_did || 'noappr') < 0.004
         then null
         else (select ag.label from drmc_demo.approver_group ag where ag.carrier_group = t.carrier_group) end,
    t.report_display_name || '_' || t.emp_id,
    to_char(t.work_date, 'MM') || '. ' || trim(to_char(t.work_date, 'Month'))
  from timed t;

  -- ---------------------------------------------------- requirement rows
  insert into drmc_staging.stg_daily_report_hours (task_did, req_id, work_description, hours_worked, req_status, file_uploaded_count)
  select r.task_did,
         r.task_did || '-r' || i,
         prod_tasks[1 + drmc_demo.h(r.task_did || 'rt' || i) % 8] || ' for '
           || site_a[1 + drmc_demo.h(r.task_did || 'rs' || i) % 12] || ' '
           || site_b[1 + drmc_demo.h(r.task_did || 'rb' || i) % 8] || ' '
           || lpad((drmc_demo.h(r.task_did || 'rn' || i) % 90 + 10)::text, 3, '0'),
         round(((r.total_hours - 1) / k.n)::numeric, 2),
         case when r.seed_status = 'in_progress' then 'in_progress' else 'completed' end,
         case when drmc_demo.u(r.task_did || 'rf' || i) < 0.30 then 1 + drmc_demo.h(r.task_did || 'rc' || i) % 3 else 0 end
  from drmc_demo.daily_report r
  cross join lateral (select 2 + drmc_demo.h(r.task_did || 'reqs') % 3 as n) k
  cross join lateral generate_series(1, k.n) i;

  -- ---------------------------------------------------------- timer entries
  -- One work day per person per working day, INCLUDING the few days with no
  -- report (the timers are the evidence that the day was worked).
  with days as (
    select d::date as work_date, row_number() over (order by d desc) as d_idx
    from generate_series(current_date - 100, current_date - 1, interval '1 day') d
    where extract(dow from d) between 1 and 5
  ),
  workday as (
    select e.emp_id, e.email, e.carrier_group, e.shift_schedule, d.work_date,
           'DR-' || e.emp_id || '-' || to_char(d.work_date, 'YYYYMMDD') as k,
           r.seed_status,
           coalesce(r.clock_in_et,
                    (d.work_date + make_interval(mins => 8 * 60 + drmc_demo.h(e.emp_id || d.work_date::text) % 120))::timestamp) as clock_in_et,
           greatest(coalesce(r.total_hours, 9) - 1, 0) as stated_net
    from drmc_demo.employee e
    join days d on d.d_idx <= 60
    left join drmc_demo.daily_report r on r.emp_id = e.emp_id and r.work_date = d.work_date
    where e.position <> 'Delivery Manager'
      and d.work_date >= e.hire_date
      and (e.resignation_date is null or d.work_date <= e.resignation_date)
  ),
  planned as (
    select w.*,
           4 + drmc_demo.h(w.k || 'n') % 4 as n,
           -- Share of the stated (net) hours that timers cover. Group C Rural and
           -- two people in Group B run well short: that is the story the heatmap tells.
           case
             when w.carrier_group = 'Group C - Carrier C/Rural' then 0.66 + drmc_demo.u(w.k || 'cov') * 0.28
             when w.emp_id in ('260013', '260017')              then 0.68 + drmc_demo.u(w.k || 'cov') * 0.20
             when w.carrier_group = 'Group B - Carrier B'       then 0.88 + drmc_demo.u(w.k || 'cov') * 0.13
             else 0.91 + drmc_demo.u(w.k || 'cov') * 0.11
           end as cover
    from workday w
  ),
  parts as (
    select p.*, i,
           1 + drmc_demo.h(p.k || 'w' || i) % 5
             + case when i = p.n then (case when p.shift_schedule = 'Late shift' then 9 else 4 end) else 0 end as w,
           2 + drmc_demo.h(p.k || 'g' || i) % 9 as gap_min
    from planned p
    cross join lateral generate_series(1, p.n) i
  ),
  sized as (
    select s.*,
           greatest(round(s.stated_net * 60 * s.cover * s.w / sum(s.w) over (partition by s.k)), 1)::int as dur_min
    from parts s
  ),
  placed as (
    select z.*,
           5 + coalesce(sum(z.dur_min + z.gap_min) over (partition by z.k order by z.i
                                                         rows between unbounded preceding and 1 preceding), 0) as start_off
    from sized z
  ),
  entries as (
    select pl.email, pl.carrier_group, pl.k, pl.i,
           (pl.clock_in_et + make_interval(mins => pl.start_off::int)) at time zone 'America/New_York' as start_time,
           pl.dur_min,
           (pl.seed_status = 'in_progress' and pl.i = pl.n) as is_open,
           drmc_demo.u(pl.k || 'oh' || pl.i) < 0.18 as is_overhead
    from placed pl
    union all
    -- A second timer left running alongside the first (about 15 % of days): it
    -- sits INSIDE entry 2, so the union of intervals must not count it twice.
    select pl.email, pl.carrier_group, pl.k, 100 + pl.i,
           (pl.clock_in_et + make_interval(mins => pl.start_off::int + 3)) at time zone 'America/New_York',
           least(pl.dur_min - 6, 25), false, true
    from placed pl
    where pl.i = 2 and pl.dur_min > 20 and drmc_demo.u(pl.k || 'overlap') < 0.15
  )
  insert into drmc_staging.stg_timer_activities_clean (
    user_email, project, site_name, task, task_clean, asset_did, start_time, end_time, duration_min)
  select
    en.email,
    case en.carrier_group
      when 'Group A - Carrier A' then 'Client North' when 'Group B - Carrier B' then 'Client South'
      when 'Group C - Carrier C/Fiber' then 'Client East' else 'Client West' end,
    case when en.is_overhead then null
         else site_a[1 + drmc_demo.h(en.k || 'sa' || (en.i % 3)) % 12] || ' '
              || site_b[1 + drmc_demo.h(en.k || 'sb' || (en.i % 3)) % 8] || ' '
              || lpad((drmc_demo.h(en.k || 'sn' || (en.i % 3)) % 90 + 10)::text, 3, '0') end,
    tk.prefix || tk.name,
    tk.name,
    case when en.is_overhead then null
         else 'AST-' || lpad((drmc_demo.h(en.k || 'sa' || (en.i % 3)) % 9000 + 1000)::text, 4, '0') end,
    en.start_time,
    case when en.is_open then null else en.start_time + make_interval(mins => en.dur_min) end,
    case when en.is_open then null else en.dur_min end
  from entries en
  cross join lateral (
    select case when en.is_overhead then overhead_tasks[1 + drmc_demo.h(en.k || 'ot' || en.i) % 5]
                else prod_tasks[1 + drmc_demo.h(en.k || 'pt' || en.i) % 8] end as name,
           case when drmc_demo.u(en.k || 'px' || en.i) < 0.5
                then (1 + drmc_demo.h(en.k || 'pn' || en.i) % 9)::text || '. ' else '' end as prefix
  ) tk;

  -- ------------------------------------------------------ schedule history
  insert into drmc_demo.schedule_change (
    emp_id, role, sheet_tab, shift_start_pht, shift_end_pht, shift_start_et, shift_end_et,
    shift_code, work_arrangement, reg_hours, rest_day, start_date, end_date, change_kind, notes)
  select e.emp_id, e.position, 'Schedule changes', e.shift_time_in_pht, e.shift_time_out_pht,
         case when e.shift_schedule = 'Late shift' then '4:00 PM' else '8:00 AM' end,
         case when e.shift_schedule = 'Late shift' then '1:00 AM' else '5:00 PM' end,
         case when e.shift_schedule = 'Late shift' then 'LS' else 'DS' end,
         '5DWW', 8, 'Sat / Sun', e.hire_date, null, 'ongoing', 'Standard schedule from hire.'
  from drmc_demo.employee e
  where e.position <> 'Delivery Manager' and substr(e.emp_id, 3)::int % 3 = 1
  union all
  select e.emp_id, e.position, 'Schedule changes', '10:00 PM', '7:00 AM', '10:00 AM', '7:00 PM',
         'DS', '5DWW', 8, 'Sat / Sun', current_date - 10, current_date + 11, 'temporary',
         'Temporary two-hour shift to cover a project hand-off. Agreed with the team lead.'
  from drmc_demo.employee e
  where e.position <> 'Delivery Manager' and substr(e.emp_id, 3)::int % 6 = 1
  union all
  select e.emp_id, e.position, 'Schedule changes', '6:00 PM', '3:00 AM', '6:00 AM', '3:00 PM',
         'DS', '5DWW', 8, 'Sat / Sun', current_date - 24, current_date - 24, 'one_day',
         'One-day early start for a client review.'
  from drmc_demo.employee e
  where e.position <> 'Delivery Manager' and substr(e.emp_id, 3)::int % 6 = 4;

  -- ------------------------------------------------------------- app user
  insert into drmc_app.hr_app_user (email, role, is_active)
  values ('demo@example.com', 'manager', true)
  on conflict (email) do update set role = excluded.role, is_active = true, updated_at = now();

  refresh materialized view drmc_analytics.mv_timer_day_rollup;
end;
$$;

-- Invented app activity for the last 14 days, so the Activity page has a history
-- right after a reset: sign-ins, single approves and bulk approves by the four
-- team leads and the second manager (never the demo user, whose rows are the
-- visitor's own). Same rule as the loader: hashes of a stable key, no random().
-- reset_demo() truncates the audit log first, then calls this.
create or replace function drmc_demo.load_activity()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into drmc_app.hr_audit_log (actor_email, action, entity, entity_id, detail, created_at)
  select x.actor_email, x.action, x.entity, x.entity_id, x.detail, x.created_at
  from (
    select e.email as actor_email, k.key, a.action, a.entity,
           case when a.action = 'approval.bulk_approve' then md5(k.key || 'batch')::uuid::text end as entity_id,
           case a.action
             when 'auth.sign_in' then jsonb_build_object('outcome', 'granted', 'role', case when e.position = 'Team Lead' then 'lead' else 'manager' end)
             when 'approval.approve' then jsonb_build_object('approved', 1 + drmc_demo.h(k.key || 'n') % 4, 'failed', 0)
             else jsonb_build_object('total', 8 + drmc_demo.h(k.key || 'n') % 23,
                                     'approved', 8 + drmc_demo.h(k.key || 'n') % 23, 'failed', 0)
           end as detail,
           (((current_date - d.n)::timestamp
             + make_interval(mins => a.base_min + drmc_demo.h(k.key || a.action) % 90)) at time zone 'America/New_York') as created_at
    from generate_series(1, 14) d(n)
    join drmc_demo.employee e on e.emp_id in ('260037', '260038', '260039', '260040', '260042')
    cross join lateral (select 'ACT-' || e.emp_id || '-' || d.n as key) k
    cross join (values ('auth.sign_in', 'session', 8 * 60, 0.50),
                       ('approval.approve', 'report', 10 * 60, 0.30),
                       ('approval.bulk_approve', 'approval_batch', 14 * 60, 0.12)) a(action, entity, base_min, share)
    where extract(dow from current_date - d.n) between 1 and 5
      and drmc_demo.u(k.key || a.action || 'on') < a.share
  ) x
  order by x.created_at, x.key;
end;
$$;

-- Not callable through the API: drmc_demo is not exposed and nobody holds USAGE on it.
revoke all on function drmc_demo.h(text) from public, anon, authenticated, service_role;
revoke all on function drmc_demo.u(text) from public, anon, authenticated, service_role;
revoke all on function drmc_demo.load_seed() from public, anon, authenticated, service_role;
revoke all on function drmc_demo.load_activity() from public, anon, authenticated, service_role;
