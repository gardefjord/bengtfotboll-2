-- Importera legacy-statistik till Supabase.
-- 1) Kör först: supabase/migration-legacy-stats-tables.sql (om tabellerna saknas)
-- 2) Kör sedan hela denna fil i SQL Editor.
--
-- OBS: Om samma namn förekommer flera gånger i listan slås poäng ihop (SUM).
-- Byt slug om du inte använder default-gruppen.

-- Träningsligan
with grp as (
  select id
  from public.training_groups
  where slug = 'default'
),
training as (
  select * from (values
    ('Adam', 340),
    ('Mattias AN', 336),
    ('Einar', 299),
    ('Micke', 243),
    ('Daniel R', 232),
    ('Samir', 230),
    ('Gustav', 211),
    ('Ossian', 207),
    ('Perra', 184),
    ('Jon', 183),
    ('Johannes', 180),
    ('Per H', 156),
    ('Jakob', 259),
    ('Ali', 141),
    ('Jonas A', 136),
    ('Julien', 134),
    ('Robin A', 106),
    ('Marton', 100),
    ('Daniel J', 98),
    ('Jimmy', 93),
    ('Kalle', 93),
    ('Alex Burväktarn', 92),
    ('Johannes Bl', 81),
    ('Andreas', 78),
    ('Fraser', 73),
    ('Henrik Knippet', 70),
    ('Jordi', 70),
    ('Jesper K', 69),
    ('Johan Agrell', 69),
    ('Viktor', 63),
    ('Simon', 58),
    ('Jonas B', 57),
    ('Rezan', 50),
    ('Max E Garberg', 48),
    ('Nicklas C', 48),
    ('Jesper BD', 46),
    ('John', 37),
    ('Anton', 36),
    ('Eagle-Eye', 31),
    ('Robin M', 31),
    ('Jonas Åhman', 30),
    ('Mattias L', 29),
    ('Austin', 28),
    ('Martin', 26),
    ('Alexander A', 24),
    ('Amir', 24),
    ('Simon D', 23),
    ('Stephan', 22),
    ('Ludvig', 21),
    ('Mounim', 18),
    ('Jocke Buerling', 17),
    ('Omar', 17),
    ('Addis', 15),
    ('Niklas aka Martons BFF', 14),
    ('Emil F', 12),
    ('Erik W', 12),
    ('Josef', 12),
    ('Hugo', 11),
    ('Patrik L', 10),
    ('Daniel S', 9),
    ('Matthias P', 8),
    ('Teddy', 8),
    ('Hasanein', 7),
    ('Nils', 7),
    ('Robert', 7),
    ('Emil S', 6),
    ('John Modric', 6),
    ('Tomas', 6),
    ('Alve', 7),
    ('Chelbi', 5),
    ('Marcus Ericsson', 5),
    ('Marko', 5),
    ('Eddie', 4),
    ('Simon Rissvik', 4),
    ('Vidar', 4),
    ('Adam J', 3),
    ('Daniel A', 3),
    ('David', 3),
    ('Eddie H', 3),
    ('Erik J', 4),
    ('Ismail', 3),
    ('Oscar', 3),
    ('Viktor F', 3),
    ('Dennis', 2),
    ('Fisnik', 2),
    ('Jacob L', 2),
    ('Nicklas J', 2),
    ('Robert H', 2),
    ('Martin Grimlund', 1),
    ('Micke N', 1),
    ('Måns', 1),
    ('Per L', 1)
  ) as v(player_name, points)
)
insert into public.legacy_training_totals (group_id, player_name, points)
select grp.id, t.player_name, t.points
from grp
cross join training t
on conflict (group_id, lower(player_name))
do update set points = public.legacy_training_totals.points + excluded.points;

-- Bring-a-friend-ligan
with grp as (
  select id
  from public.training_groups
  where slug = 'default'
),
friend as (
  select * from (values
    ('Einar', 134),
    ('Mattias AN', 100),
    ('Jimmy', 53),
    ('Samir', 49),
    ('Adam', 46),
    ('Fraser', 40),
    ('Ossian', 29),
    ('Rezan', 24),
    ('Daniel R', 23),
    ('Gustav', 20),
    ('Johannes', 19),
    ('Max E Garberg', 19),
    ('Ali', 16),
    ('Jonas Åhman', 13),
    ('Jon', 12),
    ('Marton', 10),
    ('Johan Agrell', 8),
    ('Robin A', 8),
    ('Addis', 5),
    ('Alex Burväktarn', 5),
    ('Jakob', 15),
    ('Jonas A', 5),
    ('Jordi', 4),
    ('Nicklas C', 4),
    ('Anton', 3),
    ('Chelbi', 3),
    ('Henrik Knippet', 3),
    ('Ismail', 3),
    ('Jocke Buerling', 3),
    ('Robin M', 3),
    ('Viktor', 3),
    ('Austin', 2),
    ('Jonas B', 2),
    ('Kalle', 2),
    ('Martin', 2),
    ('Micke', 2),
    ('Mounim', 2),
    ('Per H', 2),
    ('Erik J', 1),
    ('Hugo', 1),
    ('Jesper BD', 1),
    ('John', 1),
    ('Julien', 1),
    ('Marcus Ericsson', 1),
    ('Omar', 1),
    ('Perra', 1),
    ('Simon', 1),
    ('Simon D', 1),
    ('Vidar', 1)
  ) as v(player_name, points)
)
insert into public.legacy_friend_totals (group_id, player_name, points)
select grp.id, f.player_name, f.points
from grp
cross join friend f
on conflict (group_id, lower(player_name))
do update set points = public.legacy_friend_totals.points + excluded.points;

-- Sammanfattning
with grp as (
  select id
  from public.training_groups
  where slug = 'default'
)
insert into public.legacy_summary (group_id, trainings, cancelled, avg_players, avg_with_guests)
select grp.id, 515, 99, 10.82, 12.17
from grp
on conflict (group_id)
do update set
  trainings = excluded.trainings,
  cancelled = excluded.cancelled,
  avg_players = excluded.avg_players,
  avg_with_guests = excluded.avg_with_guests,
  updated_at = now();
