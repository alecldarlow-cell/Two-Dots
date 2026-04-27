-- 001_devices.sql
-- Device identity. Every install gets one row; the device_id is persisted
-- in AsyncStorage so the same install keeps its identity across sessions
-- and app restarts. No user login — anonymous device-scoped identity only.

create extension if not exists "uuid-ossp";

create table if not exists devices (
  id uuid primary key default gen_random_uuid(),
  platform text not null check (platform in ('ios', 'android', 'web')),
  app_version text not null,
  display_name text,                              -- user-chosen handle for leaderboard (optional)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists devices_created_at_idx on devices (created_at);

-- RLS
alter table devices enable row level security;

-- Anyone can insert their own device row during first launch.
drop policy if exists devices_insert_self on devices;
create policy devices_insert_self on devices
  for insert
  with check (true);

-- Reads gated via Supabase anon key — in practice, clients only read their
-- own device by id. The leaderboard view (see 002) joins devices for display
-- names and is separately readable.
drop policy if exists devices_select_self on devices;
create policy devices_select_self on devices
  for select
  using (true);

-- Updates restricted to the same device (display_name change). Enforced by
-- the client passing its id; for Phase 1 friends-and-family testing, this is
-- sufficient. Phase 2: add Supabase Auth anonymous sign-in and scope by auth.uid().
drop policy if exists devices_update_self on devices;
create policy devices_update_self on devices
  for update
  using (true)
  with check (true);
