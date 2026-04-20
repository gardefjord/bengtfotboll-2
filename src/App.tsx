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
  PRACTICE_SESSION_SELECT_EXTENDED,
  probePracticeSessionMeta,
  probeLegacyTotalsTables,
  loadSessionAttendanceAndGuests,
  type Attendance,
  type GuestRow,
  type PlayerRow,
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

const normalizeSessionRow = (row: SessionRow): SessionRow => ({
  ...row,
  is_cancelled: Boolean(row.is_cancelled),
  season_id: row.season_id ?? null,
})

const formatSupabaseError = (error: unknown) => {
  if (error && typeof error === 'object' && 'message' in error) {
    const message = String((error as { message?: string }).message ?? error)
    if (message.toLowerCase().includes('is_cancelled') || message.includes('season_id')) {
      return `Supabase-fel: ${message}. Kör migreringen supabase/migration-stats-seasons.sql i SQL Editor.`
    }
    return `Supabase-fel: ${message}`
  }
  return 'Kunde inte ladda data från Supabase.'
}

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
  const [includeSessionMeta, setIncludeSessionMeta] = useState(false)

  const [statsSummary, setStatsSummary] = useState({
    trainings: 0,
    cancelled: 0,
    avgPlayers: 0,
    avgWithGuests: 0,
  })
  const [trainingRows, setTrainingRows] = useState<{ rank: number; name: string; points: number }[]>(
    [],
  )
  const [friendRows, setFriendRows] = useState<{ rank: number; name: string; points: number }[]>([])

  const [legacyTrainingByName, setLegacyTrainingByName] = useState<Record<string, number>>({})
  const [legacyFriendByName, setLegacyFriendByName] = useState<Record<string, number>>({})
  const [legacySummary, setLegacySummary] = useState<{
    trainings: number
    cancelled: number
    avgPlayers: number
    avgWithGuests: number
  } | null>(null)

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
    const loadLegacyStats = async () => {
      if (!supabase || !groupId) {
        return
      }

      const legacyAvailable = await probeLegacyTotalsTables(supabase)
      if (!legacyAvailable) {
        setLegacyTrainingByName({})
        setLegacyFriendByName({})
        setLegacySummary(null)
        return
      }

      const [{ data: trainingRowsData, error: trainingError }, { data: friendRowsData, error: friendError }, { data: summaryRow, error: summaryError }] =
        await Promise.all([
          supabase.from('legacy_training_totals').select('player_name, points').eq('group_id', groupId),
          supabase.from('legacy_friend_totals').select('player_name, points').eq('group_id', groupId),
          supabase.from('legacy_summary').select('trainings, cancelled, avg_players, avg_with_guests').eq('group_id', groupId).maybeSingle(),
        ])

      if (trainingError) {
        console.error(trainingError)
      }
      if (friendError) {
        console.error(friendError)
      }
      if (summaryError) {
        console.error(summaryError)
      }

      const nextTraining: Record<string, number> = {}
      for (const row of trainingRowsData ?? []) {
        const key = String(row.player_name).trim()
        if (!key) {
          continue
        }
        nextTraining[key] = Number(row.points)
      }

      const nextFriend: Record<string, number> = {}
      for (const row of friendRowsData ?? []) {
        const key = String(row.player_name).trim()
        if (!key) {
          continue
        }
        nextFriend[key] = Number(row.points)
      }

      setLegacyTrainingByName(nextTraining)
      setLegacyFriendByName(nextFriend)

      if (summaryRow) {
        setLegacySummary({
          trainings: Number(summaryRow.trainings),
          cancelled: Number(summaryRow.cancelled),
          avgPlayers: Number(summaryRow.avg_players),
          avgWithGuests: Number(summaryRow.avg_with_guests),
        })
      } else {
        setLegacySummary(null)
      }
    }

    void loadLegacyStats()
  }, [groupId, supabase])

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
        const resolvedIncludeSessionMeta = await probePracticeSessionMeta(client)
        setIncludeSessionMeta(resolvedIncludeSessionMeta)

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

        const today = new Date()
        const targetPractice = getNextPracticeDate(today)
        const sessionDate = toDateOnly(targetPractice)

        await closeStaleSessions(client, resolvedGroupId, toDateOnly(today))

        const existingSession = await fetchOpenSession(
          client,
          resolvedGroupId,
          resolvedIncludeSessionMeta,
        )
        let activeSession = existingSession
          ? normalizeSessionRow(existingSession as SessionRow)
          : null
        if (!activeSession || activeSession.session_date !== sessionDate) {
          const insertPayload: Record<string, unknown> = {
            group_id: resolvedGroupId,
            session_date: sessionDate,
            status: 'open',
          }
          if (resolvedIncludeSessionMeta) {
            insertPayload.is_cancelled = false
          }

          let insertedSession: SessionRow | null = null
          let sessionInsertError = null

          if (resolvedIncludeSessionMeta) {
            const inserted = await client
              .from('practice_sessions')
              .insert(insertPayload)
              .select(PRACTICE_SESSION_SELECT_EXTENDED)
              .single()
            insertedSession = inserted.data as SessionRow | null
            sessionInsertError = inserted.error
          } else {
            const inserted = await client
              .from('practice_sessions')
              .insert(insertPayload)
              .select('id, session_date, status')
              .single()
            insertedSession = inserted.data as SessionRow | null
            sessionInsertError = inserted.error
          }

          if (sessionInsertError) {
            const reopened = await fetchOpenSession(
              client,
              resolvedGroupId,
              resolvedIncludeSessionMeta,
            )
            activeSession = reopened ? normalizeSessionRow(reopened as SessionRow) : null
            if (!activeSession) {
              throw sessionInsertError
            }
          } else {
            activeSession = normalizeSessionRow(insertedSession as SessionRow)
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

        const closedRaw = await fetchClosedSessions(
          client,
          resolvedGroupId,
          resolvedIncludeSessionMeta,
        )
        setClosedSessions(closedRaw.map((row) => normalizeSessionRow(row as SessionRow)))
      } catch (error) {
        console.error(error)
        setLoadError(formatSupabaseError(error))
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

    const closed = await fetchClosedSessions(supabase, groupId, includeSessionMeta)
    setClosedSessions(closed.map((row) => normalizeSessionRow(row as SessionRow)))
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
      const closed = await fetchClosedSessions(supabase, groupId, includeSessionMeta)
      setClosedSessions(closed.map((row) => normalizeSessionRow(row as SessionRow)))
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

  const rankRowsFromNameMap = (nameToPoints: Record<string, number>) => {
    const entries = Object.entries(nameToPoints)
      .map(([name, points]) => ({ name, points }))
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

      const hasLegacyTraining = Object.keys(legacyTrainingByName).length > 0
      const hasLegacyFriend = Object.keys(legacyFriendByName).length > 0

      if (hasLegacyTraining) {
        setTrainingRows(rankRowsFromNameMap(legacyTrainingByName))
      }
      if (hasLegacyFriend) {
        setFriendRows(rankRowsFromNameMap(legacyFriendByName))
      }

      if (legacySummary) {
        setStatsSummary({
          trainings: legacySummary.trainings,
          cancelled: legacySummary.cancelled,
          avgPlayers: legacySummary.avgPlayers,
          avgWithGuests: legacySummary.avgWithGuests,
        })
      }

      const sessionsForStats = closedSessions.filter((row) => !Boolean(row.is_cancelled))
      const cancelledCount = closedSessions.filter((row) => Boolean(row.is_cancelled)).length

      if (sessionsForStats.length === 0) {
        if (!legacySummary) {
          setStatsSummary({
            trainings: 0,
            cancelled: cancelledCount,
            avgPlayers: 0,
            avgWithGuests: 0,
          })
        }
        if (!hasLegacyTraining) {
          setTrainingRows([])
        }
        if (!hasLegacyFriend) {
          setFriendRows([])
        }
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

      let sumPlayers = 0
      let sumWithGuests = 0
      for (const sessionRow of sessionsForStats) {
        sumPlayers += yesBySession.get(sessionRow.id) ?? 0
        sumWithGuests +=
          (yesBySession.get(sessionRow.id) ?? 0) + (guestYesBySession.get(sessionRow.id) ?? 0)
      }

      if (!legacySummary) {
        setStatsSummary({
          trainings: sessionsForStats.length,
          cancelled: cancelledCount,
          avgPlayers: Math.round((sumPlayers / sessionsForStats.length) * 100) / 100,
          avgWithGuests: Math.round((sumWithGuests / sessionsForStats.length) * 100) / 100,
        })
      }

      if (!hasLegacyTraining) {
        setTrainingRows(rankRows(trainingScore))
      }
      if (!hasLegacyFriend) {
        setFriendRows(rankRows(friendScore))
      }
    }

    void loadStats()
  }, [
    closedSessions,
    players,
    supabase,
    legacyTrainingByName,
    legacyFriendByName,
    legacySummary,
  ])

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
            <h2>Statistik</h2>
            <p className="muted small">
              Poäng = antal gånger du svarat <strong>Kommer</strong> på stängda träningar. Bring-a-friend räknar
              gäster du tagit med som kommer.
            </p>
          </div>

          <div className="grid-two">
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
          </div>

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
