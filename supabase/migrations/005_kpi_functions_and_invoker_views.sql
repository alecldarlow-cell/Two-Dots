-- 005_kpi_functions_and_invoker_views.sql
-- Replaces the kpi_* views from 004 with SECURITY DEFINER SQL functions, and
-- recreates the leaderboard views with security_invoker = on.
--
-- Why functions instead of views for the kpi_* aggregates:
--
--   The Supabase database linter raises a hard ERROR (0010_security_definer_view)
--   on any view defined with SECURITY DEFINER, because views can't pin
--   search_path and so are a privilege-escalation surface. The recommended
--   fix is `WITH (security_invoker = on)`, but our analytics_events table
--   is service-role-read-only by design (see 003) — making the views
--   security_invoker means anon hits RLS on the underlying table and the
--   public dashboard goes empty.
--
--   The Supabase-blessed pattern for "let anon read aggregates over a
--   private table" is a SECURITY DEFINER function with `SET search_path = ''`,
--   which the linter accepts (0010 only flags views). Anon gets EXECUTE on
--   the functions and queries them via /rest/v1/rpc/<name>; the underlying
--   rows stay invisible.
--
--   The leaderboard views (personal_bests, top_scores) sit over publicly
--   readable tables (scores, devices), so for those the correct fix is
--   simply `security_invoker = on`.

-- ─── 1. Drop the security-definer views ───────────────────────────────────
drop view if exists public.kpi_overview;
drop view if exists public.kpi_drop_off_by_tier;
drop view if exists public.kpi_retention;

-- ─── 2. KPI functions (called via supabase.rpc(...) from the dashboard) ──
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
  with run_ends as (
    select * from public.analytics_events where event_type = 'run_end'
  ),
  retries as (
    select * from public.analytics_events where event_type = 'retry_tapped'
  ),
  unprompted as (
    select count(*)::int as cnt
    from retries
    where (payload->>'time_since_death_ms')::int < 30000
  )
  select
    (select count(*) from run_ends)::int,
    (select count(distinct device_id) from public.analytics_events)::int,
    (select count(distinct session_id) from public.analytics_events)::int,
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
    tier,
    count(*)::int,
    round(
      100.0 * count(*) / nullif(sum(count(*)) over (), 0),
      1
    )
  from public.analytics_events
  where event_type = 'run_end' and tier is not null
  group by tier
  order by tier;
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
  with first_seen as (
    select device_id, min(occurred_at::date) as first_day
    from public.analytics_events
    group by device_id
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

revoke all on function public.kpi_overview()         from public;
revoke all on function public.kpi_drop_off_by_tier() from public;
revoke all on function public.kpi_retention()        from public;
grant execute on function public.kpi_overview()         to anon;
grant execute on function public.kpi_drop_off_by_tier() to anon;
grant execute on function public.kpi_retention()        to anon;

-- ─── 3. Leaderboard views, now security_invoker = on ─────────────────────
drop view if exists public.personal_bests;
create view public.personal_bests
with (security_invoker = on) as
  select
    s.device_id,
    d.display_name,
    d.platform,
    max(s.score) as best_score,
    max(s.tier) as best_tier,
    count(*) as total_runs,
    max(s.submitted_at) as last_played
  from public.scores s
  left join public.devices d on d.id = s.device_id
  group by s.device_id, d.display_name, d.platform;

drop view if exists public.top_scores;
create view public.top_scores
with (security_invoker = on) as
  select
    s.id,
    s.device_id,
    d.display_name,
    d.platform,
    s.score,
    s.tier,
    s.submitted_at,
    rank() over (order by s.score desc, s.submitted_at asc) as rank
  from public.scores s
  left join public.devices d on d.id = s.device_id
  order by s.score desc, s.submitted_at asc
  limit 100;

grant select on public.personal_bests to anon;
grant select on public.top_scores to anon;

-- Force PostgREST to pick up the new functions and views immediately.
notify pgrst, 'reload schema';
