import { render, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import type { CategoryDef, MatchupOddsView, PredictionsResponse, SeasonOverview, TeamPowerView } from '@/fantasy/api/types'
import Overview from '../Overview'

const mockData = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('./useOverviewData', () => ({ useOverviewData: () => mockData.current }))
vi.mock('@/hooks/useApi', () => ({ useStatus: () => ({ data: undefined }) }))

const cat = (key: string, label: string, higher = true): CategoryDef => ({ key, label, higher_is_better: higher, kind: 'counting' } as CategoryDef)
const CATEGORIES = [cat('PTS', 'Points'), cat('REB', 'Rebounds'), cat('FG_PCT', 'FG%'), cat('TO', 'Turnovers', false), cat('FT_PCT', 'FT%'), cat('FG3M', 'Threes made')]

const odds: MatchupOddsView = {
  period: 1, manager_a: 'm05', manager_b: 'm02', expected_a: 4.36, expected_b: 1.64,
  p_win_a: 0.9433, p_tie: 0.0333, p_win_b: 0.0233,
  // deliberately not in value order, with both close boundaries (0.40 and 0.60)
  cat_p_a: { PTS: 0.9675, REB: 0.6, FG_PCT: 0.4317, TO: 0.12, FT_PCT: 0.4, FG3M: 0.9075 },
  modal_score: [5, 1], games_a: 40, games_b: 28, notes: ['Jalen Duren is OUT / on IR: 0 games this week'],
}

const power = (id: string, name: string, rank: number, isUser = false): TeamPowerView => ({
  manager_id: id, name, is_user: isUser, expected_cats: isUser ? 4.56 : 3, rank,
  cat_win_prob: isUser ? { PTS: 0.43, REB: 0.65, FG_PCT: 0.61, TO: 0.55, FT_PCT: 0.56, FG3M: 0.4 } : {}, z: {}, n_players: 13, n_ir: 1,
})

function overview(patch: Partial<SeasonOverview> = {}): SeasonOverview {
  return {
    ids: {} as SeasonOverview['ids'], linked: true, league_name: 'Courtside demo league', synced_at: null, summary: null, warnings: [],
    current_period: 1, league_categories: CATEGORIES, manager_names: { m05: 'Aaron', m02: 'Manager 02' },
    power: [power('m02', 'Manager 02', 1), power('m05', 'Aaron', 2, true)], movement: {}, matchups: [],
    user_matchup: { period: 1, home_manager_id: 'm05', away_manager_id: 'm02', odds },
    ...patch,
  }
}

const predictions = (decided: number): PredictionsResponse => ({
  ids: {} as PredictionsResponse['ids'], predictions: [],
  summary: { n_predicted: 6, n_decided: decided, n_correct: decided ? 4 : 0, hit_rate: decided ? 4 / decided : null, brier: decided ? 0.18 : null, by_period: {} },
})

const q = <T,>(data: T | undefined) => ({ data, isLoading: false, error: null, refetch: vi.fn() })

function setup({ ov = overview(), decided = 0, linked = true, sid = 'demo1' as string | null } = {}) {
  mockData.current = {
    ctx: { sessionId: sid, isComplete: true, isDemo: false },
    overview: q(sid ? ov : undefined),
    performers: q(undefined),
    predictions: q(predictions(decided)),
    userId: ov.power.find((p) => p.is_user)?.manager_id ?? null,
    linked,
  }
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter><Overview /></MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Overview', () => {
  it('shows win, tie and lose chances separately', () => {
    setup()
    const outcome = screen.getByTestId('matchup-outcome')
    expect(outcome).toHaveTextContent(/Win\s*94%/)
    expect(outcome).toHaveTextContent(/Tie\s*3%/)
    expect(outcome).toHaveTextContent(/Lose\s*2%/)
    expect(outcome).toHaveTextContent(/simulated/i)
    expect(screen.getByRole('heading', { name: 'Aaron (you) vs Manager 02' })).toBeInTheDocument()
    expect(screen.getByTestId('matchup-expected')).toHaveTextContent('Expected categories 4.4 – 1.6 of 6')
    expect(screen.getByTestId('matchup-games')).toHaveTextContent('Games 40 · 28 (scheduled this week)')
  })

  it('lists exactly the league\'s categories in league order', () => {
    setup()
    const rows = screen.getAllByTestId('category-row')
    expect(rows.map((r) => within(r).getByTestId('category-label').textContent?.replace('↓', '').trim())).toEqual(CATEGORIES.map((c) => c.label))
    expect(rows[0]).toHaveTextContent('97%')
  })

  it('marks close categories with the word close', () => {
    setup()
    const rows = screen.getAllByTestId('category-row')
    const closeLabels = rows.filter((r) => within(r).queryByText('close')).map((r) => within(r).getByTestId('category-label').textContent?.trim())
    expect(closeLabels).toEqual(['Rebounds', 'FG%', 'FT%'])
  })

  it('explains the empty track record in one sentence', () => {
    setup({ decided: 0 })
    expect(screen.getByText('Results are scored after each scoring period ends; the first arrives after week 1.')).toBeInTheDocument()
    expect(screen.queryByText('Projection hit rate')).not.toBeInTheDocument()
    expect(screen.queryByText('Brier score')).not.toBeInTheDocument()
  })

  it('keeps hit rate and Brier tiles once matchups are decided', () => {
    setup({ decided: 6 })
    expect(screen.getByText('Projection hit rate')).toBeInTheDocument()
    expect(screen.getByText('Brier score')).toBeInTheDocument()
  })

  it('shows the rank and the three weakest categories in the outlook', () => {
    setup()
    expect(screen.getByTestId('outlook-rank')).toHaveTextContent('#2 of 2')
    expect(screen.getByTestId('outlook-vulnerable')).toHaveTextContent('Vulnerable: Threes made 40% · Points 43% · Turnovers 55%')
  })

  it('offers next actions built from the session', () => {
    setup()
    const actions = screen.getByTestId('next-actions')
    expect(within(actions).getByRole('link', { name: /Review free agents/ })).toHaveAttribute('href', '/fantasy?session=demo1#/season?tab=free-agents')
    expect(within(actions).getByRole('link', { name: /See this week's performers/ })).toHaveAttribute('href', '/fantasy?session=demo1#/performers?team=m05&week=1')
    expect(within(actions).getByRole('link', { name: /Open my matchup/ })).toHaveAttribute('href', '/fantasy?session=demo1#/season?tab=matchups')
  })

  it('handles a bye week without odds', () => {
    setup({ ov: overview({ user_matchup: { period: 1, home_manager_id: 'm05', away_manager_id: null, odds: null } }) })
    expect(screen.getByTestId('matchup-none')).toHaveTextContent(/bye week/i)
    expect(screen.queryByTestId('matchup-outcome')).not.toBeInTheDocument()
  })

  it('asks to link the league when not linked, and has no next actions', () => {
    setup({ ov: overview({ linked: false }), linked: false })
    expect(screen.getByText('Not linked to an ESPN league')).toBeInTheDocument()
    expect(screen.queryByTestId('next-actions')).not.toBeInTheDocument()
  })

  it('points to setup with no session', () => {
    setup({ sid: null })
    expect(screen.getByRole('link', { name: /Open setup/ })).toHaveAttribute('href', '/fantasy#/setup')
  })
})
