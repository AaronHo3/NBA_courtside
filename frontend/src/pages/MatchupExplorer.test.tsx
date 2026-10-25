import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { MatchupRow } from '@/lib/types'

const row = (defId: number, name: string, poss: number, ppp: number, fga: number): MatchupRow => ({
  season: '2025-26', season_type: 'Regular Season', off_player_id: 1628983, off_player_name: 'Test Scorer', off_position: 'G',
  def_player_id: defId, def_player_name: name, def_position: 'F', gp: 3, matchup_min: 6.2, partial_poss: poss, player_pts: Math.round(poss * ppp), team_pts: null,
  matchup_ast: 1, matchup_tov: 0, matchup_blk: 0, matchup_fgm: Math.round(fga / 2), matchup_fga: fga, matchup_fg3m: 0, matchup_fg3a: 0, matchup_ftm: 0, matchup_fta: 0, sfl: 0,
  fg_pct: 0.5, fg3_pct: null, fg_pct_shrunk: 0.48, ci_low: 0.3, ci_high: 0.7, pts_per_poss: ppp, team_pts_per_poss: null, qualifies: poss >= 10,
})

const ROWS = [row(11, 'Low Defender', 14.5, 0.4, 4), row(12, 'Mid Defender', 30, 1.0, 22), row(13, 'High Defender', 22.25, 1.47, 12), row(14, 'Tiny Sample', 3, 3.0, 2)]
const WORDING = 'Values describe the lowest observed efficiency among qualifying matchups, not a verdict.'

const ok = <T,>(data: T, meta: Record<string, unknown> = {}) => ({ data: { success: true, data, error: null, meta }, isFetching: false, isLoading: false, error: null, refetch: vi.fn() })
const idle = () => ({ data: undefined, isFetching: false, isLoading: false, error: null, refetch: vi.fn() })

vi.mock('@/components/charts/Plot', () => ({
  Plot: () => <div data-testid="plot" />,
  useChartTheme: () => ({ theme: 'dark', ink: '#fff', ink2: '#ccc', ink3: '#999', axis: '#444', accent: '#f80', surface: '#111', series: ['#f80', '#0af'] }),
}))

vi.mock('@/hooks/useApi', () => ({
  useStatus: () => ok({ default_season: '2025-26', default_season_type: 'Regular Season', seasons: ['2025-26'], season_types: ['Regular Season'], coverage: {} }),
  useMatchupAvailability: () => ok({ available: true, reason: null }),
  usePlayer: () => ok({ bio: { full_name: 'Test Scorer', position: 'G' }, seasons: [] }),
  usePlayerSearch: () => idle(),
  useMatchupOffense: () => ok(ROWS, { prior: { mean: 0.476, strength: 25 }, wording: WORDING, shrinkage: 'Shrunk toward the prior.' }),
  useMatchupDefense: () => idle(),
  useMatchupPairAt: () => idle(),
  useMatchupHeatmap: () => idle(),
  useTeams: () => ok([]),
  useDefenseDash: () => idle(),
}))

const { default: MatchupExplorer } = await import('./MatchupExplorer')

function renderPage() {
  return render(<MemoryRouter initialEntries={['/matchups?season=2025-26&player=1628983']}><MatchupExplorer /></MemoryRouter>)
}

describe('MatchupExplorer', () => {
  it('keeps sample size beside each result', () => {
    renderPage()
    const lowest = screen.getByTestId('matchup-result-lowest')
    const highest = screen.getByTestId('matchup-result-highest')
    expect(lowest).toHaveTextContent('Lowest observed efficiency')
    expect(highest).toHaveTextContent('Highest observed efficiency')
    expect(within(lowest).getByText('Low Defender')).toBeInTheDocument()
    expect(within(highest).getByText('High Defender')).toBeInTheDocument()
    // the headline value and its possession count sit together
    expect(within(lowest).getByTestId('result-value')).toHaveTextContent('0.40')
    expect(within(lowest).getByTestId('result-sample')).toHaveTextContent('14.5 poss')
    expect(within(highest).getByTestId('result-sample')).toHaveTextContent('22.25 poss')
    expect(within(lowest).getByText('low sample')).toBeInTheDocument()
    expect(within(highest).queryByText('low sample')).toBeNull()
    expect(within(lowest).getByRole('button', { name: /points per partial possession among matchups with ≥ 10 possessions; observations, not verdicts/ })).toBeInTheDocument()
  })

  it('moves the wording note into a disclosure and puts results before the chart', () => {
    renderPage()
    const note = screen.getByText('What matchup data can and cannot show').closest('details')!
    expect(note).not.toHaveAttribute('open')
    expect(note).toHaveTextContent(WORDING)
    const strip = screen.getByTestId('matchup-result-strip')
    const chart = screen.getByRole('heading', { name: 'Against whom did his efficiency differ?' })
    expect(strip.compareDocumentPosition(chart) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
