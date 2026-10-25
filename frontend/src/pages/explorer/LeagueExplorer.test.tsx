import { fireEvent, render, screen, within } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import type { Metric, PlayerRow } from '@/lib/types'
import { useCompare } from '@/store/compare'
import LeagueExplorer from '../LeagueExplorer'

const metric = (key: string, label: string, kind: Metric['kind']): Metric => ({ key, label, kind, definition: '', formula: null, higher_is_better: true, unit: null, source: 'test', decimals: 1 })
const METRICS: Metric[] = [
  metric('pts', 'Points', 'counting'),
  metric('fga', 'Field goal attempts', 'counting'),
  metric('ts_pct', 'True shooting', 'pct'),
  metric('usg_pct', 'Usage', 'pct'),
  metric('age', 'Age', 'context'),
  metric('gp', 'Games', 'context'),
  metric('min', 'Minutes', 'counting'),
]
const row = (player_id: number, full_name: string, pts: number): PlayerRow => ({
  player_id, full_name, team_id: 1, team_abbreviation: 'AAA', position: 'G', is_aggregate: false, age: 25, gp: 60, min: 30, poss: null, normalization: 'per_game',
  height_in: null, weight_lb: null, wingspan_in: null, standing_reach_in: null, wingspan_height_ratio: null, on_off_net: null,
  pts, fga: 15, ts_pct: 0.58, usg_pct: 0.24,
})
const ROWS = [row(101, 'Ann Archer', 25), row(202, 'Bo Baker', 18)]

vi.mock('@/hooks/useApi', () => ({
  useExplorer: () => ({ data: { data: ROWS, meta: { population: ROWS.length } }, isError: false, isPending: false, isFetching: false, error: null, refetch: () => {} }),
  useMetricIndex: () => {
    const index = new Map(METRICS.map((m) => [m.key, m]))
    return { index, get: (k: string) => index.get(k), list: METRICS, isLoading: false }
  },
  useTeams: () => ({ data: undefined }),
  useStatus: () => ({ data: undefined }),
}))
vi.mock('@/hooks/useSeason', () => ({ useSeason: () => ({ season: '2025-26', seasonType: 'Regular Season', ready: true }) }))
vi.mock('@/components/charts/Plot', () => ({
  baseConfig: {},
  useChartTheme: () => ({ theme: 'dark', ink: '#fff', ink2: '#ccc', ink3: '#999', grid: '#333', axis: '#444', surface: '#000', accent: '#f80', series: ['#111', '#222', '#333'] }),
  // A stand-in for Plotly: one button per plotted point that fires the click handler with its customdata.
  Plot: ({ data, onClick }: { data: Array<{ name?: string; customdata?: number[]; hoverinfo?: string }>; onClick?: (e: unknown) => void }) => (
    <div data-testid="plot">
      {data.filter((t) => t.hoverinfo !== 'skip').flatMap((t) => (t.customdata ?? []).map((id) => (
        <button key={`${t.name}-${id}`} type="button" onClick={() => onClick?.({ points: [{ customdata: id }] })}>point {id}</button>
      )))}
    </div>
  ),
}))

function Probe() {
  const loc = useLocation()
  return <output data-testid="location">{loc.pathname + loc.search}</output>
}

function renderPage(initial = '/explorer?season=2025-26') {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/explorer" element={<><LeagueExplorer /><Probe /></>} />
        <Route path="/players/:id" element={<><p>profile page</p><Probe /></>} />
      </Routes>
    </MemoryRouter>,
  )
}
const location = () => screen.getByTestId('location').textContent ?? ''

// jsdom has no layout; give elements a height so the table's virtualiser renders rows.
const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 400 }))
afterAll(() => { if (offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight) })

describe('LeagueExplorer interaction', () => {
  beforeEach(() => useCompare.setState({ players: [] }))

  it('single click selects and shows the selection strip', () => {
    renderPage()
    expect(screen.queryByTestId('explorer-selection')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'point 101' }))
    expect(location()).toMatch(/^\/explorer\?/)
    expect(new URLSearchParams(location().split('?')[1]).get('sel')).toBe('101')

    const strip = screen.getByTestId('explorer-selection')
    expect(strip).toHaveTextContent('Ann Archer')
    expect(within(strip).getByRole('link', { name: 'Open profile →' })).toHaveAttribute('href', '/players/101?season=2025-26')

    // Clicking the same marker again keeps the selection and never navigates.
    fireEvent.click(screen.getByRole('button', { name: 'point 101' }))
    expect(location()).toMatch(/^\/explorer\?/)

    fireEvent.click(within(strip).getByRole('button', { name: 'Add to compare' }))
    expect(useCompare.getState().players.map((p) => p.player_id)).toEqual([101])
    expect(within(strip).getByRole('button', { name: 'Remove from compare' })).toBeInTheDocument()
  })

  it('table row click selects without navigating', () => {
    renderPage()
    const table = screen.getByRole('table')
    const bo = within(table).getByText('Bo Baker').closest('tr')!
    fireEvent.click(bo)
    expect(new URLSearchParams(location().split('?')[1]).get('sel')).toBe('202')
    fireEvent.click(bo)
    expect(location()).toMatch(/^\/explorer\?/)
    expect(screen.getByTestId('explorer-selection')).toHaveTextContent('Bo Baker')
    // The name is the profile link, carrying the season.
    expect(within(bo).getByRole('link', { name: /Bo Baker/ })).toHaveAttribute('href', '/players/202?season=2025-26')
  })

  it('legend states size and colour encodings', () => {
    renderPage()
    expect(screen.getByTestId('explorer-encoding')).toHaveTextContent('Size: Points / game · Colour: none')
    expect(screen.getByText('Drag to box-select · lasso · reset')).toBeInTheDocument()
  })
})
