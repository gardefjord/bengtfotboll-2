-- Kör detta i Supabase SQL Editor (en gång per projekt).
-- OBS: RLS-policies nedan är avsedda för en intern grupp-MVP där alla med anon-nyckeln får läsa/skriva.
-- För publikt internet bör du byta till riktig auth eller begränsa policies.

create extension if not exists pgcrypto;

create table if not exists public.training_groups (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.training_groups (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists players_group_name_lower_unique_idx
on public.players (group_id, lower(name));

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.training_groups (id) on delete cascade,
  label text not null,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  unique (group_id, label)
);

create table if not exists public.practice_sessions (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.training_groups (id) on delete cascade,
  season_id uuid references public.seasons (id) on delete set null,
  session_date date not null,
  status text not null check (status in ('open', 'closed')),
  is_cancelled boolean not null default false,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, session_date)
);

create table if not exists public.attendance (
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  player_id uuid not null references public.players (id) on delete cascade,
  status text not null check (status in ('yes', 'no', 'unknown')),
  updated_at timestamptz not null default now(),
  primary key (session_id, player_id)
);

create table if not exists public.session_guests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.practice_sessions (id) on delete cascade,
  host_player_id uuid not null references public.players (id) on delete cascade,
  guest_name text not null,
  status text not null check (status in ('yes', 'no')),
  created_at timestamptz not null default now()
);

alter table public.training_groups enable row level security;
alter table public.seasons enable row level security;
alter table public.players enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.attendance enable row level security;
alter table public.session_guests enable row level security;

create policy "training_groups_all_anon" on public.training_groups
for all using (true) with check (true);

create policy "seasons_all_anon" on public.seasons
for all using (true) with check (true);

create policy "players_all_anon" on public.players
for all using (true) with check (true);

create policy "practice_sessions_all_anon" on public.practice_sessions
for all using (true) with check (true);

create policy "attendance_all_anon" on public.attendance
for all using (true) with check (true);

create policy "session_guests_all_anon" on public.session_guests
for all using (true) with check (true);
