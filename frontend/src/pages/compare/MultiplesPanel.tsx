import { Panel } from '@/components/ui'
import type { Normalization } from '@/lib/types'
import { MetricBars } from './MetricBars'
import { PlayerLegend } from './PlayerLegend'
import type { PanelSpec } from './metrics'
import type { ComparedPlayer, MetricResult, PopulationKind } from './model'

type Props = { panel: PanelSpec; model: Map<string, MetricResult>; players: ComparedPlayer[]; colors: string[]; norm: Normalization; populationKind: PopulationKind; minMinutes: number }

export function MultiplesPanel({ panel, model, players, colors, norm, populationKind, minMinutes }: Props) {
  return (
    <Panel question={panel.question} method={panel.method} actions={<PlayerLegend players={players} colors={colors} showInitials />}>
      {panel.caveat && <p className="mb-3 max-w-prose text-xs text-ink-3">{panel.caveat}</p>}
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
        {panel.metrics.map((k) => {
          const r = model.get(k)
          return r ? <MetricBars key={k} result={r} players={players} colors={colors} norm={norm} populationKind={populationKind} minMinutes={minMinutes} /> : null
        })}
      </div>
    </Panel>
  )
}
