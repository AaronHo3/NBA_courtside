import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import type { CourtGeometry, HexBin, ZoneSummary } from '@/lib/types'

const GEOMETRY: CourtGeometry = {
  bounds: { x_min: -25, x_max: 25, y_min: -5.25, y_max: 41.75 },
  hoop: { cx: 0, cy: 0, r: 0.75 },
  backboard: { x1: -3, x2: 3, y: -1.25 },
  paint: { x: -8, y: -5.25, width: 16, height: 19 },
  inner_paint: { x: -6, y: -5.25, width: 12, height: 19 },
  free_throw_circle: { cx: 0, cy: 13.75, r: 6 },
  restricted_area: { cx: 0, cy: 0, r: 4 },
  three_point: { radius: 23.75, corner_x: 22, corner_break_y: 8.94776508408664, baseline_y: -5.25 },
  half_court: { y: 41.75 },
  center_circle: { cx: 0, cy: 41.75, r: 6 },
}

const bin = (q: number, r: number, fga: number, fgm: number, zone = 'Mid-Range'): HexBin => ({
  q, r, x_ft: 1.5 * Math.sqrt(3) * (q + r / 2), y_ft: 2.25 * r, zone, fga, fgm, pts: fgm * 2, fg_pct: fgm / fga,
  ci_low: 0.2, ci_high: 0.7, low_sample: fga < 5, pts_per_fga: (fgm * 2) / fga, frequency: fga / 30, league_fg_pct: 0.42, rel_fg_pct: fgm / fga - 0.42,
})
const zone = (z: string, fga: number, fgm: number): ZoneSummary => ({
  zone: z, fga, fgm, pts: fgm * 2, fg_pct: fgm / fga, ci_low: 0.38, ci_high: 0.55, low_sample: fga < 5, pts_per_fga: (fgm * 2) / fga, frequency: fga / 100, league_fg_pct: 0.42, rel_fg_pct: fgm / fga - 0.42,
})

const ok = <T,>(data: T, meta: Record<string, unknown> = {}) => ({ data: { success: true, data, error: null, meta }, isFetching: false, isLoading: false, error: null, refetch: vi.fn() })
const idle = () => ({ data: undefined, isFetching: false, isLoading: false, error: null, refetch: vi.fn() })

const width = vi.hoisted(() => ({ value: 1100 }))

vi.mock('@/components/court/useContainerWidth', () => ({
  useContainerWidth: () => [{ current: null }, width.value],
}))

vi.mock('@/hooks/useApi', () => ({
  useStatus: () => ok({ default_season: '2025-26', default_season_type: 'Regular Season', seasons: ['2025-26'], season_types: ['Regular Season'], coverage: { '2025-26': { 'Regular Season': { shots: 'ok' } } } }),
  useCourt: () => ok(GEOMETRY),
  useTeams: () => ok([]),
  useExplorer: () => idle(),
  useShotFilters: () => idle(),
  usePlayer: () => ok({ bio: { full_name: 'Test Shooter' }, seasons: [] }),
  usePlayerSearch: () => idle(),
  useShotMarkers: () => ok([], { available: true }),
  useHexbins: () => ok([bin(0, 6, 20, 10), bin(1, 6, 3, 1)], { available: true, total_fga: 23, total_fgm: 11 }),
  useZones: () => ok([zone('Mid-Range', 23, 11), zone('Restricted Area', 40, 26)], { available: true }),
  useShotEvidence: () => idle(),
}))

const { default: ShootingLab } = await import('./ShootingLab')

const loc = { search: '' }
function Spy() { const { search } = useLocation(); useEffect(() => { loc.search = search }, [search]); return null }
function renderAt(url: string) {
  return render(<MemoryRouter initialEntries={[url]}><ShootingLab /><Spy /></MemoryRouter>)
}

// the virtualised table only lays out rows when its scroll container has a height
const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 400 }))
afterAll(() => { if (offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight) })

describe('ShootingLab', () => {
  beforeEach(() => { width.value = 1100 })

  it('renders zone summary beside the court at desktop width', () => {
    renderAt('/shooting?season=2025-26&player=1&sel=z:Mid-Range')
    const layout = screen.getByTestId('shooting-layout')
    expect(layout).toHaveAttribute('data-layout', 'split')
    const court = within(layout).getByTestId('shooting-court')
    const aside = within(layout).getByTestId('shooting-aside')
    // court first, then the right column with legend, zone summary and the selected-bin detail
    expect(court.compareDocumentPosition(aside) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(court).getByRole('img', { name: /shot chart/i })).toBeInTheDocument()
    expect(within(aside).getByTestId('court-legend')).toBeInTheDocument()
    expect(within(aside).getByRole('table')).toHaveTextContent('Restricted area')
    expect(within(aside).getByTestId('bin-detail')).toHaveTextContent('Mid-range')
    // the court never exceeds 640px tall
    const svg = within(court).getByRole('img', { name: /shot chart/i })
    expect(Number(svg.getAttribute('height'))).toBeLessThanOrEqual(640)
  })

  it('stacks the zone summary under the court on a narrow screen', () => {
    width.value = 360
    renderAt('/shooting?season=2025-26&player=1')
    expect(screen.getByTestId('shooting-layout')).toHaveAttribute('data-layout', 'stacked')
  })

  it('names frequency, accuracy and the diverging relative scale in the legend', () => {
    renderAt('/shooting?season=2025-26&player=1')
    const legend = screen.getByTestId('court-legend')
    expect(legend).toHaveTextContent(/Colour = accuracy/)
    expect(legend).toHaveTextContent(/Size = frequency/)
    expect(legend).toHaveTextContent(/diverging/i)
  })

  it('outlines a zone on the court when its row is hovered and selects it on click', () => {
    renderAt('/shooting?season=2025-26&player=1')
    const aside = screen.getByTestId('shooting-aside')
    const row = within(aside).getByText('Restricted area').closest('tr')!
    fireEvent.mouseEnter(row)
    expect(screen.getByTestId('zone-outline')).toHaveAttribute('data-zone', 'Restricted Area')
    fireEvent.mouseLeave(row)
    expect(screen.queryByTestId('zone-outline')).toBeNull()
    fireEvent.click(row)
    expect(new URLSearchParams(loc.search).get('sel')).toBe('z:Restricted Area')
    expect(screen.getByTestId('zone-outline')).toHaveAttribute('data-zone', 'Restricted Area')
  })
})
