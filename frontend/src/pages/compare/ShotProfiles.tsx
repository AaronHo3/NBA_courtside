import { useMemo } from 'react'
import type { Data, Layout } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { EmptyState, Panel } from '@/components/ui'
import { formatPct } from '@/lib/format'
import type { ZoneSummary } from '@/lib/types'
import { ZONE_ORDER } from './metrics'
import type { ComparedPlayer } from './model'
import { PlayerLegend } from './PlayerLegend'
import type { ZoneResult } from './useCompareData'

type Props = { players: ComparedPlayer[]; colors: string[]; results: Array<ZoneResult | undefined>; season: string }

export function ShotProfiles({ players, colors, results, season }: Props) {
  const t = useChartTheme()
  const entries = useMemo(() => players.map((p, i) => ({ p, color: colors[i], res: results[i] })), [players, colors, results])
  const available = entries.filter((e) => e.res?.meta.available && e.res.data.length)
  const unavailable = entries.filter((e) => e.res && !(e.res.meta.available && e.res.data.length))
  const zones = useMemo(() => {
    const present = new Set(available.flatMap((e) => e.res!.data.map((z) => z.zone)))
    return ZONE_ORDER.filter((z) => present.has(z)).concat([...present].filter((z) => !ZONE_ORDER.includes(z)))
  }, [available])
  const minAttempts = available[0]?.res?.meta.min_attempts ?? 10

  const byZone = (rows: ZoneSummary[]) => new Map(rows.map((z) => [z.zone, z]))
  const freqData: Data[] = available.map((e) => {
    const m = byZone(e.res!.data)
    return {
      type: 'bar', orientation: 'h', name: e.p.name, y: zones, x: zones.map((z) => m.get(z)?.frequency ?? null), marker: { color: e.color },
      customdata: zones.map((z) => { const r = m.get(z); return [formatPct(r?.fg_pct), formatPct(r?.league_fg_pct), r?.fga ?? 0, r?.low_sample ? ' · low sample' : ''] }),
      hovertemplate: '<b>%{x:.1%} of attempts</b> · %{fullData.name}<br>%{y}: FG %{customdata[0]} (league %{customdata[1]}) · %{customdata[2]} FGA%{customdata[3]}<extra></extra>',
    }
  })
  const leagueByZone = new Map<string, number | null>()
  for (const e of available) for (const z of e.res!.data) if (!leagueByZone.has(z.zone)) leagueByZone.set(z.zone, z.league_fg_pct)
  const pctData: Data[] = [
    ...available.map((e) => {
      const m = byZone(e.res!.data)
      return {
        type: 'bar' as const, orientation: 'h' as const, name: e.p.name, y: zones, x: zones.map((z) => m.get(z)?.fg_pct ?? null),
        marker: { color: e.color, pattern: { shape: zones.map((z) => (m.get(z)?.low_sample ? '/' : '')), fgcolor: t.surface, fgopacity: 0.6, size: 6 } },
        customdata: zones.map((z) => { const r = m.get(z); return [r?.fga ?? 0, r?.fgm ?? 0, r?.low_sample ? ` · low sample (under ${minAttempts} FGA)` : '', formatPct(r?.league_fg_pct)] }),
        hovertemplate: '<b>FG %{x:.1%}</b> · %{fullData.name}<br>%{y}: %{customdata[1]}/%{customdata[0]} · league %{customdata[3]}%{customdata[2]}<extra></extra>',
      }
    }),
    {
      type: 'scatter', mode: 'markers', name: 'League FG%', y: zones, x: zones.map((z) => leagueByZone.get(z) ?? null),
      marker: { symbol: 'line-ns-open', size: 16, color: t.ink3, line: { width: 2, color: t.ink3 } },
      hovertemplate: 'League FG %{x:.1%} · %{y}<extra></extra>',
    },
  ]
  const height = 70 + zones.length * (Math.max(available.length, 1) * 14 + 14)
  const base: Partial<Layout> = {
    barmode: 'group', height, hovermode: 'closest', bargap: 0.25, bargroupgap: 0.05,
    margin: { l: 8, r: 12, t: 8, b: 64 },
    legend: { orientation: 'h', y: -0.22, x: 0 },
    yaxis: { type: 'category', categoryorder: 'array', categoryarray: zones, autorange: 'reversed', automargin: true, tickfont: { size: 11 } },
  }
  const freqLayout: Partial<Layout> = { ...base, xaxis: { tickformat: '.0%', title: { text: 'Share of attempts' }, rangemode: 'tozero', automargin: true } }
  const pctLayout: Partial<Layout> = { ...base, xaxis: { tickformat: '.0%', title: { text: 'FG% in zone' }, range: [0, 1], automargin: true } }

  const anyLoading = entries.some((e) => !e.res)
  return (
    <Panel question="Where do they shoot from?" method={`Shot zones, ${season}. Shared zone order; hover for FG% against the league in that zone.`} actions={<PlayerLegend players={players} colors={colors} />}>
      {unavailable.length > 0 && (
        <ul className="mb-3 text-xs text-warning">
          {unavailable.map((e) => <li key={e.p.id}>{e.p.name}: {e.res?.meta.reason ?? 'no shot detail for this season'}</li>)}
        </ul>
      )}
      {available.length === 0 ? (
        <EmptyState title={anyLoading ? 'Loading shot profiles…' : `Shot detail is not available for ${season}`} body={anyLoading ? undefined : unavailable[0]?.res?.meta.reason ?? 'Shot-level data covers recent seasons only.'} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <figure className="min-w-0">
            <figcaption className="mb-1 text-xs font-medium text-ink-2">Share of attempts by zone</figcaption>
            <div style={{ height }}><Plot data={freqData} layout={freqLayout} config={{ displayModeBar: false }} /></div>
          </figure>
          <figure className="min-w-0">
            <figcaption className="mb-1 text-xs font-medium text-ink-2">FG% by zone</figcaption>
            <div style={{ height }}><Plot data={pctData} layout={pctLayout} config={{ displayModeBar: false }} /></div>
            <p className="mt-1 text-xs text-ink-3">Hatched bars: fewer than {minAttempts} attempts (low sample). Grey ticks: league FG% in that zone.</p>
          </figure>
        </div>
      )}
    </Panel>
  )
}
