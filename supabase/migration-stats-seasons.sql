-- Kör i Supabase SQL Editor om du redan skapat tabellerna tidigare.
-- Detta lägger till säsonger + inställda träningar och kopplar befintliga pass till en default-säsong.

create extension if not exists pgcrypto;

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.training_groups (id) on delete cascade,
  label text not null,
  starts_on date,
  ends_on date,
  created_at timestamptz not null default now(),
  unique (group_id, label)
);

alter table public.practice_sessions
  add column if not exists season_id uuid references public.seasons (id) on delete set null;

alter table public.practice_sessions
  add column if not exists is_cancelled boolean not null default false;

alter table public.seasons enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'seasons'
      and policyname = 'seasons_all_anon'
  ) then
    create policy "seasons_all_anon" on public.seasons
    for all using (true) with check (true);
  end if;
end $$;

-- Skapa en default-säsong per grupp om den saknas, och koppla alla befintliga pass till den.
with inserted as (
  insert into public.seasons (group_id, label)
  select g.id, 'Alla tider'
  from public.training_groups g
  where not exists (
    select 1 from public.seasons s where s.group_id = g.id and s.label = 'Alla tider'
  )
  returning id, group_id
)
update public.practice_sessions ps
set season_id = i.id
from inserted i
where ps.group_id = i.group_id
  and ps.season_id is null;

-- Om säsongen redan fanns men pass fortfarande saknar season_id:
update public.practice_sessions ps
set season_id = s.id
from public.seasons s
where ps.season_id is null
  and s.group_id = ps.group_id
  and s.label = 'Alla tider';
