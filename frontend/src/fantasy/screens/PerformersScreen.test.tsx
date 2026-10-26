import { fireEvent, render, screen, within } from '@testing-library/react'
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { CategoryDef, PerformerRow, PerformersResponse } from '../api/types'
import { useDraftStore } from '../store/draftStore'
import { makeState } from '../test/fixtures'
import { PerformersScreen } from './PerformersScreen'

const CATS = [
  { key: 'PTS', label: 'Points', higher_is_better: true, kind: 'counting' },
  { key: 'REB', label: 'Rebounds', higher_is_better: true, kind: 'counting' },
] as unknown as CategoryDef[]

function row(rank: number, id: string, name: string, contribution: number, over: number | null, cats: { PTS: number; REB: number }, games = 3, flags: string[] = [], nbaId: number | null = null): PerformerRow {
  const line = { PTS: 60, REB: 15, AST: 12, STL: 3, BLK: 2, TOV: 6, FG3M: 6, FG3A: 15, FGM: 21, FGA: 45, FTM: 12, FTA: 15, FG_PCT: 0.467, FT_PCT: 0.8 }
  return {
    rank,
    player: { player_id: id, name, team: 'BOS', primary_position: 'PG', eligible_positions: ['PG'], eligibility_verified: true, injury_status: null, adp: null, rank: null, projection_source: 'blend', per_game: {}, per_game_sd: {}, drafted_by: null, drafted_overall: null, espn_id: null, nba_id: nbaId } as unknown as PerformerRow['player'],
    games,
    periods: 1,
    minutes: 90,
    contribution,
    contribution_per_game: games ? contribution / games : null,
    expected_contribution: over === null ? null : contribution - over,
    over_expected: over,
    over_expected_per_game: over === null ? null : over / games,
    actual: line,
    expected: over === null ? null : line,
    actual_per_game: line,
    expected_per_game: over === null ? null : line,
    category_z: {},
    contribution_by_category: cats,
    expected_by_category: null,
    flags,
  }
}

const star = row(1, 'a', 'Star Player', 12, 0.5, { PTS: 9, REB: 3 }, 3, [], 201939)
const role = row(2, 'b', 'Role Player', 8, 3.2, { PTS: 2, REB: 6 }, 4)
const prior = row(3, 'c', 'Prior Guy', 2, null, { PTS: 1, REB: 1 }, 2, ['small sample', 'no baseline'])

let response: PerformersResponse
function makeResponse(overperformers: PerformerRow[]): PerformersResponse {
  return {
    ids: {} as PerformersResponse['ids'],
    manager_id: 'm02',
    scope: 'week',
    period: 3,
    periods_available: [1, 2, 3],
    baseline: 'snapshot',
    source: 'ESPN box scores',
    categories: CATS,
    unit_sizes: { PTS: 6, REB: 2.5 },
    benchmark_rates: { FG_PCT: 0.47, FT_PCT: 0.78 },
    contributors: [star, role, prior],
    overperformers,
    notes: [],
  }
}

vi.mock('../api/client', async (orig) => {
  const real = await orig<typeof import('../api/client')>()
  return { ...real, api: new Proxy({}, { get: (_t, name) => async () => (name === 'seasonPerformers' ? response : name === 'seasonMoves' ? null : []) }) }
})

function Profile() {
  const loc = useLocation()
  const from = (loc.state as { from?: { href: string; label: string } } | null)?.from
  return <p data-testid="profile-from">{from ? `${from.label}|${from.href}` : 'none'}</p>
}

function renderScreen() {
  const router = createMemoryRouter(
    [
      { path: '/fantasy', element: <PerformersScreen /> },
      { path: '/players/:id', element: <Profile /> },
    ],
    { initialEntries: ['/fantasy'] },
  )
  return render(<RouterProvider router={router} />)
}

beforeEach(() => {
  response = makeResponse([role, star])
  window.history.replaceState(null, '', '/fantasy?session=s1#/performers?team=m02&week=3')
  useDraftStore.setState({ sessionId: 's1', state: makeState({ is_complete: true }) })
})

describe('PerformersScreen', () => {
  it('does not repeat a player across sections except the table', async () => {
    response = makeResponse([star, role]) // the leading contributor is also the biggest overperformer
    renderScreen()
    const contributor = await screen.findByTestId('feature-contributor')
    const over = screen.getByTestId('feature-overperformer')
    expect(within(contributor).getByText('Star Player')).toBeInTheDocument()
    expect(within(over).queryByText('Star Player')).toBeNull()
    expect(within(over).getByText('Role Player')).toBeInTheDocument()
    expect(within(contributor).getByText(/also the biggest overperformer/i)).toBeInTheDocument()
    // the leaderboard cards and the empty trend chart are gone
    expect(screen.queryByTestId('top-contributors')).toBeNull()
    expect(screen.queryByTestId('top-overperformers')).toBeNull()
    expect(screen.queryByTestId('chart-trend')).toBeNull()
    expect(screen.getAllByTestId('performer-row')).toHaveLength(3)
  })

  it('captions carry the active unit mode', async () => {
    renderScreen()
    await screen.findByTestId('heatmap')
    expect(screen.getByText('Units: category standard deviations × games (one unit ≈ one average starter-game in one category)')).toBeInTheDocument()
    expect(within(screen.getByTestId('chart-heatmap')).getByTestId('unit-chip')).toHaveTextContent('Totals')
    expect(within(screen.getByTestId('performers-table')).getByTestId('unit-chip')).toHaveTextContent('Totals')
    fireEvent.click(screen.getByTestId('unit-per-game'))
    expect(within(screen.getByTestId('chart-heatmap')).getByTestId('unit-chip')).toHaveTextContent('Per game')
    expect(within(screen.getByTestId('performers-table')).getByTestId('unit-chip')).toHaveTextContent('Per game')
    // per game: Star Player's 12 units over 3 games
    const first = screen.getAllByTestId('performer-row')[0]
    expect(first).toHaveTextContent('4.0')
  })

  it('keeps the small-sample tag beside the number', async () => {
    renderScreen()
    const rows = await screen.findAllByTestId('performer-row')
    expect(within(rows[2]).getByTestId('sample-tag')).toHaveTextContent('2 GP · small sample')
  })

  it('heatmap sorts by a category', async () => {
    renderScreen()
    const heat = await screen.findByTestId('heatmap')
    const names = () => within(heat).getAllByRole('rowheader').map((th) => th.textContent)
    expect(names()).toEqual(['Star Player', 'Role Player', 'Prior Guy'])
    fireEvent.click(within(heat).getByRole('button', { name: /^Rebounds/ }))
    expect(names()).toEqual(['Role Player', 'Star Player', 'Prior Guy'])
    expect(within(heat).getByRole('columnheader', { name: /Rebounds/ })).toHaveAttribute('aria-sort', 'descending')
  })

  it('opens the NBA profile with a back-link to this team and week', async () => {
    renderScreen()
    const card = await screen.findByTestId('feature-contributor')
    const link = within(card).getByRole('link', { name: /NBA profile/ })
    expect(link).toHaveAttribute('href', '/players/201939')
    fireEvent.click(link)
    expect(await screen.findByTestId('profile-from')).toHaveTextContent('Performers|/fantasy?session=s1#/performers?team=m02&week=3')
  })
})
