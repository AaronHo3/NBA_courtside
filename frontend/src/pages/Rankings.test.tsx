import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { RankingMeta, RankingRow } from '@/lib/types'
import { RankingTable } from './rankings/RankingTable'

vi.mock('@/hooks/useApi', () => ({ useMetricIndex: () => ({ get: () => undefined, list: [] }) }))

// jsdom has no layout; give elements a height so the virtualiser renders rows.
const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 400 }))
afterAll(() => { if (offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight) })

const meta: RankingMeta = {
  population_size: 2, normalization: 'percentile', normalization_of_counting_stats: 'per_game', min_gp: 10, min_minutes: 100, mode: 'rate', disclaimer: '',
  components: [{ metric: 'pts', weight: 1, higher_is_better: true, label: 'Points', kind: 'counting', scaled: true }],
}
const row = (rank: number, id: number, name: string, score: number): RankingRow => ({
  rank, player_id: id, full_name: name, team_abbreviation: 'BOS', position: 'G', age: 25, gp: 60, min: 30, score, eligible: true, missing: [], pts: 20,
  contributions: [{ metric: 'pts', raw: 20, normalized: score, normalization: 'percentile', higher_is_better: true, weight: 1, contribution: score, population_size: 2 }],
})

describe('Rankings', () => {
  it('pins the player column in the ranking table', () => {
    render(<MemoryRouter><RankingTable rows={[row(1, 1, 'Alpha Guard', 90), row(2, 2, 'Bravo Wing', 40)]} meta={meta} colors={new Map([['pts', '#f00']])} /></MemoryRouter>)
    const [firstHead] = screen.getAllByRole('columnheader')
    expect(firstHead).toHaveTextContent('Player')
    expect(firstHead).toHaveStyle({ position: 'sticky', left: '0px' })
    const firstRow = screen.getAllByRole('row')[1]
    const firstCell = within(firstRow).getAllByRole('cell')[0]
    expect(firstCell).toHaveTextContent('Alpha Guard')
    expect(firstCell).toHaveTextContent('1')
    expect(firstCell).toHaveStyle({ position: 'sticky', left: '0px' })
  })
})
