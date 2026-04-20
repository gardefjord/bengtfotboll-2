import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  formatSvDate,
  getNextPracticeDate,
  isSunday,
  toDateOnly,
} from './lib/practiceDates'
import { isSupabaseConfigured, supabase } from './lib/supabaseClient'
import {
  closeStaleSessions,
  ensureAttendanceRows,
  fetchClosedSessions,
  fetchOpenSession,
  loadSessionAttendanceAndGuests,
  type Attendance,
  type GuestRow,
  type PlayerRow,
  type SeasonRow,
  type SessionRow,
} from './lib/supabaseQueries'

type Tab = 'training' | 'stats' | 'players' | 'admin'

const SELECTED_PLAYER_KEY = 'bengtfotboll.selectedPlayerId'
const ADMIN_PIN = '1909'
const GROUP_SLUG = import.meta.env.VITE_GROUP_SLUG ?? 'default'
const GROUP_NAME = 'Bengtfotboll'

const DEFAULT_PLAYER_NAMES = [
  'Adam',
  'Ali',
  'Alve',
  'Amir',
  'Anton',
  'Chelbi',
  'Eagle-Eye',
  'Einar',
  'Fraser',
  'Gustav',
  'Henrik Knippet',
  'Ismail',
  'Jakob',
  'Jesper BD',
  'Jesper K',
  'Jimmy',
  'Jocke Buerling',
  'Johan Agrell',
  'Johannes',
  'Jon',
  'Jonas Åhman',
  'Julien',
  'Marcus Ericsson',
  'Mattias AN',
  'Max E Garberg',
  'Mounim',
  'Nils',
  'Omar',
  'Ossian',
  'Per H',
  'Rezan',
  'Ricky',
  'Simon Rissvik',
  'Teddy',
  'Tobias H',
]

const readSelectedPlayerId = () => localStorage.getItem(SELECTED_PLAYER_KEY)

const writeSelectedPlayerId = (playerId: string) => {
  localStorage.setItem(SELECTED_PLAYER_KEY, playerId)
}

const ALL_SEASONS = 'all'

function App() {
  const [tab, setTab] = useState<Tab>('training')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [groupId, setGroupId] = useState<string | null>(null)
  const [session, setSession] = useState<SessionRow | null>(null)
  const [players, setPlayers] = useState<PlayerRow[]>([])
  const [responses, setResponses] = useState<Record<string, Attendance>>({})
  const [guests, setGuests] = useState<GuestRow[]>([])
  const [closedSessions, setClosedSessions] = useState<SessionRow[]>([])
  const [seasons, setSeasons] = useState<SeasonRow[]>([])
  const [selectedSeasonId, setSelectedSeasonId] = useState<string>(ALL_SEASONS)

  const [statsSummary, setStatsSummary] = useState({
    trainings: 0,
    cancelled: 0,
    avgPlayers: 0,
    avgWithGuests: 0,
  })
  const [marathonRows, setMarathonRows] = useState<{ rank: number; name: string; points: number }[]>(
    [],
  )
  const [trainingRows, setTrainingRows] = useState<{ rank: number; name: string; points: number }[]>(
    [],
  )
  const [friendRows, setFriendRows] = useState<{ rank: number; name: string; points: number }[]>([])

  const [selectedPlayerId, setSelectedPlayerId] = useState<string>('')

  const [guestName, setGuestName] = useState('')
  const [guestStatus, setGuestStatus] = useState<'yes' | 'no'>('yes')
  const [isGuestFormOpen, setIsGuestFormOpen] = useState(false)

  const [newPlayer, setNewPlayer] = useState('')
  const [adminPinInput, setAdminPinInput] = useState('')
  const [isAdminUnlocked, setIsAdminUnlocked] = useState(false)
  const [adminPinError, setAdminPinError] = useState('')

  const practiceDateLabel = useMemo(
    () => (session ? formatSvDate(new Date(`${session.session_date}T12:00:00`)) : ''),
    [session],
  )

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      setLoadError(
        'Supabase är inte konfigurerat. Lägg till VITE_SUPABASE_URL och VITE_SUPABASE_ANON_KEY i en .env.local-fil och starta om dev-servern.',
      )
      return
    }

    const client = supabase

    const bootstrap = async () => {
      setLoading(true)
      setLoadError(null)
      try {
        const { data: group, error: groupError } = await client
          .from('training_groups')
          .select('id')
          .eq('slug', GROUP_SLUG)
          .maybeSingle()

        if (groupError) {
          throw groupError
        }

        let resolvedGroupId = group?.id as string | undefined
        if (!resolvedGroupId) {
          const { data: inserted, error: insertGroupError } = await client
            .from('training_groups')
            .insert({ slug: GROUP_SLUG, name: GROUP_NAME })
            .select('id')
            .single()
          if (insertGroupError) {
            throw insertGroupError
          }
          resolvedGroupId = inserted.id as string | undefined
        }

        if (!resolvedGroupId) {
          throw new Error('Kunde inte skapa eller läsa grupp.')
        }

        setGroupId(resolvedGroupId)

        const { data: playerRows, error: playersError } = await client
          .from('players')
          .select('id, name')
          .eq('group_id', resolvedGroupId)
          .order('name')

        if (playersError) {
          throw playersError
        }

        let nextPlayers = (playerRows ?? []) as PlayerRow[]
        if (nextPlayers.length === 0) {
          const { error: seedError } = await client.from('players').insert(
            DEFAULT_PLAYER_NAMES.map((name) => ({
              group_id: resolvedGroupId,
              name,
            })),
          )
          if (seedError) {
            throw seedError
          }
          const { data: seeded, error: seededReadError } = await client
            .from('players')
            .select('id, name')
            .eq('group_id', resolvedGroupId)
            .order('name')
          if (seededReadError) {
            throw seededReadError
          }
          nextPlayers = (seeded ?? []) as PlayerRow[]
        }

        setPlayers(nextPlayers)

        const { data: seasonRows, error: seasonsReadError } = await client
          .from('seasons')
          .select('id, label, starts_on, ends_on')
          .eq('group_id', resolvedGroupId)
          .order('starts_on', { ascending: true, nullsFirst: true })

        if (seasonsReadError) {
          throw seasonsReadError
        }

        let nextSeasons = (seasonRows ?? []) as SeasonRow[]
        let seasonIdForNewSessions: string | null = null

        if (nextSeasons.length === 0) {
          const { data: insertedSeason, error: seasonInsertError } = await client
            .from('seasons')
            .insert({ group_id: resolvedGroupId, label: 'Alla tider' })
            .select('id, label, starts_on, ends_on')
            .single()

          if (seasonInsertError) {
            throw seasonInsertError
          }

          nextSeasons = [insertedSeason as SeasonRow]
        }

        seasonIdForNewSessions = nextSeasons[0]?.id ?? null
        setSeasons(nextSeasons)
        setSelectedSeasonId(ALL_SEASONS)

        const today = new Date()
        const targetPractice = getNextPracticeDate(today)
        const sessionDate = toDateOnly(targetPractice)

        await closeStaleSessions(client, resolvedGroupId, toDateOnly(today))

        let activeSession = await fetchOpenSession(client, resolvedGroupId)
        if (!activeSession || activeSession.session_date !== sessionDate) {
          const { data: insertedSession, error: sessionInsertError } = await client
            .from('practice_sessions')
            .insert({
              group_id: resolvedGroupId,
              season_id: seasonIdForNewSessions,
              session_date: sessionDate,
              status: 'open',
              is_cancelled: false,
            })
            .select('id, session_date, status, is_cancelled, season_id')
            .single()

          if (sessionInsertError) {
            activeSession = await fetchOpenSession(client, resolvedGroupId)
            if (!activeSession) {
              throw sessionInsertError
            }
          } else {
            activeSession = insertedSession as SessionRow
            await ensureAttendanceRows(client, activeSession.id, nextPlayers.map((p) => p.id))
          }
        }

        if (!activeSession) {
          throw new Error('Kunde inte skapa eller hitta aktiv träning.')
        }

        setSession(activeSession)
        const loaded = await loadSessionAttendanceAndGuests(client, activeSession.id, nextPlayers)
        setResponses(loaded.responses)
        setGuests(loaded.guests)

        const storedId = readSelectedPlayerId()
        const initialId =
          storedId && nextPlayers.some((p) => p.id === storedId)
            ? storedId
            : nextPlayers[0]?.id ?? ''
        setSelectedPlayerId(initialId)
        if (initialId) {
          writeSelectedPlayerId(initialId)
        }

        const closed = await fetchClosedSessions(client, resolvedGroupId)
        setClosedSessions(closed)
      } catch (error) {
        console.error(error)
        setLoadError('Kunde inte ladda data från Supabase. Kontrollera tabeller, RLS och API-nycklar.')
      } finally {
        setLoading(false)
      }
    }

    void bootstrap()
  }, [])

  const handleSelectPlayer = (playerId: string) => {
    setSelectedPlayerId(playerId)
    writeSelectedPlayerId(playerId)
  }

  const updateAttendance = async (status: 'yes' | 'no') => {
    if (!supabase || !session || !selectedPlayerId) {
      return
    }

    const { error } = await supabase.from('attendance').upsert(
      {
        session_id: session.id,
        player_id: selectedPlayerId,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'session_id,player_id' },
    )

    if (error) {
      console.error(error)
      return
    }

    setResponses((prev) => ({
      ...prev,
      [selectedPlayerId]: status,
    }))
  }

  const addGuest = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || !session || !selectedPlayerId) {
      return
    }
    const trimmed = guestName.trim()
    if (!trimmed) {
      return
    }

    const { data, error } = await supabase
      .from('session_guests')
      .insert({
        session_id: session.id,
        host_player_id: selectedPlayerId,
        guest_name: trimmed,
        status: guestStatus,
      })
      .select('id, guest_name, host_player_id, status')
      .single()

    if (error) {
      console.error(error)
      return
    }

    setGuests((prev) => [...prev, data as GuestRow])
    setGuestName('')
    setIsGuestFormOpen(false)
  }

  const removeGuest = async (guestId: string) => {
    if (!supabase) {
      return
    }
    const { error } = await supabase.from('session_guests').delete().eq('id', guestId)
    if (error) {
      console.error(error)
      return
    }
    setGuests((prev) => prev.filter((guest) => guest.id !== guestId))
  }

  const addPlayer = async (event: FormEvent) => {
    event.preventDefault()
    if (!supabase || !groupId || !session) {
      return
    }
    const trimmed = newPlayer.trim()
    if (!trimmed) {
      return
    }

    const { data, error } = await supabase
      .from('players')
      .insert({ group_id: groupId, name: trimmed })
      .select('id, name')
      .single()

    if (error) {
      console.error(error)
      return
    }

    const inserted = data as PlayerRow
    const nextPlayers = [...players, inserted].sort((a, b) => a.name.localeCompare(b.name))
    setPlayers(nextPlayers)
    setNewPlayer('')

    await ensureAttendanceRows(supabase, session.id, [inserted.id])
    const loaded = await loadSessionAttendanceAndGuests(supabase, session.id, nextPlayers)
    setResponses(loaded.responses)
    setGuests(loaded.guests)

    const closed = await fetchClosedSessions(supabase, groupId)
    setClosedSessions(closed)
  }

  const removePlayer = async (playerId: string) => {
    if (!supabase || players.length <= 1) {
      return
    }

    const { error } = await supabase.from('players').delete().eq('id', playerId)
    if (error) {
      console.error(error)
      return
    }

    const nextPlayers = players.filter((player) => player.id !== playerId)
    setPlayers(nextPlayers)

    if (selectedPlayerId === playerId) {
      const fallback = nextPlayers[0]?.id ?? ''
      handleSelectPlayer(fallback)
    }

    setGuests((prev) => prev.filter((guest) => guest.host_player_id !== playerId))
    setResponses((prev) => {
      const clone = { ...prev }
      delete clone[playerId]
      return clone
    })

    if (groupId) {
      const closed = await fetchClosedSessions(supabase, groupId)
      setClosedSessions(closed)
    }
  }

  const unlockAdmin = (event: FormEvent) => {
    event.preventDefault()
    if (adminPinInput.trim() === ADMIN_PIN) {
      setIsAdminUnlocked(true)
      setAdminPinError('')
      setAdminPinInput('')
      return
    }
    setAdminPinError('Fel PIN-kod.')
  }

  const comingPlayers = useMemo(
    () => players.filter((player) => responses[player.id] === 'yes'),
    [players, responses],
  )
  const noPlayers = useMemo(
    () => players.filter((player) => responses[player.id] === 'no'),
    [players, responses],
  )
  const unknownPlayers = useMemo(
    () => players.filter((player) => responses[player.id] === 'unknown'),
    [players, responses],
  )

  const seasonBounds = useMemo(() => {
    if (selectedSeasonId === ALL_SEASONS) {
      return null
    }
    return seasons.find((season) => season.id === selectedSeasonId) ?? null
  }, [seasons, selectedSeasonId])

  const filteredClosedSessions = useMemo(() => {
    if (!seasonBounds) {
      return closedSessions
    }

    return closedSessions.filter((sessionRow) => {
      if (sessionRow.season_id && sessionRow.season_id === seasonBounds.id) {
        return true
      }

      if (!sessionRow.season_id) {
        const sessionKey = sessionRow.session_date
        if (seasonBounds.starts_on && sessionKey < seasonBounds.starts_on) {
          return false
        }
        if (seasonBounds.ends_on && sessionKey > seasonBounds.ends_on) {
          return false
        }
        return true
      }

      return false
    })
  }, [closedSessions, seasonBounds])

  const rankRows = (scores: Record<string, number>) => {
    const entries = Object.entries(scores)
      .map(([playerId, points]) => ({
        playerId,
        points,
        name: players.find((player) => player.id === playerId)?.name ?? 'Okänd spelare',
      }))
      .filter((entry) => entry.points > 0)
      .sort((a, b) => {
        if (b.points !== a.points) {
          return b.points - a.points
        }
        return a.name.localeCompare(b.name, 'sv')
      })

    const rows: { rank: number; name: string; points: number }[] = []
    let lastPoints: number | null = null
    let lastRank = 0

    entries.forEach((entry, index) => {
      const rank = lastPoints === entry.points ? lastRank : index + 1
      rows.push({ rank, name: entry.name, points: entry.points })
      lastPoints = entry.points
      lastRank = rank
    })

    return rows
  }

  useEffect(() => {
    const loadStats = async () => {
      if (!supabase) {
        return
      }

      const sessionsForStats = filteredClosedSessions.filter((row) => !row.is_cancelled)
      const cancelledCount = filteredClosedSessions.filter((row) => row.is_cancelled).length

      if (sessionsForStats.length === 0) {
        setStatsSummary({
          trainings: 0,
          cancelled: cancelledCount,
          avgPlayers: 0,
          avgWithGuests: 0,
        })
        setMarathonRows([])
        setTrainingRows([])
        setFriendRows([])
        return
      }

      const sessionIds = sessionsForStats.map((row) => row.id)

      const [{ data: attendanceRows, error: attendanceError }, { data: guestRows, error: guestError }] =
        await Promise.all([
          supabase.from('attendance').select('session_id, player_id, status').in('session_id', sessionIds),
          supabase
            .from('session_guests')
            .select('session_id, host_player_id, status')
            .in('session_id', sessionIds),
        ])

      if (attendanceError) {
        console.error(attendanceError)
        return
      }
      if (guestError) {
        console.error(guestError)
        return
      }

      const yesBySession = new Map<string, number>()
      const guestYesBySession = new Map<string, number>()

      const trainingScore: Record<string, number> = {}
      const friendScore: Record<string, number> = {}

      for (const player of players) {
        trainingScore[player.id] = 0
        friendScore[player.id] = 0
      }

      for (const row of attendanceRows ?? []) {
        if (row.status !== 'yes') {
          continue
        }
        const sessionId = row.session_id as string
        const playerId = row.player_id as string
        yesBySession.set(sessionId, (yesBySession.get(sessionId) ?? 0) + 1)
        trainingScore[playerId] = (trainingScore[playerId] ?? 0) + 1
      }

      for (const row of guestRows ?? []) {
        if (row.status !== 'yes') {
          continue
        }
        const sessionId = row.session_id as string
        guestYesBySession.set(sessionId, (guestYesBySession.get(sessionId) ?? 0) + 1)
        const hostId = row.host_player_id as string
        friendScore[hostId] = (friendScore[hostId] ?? 0) + 1
      }

      const marathonScore: Record<string, number> = {}
      for (const player of players) {
        marathonScore[player.id] = (trainingScore[player.id] ?? 0) + (friendScore[player.id] ?? 0)
      }

      let sumPlayers = 0
      let sumWithGuests = 0
      for (const sessionRow of sessionsForStats) {
        sumPlayers += yesBySession.get(sessionRow.id) ?? 0
        sumWithGuests +=
          (yesBySession.get(sessionRow.id) ?? 0) + (guestYesBySession.get(sessionRow.id) ?? 0)
      }

      setStatsSummary({
        trainings: sessionsForStats.length,
        cancelled: cancelledCount,
        avgPlayers: Math.round((sumPlayers / sessionsForStats.length) * 100) / 100,
        avgWithGuests: Math.round((sumWithGuests / sessionsForStats.length) * 100) / 100,
      })

      setMarathonRows(rankRows(marathonScore))
      setTrainingRows(rankRows(trainingScore))
      setFriendRows(rankRows(friendScore))
    }

    void loadStats()
  }, [filteredClosedSessions, players, supabase])

  const selectedPlayerName =
    players.find((player) => player.id === selectedPlayerId)?.name ?? ''

  if (!isSupabaseConfigured) {
    return (
      <main className="app-shell">
        <p className="error-banner">
          Supabase saknas. Kopiera <code>.env.example</code> till <code>.env.local</code> och fyll i
          nycklarna.
        </p>
      </main>
    )
  }

  if (loading) {
    return (
      <main className="app-shell">
        <p>Laddar…</p>
      </main>
    )
  }

  if (loadError) {
    return (
      <main className="app-shell">
        <p className="error-banner">{loadError}</p>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <h1>bengtfotboll.se</h1>
        <p>Vem kommer till helgens träning?</p>
      </header>

      <nav className="tabs" aria-label="Huvudmeny">
        <button className={tab === 'training' ? 'active' : ''} onClick={() => setTab('training')}>
          Träning
        </button>
        <button className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>
          Statistik
        </button>
        <button className={tab === 'players' ? 'active' : ''} onClick={() => setTab('players')}>
          Spelare
        </button>
        <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>
          Admin
        </button>
      </nav>

      {tab === 'training' && session && (
        <section className="grid-two">
          <article className="card">
            <h2>Närvaro</h2>
            <p className="muted">Träning: {practiceDateLabel}</p>
            {isSunday(new Date()) && (
              <p className="hint">Ny vecka: tidigare träning är stängd och statistik uppdateras.</p>
            )}
            <label htmlFor="player">Spelare</label>
            <select
              id="player"
              value={selectedPlayerId}
              onChange={(event) => handleSelectPlayer(event.target.value)}
            >
              {players.map((player) => (
                <option key={player.id} value={player.id}>
                  {player.name}
                </option>
              ))}
            </select>
            <div className="actions">
              <button className="yes" type="button" onClick={() => void updateAttendance('yes')}>
                Kommer
              </button>
              <button className="no" type="button" onClick={() => void updateAttendance('no')}>
                Kan inte
              </button>
            </div>

            <section className="guest-accordion">
              <button
                type="button"
                className="accordion-toggle"
                onClick={() => setIsGuestFormOpen((open) => !open)}
              >
                {isGuestFormOpen
                  ? 'Stäng gästformulär'
                  : `Anmäl gäst för ${selectedPlayerName || ' vald spelare'}`}
              </button>
              {isGuestFormOpen && (
                <form className="guest-form" onSubmit={(event) => void addGuest(event)}>
                  <h3>Gästspelare</h3>
                  <label htmlFor="guest-name">Namn</label>
                  <input
                    id="guest-name"
                    value={guestName}
                    onChange={(event) => setGuestName(event.target.value)}
                    placeholder="Gästens namn"
                  />
                  <label htmlFor="guest-status">Status</label>
                  <select
                    id="guest-status"
                    value={guestStatus}
                    onChange={(event) => setGuestStatus(event.target.value as 'yes' | 'no')}
                  >
                    <option value="yes">Kommer</option>
                    <option value="no">Kan inte</option>
                  </select>
                  <button type="submit">Lägg till gäst</button>
                </form>
              )}
            </section>
          </article>

          <article className="stack">
            <section className="card">
              <h2>
                Kommer (
                {comingPlayers.length + guests.filter((guest) => guest.status === 'yes').length})
              </h2>
              <ul>
                {comingPlayers.map((player) => (
                  <li key={player.id}>{player.name}</li>
                ))}
                {guests
                  .filter((guest) => guest.status === 'yes')
                  .map((guest) => (
                    <li key={guest.id}>
                      {guest.guest_name} (Gäst till{' '}
                      {players.find((p) => p.id === guest.host_player_id)?.name ?? 'okänd'}){' '}
                      {guest.host_player_id === selectedPlayerId && (
                        <button
                          type="button"
                          className="inline"
                          onClick={() => void removeGuest(guest.id)}
                        >
                          Ångra
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </section>

            <section className="card">
              <h2>
                Kan inte (
                {noPlayers.length + guests.filter((guest) => guest.status === 'no').length})
              </h2>
              <ul>
                {noPlayers.map((player) => (
                  <li key={player.id}>{player.name}</li>
                ))}
                {guests
                  .filter((guest) => guest.status === 'no')
                  .map((guest) => (
                    <li key={guest.id}>
                      {guest.guest_name} (Gäst till{' '}
                      {players.find((p) => p.id === guest.host_player_id)?.name ?? 'okänd'}){' '}
                      {guest.host_player_id === selectedPlayerId && (
                        <button
                          type="button"
                          className="inline"
                          onClick={() => void removeGuest(guest.id)}
                        >
                          Ångra
                        </button>
                      )}
                    </li>
                  ))}
              </ul>
            </section>

            <section className="card">
              <h2>Inget svar ({unknownPlayers.length})</h2>
              <ul>
                {unknownPlayers.map((player) => (
                  <li key={player.id}>{player.name}</li>
                ))}
              </ul>
            </section>
          </article>
        </section>
      )}

      {tab === 'stats' && (
        <section className="stats-page">
          <div className="card">
            <label htmlFor="season">Välj säsong</label>
            <select
              id="season"
              value={selectedSeasonId}
              onChange={(event) => setSelectedSeasonId(event.target.value)}
            >
              <option value={ALL_SEASONS}>Alla säsonger</option>
              {seasons.map((season) => (
                <option key={season.id} value={season.id}>
                  {season.label}
                </option>
              ))}
            </select>
            <p className="muted small">
              Marathontabellen räknar träningar du kommit på plus gäster du tagit med (som kom). Träningsligan
              räknar bara dina egna träningar.
            </p>
          </div>

          <div className="grid-two">
            <section className="card">
              <h2>Marathontabellen</h2>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Spelare</th>
                    <th>Poäng</th>
                  </tr>
                </thead>
                <tbody>
                  {marathonRows.map((row, index) => (
                    <tr key={`marathon-${index}-${row.name}`}>
                      <td>{row.rank}</td>
                      <td>{row.name}</td>
                      <td>{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card">
              <h2>Träningsligan</h2>
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Spelare</th>
                    <th>Poäng</th>
                  </tr>
                </thead>
                <tbody>
                  {trainingRows.map((row, index) => (
                    <tr key={`training-${index}-${row.name}`}>
                      <td>{row.rank}</td>
                      <td>{row.name}</td>
                      <td>{row.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          <section className="card">
            <h2>Bring-a-friend-ligan</h2>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Spelare</th>
                  <th>Poäng</th>
                </tr>
              </thead>
              <tbody>
                {friendRows.map((row, index) => (
                  <tr key={`friends-${index}-${row.name}`}>
                    <td>{row.rank}</td>
                    <td>{row.name}</td>
                    <td>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <div className="grid-two">
            <section className="card">
              <h2>Antal träningar</h2>
              <p>
                {statsSummary.trainings} ({statsSummary.cancelled} inställda)
              </p>
            </section>
            <section className="card">
              <h2>Genomsnittlig närvaro</h2>
              <p>
                {statsSummary.avgPlayers} ({statsSummary.avgWithGuests} med gäster)
              </p>
            </section>
          </div>
        </section>
      )}

      {tab === 'players' && (
        <section className="card">
          <h2>Spelare</h2>
          <ul>
            {players.map((player) => (
              <li key={player.id}>{player.name}</li>
            ))}
          </ul>
        </section>
      )}

      {tab === 'admin' && (
        <section className="card">
          <h2>Admin</h2>
          {!isAdminUnlocked ? (
            <form className="pin-form" onSubmit={unlockAdmin}>
              <p className="muted">Ange admin-PIN för att hantera spelare.</p>
              <label htmlFor="admin-pin">PIN-kod</label>
              <input
                id="admin-pin"
                type="password"
                inputMode="numeric"
                value={adminPinInput}
                onChange={(event) => setAdminPinInput(event.target.value)}
                placeholder="••••"
              />
              {adminPinError && <p className="error-text">{adminPinError}</p>}
              <button type="submit">Lås upp admin</button>
            </form>
          ) : (
            <>
              <p className="muted">Hantera spelare för gruppen.</p>
              <form className="player-form" onSubmit={(event) => void addPlayer(event)}>
                <label htmlFor="new-player">Lägg till spelare</label>
                <input
                  id="new-player"
                  value={newPlayer}
                  onChange={(event) => setNewPlayer(event.target.value)}
                  placeholder="Spelarens namn"
                />
                <button type="submit">Lägg till</button>
              </form>

              <h3>Ta bort spelare</h3>
              <ul>
                {players.map((player) => (
                  <li key={player.id} className="admin-row">
                    <span>{player.name}</span>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => void removePlayer(player.id)}
                      disabled={players.length === 1}
                    >
                      Ta bort
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  )
}

export default App
