import { useMemo } from 'react'
import type { Data, Layout } from 'plotly.js'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { Button, EmptyState, Panel, Select } from '@/components/ui'
import { useTeamSeasons } from '@/hooks/useApi'
import { useListParam, useParam } from '@/lib/urlState'
import type { Team, TeamSeason } from '@/lib/types'
import { axisFormat, formatTeamMetric, numberAt, teamMetric, wl } from './teamMetrics'
import { ChartBox, LegendChips, Note } from './shared'

const SLOTS = [0, 1, 2, 3] as const
const BAR_METRICS = ['net_rating', 'off_rating', 'def_rating', 'pace', 'efg_pct', 'tm_tov_pct'] as const

type Series = { team: Team; color: string; seasons: TeamSeason[] }

function useSeriesData(ids: number[], teams: Team[], colors: string[]): { series: Series[]; loading: boolean } {
  // Fixed number of hooks: four slots, disabled when empty.
  const q0 = useTeamSeasons(ids[0] ?? null)
  const q1 = useTeamSeasons(ids[1] ?? null)
  const q2 = useTeamSeasons(ids[2] ?? null)
  const q3 = useTeamSeasons(ids[3] ?? null)
  const queries = [q0, q1, q2, q3]
  const series = ids.flatMap((id, i) => {
    const team = teams.find((tm) => tm.team_id === id)
    return team ? [{ team, color: colors[i % colors.length], seasons: queries[i].data?.data ?? [] }] : []
  })
  return { series, loading: queries.some((q) => q.isLoading) }
}

/** Two to four teams side by side: dots per metric for one season, and net rating across every season. */
export function CompareStrip({ season, seasons, teams, league }: { season: string; seasons: string[]; teams: Team[]; league: TeamSeason[] }) {
  const t = useChartTheme()
  const [ids, setIds] = useListParam('cmp')
  const [cmpSeason, setCmpSeason] = useParam('cseason', season)
  const { series, loading } = useSeriesData(ids.slice(0, 4), teams, t.series)

  const setSlot = (slot: number, value: string) => {
    const next = [...ids]
    const id = Number(value)
    if (!id) next.splice(slot, 1)
    else next[slot] = id
    setIds(Array.from(new Set(next.filter((n) => n > 0))).slice(0, 4))
  }
  const suggest = () => {
    const top = [...league].sort((a, b) => (b.net_rating ?? -Infinity) - (a.net_rating ?? -Infinity)).slice(0, 3)
    setIds(top.map((r) => r.team_id))
  }

  const picked = useMemo(() => series.map((s) => ({ ...s, row: s.seasons.find((r) => r.season === cmpSeason) ?? null })), [series, cmpSeason])
  const seasonAxis = useMemo(() => {
    const all = new Set<string>()
    for (const s of series) for (const r of s.seasons) all.add(r.season)
    return Array.from(all).sort()
  }, [series])

  const trend = useMemo(() => {
    const data: Data[] = series.map((s) => {
      const bySeason = new Map(s.seasons.map((r) => [r.season, r]))
      const rows = seasonAxis.map((se) => bySeason.get(se) ?? null)
      return {
        type: 'scatter', mode: 'lines+markers', name: s.team.abbreviation, x: seasonAxis, y: rows.map((r) => r?.net_rating ?? null),
        line: { color: s.color, width: 2 }, marker: { color: s.color, size: 7 }, connectgaps: false,
        customdata: rows.map((r) => (r ? [formatTeamMetric('net_rating', r.net_rating), wl(r)] : ['–', '–'])),
        hovertemplate: `<b>%{customdata[0]} net</b> · ${s.team.abbreviation} %{x}<br>%{customdata[1]}<extra></extra>`,
      }
    })
    const layout: Partial<Layout> = {
      margin: { l: 48, r: 16, t: 8, b: 64 },
      xaxis: { type: 'category', title: { text: 'Season' }, tickangle: -30, tickfont: { size: 10 } },
      yaxis: { title: { text: 'Net rating' }, zeroline: true },
      shapes: seasonAxis.includes(cmpSeason) ? [{ type: 'rect', xref: 'x', yref: 'paper', x0: seasonAxis.indexOf(cmpSeason) - 0.5, x1: seasonAxis.indexOf(cmpSeason) + 0.5, y0: 0, y1: 1, fillcolor: t.accent, opacity: 0.08, line: { width: 0 } }] : [],
      legend: { orientation: 'h', y: -0.3 },
    }
    return { data, layout }
  }, [series, seasonAxis, cmpSeason, t])

  return (
    <Panel
      question="Team vs team: how do their profiles differ?"
      method="Pick two to four teams. Dots compare one season on six metrics (one axis per chart, so no truncated bars); the line chart follows net rating across every season on file."
      actions={
        <>
          {SLOTS.map((slot) => (
            <Select key={slot} aria-label={`Team ${slot + 1}`} value={ids[slot] ?? ''} onChange={(e) => setSlot(slot, e.target.value)}>
              <option value="">{slot < 2 ? `Team ${slot + 1}` : `Team ${slot + 1} (optional)`}</option>
              {teams.map((tm) => <option key={tm.team_id} value={tm.team_id} disabled={ids.includes(tm.team_id) && ids[slot] !== tm.team_id}>{tm.abbreviation} · {tm.full_name}</option>)}
            </Select>
          ))}
          <Select aria-label="Comparison season" value={cmpSeason} onChange={(e) => setCmpSeason(e.target.value)}>
            {(seasons.length ? seasons : [season]).map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </>
      }
    >
      {series.length < 2 ? (
        <EmptyState title="Pick at least two teams" body="Choose teams in the selectors above, or start from the three best net ratings this season." action={<Button size="sm" onClick={suggest} disabled={!league.length}>Use top three by net rating</Button>} />
      ) : (
        <div className="flex flex-col gap-4">
          <LegendChips ariaLabel="Teams in comparison" items={series.map((s) => ({ label: `${s.team.abbreviation} · ${s.team.full_name}`, color: s.color }))} />
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {BAR_METRICS.map((k) => {
              const m = teamMetric(k)
              const vals = picked.map((p) => (p.row ? numberAt(p.row, k) : null))
              const data: Data[] = [{
                type: 'scatter', mode: 'markers+text', orientation: 'h', name: m.short,
                y: picked.map((p) => p.team.abbreviation), x: vals,
                text: vals.map((v) => formatTeamMetric(k, v)), textposition: 'middle right', textfont: { size: 11, color: t.ink2 }, cliponaxis: false,
                marker: { color: picked.map((p) => p.color), size: 12 },
                customdata: picked.map((p) => (p.row ? [p.team.full_name, wl(p.row)] : [p.team.full_name, 'no season on file'])),
                hovertemplate: `<b>%{text}</b> ${m.short}<br>%{customdata[0]} (%{customdata[1]})<extra></extra>`,
              }]
              const layout: Partial<Layout> = {
                showlegend: false,
                margin: { l: 44, r: 56, t: 4, b: 28 },
                xaxis: { ...axisFormat(k), tickfont: { size: 10 }, zeroline: false },
                yaxis: { type: 'category', autorange: 'reversed', tickfont: { size: 11 } },
              }
              return (
                <figure key={k} className="m-0 rounded-[var(--radius-control)] border border-line p-2">
                  <figcaption className="mb-1 text-xs font-medium text-ink-2">{m.label}{m.higherIsBetter === false ? <span className="font-normal text-ink-3"> · lower is better</span> : null}</figcaption>
                  <ChartBox height={36 + 26 * picked.length}>
                    <Plot data={data} layout={layout} config={{ staticPlot: false, displayModeBar: false }} />
                  </ChartBox>
                </figure>
              )
            })}
          </div>
          <div>
            <p className="mb-1 text-xs font-medium text-ink-2">Net rating by season{loading ? ' · loading' : ''}</p>
            <ChartBox height={300}>
              <Plot data={trend.data} layout={trend.layout} />
            </ChartBox>
          </div>
          <Note>Season shown in the dot charts: {cmpSeason} (shaded in the trend). Ratings are provider/derived estimates; a team's rise or fall across seasons reflects roster, health, schedule and opponents together.</Note>
        </div>
      )}
    </Panel>
  )
}
