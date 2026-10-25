import type { ManifestEntry } from '@/lib/types'
import { groupManifest, shapeCoverage } from './coverage'

const entry = (over: Partial<ManifestEntry>): ManifestEntry =>
  ({ family: 'shots', season: '2024-25', season_type: 'Regular Season', status: 'ok', rows: 10, fetched_at: '2026-01-01T00:00:00Z', source: 'nba_api', path: null, error: null, note: null, ...over })

describe('coverage matrix shaping', () => {
  const status = {
    seasons: ['2025-26', '2024-25'],
    families: ['teams', 'player_season', 'shots', 'matchups'],
    coverage: {
      '2025-26': { 'Regular Season': { player_season: 'ok', shots: 'partial', matchups: 'missing' }, Playoffs: { player_season: 'missing', shots: 'missing', matchups: 'missing' } },
      '2024-25': { 'Regular Season': { player_season: 'stale', shots: 'failed', matchups: 'bogus' } },
    },
  }
  it('builds seasons × season-scoped families with status chips and counts', () => {
    const grid = shapeCoverage(status, 'Regular Season')
    expect(grid.families).toEqual(['player_season', 'shots', 'matchups'])
    expect(grid.rows.map((r) => r.season)).toEqual(['2025-26', '2024-25'])
    expect(grid.rows[0].cells.map((c) => c.status)).toEqual(['ok', 'partial', 'missing'])
    expect(grid.rows[1].cells.map((c) => c.status)).toEqual(['stale', 'failed', 'unknown'])
    expect(grid.counts).toEqual({ ok: 1, partial: 1, stale: 1, failed: 1, missing: 1, unknown: 1 })
  })
  it('attaches the manifest note or error for the matching season type only', () => {
    const manifest = [
      entry({ season: '2025-26', note: 'capped at 50k rows' }),
      entry({ season: '2025-26', season_type: 'Playoffs', note: 'should not leak' }),
      entry({ family: 'matchups', season: '2024-25', status: 'failed', error: 'HTTP 429' }),
    ]
    const grid = shapeCoverage(status, 'Regular Season', manifest)
    expect(grid.rows[0].cells[1].note).toBe('capped at 50k rows')
    expect(grid.rows[0].cells[2].note).toBeNull()
    expect(grid.rows[1].cells[2].note).toBe('HTTP 429')
  })
  it('handles a season type with no coverage at all', () => {
    const grid = shapeCoverage(status, 'Pre Season')
    expect(grid.families).toEqual([])
    expect(grid.rows.every((r) => r.cells.length === 0)).toBe(true)
  })
})

describe('manifest grouping', () => {
  it('summarises per family with newest fetch, summed rows and distinct notes', () => {
    const grouped = groupManifest(
      [
        entry({ fetched_at: '2026-01-01T00:00:00Z', rows: 10, note: 'a' }),
        entry({ season: '2023-24', fetched_at: '2026-02-01T00:00:00Z', rows: 5, note: 'a' }),
        entry({ family: 'teams', season: null, season_type: null, rows: 30, status: 'failed', error: 'boom' }),
      ],
      ['teams', 'shots'],
    )
    expect(grouped.map((g) => g.family)).toEqual(['teams', 'shots'])
    expect(grouped[1]).toMatchObject({ rows: 15, entries: 2, ok: 2, latest_fetched_at: '2026-02-01T00:00:00Z', notes: ['a'] })
    expect(grouped[0]).toMatchObject({ ok: 0, notes: ['boom'] })
  })
})
