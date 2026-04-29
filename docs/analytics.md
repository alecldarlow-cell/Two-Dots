# Analytics Queries — Phase 1 Gate

The Phase 1 gate for Two Dots is **70%+ unprompted retry behaviour in 20–30 personal testers.** These queries compute the numbers that answer it.

Run these in the Supabase SQL editor against the production database after at least 20 testers have played through a handful of sessions each.

> **For the live read of these metrics** see `docs/dashboard.html`, which calls three `SECURITY DEFINER` SQL functions (`kpi_overview`, `kpi_retention`, `kpi_drop_off_by_tier`) defined in migration 005. Those functions are aggregates-only and `EXECUTE`-granted to `anon`, so the dashboard can read them with the public Supabase URL + anon key without ever exposing per-event row data. The queries below are for ad-hoc deeper analysis when the dashboard's headline numbers prompt a question.

## The headline metric — unprompted retry rate

"Unprompted" is defined as: a `retry_tapped` event occurring within 30 seconds of the preceding `run_end`. Longer gaps are treated as the tester having walked away and come back — prompted, not unprompted.

```sql
with paired as (
  select
    e.device_id,
    e.session_id,
    e.occurred_at as retry_at,
    (e.payload->>'time_since_death_ms')::int as time_since_death_ms
  from analytics_events e
  where e.event_type = 'retry_tapped'
),
run_ends as (
  select
    device_id,
    session_id,
    count(*) as total_deaths
  from analytics_events
  where event_type = 'run_end'
  group by device_id, session_id
),
unprompted_retries as (
  select
    device_id,
    session_id,
    count(*) as unprompted_count
  from paired
  where time_since_death_ms < 30000
  group by device_id, session_id
)
select
  r.device_id,
  r.session_id,
  r.total_deaths,
  coalesce(u.unprompted_count, 0) as unprompted_retries,
  round(
    100.0 * coalesce(u.unprompted_count, 0) / nullif(r.total_deaths, 0),
    1
  ) as retry_rate_pct
from run_ends r
left join unprompted_retries u
  on u.device_id = r.device_id and u.session_id = r.session_id
where r.total_deaths >= 2  -- per research page: sessions of 2+ runs only
order by retry_rate_pct desc nulls last;
```

## Cohort-level rate

The above gives a per-session breakdown. The number that matters for the gate is the aggregate:

```sql
with paired as (
  select
    (payload->>'time_since_death_ms')::int as time_since_death_ms
  from analytics_events
  where event_type = 'retry_tapped'
)
select
  (select count(*) from analytics_events where event_type = 'run_end') as total_deaths,
  (select count(*) from paired where time_since_death_ms < 30000) as unprompted_retries,
  round(
    100.0 * (select count(*) from paired where time_since_death_ms < 30000)
          / nullif((select count(*) from analytics_events where event_type = 'run_end'), 0),
    1
  ) as cohort_retry_rate_pct;
```

## Sessions-to-first-retry distribution

A secondary signal — how quickly does a new tester get hooked on retrying?

```sql
select
  device_id,
  min(run_index) filter (where event_type = 'retry_tapped') as first_retry_at_run
from analytics_events
group by device_id
order by first_retry_at_run nulls last;
```

## Death tier distribution

Calibration check — are testers reaching the tiers we think they are? If 95% of deaths are at Tier 1-2, the difficulty curve is too harsh.

```sql
select
  tier,
  count(*) as deaths,
  round(100.0 * count(*) / sum(count(*)) over (), 1) as pct_of_deaths
from analytics_events
where event_type = 'run_end'
group by tier
order by tier;
```

## Session length and run count

Are testers playing in real sessions, or tapping once and closing?

```sql
select
  session_id,
  device_id,
  min(occurred_at) as started,
  max(occurred_at) as ended,
  extract(epoch from (max(occurred_at) - min(occurred_at))) as duration_s,
  count(*) filter (where event_type = 'run_start') as runs_started,
  count(*) filter (where event_type = 'run_end') as runs_ended
from analytics_events
group by session_id, device_id
having count(*) filter (where event_type = 'run_start') >= 1
order by started desc;
```
