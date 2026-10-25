/** Pure shaping for the methodology page: coverage grid and manifest grouping. */
import type { ManifestEntry, Status } from '@/lib/types'

export const COVERAGE_STATUSES = ['ok', 'partial', 'stale', 'failed', 'missing'] as const
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number]

export type CoverageCell = { season: string; family: string; status: CoverageStatus | 'unknown'; note: string | null }
export type CoverageGrid = { seasons: string[]; families: string[]; rows: Array<{ season: string; cells: CoverageCell[] }>; counts: Record<CoverageStatus | 'unknown', number> }

function coerceStatus(raw: string | undefined): CoverageStatus | 'unknown' {
  return (COVERAGE_STATUSES as ReadonlyArray<string>).includes(raw ?? '') ? (raw as CoverageStatus) : 'unknown'
}

/**
 * Shape `status.coverage[season][season_type][family]` into rows (seasons, newest first) × families.
 * Families come from `status.families` filtered to the ones that are season-scoped (appear in any
 * coverage entry), so season-less families like `teams` do not produce an empty column.
 */
export function shapeCoverage(status: Pick<Status, 'coverage' | 'families' | 'seasons'>, seasonType: string, manifest: ReadonlyArray<ManifestEntry> = []): CoverageGrid {
  const seasons = [...status.seasons]
  const present = new Set<string>()
  for (const s of seasons) for (const f of Object.keys(status.coverage?.[s]?.[seasonType] ?? {})) present.add(f)
  const families = status.families.filter((f) => present.has(f))
  const notes = new Map<string, string>()
  for (const e of manifest) {
    const text = e.note ?? e.error
    if (e.season && e.season_type === seasonType && text) notes.set(`${e.season}|${e.family}`, text)
  }
  const counts: CoverageGrid['counts'] = { ok: 0, partial: 0, stale: 0, failed: 0, missing: 0, unknown: 0 }
  const rows = seasons.map((season) => ({
    season,
    cells: families.map((family) => {
      const status_ = coerceStatus(status.coverage?.[season]?.[seasonType]?.[family])
      counts[status_] += 1
      return { season, family, status: status_, note: notes.get(`${season}|${family}`) ?? null }
    }),
  }))
  return { seasons, families, rows, counts }
}

export type FamilySummary = {
  family: string
  source: string
  latest_fetched_at: string | null
  rows: number
  entries: number
  ok: number
  notes: string[]
}

/** One line per family: distinct sources, newest fetch, summed rows and distinct notes/errors. */
export function groupManifest(entries: ReadonlyArray<ManifestEntry>, familyOrder: ReadonlyArray<string> = []): FamilySummary[] {
  const byFamily = new Map<string, ManifestEntry[]>()
  for (const e of entries) byFamily.set(e.family, [...(byFamily.get(e.family) ?? []), e])
  const order = (f: string) => { const i = familyOrder.indexOf(f); return i === -1 ? Number.MAX_SAFE_INTEGER : i }
  return [...byFamily.entries()]
    .sort(([a], [b]) => order(a) - order(b) || a.localeCompare(b))
    .map(([family, list]) => ({
      family,
      source: [...new Set(list.map((e) => e.source))].join(', '),
      latest_fetched_at: list.reduce<string | null>((acc, e) => (e.fetched_at && (!acc || e.fetched_at > acc) ? e.fetched_at : acc), null),
      rows: list.reduce((s, e) => s + (e.rows ?? 0), 0),
      entries: list.length,
      ok: list.filter((e) => e.status === 'ok').length,
      notes: [...new Set(list.map((e) => e.note ?? e.error).filter((n): n is string => Boolean(n)))],
    }))
}

export function humanFamily(family: string): string {
  const names: Record<string, string> = {
    teams: 'Teams',
    players: 'Players',
    combine_anthro: 'Combine measurements',
    player_season: 'Player season totals',
    player_game_logs: 'Player game logs',
    team_season: 'Team season totals',
    team_game_logs: 'Team game logs',
    games: 'Games',
    events: 'Play-by-play events',
    event_participants: 'Event participants',
    event_id_map: 'Shot-to-event id map',
    shots: 'Shots',
    shot_league_zone_avg: 'League zone averages',
    matchups: 'Matchups',
    defense_dash: 'Defense dashboards',
    lineups: 'Lineups',
    on_off: 'On/off',
  }
  return names[family] ?? family.replace(/_/g, ' ')
}
