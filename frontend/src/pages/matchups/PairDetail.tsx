import { useMemo } from 'react'
import type { Data, Layout } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { Button, EmptyState, Panel, Refetching } from '@/components/ui'
import { useMatchupPairAt } from '@/hooks/useApi'
import { formatNumber, formatPct, wilsonText } from '@/lib/format'
import type { MatchupRow } from '@/lib/types'
import { formatPpp, isLowSample, priorText } from './helpers'

type Props = { offId: number | null; defId: number | null; priorStrength: number; onClear: () => void }

const CELL = 'px-2 py-1 whitespace-nowrap'

function SeasonRow({ r, total }: { r: MatchupRow; total?: boolean }) {
  return (
    <tr className={total ? 'border-t border-line-strong font-medium' : 'border-t border-line'}>
      <td className={CELL}>{total ? 'All seasons' : r.season}{isLowSample(r) && <span className="ml-1 text-[11px] text-warning">low sample</span>}</td>
      <td className={`${CELL} text-right tnum`}>{r.gp}</td>
      <td className={`${CELL} text-right tnum`}>{formatNumber(r.partial_poss, 0)}</td>
      <td className={`${CELL} text-right tnum`}>{formatNumber(r.player_pts, 0)}</td>
      <td className={`${CELL} text-right tnum`}>{formatPpp(r.pts_per_poss)}</td>
      <td className={`${CELL} text-right tnum`}>{formatNumber(r.matchup_fgm, 0)}/{formatNumber(r.matchup_fga, 0)}</td>
      <td className={`${CELL} text-right tnum`}>{formatPct(r.fg_pct)}</td>
      <td className={`${CELL} text-right tnum`}>{formatPct(r.fg_pct_shrunk)}</td>
      <td className={`${CELL} text-right tnum text-ink-2`}>{wilsonText(r.ci_low, r.ci_high).replace(' (95% Wilson)', '') || '–'}</td>
    </tr>
  )
}

/** Season-by-season history for one scorer–defender pair, read from URL (pair_off, pair_def). */
export function PairDetail({ offId, defId, priorStrength, onClear }: Props) {
  const res = useMatchupPairAt(offId, defId, priorStrength)
  const t = useChartTheme()
  const seasons = useMemo(() => [...(res.data?.data.seasons ?? [])].sort((a, b) => a.season.localeCompare(b.season)), [res.data])
  const total = res.data?.data.total ?? null
  const first = seasons[0]
  const title = first ? `${first.off_player_name} scoring on ${first.def_player_name}` : 'Pick a pair'

  const chartData: Data[] = useMemo(() => [
    { type: 'scatter', mode: 'lines+markers', name: 'Scorer pts / poss', x: seasons.map((s) => s.season), y: seasons.map((s) => s.pts_per_poss),
      marker: { size: seasons.map((s) => 6 + Math.min(12, Math.sqrt(s.partial_poss ?? 0))), color: t.series[0] }, line: { color: t.series[0] },
      text: seasons.map((s) => `${formatPpp(s.pts_per_poss)} pts/poss · ${formatNumber(s.partial_poss, 0)} poss · ${formatNumber(s.player_pts, 0)} pts`), hovertemplate: '%{text}<br>%{x}<extra></extra>' },
    { type: 'scatter', mode: 'lines+markers', name: 'Team pts / poss while matched', x: seasons.map((s) => s.season), y: seasons.map((s) => s.team_pts_per_poss),
      marker: { size: 6, color: t.series[1] }, line: { color: t.series[1], dash: 'dot' },
      text: seasons.map((s) => `${formatPpp(s.team_pts_per_poss)} team pts/poss · ${formatNumber(s.team_pts, 0)} team pts`), hovertemplate: '%{text}<br>%{x}<extra></extra>' },
  ], [seasons, t])
  const chartLayout: Partial<Layout> = useMemo(() => ({
    height: 220, margin: { l: 48, r: 12, t: 8, b: 56 }, showlegend: true, legend: { orientation: 'h', y: -0.32, x: 0 },
    xaxis: { type: 'category', title: { text: '' } }, yaxis: { title: { text: 'Pts / poss' }, rangemode: 'tozero', tickformat: '.2f' },
  }), [])

  return (
    <Panel
      question="How did these two do, season by season?"
      method={first ? `${title}. Raw FG% with its 95% Wilson interval beside shrunk FG%. ${priorText(res.data?.data.prior)}.` : 'Click a matchup in the chart, table or heatmap to load its history across seasons.'}
      info="Shrunk FG% = (FGM + prior mean × k) / (FGA + k), with k the prior strength in attempts. Small seasons move toward the league rate; large seasons stay near their raw value."
      actions={offId && defId ? <Button size="sm" variant="ghost" onClick={onClear}>Clear pair</Button> : undefined}
    >
      {!offId || !defId ? (
        <EmptyState title="No pair selected" body="Pick a scorer–defender pair from the chart, the table, or a heatmap cell." />
      ) : (
        <Refetching loading={res.isFetching} error={res.error} retry={() => res.refetch()}>
          {res.isLoading ? <p className="text-sm text-ink-3">Loading…</p> : !seasons.length ? (
            <EmptyState title="These two have no recorded matchup" body="The pair endpoint returned no seasons." />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
              <div className="overflow-auto rounded-[var(--radius-control)] border border-line">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-raised text-xs text-ink-2">
                    <tr>
                      <th scope="col" className={`${CELL} text-left font-medium`}>Season</th>
                      <th scope="col" className={`${CELL} text-right font-medium`}>GP</th>
                      <th scope="col" className={`${CELL} text-right font-medium`}>Poss</th>
                      <th scope="col" className={`${CELL} text-right font-medium`}>Pts</th>
                      <th scope="col" className={`${CELL} text-right font-medium`}>Pts/poss</th>
                      <th scope="col" className={`${CELL} text-right font-medium`}>FG</th>
                      <th scope="col" className={`${CELL} text-right font-medium`}>FG% raw</th>
                      <th scope="col" className={`${CELL} text-right font-medium`}>FG% shrunk</th>
                      <th scope="col" className={`${CELL} text-right font-medium`}>Raw 95% interval</th>
                    </tr>
                  </thead>
                  <tbody>
                    {seasons.map((s) => <SeasonRow key={s.season} r={s} />)}
                    {total && <SeasonRow r={total} total />}
                  </tbody>
                </table>
              </div>
              {seasons.length >= 2 ? (
                <div className="min-w-0"><Plot data={chartData} layout={chartLayout} /></div>
              ) : (
                <p className="self-center text-xs text-ink-3">Only one season on record; the trend line needs at least two.</p>
              )}
            </div>
          )}
        </Refetching>
      )}
    </Panel>
  )
}
