import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import type { SeasonOverview, TeamPowerView } from '../../api/types'
import { useSeasonStore } from '../../store/seasonStore'
import { PowerTab } from './PowerTab'

function team(id: string, name: string, rank: number, cats: number, pts: number, z: number, isUser = false): TeamPowerView {
  return { manager_id: id, name, is_user: isUser, expected_cats: cats, rank, cat_win_prob: { PTS: pts, REB: 1 - pts }, z: { PTS: z, REB: -z / 2 }, n_players: 13, n_ir: 0 }
}

const overview: SeasonOverview = {
  ids: { draft_revision: 1, strategy_revision: 0, league_revision: 1, last_seq: 1, snapshot_id: 'x', projection_version: 'v', seed: 1 },
  linked: true,
  league_name: 'L',
  synced_at: null,
  summary: null,
  warnings: [],
  current_period: 1,
  league_categories: [
    { key: 'PTS', label: 'Points', higher_is_better: true, kind: 'counting', numerator: null, denominator: null },
    { key: 'REB', label: 'Rebounds', higher_is_better: true, kind: 'counting', numerator: null, denominator: null },
  ],
  manager_names: { m01: 'Aaron', m02: 'Manager 02', m03: 'Manager 03' },
  power: [team('m02', 'Manager 02', 1, 5.4, 0.3, -0.4), team('m01', 'Aaron', 2, 4.9, 0.7, 1.2, true), team('m03', 'Manager 03', 3, 4.1, 0.55, 0.8)],
  movement: { m01: 1, m02: -1, m03: 0 },
  matchups: [],
  user_matchup: null,
}

const bodyNames = () =>
  within(screen.getByTestId('power-table'))
    .getAllByRole('row')
    .slice(1)
    .map((r) => within(r).getByRole('rowheader').textContent)

describe('PowerTab', () => {
  beforeEach(() => useSeasonStore.setState({ overview }))

  it('sorts by a column and marks aria-sort', () => {
    render(<PowerTab />)
    const table = screen.getByTestId('power-table')
    const catsHeader = within(table).getByRole('columnheader', { name: /Cats \/ week/ })
    // default: expected categories, best first
    expect(catsHeader).toHaveAttribute('aria-sort', 'descending')
    expect(bodyNames()).toEqual(['Manager 02', 'Aaron (you)', 'Manager 03'])
    const ptsHeader = within(table).getByRole('columnheader', { name: /PTS|Points/ })
    expect(ptsHeader).toHaveAttribute('aria-sort', 'none')
    fireEvent.click(within(ptsHeader).getByRole('button'))
    expect(ptsHeader).toHaveAttribute('aria-sort', 'descending')
    expect(catsHeader).toHaveAttribute('aria-sort', 'none')
    expect(bodyNames()).toEqual(['Aaron (you)', 'Manager 03', 'Manager 02'])
    fireEvent.click(within(ptsHeader).getByRole('button'))
    expect(ptsHeader).toHaveAttribute('aria-sort', 'ascending')
    expect(bodyNames()).toEqual(['Manager 02', 'Manager 03', 'Aaron (you)'])
    // mine stays marked whatever the order
    expect(table.querySelectorAll('tbody tr.mine')).toHaveLength(1)
  })

  it('explains the cats-per-week and move columns', () => {
    render(<PowerTab />)
    const cats = screen.getByRole('button', { name: /About Cats \/ week/ })
    fireEvent.focus(cats)
    expect(screen.getByRole('tooltip')).toHaveTextContent(/expected categories won per week against the league-average opponent over 600 simulated weeks/i)
    fireEvent.blur(cats)
    fireEvent.focus(screen.getByRole('button', { name: /About Move/ }))
    expect(screen.getByRole('tooltip')).toHaveTextContent(/rank change since the last sync that changed a roster/i)
  })

  it('selecting another team shows a two-team comparison with values', () => {
    render(<PowerTab />)
    // my profile by default
    expect(screen.getByTestId('power-profile')).toBeInTheDocument()
    expect(screen.queryByTestId('power-compare')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Show Manager 03' }))
    const cmp = screen.getByTestId('power-compare')
    expect(within(cmp).getByRole('heading', { level: 3 })).toHaveTextContent('Aaron vs Manager 03')
    // both values printed per category
    const pts = within(cmp).getByTestId('compare-row-PTS')
    expect(pts).toHaveTextContent('+1.2')
    expect(pts).toHaveTextContent('+0.8')
    const reb = within(cmp).getByTestId('compare-row-REB')
    expect(reb).toHaveTextContent('−0.6')
    expect(reb).toHaveTextContent('−0.4')
    // one shared symmetric scale: the larger |z| fills the half-track, the other is proportional
    const mine = within(cmp).getByTestId('diverging-bar-PTS-a') as HTMLElement
    const theirs = within(cmp).getByTestId('diverging-bar-PTS-b') as HTMLElement
    expect(mine.style.width).toBe('50%')
    expect(parseFloat(theirs.style.width)).toBeCloseTo((0.8 / 1.2) * 50, 3)
    expect(screen.getByTestId('power-table').querySelector('tr.selected')).toHaveAttribute('aria-selected', 'true')
    fireEvent.click(within(cmp).getByRole('button', { name: 'Clear' }))
    expect(screen.queryByTestId('power-compare')).toBeNull()
    expect(screen.getByTestId('power-profile')).toHaveTextContent(/Aaron \(you\)/)
  })
})
