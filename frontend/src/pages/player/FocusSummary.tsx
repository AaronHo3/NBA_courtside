import { StatRow, StatTile } from '@/components/ui'
import { formatNumber, formatPct, formatSigned, isNil } from '@/lib/format'
import type { PlayerSeasonRow } from '@/lib/types'
import { ratio } from './helpers'

type Props = { season: string; row: PlayerSeasonRow | undefined; onOffNet: number | null }

type Tile = { label: string; value: string; sub?: string }

const show = (v: number | null | undefined, fmt: (n: number) => string) => (isNil(v) ? '—' : fmt(v))
const num = (v: unknown) => (typeof v === 'number' ? v : null)

/** The eight key numbers for the focus season; a missing value keeps its tile as "—" so the row never reflows. */
function keyTiles(row: PlayerSeasonRow, onOffNet: number | null): Tile[] {
  const gp = num(row.gp)
  const mpg = num(row.mpg) ?? ratio(row.min, gp)
  return [
    { label: 'Pts / game', value: show(ratio(row.pts, gp), (n) => formatNumber(n, 1)), sub: gp != null ? `${formatNumber(gp, 0)} GP` : 'games unknown' },
    { label: 'Reb / game', value: show(ratio(row.reb, gp), (n) => formatNumber(n, 1)) },
    { label: 'Ast / game', value: show(ratio(row.ast, gp), (n) => formatNumber(n, 1)) },
    { label: 'Min / game', value: show(mpg, (n) => formatNumber(n, 1)) },
    { label: 'True shooting', value: show(num(row.ts_pct), (n) => formatPct(n)) },
    { label: 'Usage', value: show(num(row.usg_pct), (n) => formatPct(n, 1)) },
    { label: 'Net rating', value: show(num(row.net_rating), (n) => formatSigned(n, 1)), sub: 'per 100 poss' },
    { label: 'On/off net', value: show(onOffNet, (n) => formatSigned(n, 1)), sub: 'on minus off' },
  ]
}

export function FocusSummary({ season, row, onOffNet }: Props) {
  return (
    <section aria-label={`Season ${season} summary`} className="rise-in">
      <p className="mb-2 text-xs text-ink-3">{row?.is_aggregate ? `Per-game and rate stats for ${season}, using the TOT row across all stints.` : `Per-game and rate stats for ${season}.`}</p>
      {!row ? (
        <p className="text-sm text-ink-3">No season row for {season}.</p>
      ) : (
        <StatRow className="lg:grid-cols-8 sm:max-lg:[&>*:nth-child(5)]:border-l-0 sm:max-lg:[&>*:nth-child(5)]:pl-0">
          {keyTiles(row, onOffNet).map((t) => <StatTile key={t.label} label={t.label} value={t.value} sub={t.sub} />)}
        </StatRow>
      )}
    </section>
  )
}
