import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import type { Data, Layout } from 'plotly.js'
import { ChartFrame } from '@/components/charts/ChartFrame'
import { Plot, useChartTheme } from '@/components/charts/Plot'
import { DataTable } from '@/components/table/DataTable'
import { EmptyState, Panel } from '@/components/ui'
import { formatNumber } from '@/lib/format'
import type { TeamSeasonDetail } from '@/lib/types'
import { stintBars, type StintBar } from './analysis'
import { Note } from './shared'

type Stint = TeamSeasonDetail['stints'][number]

const fmtDay = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '–')

function Gantt({ bars }: { bars: StintBar[] }) {
  const t = useChartTheme()
  const { data, layout } = useMemo(() => {
    const names = bars.map((b) => b.name)
    const mk = (subset: StintBar[], name: string, color: string): Data => ({
      type: 'bar', orientation: 'h', name,
      y: subset.map((b) => b.name), x: subset.map((b) => b.durationMs), base: subset.map((b) => b.start),
      width: subset.map((b) => b.width),
      marker: { color, line: { color: t.surface, width: 1 } },
      text: subset.map((b) => `${formatNumber(b.min, 0)} min`), textposition: 'outside', textfont: { size: 10, color: t.ink3 }, cliponaxis: false,
      customdata: subset.map((b) => [formatNumber(b.min, 0), formatNumber(b.gp, 0), fmtDay(b.start), fmtDay(b.end), b.seasonStints]),
      hovertemplate: '<b>%{customdata[0]} min · %{customdata[1]} GP</b><br>%{y}: %{customdata[2]} – %{customdata[3]} (%{customdata[4]} stint(s) this season)<extra></extra>',
    })
    const data: Data[] = [mk(bars.filter((b) => !b.traded), 'Whole stint with this team', t.series[0]), mk(bars.filter((b) => b.traded), 'Joined or left mid-season', t.series[1])]
    const layout: Partial<Layout> = {
      barmode: 'overlay', showlegend: false,
      margin: { l: 150, r: 64, t: 4, b: 36 },
      xaxis: { type: 'date', tickformat: '%b', tickfont: { size: 10 } },
      yaxis: { type: 'category', categoryorder: 'array', categoryarray: names, autorange: 'reversed', tickfont: { size: 11 } },
    }
    return { data, layout }
  }, [bars, t])
  return (
    <ChartFrame title="First to last game with this team" height={60 + 24 * bars.length} legend={[{ label: 'Whole stint with this team', color: t.series[0] }, { label: 'Joined or left mid-season', color: t.series[1] }]}>
      <Plot data={data} layout={layout} config={{ displayModeBar: false }} />
    </ChartFrame>
  )
}

function StintTable({ stints, tradedIds }: { stints: Stint[]; tradedIds: ReadonlySet<number> }) {
  const columns = useMemo<ColumnDef<Stint, unknown>[]>(() => [
    { id: 'player', header: 'Player', accessorFn: (r) => r.full_name },
    { id: 'gp', header: 'GP', accessorFn: (r) => r.gp, cell: ({ getValue }) => formatNumber(getValue() as number, 0), meta: { numeric: true } },
    { id: 'min', header: 'Minutes', accessorFn: (r) => r.min, cell: ({ getValue }) => formatNumber(getValue() as number, 0), meta: { numeric: true } },
    { id: 'stints', header: 'Stints', accessorFn: (r) => r.season_stints, meta: { numeric: true } },
    { id: 'traded', header: 'Moved', accessorFn: (r) => (tradedIds.has(r.player_id) || r.season_stints > 1 ? 'yes' : ''), cell: ({ getValue }) => (getValue() as string) || '–' },
  ], [tradedIds])
  return <DataTable data={stints} columns={columns} rowKey={(r) => r.player_id} initialSort={[{ id: 'min', desc: true }]} maxHeight={420} dense pinFirstColumn />
}

/** Gantt of first..last game per player (bar thickness = minutes); falls back to a table when game dates are missing. */
export function StintsPanel({ stints, tradedIds }: { stints: Stint[]; tradedIds: ReadonlySet<number> }) {
  const { bars, hasDates } = useMemo(() => stintBars(stints, tradedIds), [stints, tradedIds])
  return (
    <Panel question="Who played when?" method="Each bar runs from a player's first to last game with this team; thicker bars played more minutes. Players who joined or left mid-season use the second colour.">
      {!stints.length ? (
        <EmptyState title="No stint data" body="The roster for this season has no minutes on record." />
      ) : hasDates ? (
        <Gantt bars={bars} />
      ) : (
        <>
          <Note className="mt-0 mb-2">Game logs are not loaded for this season, so first and last game dates are unavailable; totals are shown instead.</Note>
          <StintTable stints={stints} tradedIds={tradedIds} />
        </>
      )}
    </Panel>
  )
}
