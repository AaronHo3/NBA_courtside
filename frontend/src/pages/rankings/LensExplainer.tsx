import { Badge, Panel } from '@/components/ui'
import { MetricLabel } from '@/components/ui/MetricLabel'
import type { Lens, RankingMeta } from '@/lib/types'
import { normalizeWeights } from './model'
import { Swatch } from './ComponentChips'

const KIND_LABEL: Record<string, string> = { counting: 'Counting', pct: 'Percentage', rate: 'Rate', rating: 'Rating', physical: 'Physical', context: 'Context' }

/** What exactly is being summed: each component's weight share, direction, kind and scaling. */
export function LensExplainer({ lens, meta, colors }: { lens: Lens; meta: RankingMeta | undefined; colors: Map<string, string> }) {
  const comps = meta?.components ?? lens.components.map((c) => ({ ...c, scaled: c.kind === 'counting' }))
  const shares = normalizeWeights(comps)
  const counting = meta?.normalization_of_counting_stats ?? 'per_game'
  return (
    <Panel question={`What does "${lens.label}" add up?`} method={lens.description}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-ink-3">
              <th className="py-1 pr-3 font-medium">Component</th>
              <th className="py-1 pr-3 font-medium">Kind</th>
              <th className="py-1 pr-3 font-medium">Direction</th>
              <th className="py-1 pr-3 font-medium text-right">Weight</th>
              <th className="py-1 pr-3 font-medium text-right">Share</th>
            </tr>
          </thead>
          <tbody>
            {comps.map((c, i) => (
              <tr key={c.metric} className="border-t border-line">
                <td className="py-1.5 pr-3">
                  <span className="inline-flex items-center gap-2">
                    <Swatch color={colors.get(c.metric)} />
                    <MetricLabel metric={c.metric} normalization={c.scaled ? counting : 'per_game'} />
                  </span>
                </td>
                <td className="py-1.5 pr-3 whitespace-nowrap text-ink-2">
                  {KIND_LABEL[c.kind ?? ''] ?? c.kind ?? '–'}
                  {c.scaled && <span className="ml-1 text-xs text-ink-3">({counting === 'totals' ? 'season totals' : 'per game'})</span>}
                </td>
                <td className="py-1.5 pr-3 whitespace-nowrap text-ink-2">{c.higher_is_better ? 'Higher is better' : 'Lower is better'}</td>
                <td className="py-1.5 pr-3 text-right tnum">{c.weight}</td>
                <td className="py-1.5 pr-3 text-right tnum">{(shares[i] * 100).toFixed(0)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-ink-2">
        Score = Σ share × normalised value, where each component is {meta?.normalization === 'zscore' ? 'a z-score' : 'a mid-rank percentile (0–100)'} within the eligible population and flipped for lower-is-better metrics.
      </p>
      {lens.caveat && (
        <p className="mt-2 flex items-start gap-2 text-xs text-ink-2">
          <Badge tone="warning">Caveat</Badge>
          <span>{lens.caveat}</span>
        </p>
      )}
    </Panel>
  )
}
