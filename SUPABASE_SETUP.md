# Supabase setup (snabbguide)

## 1) Fyll i `.env.local`

Öppna filen `.env.local` i projektroten och fyll i:

- `VITE_SUPABASE_URL` = din Project URL från Supabase
- `VITE_SUPABASE_ANON_KEY` = din `anon public` API key
- `VITE_GROUP_SLUG` = kan vara `default`

## 2) Kör SQL-schemat i Supabase

1. Öppna ditt projekt i Supabase.
2. Gå till **SQL Editor**.
3. Skapa en ny query.
4. Öppna filen `supabase/schema.sql` i det här projektet.
5. Kopiera allt i den filen och klistra in i SQL Editor.
6. Klicka **Run**.

Om du redan körde en äldre version av `schema.sql` tidigare, kör också:

- `supabase/migration-stats-seasons.sql`

Om du vill importera färdiga tabell-värden för **Träningsligan / Bring-a-friend / sammanfattning**:

- `supabase/migration-legacy-stats-tables.sql` (om tabellerna saknas)
- `supabase/import-legacy-leaderboards.sql`

## 3) Starta om appen

När `.env.local` är uppdaterad:

1. Stoppa dev-servern (`Ctrl + C`)
2. Kör igen:

```bash
npm run dev
```

## 4) Kontrolltest

1. Öppna appen.
2. Lägg till en spelare i **Admin**.
3. Ladda om sidan.
4. Om spelaren finns kvar så är Supabase-kopplingen aktiv.
