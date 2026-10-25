import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '@/components/table/DataTable'
import { Badge, Panel, Segmented } from '@/components/ui'
import { useMetricIndex } from '@/hooks/useApi'
import { formatMetric, metricLabelWithNorm, NORMALIZATION_LABEL } from '@/lib/format'
import { useParam } from '@/lib/urlState'
import type { PlayerSeasonRow } from '@/lib/types'
import { rescaleRow, type ProfileNormalization } from './helpers'

const METRICS = ['gp', 'min', 'pts', 'reb', 'ast', 'ts_pct', 'efg_pct', 'usg_pct', 'net_rating', 'pie'] as const
const NORMS: ProfileNormalization[] = ['per_game', 'per_36', 'totals']

function isNorm(v: string): v is ProfileNormalization {
  return (NORMS as string[]).includes(v)
}

export function SeasonTable({ rows, focusSeason }: { rows: PlayerSeasonRow[]; focusSeason: string }) {
  const [normRaw, setNorm] = useParam('norm', 'per_game')
  const norm: ProfileNormalization = isNorm(normRaw) ? normRaw : 'per_game'
  const { get } = useMetricIndex()

  const data = useMemo(
    () =>
      [...rows]
        .sort((a, b) => b.season.localeCompare(a.season) || Number(b.is_aggregate) - Number(a.is_aggregate))
        .map((r) => rescaleRow(r, norm)),
    [rows, norm],
  )

  const columns = useMemo<ColumnDef<PlayerSeasonRow, unknown>[]>(() => {
    const seasonCols: ColumnDef<PlayerSeasonRow, unknown>[] = [
      { id: 'season', accessorKey: 'season', header: 'Season', cell: (c) => <span className="tnum">{c.getValue<string>()}</span> },
      {
        id: 'team',
        accessorFn: (r) => r.team_abbreviation ?? '',
        header: 'Team',
        cell: (c) => {
          const r = c.row.original
          return (
            <span className="inline-flex items-center gap-1.5" title={r.team_name ?? undefined}>
              {r.is_aggregate ? <Badge tone="accent">TOT</Badge> : r.team_abbreviation ?? '–'}
              {r.is_aggregate && <span className="text-xs text-ink-3">all stints</span>}
            </span>
          )
        },
      },
    ]
    const metricCols: ColumnDef<PlayerSeasonRow, unknown>[] = METRICS.map((key) => {
      const m = get(key)
      const label = key === 'min' && norm === 'per_game' ? 'Min / game' : metricLabelWithNorm(m, key, norm)
      return {
        id: key,
        accessorFn: (r) => (typeof r[key] === 'number' ? (r[key] as number) : null),
        header: label,
        sortUndefined: 'last',
        meta: { numeric: true },
        cell: (c) => formatMetric(c.getValue(), m ?? null, { signed: key === 'net_rating' }),
      }
    })
    return [...seasonCols, ...metricCols]
  }, [get, norm])

  return (
    <Panel
      question="What has he produced each season?"
      method="One row per season; a traded season shows the TOT aggregate plus one row per stint. Per-game and per-36 figures are rescaled from season totals; percentages and rates are left as reported."
      actions={
        <Segmented<ProfileNormalization>
          ariaLabel="Normalisation"
          value={norm}
          onChange={(v) => setNorm(v)}
          options={NORMS.map((n) => ({ value: n, label: NORMALIZATION_LABEL[n] }))}
        />
      }
    >
      <DataTable
        data={data}
        columns={columns}
        rowKey={(r) => `${r.season}-${r.team_abbreviation}-${r.is_aggregate ? 'tot' : 'stint'}`}
        isHighlighted={(r) => r.season === focusSeason}
        height={Math.min(520, data.length * 36 + 44)}
        emptyMessage="No seasons on record."
      />
    </Panel>
  )
}
