-- 006_devices_role_and_kpi_filter.sql
-- Classify devices by role and exclude 'internal' devices from the public
-- KPI dashboard.
--
-- New devices default to role = 'tester'. Internal/dev devices (used during
-- development, QA sweeps, or sideload smoke tests by the dev team) get
-- role = 'internal' and are filtered out of every public KPI surface so the
-- dashboard reflects external tester behaviour only.
--
-- To onboard or off-board a device manually:
--   update public.devices set role = 'internal' where id = '<uuid>';
--   update public.devices set role = 'tester'   where id = '<uuid>';
-- The dashboard updates automatically on the next page load (no migration
-- needed for re-classifications).

-- ─── 1. Schema change ────────────────────────────────────────────────────
alter table public.devices
  add column if not exists role text not null default 'tester';

alter table public.devices
  drop constraint if exists devices_role_check;
alter table public.devices
  add constraint devices_role_check check (role in ('tester', 'internal'));

create index if not exists devices_role_idx on public.devices(role);

-- ─── 2. Mark known internal devices ──────────────────────────────────────
-- Alec's primary dev device. Active since 27 Apr 2026, was the only device
-- producing telemetry until the EAS env-vars fix landed on 29 Apr 2026 (see
-- CHANGELOG entry under [Unreleased] / Fixed).
update public.devices
  set role = 'internal'
  where id = '8e833388-8c60-458d-9d8b-72b3fdbf57a4';

-- ─── 3. Re-define KPI functions with internal-device filter ──────────────
-- All three functions JOIN devices and require role <> 'internal'. The
-- alternative — pre-filtering analytics_events with NOT EXISTS — would also
-- work; the JOIN is clearer and the join column is indexed.

create or replace function public.kpi_overview()
returns table (
  total_runs int,
  total_devices int,
  total_sessions int,
  retry_rate_pct numeric,
  mean_run_length_ms int,
  mean_close_calls_per_run numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible as (
    select ae.*
    from public.analytics_events ae
    join public.devices d on d.id = ae.device_id
    where d.role <> 'internal'
  ),
  run_ends as (
    select * from eligible where event_type = 'run_end'
  ),
  retries as (
    select * from eligible where event_type = 'retry_tapped'
  ),
  unprompted as (
    select count(*)::int as cnt
    from retries
    where (payload->>'time_since_death_ms')::int < 30000
  )
  select
    (select count(*) from run_ends)::int,
    (select count(distinct device_id) from eligible)::int,
    (select count(distinct session_id) from eligible)::int,
    round(
      100.0 * (select cnt from unprompted)
            / nullif((select count(*) from run_ends), 0),
      1
    ),
    (
      select round(avg((payload->>'time_to_death_ms')::int))::int
      from run_ends
      where payload ? 'time_to_death_ms'
    ),
    (
      select round(avg((payload->>'close_calls_in_run')::int)::numeric, 2)
      from run_ends
      where payload ? 'close_calls_in_run'
    );
$$;

create or replace function public.kpi_drop_off_by_tier()
returns table (
  tier int,
  deaths int,
  pct_of_deaths numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    ae.tier,
    count(*)::int,
    round(
      100.0 * count(*) / nullif(sum(count(*)) over (), 0),
      1
    )
  from public.analytics_events ae
  join public.devices d on d.id = ae.device_id
  where ae.event_type = 'run_end'
    and ae.tier is not null
    and d.role <> 'internal'
  group by ae.tier
  order by ae.tier;
$$;

create or replace function public.kpi_retention()
returns table (
  d1_retention_pct numeric,
  d1_eligible_devices int,
  d7_retention_pct numeric,
  d7_eligible_devices int
)
language sql
stable
security definer
set search_path = ''
as $$
  with eligible_devices as (
    select id from public.devices where role <> 'internal'
  ),
  first_seen as (
    select ae.device_id, min(ae.occurred_at::date) as first_day
    from public.analytics_events ae
    join eligible_devices ed on ed.id = ae.device_id
    group by ae.device_id
  ),
  returns_calc as (
    select
      fs.device_id,
      fs.first_day,
      bool_or(ae.occurred_at::date = fs.first_day + 1) as returned_d1,
      bool_or(ae.occurred_at::date = fs.first_day + 7) as returned_d7
    from first_seen fs
    left join public.analytics_events ae on ae.device_id = fs.device_id
    group by fs.device_id, fs.first_day
  )
  select
    round(
      100.0 * count(*) filter (where returned_d1)
            / nullif(count(*) filter (where first_day <= current_date - 1), 0),
      1
    ),
    count(*) filter (where first_day <= current_date - 1)::int,
    round(
      100.0 * count(*) filter (where returned_d7)
            / nullif(count(*) filter (where first_day <= current_date - 7), 0),
      1
    ),
    count(*) filter (where first_day <= current_date - 7)::int
  from returns_calc;
$$;

notify pgrst, 'reload schema';
