import { keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryOptions } from '@tanstack/react-query'
import { apiGet, apiPost, apiSend, type Envelope, type QueryValue } from '@/lib/api'
import type {
  Capabilities, CourtGeometry, DefenseDashRow, EventDetail, EvidenceItem, ExplorerMeta, Game, GameCoverage, GameEvent, HexBin,
  IngestionStatus, Lens, Manifest, MatchupMeta, MatchupRow, Metric, Normalization, PageMeta, Percentiles, PlayerProfile, PlayerRow,
  PlayerSearchHit, RankingMeta, RankingRow, RosterMetricsRow, Shot, ShotEvidence, ShotEvidenceMeta, ShotFilterOptions, ShotMeta,
  CandidateMeta, CandidateRow, Report, ReportSummary, RoleTemplateDto, ScoutingProfile,
  Shortlist, ShortlistSummary, Status, Team, TeamSeason, TeamSeasonDetail, ZoneSummary,
} from '@/lib/types'

type Params = Record<string, QueryValue>
// `useEnvelopeQuery` is a custom hook (name starts with `use`) so the rules-of-hooks lint applies correctly.
const STATIC = { staleTime: Infinity } as const
const KEEP = { placeholderData: keepPreviousData } as const

function useEnvelopeQuery<T, M = Record<string, unknown>>(key: unknown[], path: string, params?: Params, options?: Partial<UseQueryOptions<Envelope<T, M>>>) {
  return useQuery<Envelope<T, M>>({ queryKey: key, queryFn: ({ signal }) => apiGet<T, M>(path, params, signal), ...options })
}

export const useStatus = () => useEnvelopeQuery<Status>(['status'], '/api/analytics/meta/status', undefined, STATIC)
export const useMetrics = () => useEnvelopeQuery<Metric[]>(['metrics'], '/api/analytics/meta/metrics', undefined, STATIC)
export const useCourt = () => useEnvelopeQuery<CourtGeometry>(['court'], '/api/analytics/meta/court', undefined, STATIC)
export const useTeams = () => useEnvelopeQuery<Team[]>(['teams'], '/api/analytics/meta/teams', undefined, STATIC)
export const useManifest = () => useEnvelopeQuery<Manifest>(['manifest'], '/api/analytics/meta/manifest')
export const useIngestionStatus = (enabled = true) =>
  useEnvelopeQuery<IngestionStatus>(['ingestion'], '/api/analytics/ingestion/status', undefined, { enabled, refetchInterval: enabled ? 5000 : false })

export function useMetricIndex() {
  const m = useMetrics()
  const index = new Map<string, Metric>((m.data?.data ?? []).map((x) => [x.key, x]))
  return { index, get: (k: string) => index.get(k), list: m.data?.data ?? [], isLoading: m.isLoading }
}

export const usePlayerSearch = (query: string, limit = 12) =>
  useEnvelopeQuery<PlayerSearchHit[]>(['player-search', query, limit], '/api/analytics/players/search', { q: query, limit }, { enabled: query.trim().length > 0, ...KEEP })
export const usePlayer = (id: number | null) => useEnvelopeQuery<PlayerProfile>(['player', id], `/api/analytics/players/${id}`, undefined, { enabled: id !== null && id > 0 })
export const usePercentiles = (id: number | null, params: Params) =>
  useEnvelopeQuery<Percentiles>(['percentiles', id, params], `/api/analytics/players/${id}/percentiles`, params, { enabled: id !== null && Boolean(params.season), ...KEEP })

export type ExplorerParams = Params & { season: string; season_type?: string; normalization?: Normalization }
export const useExplorer = (params: ExplorerParams, enabled = true) =>
  useEnvelopeQuery<PlayerRow[], ExplorerMeta>(['explorer', params], '/api/analytics/league/explorer', params, { enabled: enabled && Boolean(params.season), ...KEEP })

export const useShotMarkers = (params: Params, enabled = true) =>
  useEnvelopeQuery<Shot[], ShotMeta>(['shots', 'markers', params], '/api/analytics/shots/markers', params, { enabled: enabled && Boolean(params.season), ...KEEP })
export const useHexbins = (params: Params, enabled = true) =>
  useEnvelopeQuery<HexBin[], ShotMeta>(['shots', 'hexbins', params], '/api/analytics/shots/hexbins', params, { enabled: enabled && Boolean(params.season), ...KEEP })
export const useZones = (params: Params, enabled = true) =>
  useEnvelopeQuery<ZoneSummary[], ShotMeta>(['shots', 'zones', params], '/api/analytics/shots/zones', params, { enabled: enabled && Boolean(params.season), ...KEEP })
export const useShotFilters = (params: Params, enabled = true) =>
  useEnvelopeQuery<ShotFilterOptions, ShotMeta>(['shots', 'filters', params], '/api/analytics/shots/filters', params, { enabled: enabled && Boolean(params.season), ...KEEP })

export const useMatchupAvailability = (season: string, season_type: string) =>
  useEnvelopeQuery<{ available: boolean; reason: string | null }>(['matchups', 'avail', season, season_type], '/api/analytics/matchups/availability', { season, season_type }, { enabled: Boolean(season) })
export const useMatchupOffense = (id: number | null, params: Params) =>
  useEnvelopeQuery<MatchupRow[], MatchupMeta>(['matchups', 'offense', id, params], `/api/analytics/matchups/offense/${id}`, params, { enabled: id !== null && Boolean(params.season), ...KEEP })
export const useMatchupDefense = (id: number | null, params: Params) =>
  useEnvelopeQuery<MatchupRow[], MatchupMeta>(['matchups', 'defense', id, params], `/api/analytics/matchups/defense/${id}`, params, { enabled: id !== null && Boolean(params.season), ...KEEP })
export const useMatchupPair = (off: number | null, def: number | null) =>
  useEnvelopeQuery<{ seasons: MatchupRow[]; total: MatchupRow | null; prior: { mean: number; strength: number } | null }>(['matchups', 'pair', off, def], '/api/analytics/matchups/pair', { off_player_id: off, def_player_id: def }, { enabled: Boolean(off && def) })
export const useMatchupHeatmap = (params: Params, enabled = true) =>
  useEnvelopeQuery<{ offense: Array<{ player_id: number; full_name: string; position: string | null }>; defense: Array<{ player_id: number; full_name: string; position: string | null }>; cells: Array<MatchupRow & { low_sample: boolean }> }, MatchupMeta>(
    ['matchups', 'heatmap', params], '/api/analytics/matchups/heatmap', params, { enabled: enabled && Boolean(params.season && params.team_id && params.opponent_team_id), ...KEEP })
export const useDefenseDash = (id: number | null, params: Params) =>
  useEnvelopeQuery<DefenseDashRow[], { definition: string }>(['defense', id, params], `/api/analytics/defense/${id}`, params, { enabled: id !== null && Boolean(params.season), ...KEEP })

export const useTeamList = () => useEnvelopeQuery<Team[]>(['teams-list'], '/api/analytics/teams', undefined, STATIC)
export const useTeamSeasons = (id: number | null) => useEnvelopeQuery<TeamSeason[]>(['team-seasons', id], `/api/analytics/teams/${id}/seasons`, undefined, { enabled: id !== null && id > 0 })
export const useTeamSeason = (id: number | null, params: Params) =>
  useEnvelopeQuery<TeamSeasonDetail, { min_lineup_poss: number }>(['team-season', id, params], `/api/analytics/teams/${id}/season`, params, { enabled: id !== null && Boolean(params.season), ...KEEP })
export const useTeamLeague = (params: Params) => useEnvelopeQuery<TeamSeason[], { caveat: string }>(['team-league', params], '/api/analytics/teams/league', params, { enabled: Boolean(params.season), ...KEEP })
export const useRosterMetrics = (params: Params) =>
  useEnvelopeQuery<RosterMetricsRow[], { caveat: string; definitions: Record<string, string> }>(['roster-metrics', params], '/api/analytics/teams/roster-metrics', params, { enabled: Boolean(params.season), ...KEEP })

export const useLenses = () => useEnvelopeQuery<Lens[], { disclaimer: string }>(['lenses'], '/api/analytics/rankings/lenses', undefined, STATIC)
export const useRanking = (params: Params, enabled = true) =>
  useEnvelopeQuery<RankingRow[], RankingMeta>(['ranking', params], '/api/analytics/rankings', params, { enabled: enabled && Boolean(params.season && params.lens), ...KEEP })
export function useCustomRanking(body: Record<string, unknown> | null) {
  return useQuery<Envelope<RankingRow[], RankingMeta>>({
    queryKey: ['ranking-custom', body],
    queryFn: () => apiPost<RankingRow[], RankingMeta>('/api/analytics/rankings/custom', body),
    enabled: body !== null,
    placeholderData: keepPreviousData,
  })
}

/** Pair history with an explicit prior strength (attempts) so the shrunk column matches the explorer's setting. */
export const useMatchupPairAt = (off: number | null, def: number | null, prior_strength: number) =>
  useEnvelopeQuery<{ seasons: MatchupRow[]; total: MatchupRow | null; prior: { mean: number; strength: number } | null }>(['matchups', 'pair', off, def, prior_strength], '/api/analytics/matchups/pair', { off_player_id: off, def_player_id: def, prior_strength }, { enabled: Boolean(off && def), ...KEEP })

// --- scouting extension ------------------------------------------------------------------------------
export const useCapabilities = () => useEnvelopeQuery<Capabilities>(['capabilities'], '/api/analytics/meta/capabilities', undefined, STATIC)
export const useGames = (params: Params) => useEnvelopeQuery<Game[], PageMeta>(['games', params], '/api/analytics/games', params, { enabled: Boolean(params.season), ...KEEP })
export const useGame = (gameId: string | null) =>
  useEnvelopeQuery<{ game: Game; coverage: GameCoverage }>(['game', gameId], `/api/analytics/games/${gameId}`, undefined, { enabled: Boolean(gameId) })
export const useGameEvents = (gameId: string | null, params: Params) =>
  useEnvelopeQuery<GameEvent[], PageMeta>(['game-events', gameId, params], `/api/analytics/games/${gameId}/events`, params, { enabled: Boolean(gameId), ...KEEP })
export const useEventDetail = (system: string | null, gameId: string | null, eventId: number | null) =>
  useEnvelopeQuery<EventDetail>(['event', system, gameId, eventId], `/api/analytics/events/${system}/${gameId}/${eventId}`, undefined, { enabled: Boolean(system && gameId) && eventId !== null })
export const useShotEvidence = (gameId: string | null, gameEventId: number | null) =>
  useEnvelopeQuery<ShotEvidence | null, ShotEvidenceMeta>(['shot-evidence', gameId, gameEventId], `/api/analytics/shots/${gameId}/${gameEventId}/evidence`, undefined, { enabled: Boolean(gameId) && gameEventId !== null })
export const useEvidence = (params: Params, enabled = true) => useEnvelopeQuery<EvidenceItem[], PageMeta>(['evidence', params], '/api/analytics/evidence', params, { enabled, ...KEEP })
export const useShortlists = () => useEnvelopeQuery<ShortlistSummary[], { total: number }>(['shortlists'], '/api/analytics/scouting/shortlists')
export const useShortlistDetail = (id: string | null) =>
  useEnvelopeQuery<Shortlist>(['shortlist', id], `/api/analytics/scouting/shortlists/${id}`, undefined, { enabled: Boolean(id) })

// --- scouting workspace (C-06) ----------------------------------------------------------------------
export const useTraitRegistry = () => useEnvelopeQuery<Array<{ key: string; label: string; units: string; evidence_class: string; definition: string }>, { trait_registry_version: number }>(['trait-registry'], '/api/analytics/scouting/traits', undefined, STATIC)
export const useRoles = () => useEnvelopeQuery<RoleTemplateDto[], { trait_registry_version: number }>(['roles'], '/api/analytics/scouting/roles')
export const useCandidates = (params: Params, enabled = true) =>
  useEnvelopeQuery<CandidateRow[], CandidateMeta>(['candidates', params], '/api/analytics/scouting/candidates', params, { enabled: enabled && Boolean(params.season && params.role), ...KEEP })
export const useScoutingProfile = (playerId: number | null, params: Params) =>
  useEnvelopeQuery<ScoutingProfile, { snapshot_id: string; data_fingerprint: string }>(['scouting-profile', playerId, params], `/api/analytics/scouting/profiles/${playerId}`, params, { enabled: playerId !== null && Boolean(params.season), ...KEEP })
export const useReports = () => useEnvelopeQuery<ReportSummary[], { total: number }>(['reports'], '/api/analytics/scouting/reports')
export const useReport = (id: string | null) => useEnvelopeQuery<Report, { llm_mode: string }>(['report', id], `/api/analytics/scouting/reports/${id}`, undefined, { enabled: Boolean(id) })

/** Mutations for shortlists and reports; each invalidates the queries it affects. */
export function useScoutingMutations() {
  const qc = useQueryClient()
  const touch = (...keys: string[]) => () => { for (const k of keys) void qc.invalidateQueries({ queryKey: [k] }) }
  return {
    createShortlist: useMutation({ mutationFn: (body: Record<string, unknown>) => apiSend<Shortlist>('POST', '/api/analytics/scouting/shortlists', body), onSuccess: touch('shortlists') }),
    addEntries: useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiSend<Shortlist>('POST', `/api/analytics/scouting/shortlists/${id}/entries`, body), onSuccess: touch('shortlists', 'shortlist') }),
    patchEntry: useMutation({ mutationFn: ({ id, playerId, body }: { id: string; playerId: number; body: Record<string, unknown> }) => apiSend<Shortlist>('PATCH', `/api/analytics/scouting/shortlists/${id}/entries/${playerId}`, body), onSuccess: touch('shortlist') }),
    removeEntry: useMutation({ mutationFn: ({ id, playerId }: { id: string; playerId: number }) => apiSend<Shortlist>('DELETE', `/api/analytics/scouting/shortlists/${id}/entries/${playerId}`), onSuccess: touch('shortlists', 'shortlist') }),
    createReport: useMutation({ mutationFn: (body: Record<string, unknown>) => apiSend<Report>('POST', '/api/analytics/scouting/reports', body), onSuccess: touch('reports') }),
    patchReport: useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiSend<Report>('PATCH', `/api/analytics/scouting/reports/${id}`, body), onSuccess: touch('reports', 'report') }),
    addClaims: useMutation({ mutationFn: ({ id, claims }: { id: string; claims: Array<Record<string, unknown>> }) => apiSend<Report>('POST', `/api/analytics/scouting/reports/${id}/claims`, { claims }), onSuccess: touch('report') }),
  }
}
