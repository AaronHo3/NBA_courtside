import { EmptyState, Panel } from '@/components/ui'
import { formatNumber, inchesToFtIn, isNil } from '@/lib/format'
import type { PlayerProfile } from '@/lib/types'
import { wingspanRatio } from './helpers'

function inches(v: number | null | undefined): string {
  return isNil(v) ? '–' : `${inchesToFtIn(v)} (${formatNumber(v, Number.isInteger(v) ? 0 : 2)} in)`
}

function Rows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt className="text-ink-3">{k}</dt>
          <dd className="tnum whitespace-nowrap text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  )
}

export function MeasurementsPanel({ measurements }: { measurements: PlayerProfile['measurements'] }) {
  const { roster, combine } = measurements
  const ratio = combine ? wingspanRatio(combine.wingspan_in, combine.height_wo_shoes_in) : null
  return (
    <Panel className="min-w-0" question="How big is he, by which measurement?" method="Roster listing and draft-combine measurements are shown separately; wingspan comes only from the combine.">
      <div className="grid gap-5 sm:grid-cols-[auto_auto] sm:justify-start sm:gap-x-10">
        <section aria-labelledby="meas-roster">
          <h3 id="meas-roster" className="mb-2 text-xs font-medium text-ink-2">Roster listing</h3>
          <Rows rows={[
            ['Height', inches(roster.height_in)],
            ['Weight', isNil(roster.weight_lb) ? '–' : `${formatNumber(roster.weight_lb, 0)} lb`],
          ]} />
          <p className="mt-2 text-xs text-ink-3">Source: {roster.source}</p>
        </section>
        <section aria-labelledby="meas-combine">
          <h3 id="meas-combine" className="mb-2 text-xs font-medium text-ink-2">Draft combine{combine ? ` · measured ${combine.measured_at}` : ''}</h3>
          {combine ? (
            <>
              <Rows rows={[
                ['Height without shoes', inches(combine.height_wo_shoes_in)],
                ['Height with shoes', inches(combine.height_w_shoes_in)],
                ['Wingspan', inches(combine.wingspan_in)],
                ['Standing reach', inches(combine.standing_reach_in)],
                ['Weight', isNil(combine.weight_lb) ? '–' : `${formatNumber(combine.weight_lb, 0)} lb`],
                ['Body fat', isNil(combine.body_fat_pct) ? '–' : `${formatNumber(combine.body_fat_pct, 1)}%`],
                ['Hand length / width', `${isNil(combine.hand_length_in) ? '–' : `${formatNumber(combine.hand_length_in, 2)} in`} / ${isNil(combine.hand_width_in) ? '–' : `${formatNumber(combine.hand_width_in, 2)} in`}`],
                ['Wingspan ÷ height (no shoes)', isNil(ratio) ? '–' : formatNumber(ratio, 3)],
              ]} />
              <p className="mt-2 text-xs text-ink-3">Source: {combine.source}</p>
            </>
          ) : (
            <EmptyState title="No combine measurements on record" body="Wingspan, standing reach and hand size are only shown when a combine measurement exists; they are never estimated." />
          )}
        </section>
      </div>
      <p className="mt-4 border-t border-line pt-3 text-xs text-ink-2">{roster.note}</p>
    </Panel>
  )
}
