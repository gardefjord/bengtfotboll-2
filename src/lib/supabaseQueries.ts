import type { SupabaseClient } from '@supabase/supabase-js'

export type PlayerRow = {
  id: string
  name: string
}

export type SessionRow = {
  id: string
  session_date: string
  status: 'open' | 'closed'
  is_cancelled: boolean
  season_id: string | null
}

export type SeasonRow = {
  id: string
  label: string
  starts_on: string | null
  ends_on: string | null
}

export type GuestRow = {
  id: string
  guest_name: string
  host_player_id: string
  status: 'yes' | 'no'
}

export type Attendance = 'yes' | 'no' | 'unknown'

export const closeStaleSessions = async (
  client: SupabaseClient,
  resolvedGroupId: string,
  todayKey: string,
) => {
  const { data: openSessions, error } = await client
    .from('practice_sessions')
    .select('id, session_date, status')
    .eq('group_id', resolvedGroupId)
    .eq('status', 'open')

  if (error) {
    throw error
  }

  const stale = (openSessions as SessionRow[]).filter((row) => row.session_date < todayKey)
  if (stale.length === 0) {
    return
  }

  const ids = stale.map((row) => row.id)
  const { error: updateError } = await client
    .from('practice_sessions')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .in('id', ids)

  if (updateError) {
    throw updateError
  }
}

export const fetchOpenSession = async (client: SupabaseClient, resolvedGroupId: string) => {
  const { data, error } = await client
    .from('practice_sessions')
    .select('id, session_date, status, is_cancelled, season_id')
    .eq('group_id', resolvedGroupId)
    .eq('status', 'open')
    .order('session_date', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) {
    throw error
  }
  return (data as SessionRow | null) ?? null
}

export const fetchClosedSessions = async (client: SupabaseClient, resolvedGroupId: string) => {
  const { data, error } = await client
    .from('practice_sessions')
    .select('id, session_date, status, is_cancelled, season_id')
    .eq('group_id', resolvedGroupId)
    .eq('status', 'closed')
    .order('session_date', { ascending: true })

  if (error) {
    throw error
  }
  return (data as SessionRow[]) ?? []
}

export const ensureAttendanceRows = async (
  client: SupabaseClient,
  sessionId: string,
  playerIds: string[],
) => {
  if (playerIds.length === 0) {
    return
  }

  const { data: existingRows, error: existingError } = await client
    .from('attendance')
    .select('player_id')
    .eq('session_id', sessionId)
    .in('player_id', playerIds)

  if (existingError) {
    throw existingError
  }

  const existing = new Set((existingRows ?? []).map((row) => row.player_id as string))
  const missing = playerIds.filter((id) => !existing.has(id))
  if (missing.length === 0) {
    return
  }

  const rows = missing.map((player_id) => ({
    session_id: sessionId,
    player_id,
    status: 'unknown' as const,
  }))

  const { error } = await client.from('attendance').insert(rows)
  if (error) {
    throw error
  }
}

export const loadSessionAttendanceAndGuests = async (
  client: SupabaseClient,
  sessionId: string,
  playerList: PlayerRow[],
) => {
  const { data: attendanceRows, error: attendanceError } = await client
    .from('attendance')
    .select('player_id, status')
    .eq('session_id', sessionId)

  if (attendanceError) {
    throw attendanceError
  }

  const nextResponses: Record<string, Attendance> = {}
  for (const player of playerList) {
    nextResponses[player.id] = 'unknown'
  }
  for (const row of attendanceRows ?? []) {
    nextResponses[row.player_id as string] = row.status as Attendance
  }

  const { data: guestRows, error: guestError } = await client
    .from('session_guests')
    .select('id, guest_name, host_player_id, status')
    .eq('session_id', sessionId)

  if (guestError) {
    throw guestError
  }

  return {
    responses: nextResponses,
    guests: (guestRows as GuestRow[]) ?? [],
  }
}
