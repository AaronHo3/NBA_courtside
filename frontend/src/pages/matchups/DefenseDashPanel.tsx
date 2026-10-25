import { useMemo } from 'react'
import type { Data, Layout } from 'plotly.js'
import { diverging } from '@/components/charts/palette'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { EmptyState, Panel, Refetching } from '@/components/ui'
import { useDefenseDash } from '@/hooks/useApi'
import { formatNumber, formatPct, isNil } from '@/lib/format'
import type { DefenseDashRow } from '@/lib/types'

type Props = { playerId: number | null; playerName: string | null; season: string; seasonType: string }

const CELL = 'px-2 py-1 whitespace-nowrap'
const LOW_DFGA = 25

function signedPts(v: number | null): string {
  if (isNil(v)) return '–'
  const pts = v * 100
  return `${pts > 0 ? '+' : ''}${pts.toFixed(1)} pts`
}

/** Defense dashboard: shooters' FG% with this player as closest defender versus their usual FG%. */
export function DefenseDashPanel({ playerId, playerName, season, seasonType }: Props) {
  const res = useDefenseDash(playerId, { season, season_type: seasonType })
  const t = useChartTheme()
  const rows: DefenseDashRow[] = useMemo(() => [...(res.data?.data ?? [])].sort((a, b) => (b.d_fga ?? 0) - (a.d_fga ?? 0)), [res.data])
  const definition = res.data?.meta.definition
  const palette = diverging(t.theme)

  const data: Data[] = useMemo(() => {
    const plotted = [...rows].filter((r) => !isNil(r.pct_plusminus)).sort((a, b) => (a.pct_plusminus as number) - (b.pct_plusminus as number))
    return [{
      type: 'bar', orientation: 'h', name: 'D-FG% minus normal FG%',
      x: plotted.map((r) => (r.pct_plusminus as number) * 100), y: plotted.map((r) => r.defense_category),
      marker: { color: plotted.map((r) => ((r.pct_plusminus as number) < 0 ? palette[1] : palette[5])), opacity: plotted.map((r) => ((r.d_fga ?? 0) < LOW_DFGA ? 0.45 : 0.9)) },
      hovertext: plotted.map((r) => `${signedPts(r.pct_plusminus)} · D-FG% ${formatPct(r.d_fg_pct)} vs normal ${formatPct(r.normal_fg_pct)} · ${formatNumber(r.d_fga, 0)} D-FGA${(r.d_fga ?? 0) < LOW_DFGA ? ' · low sample' : ''}`),
      hovertemplate: '%{hovertext}<br>%{y}<extra></extra>',
    }]
  }, [rows, palette])
  const layout: Partial<Layout> = useMemo(() => ({
    height: Math.max(220, rows.length * 30 + 80), margin: { l: 130, r: 16, t: 8, b: 44 }, showlegend: false,
    xaxis: { title: { text: 'Percentage points vs shooters’ normal FG% (blue = below normal)' }, zeroline: true, ticksuffix: '' },
    yaxis: { type: 'category', automargin: true, tickfont: { size: 11 } },
  }), [rows.length])

  return (
    <Panel
      question="How do shooters fare with him as closest defender?"
      method={definition ?? 'Diff = D-FG% minus the shooters’ season FG% on the same shot types; negative means shooters did worse than usual.'}
      info="Difference is in percentage points of FG%. Categories overlap (for example 2 pointers includes shots under 6 ft), so they do not sum. Faded bars have fewer than 25 defended attempts."
    >
      {!playerId ? (
        <EmptyState title="Pick a player" body="The defense dashboard loads for the selected player." />
      ) : (
        <Refetching loading={res.isFetching} error={res.error} retry={() => res.refetch()}>
          {res.isLoading ? <p className="text-sm text-ink-3">Loading…</p> : !rows.length ? (
            <EmptyState title="No defense dashboard rows" body={`No closest-defender data for ${playerName ?? 'this player'} in ${season}.`} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="overflow-auto rounded-[var(--radius-control)] border border-line">
                <table className="w-full border-collapse text-sm">
                  <thead className="bg-raised text-xs text-ink-2">
                    <tr>
                      <th scope="col" className={`${CELL} text-left font-medium`}>Category</th>
                      <th scope="col" className={`${CELL} text-right font-medium`}>Freq</th>
                      <th scope="col" className={`${CELL} text-right font-medium`}>D-FGA</th>
                      <th scope="col" className={`${CELL} text-right font-medium`}>D-FGM</th>
                      <th scope="col" className={`${CELL} text-right font-medium`}>D-FG%</th>
                      <th scope="col" className={`${CELL} text-right font-medium`}>Normal FG%</th>
                      <th scope="col" className={`${CELL} text-right font-medium`}>Diff</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.defense_category} className="border-t border-line">
                        <td className={CELL}>{r.defense_category}{(r.d_fga ?? 0) < LOW_DFGA && <span className="ml-1 text-[11px] text-warning">low sample</span>}</td>
                        <td className={`${CELL} text-right tnum`}>{formatPct(r.freq, 0)}</td>
                        <td className={`${CELL} text-right tnum`}>{formatNumber(r.d_fga, 0)}</td>
                        <td className={`${CELL} text-right tnum`}>{formatNumber(r.d_fgm, 0)}</td>
                        <td className={`${CELL} text-right tnum`}>{formatPct(r.d_fg_pct)}</td>
                        <td className={`${CELL} text-right tnum`}>{formatPct(r.normal_fg_pct)}</td>
                        <td className={`${CELL} text-right tnum font-medium`}>{signedPts(r.pct_plusminus)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="min-w-0" style={{ height: Math.max(220, rows.length * 30 + 80) }}>
                <Plot data={data} layout={layout} />
              </div>
            </div>
          )}
          <p className="mt-3 max-w-prose text-xs text-ink-2">
            Treat these numbers as descriptions, not verdicts. Closest-defender attribution credits whoever was nearest at release, so switches, help rotations and late closeouts all land on one name; the shooters a player faces are chosen by his coach and the opponent, not by him; and team scheme decides which shots he is asked to concede. Individual defensive conclusions need more than this table.
          </p>
        </Refetching>
      )}
    </Panel>
  )
}
