-- 003_analytics_events.sql
-- Analytics events — the Phase 1 gate instrumentation.
--
-- The Phase 1 validation metric is "unprompted retry rate" — the fraction of
-- deaths followed by a retry within 30 seconds. These rows are the raw data
-- the analysis query consumes. See docs/analytics.md for the queries.
--
-- Writes are fire-and-forget from the client. Reads are service-role-only
-- (analytics is not surfaced in the app).

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id) on delete cascade,
  session_id uuid not null,
  event_type text not null check (
    event_type in (
      'session_start',
      'run_start',
      'run_end',
      'retry_tapped',
      'session_end',
      'close_call'
    )
  ),
  -- Common fields for scoring events — null when N/A.
  score int check (score >= 0 and score <= 10000),
  tier int check (tier >= 1 and tier <= 8),
  run_index int,
  -- Free-form payload for event-specific data. Examples:
  --   retry_tapped:     { time_since_death_ms: 1240 }
  --   session_end:      { total_runs: 14, max_score: 22 }
  --   close_call:       { side: 'L' }
  --   run_end:          { death_side: 'L', death_gate_in_tier: 3 }
  payload jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists analytics_events_device_event_idx
  on analytics_events (device_id, event_type);
create index if not exists analytics_events_session_idx
  on analytics_events (session_id, occurred_at);
create index if not exists analytics_events_event_time_idx
  on analytics_events (event_type, occurred_at);

alter table analytics_events enable row level security;

-- Writes: any authenticated anon client can insert events for an existing device.
drop policy if exists analytics_events_insert on analytics_events;
create policy analytics_events_insert on analytics_events
  for insert
  with check (
    exists (select 1 from devices where id = analytics_events.device_id)
  );

-- Reads: service role only. No select policy = no public access.
