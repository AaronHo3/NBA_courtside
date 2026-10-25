import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/table/DataTable'
import { Badge, Button, PlayerIdentity } from '@/components/ui'
import { MetricLabel } from '@/components/ui/MetricLabel'
import { useMetricIndex } from '@/hooks/useApi'
import { formatMetric, formatNumber } from '@/lib/format'
import type { RankingMeta, RankingRow } from '@/lib/types'
import { useCompare } from '@/store/compare'
import { formatNormalized, formatScore } from './model'
import { Swatch } from './ComponentChips'

/** Sortable table of eligible players with a per-row contribution breakdown panel on click. */
export function RankingTable({ rows, meta, colors }: { rows: RankingRow[]; meta: RankingMeta; colors: Map<string, string> }) {
  const { get } = useMetricIndex()
  const compare = useCompare()
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const selected = rows.find((r) => r.player_id === selectedId) ?? null
  const counting = meta.normalization_of_counting_stats

  const columns = useMemo<ColumnDef<RankingRow, unknown>[]>(() => [
    {
      // Rank rides inside the pinned player column so both stay readable while the components scroll.
      id: 'player', header: 'Player', accessorFn: (r) => r.rank ?? Infinity,
      cell: (c) => (
        <span className="inline-flex items-center gap-2">
          <span className="w-6 shrink-0 text-right tnum text-ink-3">{c.row.original.rank ?? '–'}</span>
          <span onClick={(e) => e.stopPropagation()}><PlayerIdentity playerId={c.row.original.player_id} name={c.row.original.full_name} team={c.row.original.team_abbreviation} size="xs" /></span>
        </span>
      ),
    },
    { id: 'team', header: 'Team', accessorFn: (r) => r.team_abbreviation ?? '', cell: (c) => c.getValue<string>() || '–' },
    { id: 'pos', header: 'Pos', accessorFn: (r) => r.position ?? '', cell: (c) => c.getValue<string>() || '–' },
    { id: 'gp', header: 'GP', accessorFn: (r) => r.gp ?? 0, cell: (c) => formatNumber(c.row.original.gp, 0), meta: { numeric: true } },
    { id: 'min', header: counting === 'totals' ? 'MIN' : 'MIN / game', accessorFn: (r) => r.min ?? 0, cell: (c) => formatNumber(c.row.original.min, counting === 'totals' ? 0 : 1), meta: { numeric: true } },
    { id: 'score', header: 'Score', accessorFn: (r) => r.score ?? -Infinity, cell: (c) => <span className="font-medium">{formatScore(c.row.original.score, meta.normalization)}</span>, meta: { numeric: true } },
    ...meta.components.map<ColumnDef<RankingRow, unknown>>((comp) => ({
      id: comp.metric,
      header: () => (
        <span className="inline-flex items-center gap-1.5">
          <Swatch color={colors.get(comp.metric)} />
          <MetricLabel metric={comp.metric} normalization={comp.scaled ? counting : 'per_game'} />
        </span>
      ),
      accessorFn: (r) => (typeof r[comp.metric] === 'number' ? (r[comp.metric] as number) : null),
      cell: (c) => formatMetric(c.getValue(), get(comp.metric)),
      meta: { numeric: true },
    })),
    {
      id: 'actions',
      header: '',
      enableSorting: false,
      cell: (c) => {
        const r = c.row.original
        const inGroup = compare.has(r.player_id)
        return (
          <Button size="sm" variant="ghost" aria-pressed={inGroup} onClick={(e) => { e.stopPropagation(); compare.toggle({ player_id: r.player_id, full_name: r.full_name, team_abbreviation: r.team_abbreviation }) }}>
            {inGroup ? 'In compare' : 'Add to compare'}
          </Button>
        )
      },
    },
  ], [meta, colors, counting, get, compare])

  return (
    <div className="flex flex-col gap-3">
      <DataTable
        data={rows}
        columns={columns}
        rowKey={(r) => r.player_id}
        maxHeight={520}
        dense
        pinFirstColumn
        focusable
        onRowClick={(r) => setSelectedId((cur) => (cur === r.player_id ? null : r.player_id))}
        isSelected={(r) => r.player_id === selectedId}
        emptyMessage="No eligible players for these thresholds."
      />
      {selected ? (
        <Breakdown row={selected} meta={meta} colors={colors} onClose={() => setSelectedId(null)} />
      ) : (
        <p className="text-xs text-ink-3">Select a row (click or Enter) to see how each component adds up to that player's score.</p>
      )}
    </div>
  )
}

function Breakdown({ row, meta, colors, onClose }: { row: RankingRow; meta: RankingMeta; colors: Map<string, string>; onClose: () => void }) {
  const { get } = useMetricIndex()
  const compare = useCompare()
  const norm = meta.normalization
  const total = row.contributions.reduce((s, c) => s + c.contribution, 0)
  const span = Math.max(1e-9, ...row.contributions.map((c) => Math.abs(c.contribution)))
  return (
    <section aria-label={`Score breakdown for ${row.full_name}`} className="rounded-[var(--radius-control)] border border-line bg-raised/40 p-3">
      <header className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink">
          {row.rank ?? '–'}. {row.full_name} <span className="font-normal text-ink-3">{row.team_abbreviation ?? ''} · {row.position ?? ''}</span>
          <Badge tone="accent" className="ml-2">Score {formatScore(row.score, norm)}</Badge>
        </h3>
        <div className="flex items-center gap-2">
          <Button size="sm" onClick={() => compare.toggle({ player_id: row.player_id, full_name: row.full_name, team_abbreviation: row.team_abbreviation })}>{compare.has(row.player_id) ? 'Remove from compare' : 'Add to compare'}</Button>
          <Button size="sm" variant="ghost" onClick={onClose} aria-label="Close breakdown">Close</Button>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th className="py-1 pr-3 font-medium">Component</th>
              <th className="py-1 pr-3 font-medium text-right">Raw</th>
              <th className="py-1 pr-3 font-medium text-right">Normalised</th>
              <th className="py-1 pr-3 font-medium text-right">Weight</th>
              <th className="py-1 pr-3 font-medium text-right">Contribution</th>
              <th className="py-1 pr-3 font-medium">Share of score</th>
              <th className="py-1 font-medium text-right">Population</th>
            </tr>
          </thead>
          <tbody>
            {row.contributions.map((c) => {
              const comp = meta.components.find((x) => x.metric === c.metric)
              return (
                <tr key={c.metric} className="border-t border-line">
                  <td className="py-1 pr-3">
                    <span className="inline-flex items-center gap-2">
                      <Swatch color={colors.get(c.metric)} />
                      <span>{comp?.label ?? c.metric}</span>
                      <span className="text-xs text-ink-3">{c.higher_is_better ? '↑' : '↓'}</span>
                    </span>
                  </td>
                  <td className="py-1 pr-3 text-right tnum">{formatMetric(c.raw, get(c.metric))}</td>
                  <td className="py-1 pr-3 text-right tnum">{formatNormalized(c.normalized, norm)}</td>
                  <td className="py-1 pr-3 text-right tnum">{(c.weight * 100).toFixed(0)}%</td>
                  <td className="py-1 pr-3 text-right tnum font-medium">{formatScore(c.contribution, norm)}</td>
                  <td className="py-1 pr-3">
                    <span className="block h-2 w-full max-w-40 rounded-sm bg-line" aria-hidden>
                      <span className="block h-2 rounded-sm" style={{ width: `${(Math.abs(c.contribution) / span) * 100}%`, background: colors.get(c.metric) }} />
                    </span>
                  </td>
                  <td className="py-1 text-right tnum text-ink-2">{c.population_size}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-strong text-xs text-ink-2">
              <td className="py-1 pr-3" colSpan={4}>Sum of contributions</td>
              <td className="py-1 pr-3 text-right tnum font-medium text-ink">{formatScore(total, norm)}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
    </section>
  )
}
