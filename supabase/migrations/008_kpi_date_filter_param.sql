-- 008_kpi_date_filter_param.sql
-- Add a p_since timestamptz parameter to each KPI function so the dashboard
-- can show "last 24h" / "last 7d" / "all time" cuts without a client change.
--
-- Semantics:
--   p_since IS NULL  → all time (default, backwards-compatible)
--   p_since NOT NULL → only events at or after that instant
--
-- For retention specifically, p_since filters the COHORT — devices whose
-- first event is at or after p_since. This makes "last 24h retention" mean
-- "D1/D7 of devices that joined in the last 24h" rather than "events in
-- the last 24h of devices that joined long ago", which would produce
-- nonsense numbers.
--
-- This migration also drops the single-arg signatures introduced in 007 so
-- PostgREST has a single resolution path. The supabase-js client picks
-- functions by argument-name match, so leaving both signatures present
-- would be a footgun on schema introspection.

create or replace function public.kpi_overview(
  p_filter text default 'tester',
  p_since timestamptz default null
)
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
    where (p_since is null or ae.occurred_at >= p_since)
      and case
        when p_filter = 'all'      then true
        when p_filter = 'tester'   then d.role <> 'internal'
        when p_filter = 'internal' then d.role  = 'internal'
        else false
      end
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

create or replace function public.kpi_drop_off_by_tier(
  p_filter text default 'tester',
  p_since timestamptz default null
)
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
    and (p_since is null or ae.occurred_at >= p_since)
    and case
      when p_filter = 'all'      then true
      when p_filter = 'tester'   then d.role <> 'internal'
      when p_filter = 'internal' then d.role  = 'internal'
      else false
    end
  group by ae.tier
  order by ae.tier;
$$;

create or replace function public.kpi_retention(
  p_filter text default 'tester',
  p_since timestamptz default null
)
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
    select id from public.devices
    where case
      when p_filter = 'all'      then true
      when p_filter = 'tester'   then role <> 'internal'
      when p_filter = 'internal' then role  = 'internal'
      else false
    end
  ),
  first_seen as (
    select ae.device_id, min(ae.occurred_at::date) as first_day
    from public.analytics_events ae
    join eligible_devices ed on ed.id = ae.device_id
    group by ae.device_id
    having p_since is null
        or min(ae.occurred_at) >= p_since
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

revoke all on function public.kpi_overview(text, timestamptz)         from public;
revoke all on function public.kpi_drop_off_by_tier(text, timestamptz) from public;
revoke all on function public.kpi_retention(text, timestamptz)        from public;
grant execute on function public.kpi_overview(text, timestamptz)         to anon;
grant execute on function public.kpi_drop_off_by_tier(text, timestamptz) to anon;
grant execute on function public.kpi_retention(text, timestamptz)        to anon;

drop function if exists public.kpi_overview(text);
drop function if exists public.kpi_drop_off_by_tier(text);
drop function if exists public.kpi_retention(text);

notify pgrst, 'reload schema';
