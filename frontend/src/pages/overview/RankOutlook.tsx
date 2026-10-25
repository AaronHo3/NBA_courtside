import type { ReactNode } from 'react'
import type { CategoryDef, TeamPowerView } from '@/fantasy/api/types'
import { StatTile } from '@/components/ui'
import { pct, weakestCategories } from './format'

/** Season standing at a glance: power rank, expected categories per week and where the roster is thin. */
export function RankOutlook({ power, teams, categories, children }: { power: TeamPowerView; teams: number; categories: CategoryDef[]; children?: ReactNode }) {
  const weak = weakestCategories(power, categories)
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <StatTile testId="outlook-rank" label="Power rank" value={<>#{power.rank} <span className="text-base font-normal text-ink-3">of {teams}</span></>} size="lg" />
        <StatTile label="Expected categories" value={power.expected_cats.toFixed(1)} sub="per week, simulated vs the league" />
      </div>
      {weak.length > 0 && (
        <p data-testid="outlook-vulnerable" className="text-sm leading-6 text-ink-2">
          <span className="font-medium text-ink">Vulnerable:</span> {weak.map((w, i) => <span key={w.key} className="whitespace-nowrap">{i > 0 && ' · '}{w.label} {pct(w.p)}</span>)}
        </p>
      )}
      {children}
    </div>
  )
}
