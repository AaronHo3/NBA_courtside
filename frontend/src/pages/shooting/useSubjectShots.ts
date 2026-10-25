import { useMemo } from 'react'
import { useHexbins, usePlayer, useShotMarkers, useTeams, useZones } from '@/hooks/useApi'
import type { Filters, Subject } from './state'
import { subjectParams } from './state'

/** Markers, hexbins and zone summaries for one subject under the current filters. */
export function useSubjectShots(subject: Subject | null, seasonType: string, filters: Filters, sizeFt: number, minAttempts: number, wantMarkers: boolean) {
  const base = subject ? subjectParams(subject, seasonType, filters) : { season: '' }
  const enabled = subject !== null
  const markers = useShotMarkers(base, enabled && wantMarkers)
  const hexbins = useHexbins({ ...base, size_ft: sizeFt, min_attempts: minAttempts }, enabled)
  const zones = useZones({ ...base, min_attempts: minAttempts }, enabled)
  const available = hexbins.data ? hexbins.data.meta.available !== false : true
  const reason = hexbins.data?.meta.reason
  return { markers, hexbins, zones, available, reason, enabled }
}

/** Human label for a subject: player name or team abbreviation, plus its season when it differs from the global one. */
export function useSubjectLabel(subject: Subject | null, globalSeason: string): string {
  const player = usePlayer(subject?.kind === 'player' ? subject.id : null)
  const teams = useTeams()
  return useMemo(() => {
    if (!subject) return ''
    const name = subject.kind === 'player'
      ? player.data?.data.bio.full_name ?? `Player ${subject.id}`
      : teams.data?.data.find((t) => t.team_id === subject.id)?.full_name ?? `Team ${subject.id}`
    return subject.season !== globalSeason ? `${name} (${subject.season})` : name
  }, [subject, player.data, teams.data, globalSeason])
}
