import { useMemo } from 'react'
import type { Data, Layout } from 'plotly.js'
import { SEQUENTIAL_BLUE, toColorscale } from '@/components/charts/palette'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { EmptyState, Input, Panel, Refetching, Select } from '@/components/ui'
import { useMatchupHeatmap, useTeams } from '@/hooks/useApi'
import { formatPct } from '@/lib/format'
import { buildHeatmapMatrix, colourCap, formatPpp, HEATMAP_ZMAX_FLOOR, type HeatmapCell } from './helpers'

type Props = {
  season: string
  seasonType: string
  teamA: number | null
  teamB: number | null
  minPoss: number
  limit: number
  onTeamA: (id: number | null) => void
  onTeamB: (id: number | null) => void
  onMinPoss: (n: number) => void
  onLimit: (n: number) => void
  onSelectPair: (offId: number, defId: number) => void
}

const CELL_PX = 34

function cellHover(c: HeatmapCell | null): string {
  if (!c) return 'No recorded matchup'
  return [
    `<b>${formatPpp(c.pts_per_poss)} pts/poss</b>`,
    `${c.partial_poss ?? 0} partial poss · ${c.player_pts ?? 0} pts`,
    `FG ${c.matchup_fgm ?? 0}/${c.matchup_fga ?? 0} (${formatPct(c.fg_pct)})`,
    c.low_sample ? 'Low sample' : '',
  ].filter(Boolean).join('<br>')
}

/** Team-pair matrix: scorers of team A on the y axis, defenders of team B on the x axis, colour = pts per poss. */
export function TeamHeatmap(p: Props) {
  const teams = useTeams()
  const t = useChartTheme()
  const res = useMatchupHeatmap({ season: p.season, season_type: p.seasonType, team_id: p.teamA, opponent_team_id: p.teamB, min_poss: p.minPoss }, Boolean(p.teamA && p.teamB))
  const matrix = useMemo(() => {
    const d = res.data?.data
    return d ? buildHeatmapMatrix(d.offense, d.defense, d.cells, p.limit) : null
  }, [res.data, p.limit])
  const teamList = teams.data?.data ?? []
  const nameOf = (id: number | null) => teamList.find((x) => x.team_id === id)?.abbreviation ?? '…'

  const zmax = matrix ? colourCap(matrix.z, matrix.low) : HEATMAP_ZMAX_FLOOR
  const data: Data[] = useMemo(() => {
    if (!matrix) return []
    const x = matrix.defense.map((d) => d.full_name)
    const y = matrix.offense.map((o) => o.full_name)
    const lowX: string[] = []
    const lowY: string[] = []
    matrix.low.forEach((row, i) => row.forEach((isLow, j) => { if (isLow && matrix.z[i][j] !== null) { lowX.push(x[j]); lowY.push(y[i]) } }))
    return [
      {
        type: 'heatmap', x, y, z: matrix.z, name: 'Pts / poss',
        colorscale: toColorscale(SEQUENTIAL_BLUE), zmin: 0, zmax,
        hoverongaps: false, xgap: 2, ygap: 2,
        text: matrix.cells.map((row) => row.map(cellHover)) as unknown as string[], hovertemplate: '%{text}<br>%{y} vs %{x}<extra></extra>',
        colorbar: { title: { text: 'Pts / poss', side: 'right' }, thickness: 10, len: 0.8, tickfont: { color: t.ink3, size: 10 }, outlinewidth: 0 },
      },
      {
        type: 'scatter', mode: 'text', x: lowX, y: lowY, text: lowX.map(() => '·'), name: 'Low sample',
        textfont: { size: 20, color: t.ink }, hoverinfo: 'skip', showlegend: false,
      },
    ]
  }, [matrix, t, zmax])

  const rows = matrix?.offense.length ?? 0
  const cols = matrix?.defense.length ?? 0
  const height = Math.max(260, rows * CELL_PX + 150)
  const layout: Partial<Layout> = useMemo(() => ({
    height, margin: { l: 140, r: 16, t: 8, b: 120 }, showlegend: false,
    xaxis: { type: 'category', automargin: true, tickangle: -40, tickfont: { size: 10 }, title: { text: `${nameOf(p.teamB)} defenders` } },
    yaxis: { type: 'category', automargin: true, tickfont: { size: 10 }, autorange: 'reversed', title: { text: `${nameOf(p.teamA)} scorers` } },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [height, p.teamA, p.teamB, teamList])

  const controls = (
    <>
      <Select aria-label="Offense team" value={p.teamA ?? ''} onChange={(e) => p.onTeamA(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Offense team…</option>
        {teamList.map((tm) => <option key={tm.team_id} value={tm.team_id}>{tm.abbreviation} · {tm.full_name}</option>)}
      </Select>
      <Select aria-label="Defending team" value={p.teamB ?? ''} onChange={(e) => p.onTeamB(e.target.value ? Number(e.target.value) : null)}>
        <option value="">Defending team…</option>
        {teamList.map((tm) => <option key={tm.team_id} value={tm.team_id}>{tm.abbreviation} · {tm.full_name}</option>)}
      </Select>
      <Input aria-label="Heatmap min partial poss" type="number" min={1} max={500} value={p.minPoss} onChange={(e) => p.onMinPoss(Math.max(1, Math.round(Number(e.target.value)) || 1))} className="w-24" title="Minimum partial possessions for a cell" />
      <Select aria-label="Players per axis" value={p.limit} onChange={(e) => p.onLimit(Number(e.target.value))}>
        {[8, 12, 16, 24].map((n) => <option key={n} value={n}>{n} per axis</option>)}
      </Select>
    </>
  )

  return (
    <Panel
      question="Which scorers did what against which defenders?"
      method={`Each cell is one scorer–defender pair from ${p.season}: colour is the scorer's points per partial possession; axes keep the ${p.limit} most-sampled players. Cells with few attempts carry a dot.`}
      info="Cells are coloured on one sequential scale from 0 upward; a blank cell means the two never shared a tracked matchup at this threshold. A dot marks a low-sample cell. Click a cell to open the pair history."
      actions={controls}
    >
      {!p.teamA || !p.teamB ? (
        <EmptyState title="Choose two teams" body="Pick the scoring team and the defending team to see every tracked pairing between them." />
      ) : (
        <Refetching loading={res.isFetching} error={res.error} retry={() => res.refetch()}>
          {res.isLoading ? <p className="text-sm text-ink-3">Loading…</p> : res.data && res.data.meta.available === false ? (
            <EmptyState title="No matchup data for this season" body={res.data.meta.reason ?? undefined} />
          ) : !matrix || !matrix.z.length || !cols ? (
            <EmptyState title="No cells at this threshold" body={`No ${nameOf(p.teamA)}–${nameOf(p.teamB)} pairing reached ${p.minPoss} partial possessions in ${p.season}. Lower the threshold or pick other teams.`} />
          ) : (
            <div className="flex flex-col gap-2">
              <div style={{ height }} className="min-w-0">
                <Plot
                  data={data}
                  layout={layout}
                  onClick={(e) => {
                    const pt = e.points?.[0]
                    if (!pt || !matrix) return
                    const i = matrix.offense.findIndex((o) => o.full_name === pt.y)
                    const j = matrix.defense.findIndex((d) => d.full_name === pt.x)
                    if (i >= 0 && j >= 0 && matrix.cells[i][j]) p.onSelectPair(matrix.offense[i].player_id, matrix.defense[j].player_id)
                  }}
                />
              </div>
              <p className="text-xs text-ink-3">
                {rows} scorers × {cols} defenders shown{matrix.truncated.offense || matrix.truncated.defense ? ` (${matrix.truncated.offense} scorers and ${matrix.truncated.defense} defenders with fewer possessions hidden; raise the per-axis limit to see them)` : ''}. A dot marks a low-sample cell; blank means no tracked matchup. Colour saturates at {zmax.toFixed(1)} pts/poss; hover for exact values.
              </p>
            </div>
          )}
        </Refetching>
      )}
    </Panel>
  )
}
