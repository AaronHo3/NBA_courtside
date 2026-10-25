import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CategoryDef, MatchupPairView, WeekResultView } from '../../api/types'
import { MatchupCard } from './MatchupCard'

const CATS: CategoryDef[] = [
  { key: 'PTS', label: 'Points', higher_is_better: true, kind: 'counting', numerator: null, denominator: null },
  { key: 'FT_PCT', label: 'FT%', higher_is_better: true, kind: 'ratio', numerator: 'FTM', denominator: 'FTA' },
]
const NAMES = { m01: 'Aaron', m02: 'Kurdi' }

function counting(key: string): CategoryDef {
  return { key, label: key, higher_is_better: key !== 'TOV', kind: 'counting', numerator: null, denominator: null }
}
const EIGHT = ['PTS', 'REB', 'AST', 'STL', 'BLK', 'FG3M', 'FG_PCT', 'FT_PCT'].map(counting)

function pair(over: Partial<MatchupPairView> = {}): MatchupPairView {
  return {
    period: 1,
    home_manager_id: 'm01',
    away_manager_id: 'm02',
    odds: {
      period: 1,
      manager_a: 'm01',
      manager_b: 'm02',
      expected_a: 5.2,
      expected_b: 2.8,
      p_win_a: 0.7,
      p_tie: 0.1,
      p_win_b: 0.2,
      cat_p_a: { PTS: 0.8, FT_PCT: 0.3 },
      modal_score: [5, 3],
      games_a: 32,
      games_b: 28,
      notes: ['Kristaps Porzingis is OUT / on IR: 0 games this week', 'daily lineups: every available player counts'],
    },
    ...over,
  }
}

const ACTUAL: WeekResultView = {
  period: 1,
  home: { manager_id: 'm01', values: { PTS: 412, FT_PCT: 0.8125 }, results: { PTS: 'WIN', FT_PCT: 'LOSS' }, cats_won: 1 },
  away: { manager_id: 'm02', values: { PTS: 377, FT_PCT: 0.84 }, results: { PTS: 'LOSS', FT_PCT: 'WIN' }, cats_won: 1 },
  winner: 'UNDECIDED',
}

describe('MatchupCard', () => {
  it('renders a bye week without odds', () => {
    render(<MatchupCard pair={pair({ away_manager_id: null, odds: null })} names={NAMES} categories={CATS} userId="m01" />)
    expect(screen.getByText(/bye week/i)).toBeInTheDocument()
    expect(screen.queryByTestId('cat-PTS')).toBeNull()
  })

  it('names the projected winner and shows both sides of each category', () => {
    render(<MatchupCard pair={pair()} names={NAMES} categories={CATS} userId="m01" />)
    expect(screen.getByTestId('projected-winner')).toHaveTextContent('Aaron')
    expect(screen.getByTestId('projected-winner')).toHaveTextContent('70%')
    expect(screen.getByTestId('cat-PTS')).toHaveClass('fav-a')
    expect(screen.getByTestId('cat-FT_PCT')).toHaveClass('fav-b')
    expect(screen.getByTestId('cat-PTS-winner')).toHaveTextContent('80%')
    expect(screen.getByTestId('cat-PTS-loser')).toHaveTextContent('20%')
    expect(screen.getByTestId('cat-FT_PCT-winner')).toHaveTextContent('30%')
    expect(screen.getByTestId('cat-FT_PCT-loser')).toHaveTextContent('70%')
    expect(screen.getByTestId('user-matchup')).toBeInTheDocument()
  })

  it('prints win, tie and lose', () => {
    render(<MatchupCard pair={pair()} names={NAMES} categories={CATS} userId="m01" />)
    expect(screen.getByTestId('mc-headline')).toHaveTextContent('Win 70% · Tie 10% · Lose 20%')
    expect(screen.getByTestId('mc-expected')).toHaveTextContent('5.2 – 2.8')
    expect(screen.getByTestId('mc-context')).toHaveTextContent('Games 32 · 28 · 1 player out')
  })

  it('keeps the notes behind an assumptions disclosure', () => {
    render(<MatchupCard pair={pair()} names={NAMES} categories={CATS} userId="m01" />)
    expect(screen.queryByText(/Porzingis/)).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Assumptions and notes/ }))
    expect(screen.getByText(/Porzingis/)).toBeInTheDocument()
  })

  it('marks 40–60% categories as close', () => {
    const o = { ...pair().odds!, cat_p_a: { PTS: 0.55, FT_PCT: 0.3 } }
    render(<MatchupCard pair={pair({ odds: o })} names={NAMES} categories={CATS} userId="m01" />)
    expect(within(screen.getByTestId('cat-PTS')).getByText('close')).toBeInTheDocument()
    expect(within(screen.getByTestId('cat-FT_PCT')).queryByText('close')).toBeNull()
  })

  it('renders only the league categories, in league order', () => {
    const cat_p_a = Object.fromEntries([...EIGHT.map((c) => [c.key, 0.5]), ['TOV', 0.5]])
    render(<MatchupCard pair={pair({ odds: { ...pair().odds!, cat_p_a } })} names={NAMES} categories={EIGHT} userId="m01" />)
    const rows = screen.getAllByTestId(/^cat-[A-Z0-9_]+$/)
    expect(rows).toHaveLength(8)
    expect(rows.map((r) => r.dataset.testid)).toEqual(EIGHT.map((c) => `cat-${c.key}`))
    expect(screen.queryByTestId('cat-TOV')).toBeNull()
  })

  it('separates projected and actual sections', () => {
    const { rerender } = render(<MatchupCard pair={pair()} names={NAMES} categories={CATS} userId="m01" />)
    expect(screen.getByRole('region', { name: /Projected outcome/ })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /Actual totals/ })).toBeNull()

    rerender(<MatchupCard pair={pair()} names={NAMES} categories={CATS} userId="m01" actual={ACTUAL} />)
    const projected = screen.getByRole('region', { name: /Projected outcome \(simulated\)/ })
    const actual = screen.getByRole('region', { name: /Actual totals \(ESPN, running\)/ })
    expect(within(projected).queryByText('412')).toBeNull()
    expect(within(projected).getByTestId('cat-PTS')).toBeInTheDocument()
    expect(within(actual).queryByTestId('cat-PTS')).toBeNull()
    const pts = within(actual).getByTestId('actual-PTS')
    expect(pts).toHaveTextContent('412')
    expect(pts).toHaveTextContent('377')
    expect(within(actual).getByTestId('actual-FT_PCT')).toHaveTextContent('.813')
  })

  it('reads the user as the away side when ESPN lists them away', () => {
    render(<MatchupCard pair={pair({ home_manager_id: 'm02', away_manager_id: 'm01', odds: { ...pair().odds!, manager_a: 'm02', manager_b: 'm01' } })} names={NAMES} categories={CATS} userId="m01" />)
    expect(screen.getByTestId('user-matchup')).toBeInTheDocument()
    expect(screen.getByRole('heading', { level: 3 }).textContent).toMatch(/Kurdi.*vs.*Aaron/)
  })

  it('projects the away side as winner when its week odds are higher', () => {
    const o = { ...pair().odds!, p_win_a: 0.2, p_win_b: 0.7 }
    render(<MatchupCard pair={pair({ odds: o })} names={NAMES} categories={CATS} userId="m01" />)
    expect(screen.getByTestId('projected-winner')).toHaveTextContent('Kurdi')
    expect(screen.getByTestId('cat-PTS-winner')).toHaveTextContent('20%')
  })

  it('compact: one row with both teams and the favourite win chance', () => {
    render(<MatchupCard pair={pair()} names={NAMES} categories={CATS} userId="m01" compact />)
    const row = screen.getByTestId('user-matchup')
    expect(row).toHaveTextContent(/Aaron.*Kurdi/)
    expect(within(row).getByTestId('projected-winner')).toHaveTextContent(/Aaron.*70%/)
    expect(screen.queryByTestId('cat-PTS')).toBeNull()
  })
})
