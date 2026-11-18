import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CategoryDef, PerformerRow } from '../../api/types'
import { PerformerTable } from './PerformerTable'

function row(rank: number, id: string, name: string, contribution: number, over: number | null, games = 3, flags: string[] = []): PerformerRow {
  return {
    rank,
    player: { player_id: id, name, team: 'BOS', primary_position: 'PG', eligible_positions: ['PG', 'G'], eligibility_verified: true, injury_status: null, adp: null, rank: null, projection_source: 'blend', per_game: {}, per_game_sd: {}, drafted_by: null, drafted_overall: null, espn_id: 1234 } as unknown as PerformerRow['player'],
    games,
    periods: 1,
    minutes: 90,
    contribution,
    contribution_per_game: games ? contribution / games : null,
    expected_contribution: over === null ? null : contribution - over,
    over_expected: over,
    over_expected_per_game: over === null ? null : over / games,
    actual: { PTS: 60, REB: 15, AST: 12, STL: 3, BLK: 2, TOV: 6, FG3M: 6, FG3A: 15, FGM: 21, FGA: 45, FTM: 12, FTA: 15, FG_PCT: 0.467, FT_PCT: 0.8 },
    expected: over === null ? null : { PTS: 54, REB: 15, AST: 12, STL: 3, BLK: 2, TOV: 6, FG3M: 6, FG3A: 15, FGM: 21, FGA: 45, FTM: 12, FTA: 15, FG_PCT: 0.467, FT_PCT: 0.8 },
    actual_per_game: { PTS: 20, REB: 5, AST: 4, STL: 1, BLK: 0.7, TOV: 2, FG3M: 2, FG3A: 5, FGM: 7, FGA: 15, FTM: 4, FTA: 5, FG_PCT: 0.467, FT_PCT: 0.8 },
    expected_per_game: over === null ? null : { PTS: 18, REB: 5, AST: 4, STL: 1, BLK: 0.7, TOV: 2, FG3M: 2, FG3A: 5, FGM: 7, FGA: 15, FTM: 4, FTA: 5, FG_PCT: 0.467, FT_PCT: 0.8 },
    category_z: { PTS: 0.3 },
    contribution_by_category: { PTS: 7.0, REB: 5.0 },
    expected_by_category: over === null ? null : { PTS: 6.5, REB: 5.0 },
    flags,
  }
}

const rows = [row(1, 'a', 'Star Player', 12, 0.5), row(2, 'b', 'Role Player', 8, 3.2), row(3, 'c', 'Prior Guy', 2, null, 2, ['small sample', 'no baseline'])]

describe('PerformerTable', () => {
  it('renders rank, games and flags, and sorts by a clicked column', () => {
    render(<PerformerTable rows={rows} metric="over_expected" />)
    const body = screen.getAllByTestId('performer-row')
    expect(body).toHaveLength(3)
    expect(within(body[0]).getByText('Star Player')).toBeInTheDocument()
    expect(within(body[2]).getByText(/small sample/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /sort by vs expected/i }))
    expect(within(screen.getAllByTestId('performer-row')[0]).getByText('Role Player')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /sort by vs expected/i }))
    expect(within(screen.getAllByTestId('performer-row')[0]).getByText('Star Player')).toBeInTheDocument()
  })

  it('expands a row to the full stat line with makes and attempts', () => {
    render(<PerformerTable rows={rows} metric="contribution" />)
    expect(screen.queryByTestId('performer-detail')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /details for Star Player/i }))
    const detail = screen.getByTestId('performer-detail')
    expect(detail).toHaveTextContent('21/45')
    expect(detail).toHaveTextContent('46.7%')
    expect(detail).toHaveTextContent(/Turnovers/)
    // the per-category breakdown that explains the headline number
    const breakdown = within(detail).getByRole('table', { name: /contribution by category/i })
    expect(breakdown).toHaveTextContent('7.0')
    expect(breakdown).toHaveTextContent('6.5')
    expect(breakdown).toHaveTextContent('+0.5')
  })

  it('shows a dash for a player without a baseline instead of inventing one', () => {
    render(<PerformerTable rows={rows} metric="over_expected" />)
    const prior = screen.getAllByTestId('performer-row')[2]
    expect(within(prior).getByTestId('over-expected')).toHaveTextContent('—')
  })
})

describe('PerformerTable drawer and league categories', () => {
  it('marks turnovers as not scored when the league has no TOV category', () => {
    const cats = [{ key: 'PTS', label: 'Points', higher_is_better: true, kind: 'counting' }] as unknown as CategoryDef[]
    render(<PerformerTable rows={rows} metric="contribution" categories={cats} />)
    fireEvent.click(screen.getByRole('button', { name: /details for Star Player/i }))
    expect(screen.getByTestId('performer-detail')).toHaveTextContent(/not scored in this league/i)
  })
})

describe('PerformerTable roster moves', () => {
  it('badges players added or dropped in the shown week next to their contribution', () => {
    render(
      <PerformerTable
        rows={rows}
        metric="contribution"
        moves={{ a: [{ kind: 'add', period: 1 }], b: [{ kind: 'drop', period: 1 }] }}
      />,
    )
    const body = screen.getAllByTestId('performer-row')
    expect(within(body[0]).getByText('added wk 1')).toBeInTheDocument()
    expect(within(body[1]).getByText('dropped wk 1')).toBeInTheDocument()
    expect(within(body[2]).queryByText(/wk 1/)).toBeNull()
  })
})

describe('PerformerTable fantasy team column', () => {
  it('shows each row\'s fantasy team, sorts by it, and tints only the highlighted teams', () => {
    const rows = [row(1, 'a', 'Star Player', 12, 0.5), row(2, 'b', 'Role Player', 8, 3.2)]
    const team = (r: PerformerRow) => (r.player.player_id === 'a' ? { id: 'm01', name: 'Zed Team', color: '#ff0000' } : { id: 'm02', name: 'Alpha Team', color: null })
    render(<PerformerTable rows={rows} metric="contribution" team={team} />)
    expect(screen.getByRole('columnheader', { name: /fantasy team/i })).toBeInTheDocument()
    const starRow = screen.getByText('Star Player').closest('tr')!
    const roleRow = screen.getByText('Role Player').closest('tr')!
    expect(within(starRow).getByText('Zed Team')).toBeInTheDocument()
    expect(starRow).toHaveClass('tinted')
    expect(starRow.style.getPropertyValue('--row-tint')).toBe('#ff0000')
    expect(roleRow).not.toHaveClass('tinted')
    fireEvent.click(screen.getByRole('button', { name: /sort by fantasy team/i }))
    const names = screen.getAllByTestId('performer-row').map((tr) => within(tr).getByRole('button', { name: /details for/i }).textContent)
    expect(names).toEqual(['Role Player', 'Star Player'])
  })
})
