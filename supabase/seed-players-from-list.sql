-- Lägg till alla spelare från listan i er befintliga grupp (slug = default).
-- Kör i Supabase SQL Editor. Dubbletter hoppas över tack vare unique index.

insert into public.players (group_id, name)
select g.id, v.name
from public.training_groups g
cross join lateral (
  values
    ('Adam'),
    ('Ali'),
    ('Alve'),
    ('Amir'),
    ('Anton'),
    ('Chelbi'),
    ('Eagle-Eye'),
    ('Einar'),
    ('Fraser'),
    ('Gustav'),
    ('Henrik Knippet'),
    ('Ismail'),
    ('Jakob'),
    ('Jesper BD'),
    ('Jesper K'),
    ('Jimmy'),
    ('Jocke Buerling'),
    ('Johan Agrell'),
    ('Johannes'),
    ('Jon'),
    ('Jonas Åhman'),
    ('Julien'),
    ('Marcus Ericsson'),
    ('Mattias AN'),
    ('Max E Garberg'),
    ('Mounim'),
    ('Nils'),
    ('Omar'),
    ('Ossian'),
    ('Per H'),
    ('Rezan'),
    ('Ricky'),
    ('Simon Rissvik'),
    ('Teddy'),
    ('Tobias H')
) as v(name)
where g.slug = 'default'
on conflict (group_id, lower(name)) do nothing;
