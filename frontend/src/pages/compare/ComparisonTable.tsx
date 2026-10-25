import { clsx } from 'clsx'
import { Button, Panel } from '@/components/ui'
import { downloadCsv } from '@/components/table/DataTable'
import type { Normalization } from '@/lib/types'
import { formatCellValue, percentileText } from './format'
import { labelFor, TABLE_METRICS } from './metrics'
import type { ComparedPlayer, MetricResult, PopulationKind } from './model'
import { POPULATION_LABEL } from './model'

type Props = { model: Map<string, MetricResult>; players: ComparedPlayer[]; colors: string[]; norm: Normalization; populationKind: PopulationKind; season: string }

export function ComparisonTable({ model, players, colors, norm, populationKind, season }: Props) {
  const rows = TABLE_METRICS.map((k) => model.get(k)).filter((r): r is MetricResult => Boolean(r))
  const exportCsv = () => {
    const out = rows.map((r) => {
      const rec: Record<string, unknown> = { metric: labelFor(r.spec, norm), direction: r.spec.higherIsBetter === null ? 'none' : r.spec.higherIsBetter ? 'higher' : 'lower' }
      players.forEach((p, i) => {
        rec[`${p.name} value`] = r.cells[i].value
        rec[`${p.name} percentile`] = r.cells[i].percentile === null ? null : Math.round(r.cells[i].percentile * 10) / 10
        rec[`${p.name} cohort`] = r.cells[i].cohortSize
      })
      return rec
    })
    downloadCsv(`compare-${season}-${norm}.csv`, out)
  }
  return (
    <Panel
      question="Full comparison table"
      method={`Best value per row is highlighted (lower-is-better rows respect that). Percentiles: ${POPULATION_LABEL[populationKind].toLowerCase()}, ${season}.`}
      actions={<Button size="sm" onClick={exportCsv}>Download CSV</Button>}
    >
      <div className="overflow-auto rounded-[var(--radius-control)] border border-line">
        <table className="w-full border-collapse text-sm">
          <thead className="bg-raised">
            <tr>
              <th scope="col" className="sticky left-0 z-10 border-b border-line bg-raised px-2 py-1.5 text-left text-xs font-medium text-ink-2">Metric</th>
              {players.map((p, i) => (
                <th key={p.id} scope="col" className="whitespace-nowrap border-b border-line px-2 py-1.5 text-right text-xs font-medium text-ink-2">
                  <span className="inline-flex items-center gap-1.5">
                    <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: colors[i] }} />
                    {p.name}
                    {p.team && <span className="text-ink-3">{p.team}</span>}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.spec.key} className="border-b border-line last:border-b-0">
                <th scope="row" className="sticky left-0 z-10 min-w-[7rem] max-w-[11rem] bg-surface px-2 py-1 text-left text-xs font-normal leading-4 text-ink-2 sm:max-w-none sm:whitespace-nowrap">
                  {labelFor(r.spec, norm)}
                  {r.spec.higherIsBetter === false && <span className="ml-1 text-ink-3">(lower is better)</span>}
                </th>
                {r.cells.map((c, i) => (
                  <td key={players[i].id} className={clsx('whitespace-nowrap px-2 py-1 text-right align-top tnum', i === r.best && 'bg-accent-soft')} title={percentileText(c, populationKind, players[i].position)}>
                    <span className={clsx('block text-ink', i === r.best && 'font-semibold', c.belowThreshold && 'italic')}>{formatCellValue(r.spec, c.value, norm, { long: true })}</span>
                    <span className="block text-[11px] text-ink-3">{c.percentile === null ? '–' : `${Math.round(c.percentile)}th · n=${c.cohortSize}`}</span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-xs text-ink-3">Second line in each cell: percentile within the chosen population and its size. Italic values fall below the minimum-minutes threshold.</p>
    </Panel>
  )
}
