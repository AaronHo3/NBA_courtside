import { useMemo, useState } from 'react'
import { clsx } from 'clsx'
import { Segmented } from '@/components/ui'
import { useManifest, useStatus } from '@/hooks/useApi'
import type { SeasonType } from '@/lib/types'
import { COVERAGE_STATUSES, humanFamily, shapeCoverage, type CoverageStatus } from './coverage'
import { P, Section } from './Prose'

const CHIP: Record<CoverageStatus | 'unknown', { label: string; className: string }> = {
  ok: { label: 'ok', className: 'border-good text-good' },
  partial: { label: 'partial', className: 'border-warning text-warning' },
  stale: { label: 'stale', className: 'border-warning text-warning border-dashed' },
  failed: { label: 'failed', className: 'border-critical text-critical' },
  missing: { label: 'missing', className: 'border-line-strong text-ink-3' },
  unknown: { label: '?', className: 'border-line text-ink-3' },
}

/** Seasons × families grid; the manifest note or error for a cell shows on hover/focus. */
export function CoverageMatrix() {
  const status = useStatus()
  const manifest = useManifest()
  const st = status.data?.data
  const [seasonType, setSeasonType] = useState<SeasonType | null>(null)
  const active = seasonType ?? st?.default_season_type ?? 'Regular Season'
  const grid = useMemo(() => (st ? shapeCoverage(st, active, manifest.data?.data.entries ?? []) : null), [st, active, manifest.data])

  return (
    <Section
      id="coverage"
      question="Which families exist for which seasons?"
      method="One chip per (season, family) from the manifest. ok = complete; partial = some rows or seasons missing; stale = older than the refresh window; failed = last fetch errored; missing = never fetched."
      actions={st && <Segmented ariaLabel="Season type" value={active} onChange={(v) => setSeasonType(v as SeasonType)} options={st.season_types.map((t) => ({ value: t, label: t }))} />}
    >
      {!grid ? (
        <P>Loading coverage…</P>
      ) : grid.families.length === 0 ? (
        <P>No season-scoped families are recorded for {active}.</P>
      ) : (
        <div className="flex flex-col gap-3">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2" aria-label="Legend">
            {COVERAGE_STATUSES.map((s) => (
              <li key={s} className="inline-flex items-center gap-1.5"><Chip status={s} /> <span className="tnum">{grid.counts[s]}</span></li>
            ))}
          </ul>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr>
                  <th scope="col" className="sticky left-0 bg-surface py-1 pr-3 text-left font-medium text-ink-2">Season</th>
                  {grid.families.map((f) => (
                    <th key={f} scope="col" className="px-1 py-1 text-left font-medium text-ink-2"><span className="block max-w-24 whitespace-normal leading-tight">{humanFamily(f)}</span></th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row) => (
                  <tr key={row.season} className="border-t border-line">
                    <th scope="row" className="sticky left-0 whitespace-nowrap bg-surface py-1 pr-3 text-left font-medium tnum text-ink">{row.season}</th>
                    {row.cells.map((cell) => (
                      <td key={cell.family} className="px-1 py-1">
                        <Chip status={cell.status} note={cell.note} label={`${humanFamily(cell.family)} ${cell.season} ${active}: ${cell.status}`} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <P>Hover or focus a chip to read the manifest note for that family and season. Families without a season (teams, players, combine measurements) are listed under sources below.</P>
        </div>
      )}
    </Section>
  )
}

function Chip({ status, note, label }: { status: CoverageStatus | 'unknown'; note?: string | null; label?: string }) {
  const c = CHIP[status]
  const title = note ? `${label ?? status} — ${note}` : label
  return (
    <span
      tabIndex={title ? 0 : -1}
      title={title}
      aria-label={title}
      className={clsx('inline-flex min-w-12 items-center justify-center rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-4', c.className, note && 'underline decoration-dotted underline-offset-2')}
    >
      {c.label}
    </span>
  )
}
