import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import type { LineupRow } from '@/lib/types'
import { LineupsPanel } from './LineupsPanel'

vi.mock('@/components/charts/Plot', () => ({
  Plot: () => <div data-testid="plot" />,
  useChartTheme: () => ({ theme: 'dark', ink: '#fff', ink2: '#ccc', ink3: '#999', axis: '#444', accent: '#f80', surface: '#111', series: ['#f80', '#0af'] }),
}))

const lineup = (id: string, poss: number, net: number): LineupRow => ({
  group_id: id, group_name: `Lineup ${id}`, player_ids: [1, 2, 3, 4, 5], gp: 10, w: 6, l: 4, min: 120,
  poss, off_rating: 115, def_rating: 115 - net, net_rating: net, pace: 99, pts: 300,
})

describe('LineupsPanel', () => {
  it('renders the chart legend without a list nested in a paragraph', () => {
    const { container } = render(
      <LineupsPanel lineups={[lineup('a', 300, 5), lineup('b', 40, -8)]} minPoss={100} setMinPoss={vi.fn()} team={{ abbreviation: 'BOS', season: '2025-26' }} />,
    )
    expect(screen.getByRole('list', { name: 'Lineup legend' })).toBeInTheDocument()
    expect(container.querySelector('p ul')).toBeNull()
  })
})
