import { Badge, Info } from '@/components/ui'
import type { TraitRecord } from '@/lib/types'
import { formatTraitValue } from './model'

type Row = Partial<TraitRecord> & { key: string; label: string; value: number | null; qualified?: boolean }

/** Trait records as a compact table; unmet qualification and unsupported traits say why. */
export function TraitTable({ traits, dense = false }: { traits: Row[]; dense?: boolean }) {
  if (!traits.length) return <p className="text-sm text-ink-2">No traits.</p>
  return (
    <table className={dense ? 'w-full text-xs' : 'w-full text-sm'}>
      <thead>
        <tr className="border-b border-line text-left text-xs text-ink-3">
          <th className="py-1 pr-3 font-medium">Trait</th>
          <th className="py-1 pr-3 text-right font-medium">Value</th>
          <th className="py-1 pr-3 text-right font-medium">Pct</th>
          <th className="py-1 pr-3 text-right font-medium">Sample</th>
          <th className="py-1 font-medium">Status</th>
        </tr>
      </thead>
      <tbody>
        {traits.map((t) => {
          const met = t.qualification?.met ?? t.qualified ?? t.value !== null
          return (
            <tr key={t.key} className="border-b border-line/60">
              <td className="py-1 pr-3 text-ink">
                <span className="inline-flex items-center gap-1">{t.label}{t.definition && <Info text={`${t.definition}${t.formula ? ` · ${t.formula}` : ''}`} />}</span>
              </td>
              <td className="tnum py-1 pr-3 text-right text-ink">{formatTraitValue(t.units ?? null, t.value)}</td>
              <td className="tnum py-1 pr-3 text-right text-ink-2">{t.percentile === null || t.percentile === undefined ? '–' : t.percentile.toFixed(0)}</td>
              <td className="tnum py-1 pr-3 text-right text-ink-2">{t.sample?.n ?? '–'}</td>
              <td className="py-1 text-xs">
                {t.unsupported_reason ? <Badge tone="neutral">Unsupported</Badge> : met ? <Badge tone="good">OK</Badge> : <Badge tone="warning">Not qualified</Badge>}
                {(t.unsupported_reason || (!met && t.qualification?.reason)) && <span className="ml-2 text-ink-3">{t.unsupported_reason ?? t.qualification?.reason}</span>}
              </td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
