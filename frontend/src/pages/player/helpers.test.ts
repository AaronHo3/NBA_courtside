import { ageFromBirthdate, draftText, fg3aRate, groupTimeline, ratio, rescaleRow, resolveFocusSeason, seasonLabelFromYear, seasonRows, teamOrder, wingspanRatio } from './helpers'
import type { PlayerSeasonRow } from '@/lib/types'

const row = { season: '2025-26', gp: 10, min: 240, pts: 200, reb: 50, ast: 30, fga: 150, fg3a: 60, ts_pct: 0.6, usg_pct: 25, net_rating: 3.2, is_aggregate: false }

describe('rescaleRow', () => {
  it('returns totals untouched as a new object', () => {
    const out = rescaleRow(row, 'totals')
    expect(out).toEqual(row)
    expect(out).not.toBe(row)
  })
  it('divides counting stats by games and converts min to minutes per game', () => {
    const out = rescaleRow(row, 'per_game')
    expect(out.pts).toBe(20)
    expect(out.reb).toBe(5)
    expect(out.min).toBe(24)
    expect(out.gp).toBe(10)
    expect(row.pts).toBe(200)
  })
  it('scales counting stats to 36 minutes and keeps total minutes', () => {
    const out = rescaleRow(row, 'per_36')
    expect(out.pts).toBe(30)
    expect(out.ast).toBe(4.5)
    expect(out.min).toBe(240)
  })
  it('leaves percentages and rates alone', () => {
    const out = rescaleRow(row, 'per_36')
    expect(out.ts_pct).toBe(0.6)
    expect(out.usg_pct).toBe(25)
    expect(out.net_rating).toBe(3.2)
  })
  it('yields null, never zero, when the denominator is missing or zero', () => {
    expect(rescaleRow({ ...row, gp: 0 }, 'per_game').pts).toBeNull()
    expect(rescaleRow({ ...row, min: null }, 'per_36').pts).toBeNull()
    expect(rescaleRow({ ...row, pts: null }, 'per_game').pts).toBeNull()
  })
})

describe('ratios', () => {
  it('computes fg3a rate and handles nulls and zero attempts', () => {
    expect(fg3aRate(60, 150)).toBeCloseTo(0.4)
    expect(fg3aRate(null, 150)).toBeNull()
    expect(fg3aRate(10, 0)).toBeNull()
    expect(fg3aRate(10, undefined)).toBeNull()
  })
  it('computes wingspan-to-height ratio only from combine numbers', () => {
    expect(wingspanRatio(88.75, 83)).toBeCloseTo(1.0693, 3)
    expect(wingspanRatio(null, 83)).toBeNull()
  })
  it('applies a scale factor', () => {
    expect(ratio(100, 200, 36)).toBe(18)
  })
})

describe('groupTimeline', () => {
  const stint = (season: string, team: string, gp: number, min: number) => ({ season, season_type: 'Regular Season' as const, team_id: team.length, team_abbreviation: team, team_name: null, gp, min })
  it('groups stints by season, sorted, flagging traded seasons', () => {
    const grouped = groupTimeline([stint('2025-26', 'ASH', 30, 870), stint('2023-24', 'IRO', 77, 2240), stint('2025-26', 'VAL', 48, 1444)])
    expect(grouped.map((g) => g.season)).toEqual(['2023-24', '2025-26'])
    expect(grouped[0].traded).toBe(false)
    expect(grouped[1].traded).toBe(true)
    expect(grouped[1].stints.map((s) => s.team_abbreviation)).toEqual(['ASH', 'VAL'])
    expect(grouped[1].gp).toBe(78)
    expect(grouped[1].min).toBe(2314)
  })
  it('orders teams by first appearance', () => {
    expect(teamOrder([stint('2025-26', 'VAL', 1, 1), stint('2023-24', 'IRO', 1, 1), stint('2025-26', 'ASH', 1, 1)])).toEqual(['IRO', 'VAL', 'ASH'])
  })
})

describe('season selection', () => {
  const mk = (season: string, team: string, agg = false) => ({ season, team_abbreviation: team, is_aggregate: agg }) as unknown as PlayerSeasonRow
  it('prefers the TOT aggregate row for a traded season', () => {
    const rows = seasonRows([mk('2025-26', 'ASH'), mk('2025-26', 'TOT', true), mk('2024-25', 'IRO'), mk('2025-26', 'VAL')])
    expect(rows.map((r) => `${r.season}:${r.team_abbreviation}`)).toEqual(['2024-25:IRO', '2025-26:TOT'])
  })
  it('resolves the focus season from request, global, then latest played', () => {
    const played = ['2025-26', '2024-25']
    expect(resolveFocusSeason('2024-25', '2025-26', played)).toBe('2024-25')
    expect(resolveFocusSeason('2016-17', '2025-26', played)).toBe('2025-26')
    expect(resolveFocusSeason('', '2016-17', played)).toBe('2025-26')
    expect(resolveFocusSeason('', '2016-17', [])).toBe('2016-17')
  })
})

describe('bio text', () => {
  it('computes whole-year age', () => {
    expect(ageFromBirthdate('1995-02-13T00:00:00', new Date('2026-10-08'))).toBe(31)
    expect(ageFromBirthdate('1995-12-13T00:00:00', new Date('2026-10-08'))).toBe(30)
    expect(ageFromBirthdate(null)).toBeNull()
  })
  it('labels seasons and draft status', () => {
    expect(seasonLabelFromYear(2016)).toBe('2016-17')
    expect(seasonLabelFromYear(null)).toBeNull()
    expect(draftText({ draft_year: null, draft_round: null, draft_number: null })).toBe('Undrafted')
    expect(draftText({ draft_year: 2016, draft_round: 2, draft_number: 22 })).toBe('Drafted 2016, round 2, pick 22')
  })
})
