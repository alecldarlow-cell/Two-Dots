-- 002_scores.sql
-- Score submissions. One row per completed run. Device-scoped, public-readable
-- for the leaderboard. No updates — scores are immutable once submitted.

create table if not exists scores (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references devices(id) on delete cascade,
  session_id uuid not null,
  score int not null check (score >= 0 and score <= 10000),
  tier int not null check (tier >= 1 and tier <= 8),
  death_side text not null check (death_side in ('L', 'R', 'both', '')),
  submitted_at timestamptz not null default now()
);

create index if not exists scores_device_id_idx on scores (device_id);
create index if not exists scores_top_idx on scores (score desc, submitted_at asc);
create index if not exists scores_session_id_idx on scores (session_id);

-- RLS: inserts allowed, reads public, no updates or deletes.
alter table scores enable row level security;

drop policy if exists scores_insert on scores;
create policy scores_insert on scores
  for insert
  with check (
    -- Referenced device must exist. RLS prevents referencing a fabricated device_id
    -- because devices read-policy is permissive but the FK still applies at insert.
    exists (select 1 from devices where id = scores.device_id)
  );

drop policy if exists scores_select_public on scores;
create policy scores_select_public on scores
  for select
  using (true);

-- Leaderboard view: joins scores to devices for display names. One row per
-- device, showing its personal best.
create or replace view personal_bests as
  select
    s.device_id,
    d.display_name,
    d.platform,
    max(s.score) as best_score,
    max(s.tier) as best_tier,
    count(*) as total_runs,
    max(s.submitted_at) as last_played
  from scores s
  left join devices d on d.id = s.device_id
  group by s.device_id, d.display_name, d.platform;

-- Top-100 view: the public leaderboard.
create or replace view top_scores as
  select
    s.id,
    s.device_id,
    d.display_name,
    d.platform,
    s.score,
    s.tier,
    s.submitted_at,
    rank() over (order by s.score desc, s.submitted_at asc) as rank
  from scores s
  left join devices d on d.id = s.device_id
  order by s.score desc, s.submitted_at asc
  limit 100;
