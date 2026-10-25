import { StatTile } from '@/components/ui'
import { formatNumber, formatPct, formatSigned, isNil } from '@/lib/format'
import type { PlayerSeasonRow } from '@/lib/types'
import { ratio } from './helpers'

type Props = { season: string; row: PlayerSeasonRow | undefined; onOffNet: number | null }

export function FocusSummary({ season, row, onOffNet }: Props) {
  const tiles: Array<{ label: string; value: string; sub?: string }> = []
  if (row) {
    const gp = typeof row.gp === 'number' ? row.gp : null
    const mpg = typeof row.mpg === 'number' ? row.mpg : ratio(row.min, gp)
    const push = (label: string, v: number | null | undefined, fmt: (n: number) => string, sub?: string) => {
      if (!isNil(v)) tiles.push({ label, value: fmt(v), sub })
    }
    push('Games', gp, (n) => formatNumber(n, 0))
    push('Minutes / game', mpg, (n) => formatNumber(n, 1))
    push('Points / game', ratio(row.pts, gp), (n) => formatNumber(n, 1))
    push('Rebounds / game', ratio(row.reb, gp), (n) => formatNumber(n, 1))
    push('Assists / game', ratio(row.ast, gp), (n) => formatNumber(n, 1))
    push('True shooting', typeof row.ts_pct === 'number' ? row.ts_pct : null, (n) => formatPct(n))
    push('Usage', typeof row.usg_pct === 'number' ? row.usg_pct : null, (n) => formatPct(n, 1))
    push('Net rating', typeof row.net_rating === 'number' ? row.net_rating : null, (n) => formatSigned(n, 1), 'per 100 poss')
    push('On/off net', onOffNet, (n) => formatSigned(n, 1), 'team net rating on minus off')
  }
  return (
    <section aria-label={`Season ${season} summary`} className="rise-in">
      <p className="mb-2 text-xs text-ink-3">{row?.is_aggregate ? `Per-game and rate stats for ${season}, using the TOT row across all stints.` : `Per-game and rate stats for ${season}.`}</p>
      {tiles.length === 0 ? (
        <p className="text-sm text-ink-3">No season row for {season}.</p>
      ) : (
        <div className="grid grid-cols-3 gap-x-5 gap-y-4 border-y border-line py-4 sm:grid-cols-5 lg:grid-cols-9">
          {tiles.map((t) => <StatTile key={t.label} label={t.label} value={t.value} sub={t.sub} />)}
        </div>
      )}
    </section>
  )
}
