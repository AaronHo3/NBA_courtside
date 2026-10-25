import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { HexBin, Shot, ZoneSummary } from '@/lib/types'
import { CourtChart } from './CourtChart'
import { GEOMETRY } from './geometry.test'
import { mergeDifference } from './diff'

const bin = (q: number, r: number, fga: number, fgm: number): HexBin => ({
  q, r, x_ft: 1.5 * Math.sqrt(3) * (q + r / 2), y_ft: 2.25 * r, zone: 'Mid-Range', fga, fgm, pts: fgm * 2, fg_pct: fgm / fga,
  ci_low: 0.2, ci_high: 0.7, low_sample: fga < 5, pts_per_fga: (fgm * 2) / fga, frequency: fga / 30, league_fg_pct: 0.42, rel_fg_pct: fgm / fga - 0.42,
})
const zone = (z: string, fga: number): ZoneSummary => ({ zone: z, fga, fgm: Math.round(fga / 2), pts: fga, fg_pct: 0.5, ci_low: 0.4, ci_high: 0.6, low_sample: false, pts_per_fga: 1, frequency: 0.5, league_fg_pct: 0.45, rel_fg_pct: 0.05 })
const shot = (id: number, made: 0 | 1): Shot => ({
  game_id: 'g1', game_event_id: id, player_id: 1, team_id: 1, opponent_team_id: 2, game_date: '2025-10-22T00:00:00', period: 1, minutes_remaining: 5, seconds_remaining: 7,
  action_type: 'Jump Shot', shot_type: '2PT Field Goal', shot_zone_basic: 'Mid-Range', shot_zone_area: 'Center(C)', shot_zone_range: '8-16 ft.', shot_distance: 12, loc_x: 10, loc_y: 120, shot_made_flag: made, home: true,
})

describe('CourtChart', () => {
  it('renders court lines, hexes, a legend and reports clicks as selections', () => {
    const onSelect = vi.fn()
    render(<CourtChart geometry={GEOMETRY} layer="hex" width={500} hexbins={[bin(0, 1, 20, 10), bin(2, 2, 3, 1)]} sizeFt={1.5} metric="fg_pct" lowSampleThreshold={5} onSelect={onSelect} />)
    expect(screen.getByTestId('three-point-line').getAttribute('d')).toContain('A237.5,237.5 0 0 1')
    expect(screen.getByTestId('court-legend')).toHaveTextContent('FG%')
    expect(screen.getByTestId('court-legend')).toHaveTextContent('fewer than 5 attempts')
    const hexes = screen.getAllByRole('button')
    expect(hexes).toHaveLength(2)
    expect(hexes[1]).toHaveAccessibleName(/low sample/)
    fireEvent.click(hexes[0])
    expect(onSelect).toHaveBeenCalledWith({ kind: 'hex', q: 0, r: 1 })
    fireEvent.keyDown(hexes[0], { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledTimes(2)
  })
  it('shows a tooltip with values first on hover', () => {
    render(<CourtChart geometry={GEOMETRY} layer="hex" width={500} hexbins={[bin(0, 1, 20, 10)]} metric="rel_fg_pct" />)
    fireEvent.mouseEnter(screen.getByRole('button'))
    expect(screen.getByRole('tooltip').textContent).toMatch(/^\+8\.0 pts · 20 FGA, 10 made/)
  })
  it('draws six provider zones with labels and markers for every shot', () => {
    const { rerender } = render(<CourtChart geometry={GEOMETRY} layer="zones" width={400} zones={[zone('Mid-Range', 40), zone('Restricted Area', 60)]} />)
    expect(screen.getAllByRole('button')).toHaveLength(6)
    expect(screen.getByTestId('zone-layer')).toHaveTextContent('40 FGA')
    rerender(<CourtChart geometry={GEOMETRY} layer="markers" width={400} shots={[shot(1, 1), shot(2, 0)]} markerFilter="made" />)
    expect(screen.getByTestId('marker-layer').querySelectorAll('circle')).toHaveLength(1)
  })
  it('renders difference bins, hollow where only one side shot', () => {
    const diff = mergeDifference([bin(0, 1, 20, 10), bin(1, 1, 10, 5)], [bin(0, 1, 20, 6)], 'fg_pct', 1.5, 5)
    render(<CourtChart geometry={GEOMETRY} layer="hex" width={500} diffBins={diff} diffLabels={['A', 'B']} metric="fg_pct" />)
    const layer = screen.getByTestId('diff-layer')
    expect(layer.querySelectorAll('g[role=button]')).toHaveLength(2)
    expect(layer.querySelectorAll('path[fill="none"][stroke-dasharray]')).toHaveLength(1)
    expect(screen.getByTestId('court-legend')).toHaveTextContent('A − B difference')
  })
})
