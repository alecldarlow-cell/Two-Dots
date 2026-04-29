-- 004_analytics_kpi_views.sql
-- Read-only KPI views for the public dashboard at docs/dashboard.html.
--
-- analytics_events itself is service-role-read-only by design (data minimisation
-- — see 003_analytics_events.sql RLS comment). These views expose only
-- aggregate counts, rates, and histograms — never per-device or per-event row
-- data. SELECT is granted to anon so the static dashboard can fetch them via
-- the public Supabase URL + anon key.
--
-- Run this migration via:
--   supabase db push
-- or by pasting into the Supabase SQL Editor.

-- ─── 1. Overview KPI singleton ─────────────────────────────────────────────
-- One-row view with the headline numbers. Computed fresh on every read; the
-- dataset is small enough for this to be cheap until we have 6-figure run
-- counts, at which point materialised views become worth it.
create or replace view kpi_overview as
with run_ends as (
  select * from analytics_events where event_type = 'run_end'
),
retries as (
  select * from analytics_events where event_type = 'retry_tapped'
),
unprompted as (
  select count(*)::int as cnt
  from retries
  where (payload->>'time_since_death_ms')::int < 30000
)
select
  (select count(*) from run_ends)::int as total_runs,
  (select count(distinct device_id) from analytics_events)::int as total_devices,
  (select count(distinct session_id) from analytics_events)::int as total_sessions,
  round(
    100.0 * (select cnt from unprompted)
          / nullif((select count(*) from run_ends), 0),
    1
  ) as retry_rate_pct,
  (
    select round(avg((payload->>'time_to_death_ms')::int))::int
    from run_ends
    where payload ? 'time_to_death_ms'
  ) as mean_run_length_ms,
  (
    select round(avg((payload->>'close_calls_in_run')::int)::numeric, 2)
    from run_ends
    where payload ? 'close_calls_in_run'
  ) as mean_close_calls_per_run;

-- ─── 2. Drop-off by tier ─────────────────────────────────────────────────
-- Histogram of which tier players die in. Tells us where the difficulty cliff
-- actually sits. If 70%+ of deaths are in tiers 5–7, that confirms the
-- pause-window collapse in DEV_IDEAS_BRIEF §4(iv).
create or replace view kpi_drop_off_by_tier as
select
  tier,
  count(*)::int as deaths,
  round(
    100.0 * count(*) / nullif(sum(count(*)) over (), 0),
    1
  ) as pct_of_deaths
from analytics_events
where event_type = 'run_end' and tier is not null
group by tier
order by tier;

-- ─── 3. D1 / D7 retention ───────────────────────────────────────────────
-- For each device, first_day = day of first analytics event. A device is
-- "retained on day N" if it produced any event on (first_day + N).
-- The eligible cohort for each metric is devices whose first_day was at
-- least N days before today; otherwise we'd undercount devices that simply
-- haven't had enough calendar time to return.
create or replace view kpi_retention as
with first_seen as (
  select device_id, min(occurred_at::date) as first_day
  from analytics_events
  group by device_id
),
returns as (
  select
    fs.device_id,
    fs.first_day,
    -- date + integer = date in PG; clean comparison avoids implicit cast.
    bool_or(ae.occurred_at::date = fs.first_day + 1) as returned_d1,
    bool_or(ae.occurred_at::date = fs.first_day + 7) as returned_d7
  from first_seen fs
  left join analytics_events ae on ae.device_id = fs.device_id
  group by fs.device_id, fs.first_day
)
select
  round(
    100.0 * count(*) filter (where returned_d1)
          / nullif(count(*) filter (where first_day <= current_date - 1), 0),
    1
  ) as d1_retention_pct,
  count(*) filter (where first_day <= current_date - 1)::int as d1_eligible_devices,
  round(
    100.0 * count(*) filter (where returned_d7)
          / nullif(count(*) filter (where first_day <= current_date - 7), 0),
    1
  ) as d7_retention_pct,
  count(*) filter (where first_day <= current_date - 7)::int as d7_eligible_devices
from returns;

-- Grants — anon reads the views, never the underlying table.
grant select on kpi_overview to anon;
grant select on kpi_drop_off_by_tier to anon;
grant select on kpi_retention to anon;
