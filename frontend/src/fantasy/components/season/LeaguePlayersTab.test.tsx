import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { LeaguePerformerRow, LeaguePerformersResponse } from '../../api/types'
import { useSeasonStore } from '../../store/seasonStore'
import { makeOverview } from '../../test/seasonFixtures'
import { LeaguePlayersTab } from './LeaguePlayersTab'

function row(rank: number, id: string, name: string, manager: string, contribution: number, owners: LeaguePerformerRow['owners'] = [{ manager_id: manager, periods: [2], games: 3 }]): LeaguePerformerRow {
  const line = { PTS: 60, REB: 15, AST: 12, STL: 3, BLK: 2, TOV: 6, FG3M: 6, FG3A: 15, FGM: 21, FGA: 45, FTM: 12, FTA: 15, FG_PCT: 0.467, FT_PCT: 0.8 }
  return {
    rank,
    owner_id: manager,
    owners,
    player: { player_id: id, name, team: 'BOS', primary_position: 'PG', eligible_positions: ['PG'], eligibility_verified: true, injury_status: null, adp: null, rank: null, projection_source: 'blend', per_game: {}, per_game_sd: {}, drafted_by: null, drafted_overall: null, espn_id: null, nba_id: null } as unknown as LeaguePerformerRow['player'],
    games: 3,
    periods: 1,
    minutes: 90,
    contribution,
    contribution_per_game: contribution / 3,
    expected_contribution: contribution - 1,
    over_expected: 1,
    over_expected_per_game: 1 / 3,
    actual: line,
    expected: line,
    actual_per_game: line,
    expected_per_game: line,
    category_z: {},
    contribution_by_category: {},
    expected_by_category: null,
    flags: [],
  }
}

const response: LeaguePerformersResponse = {
  ids: makeOverview().ids,
  scope: 'week',
  period: 2,
  periods_available: [1, 2],
  baseline: 'projection',
  source: 'ESPN box scores',
  categories: [],
  unit_sizes: {},
  benchmark_rates: {},
  managers: { m01: 'Me', m02: 'Them' },
  user_manager_id: 'm01',
  rows: [row(1, 'a', 'Star Player', 'm01', 12), row(2, 'b', 'Their Guy', 'm02', 9), row(3, 'c', 'Role Player', 'm01', 4)],
  notes: [],
}

describe('LeaguePlayersTab', () => {
  beforeEach(() => {
    useSeasonStore.setState({ overview: makeOverview(), leaguePerformers: response, leaguePerformersStatus: 'ready', leaguePerformersError: null, loadLeaguePerformers: async () => {} })
  })

  it('lists every team\'s players with their fantasy team, and highlights teams picked from the legend', () => {
    render(<LeaguePlayersTab sessionId="sess" />)
    const rows = screen.getAllByTestId('performer-row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByText('Them')).toBeInTheDocument()
    expect(rows.every((r) => !r.classList.contains('tinted'))).toBe(true)
    const legend = screen.getByRole('group', { name: /highlight teams/i })
    fireEvent.click(within(legend).getByRole('button', { name: /them/i }))
    expect(screen.getByText('Their Guy').closest('tr')).toHaveClass('tinted')
    expect(screen.getByText('Star Player').closest('tr')).not.toHaveClass('tinted')
    fireEvent.click(within(legend).getByRole('button', { name: /^me/i }))
    expect(screen.getByText('Star Player').closest('tr')).toHaveClass('tinted')
    expect(screen.getByText('Their Guy').closest('tr')).toHaveClass('tinted')
    fireEvent.click(within(legend).getByRole('button', { name: /them/i }))
    expect(screen.getByText('Their Guy').closest('tr')).not.toHaveClass('tinted')
    fireEvent.click(screen.getByRole('button', { name: /clear highlights/i }))
    expect(screen.getAllByTestId('performer-row').every((r) => !r.classList.contains('tinted'))).toBe(true)
  })

  it('offers weekly or season scope and the synced weeks', () => {
    render(<LeaguePlayersTab sessionId="sess" />)
    expect(screen.getByTestId('lp-scope-week')).toHaveAttribute('aria-selected', 'true')
    const week = screen.getByLabelText('Week') as HTMLSelectElement
    expect(Array.from(week.options).map((o) => o.value)).toEqual(['1', '2'])
    expect(week.value).toBe('2')
    fireEvent.click(screen.getByTestId('lp-scope-season'))
    expect(screen.queryByLabelText('Week')).toBeNull()
  })
})

describe('LeaguePlayersTab week default', () => {
  it('never shows season totals under a week label: it asks for the latest synced week once the weeks are known', () => {
    const calls: Array<number | null> = []
    useSeasonStore.setState({
      overview: makeOverview(),
      leaguePerformers: { ...response, scope: 'season', period: null },
      leaguePerformersStatus: 'ready',
      leaguePerformersError: null,
      loadLeaguePerformers: async (_id, period) => {
        calls.push(period)
      },
    })
    render(<LeaguePlayersTab sessionId="sess" />)
    expect(screen.queryAllByTestId('performer-row')).toHaveLength(0)
    expect(screen.getByText('Loading box scores')).toBeInTheDocument()
    expect(calls).toEqual([2])
    expect((screen.getByLabelText('Week') as HTMLSelectElement).value).toBe('2')
  })

  it('shows a traded player once, under his current team, with the earlier stint and the games per team', () => {
    const traded = { ...row(1, 'b', 'Their Guy', 'm02', 9, [{ manager_id: 'm01', periods: [1, 2], games: 5 }, { manager_id: 'm02', periods: [3, 4, 5], games: 9 }]), games: 14 }
    const released = { ...row(2, 'c', 'Cut Guy', 'm01', 4), owner_id: null }
    useSeasonStore.setState({ overview: makeOverview(), leaguePerformers: { ...response, rows: [traded, released] }, leaguePerformersStatus: 'ready', leaguePerformersError: null, loadLeaguePerformers: async () => {} })
    render(<LeaguePlayersTab sessionId="sess" />)
    const rows = screen.getAllByTestId('performer-row')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('Them')).toBeInTheDocument()
    expect(within(rows[0]).getByText('you wk 1–2 · Them wk 3–5')).toBeInTheDocument()
    expect(within(rows[0]).getByTitle('14 games counted: 5 for you, 9 for Them')).toBeInTheDocument()
    expect(within(rows[1]).getByText('Free agent')).toBeInTheDocument()
    expect(within(rows[1]).getByText('you wk 2')).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('group', { name: /highlight teams/i })).getByRole('button', { name: /them/i }))
    expect(rows[0]).toHaveClass('tinted')
    expect(rows[1]).not.toHaveClass('tinted')
  })
})

