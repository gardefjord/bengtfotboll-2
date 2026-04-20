-- Kör i Supabase SQL Editor om du redan har ett projekt utan legacy-tabellerna.

create table if not exists public.legacy_training_totals (
  group_id uuid not null references public.training_groups (id) on delete cascade,
  player_name text not null,
  points int not null check (points >= 0),
  primary key (group_id, lower(player_name))
);

create table if not exists public.legacy_friend_totals (
  group_id uuid not null references public.training_groups (id) on delete cascade,
  player_name text not null,
  points int not null check (points >= 0),
  primary key (group_id, lower(player_name))
);

create table if not exists public.legacy_summary (
  group_id uuid primary key references public.training_groups (id) on delete cascade,
  trainings int not null default 0,
  cancelled int not null default 0,
  avg_players numeric not null default 0,
  avg_with_guests numeric not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.legacy_training_totals enable row level security;
alter table public.legacy_friend_totals enable row level security;
alter table public.legacy_summary enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'legacy_training_totals' and policyname = 'legacy_training_totals_all_anon'
  ) then
    create policy "legacy_training_totals_all_anon" on public.legacy_training_totals
    for all using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'legacy_friend_totals' and policyname = 'legacy_friend_totals_all_anon'
  ) then
    create policy "legacy_friend_totals_all_anon" on public.legacy_friend_totals
    for all using (true) with check (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'legacy_summary' and policyname = 'legacy_summary_all_anon'
  ) then
    create policy "legacy_summary_all_anon" on public.legacy_summary
    for all using (true) with check (true);
  end if;
end $$;
