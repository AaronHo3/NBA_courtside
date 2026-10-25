import { Segmented, Select, Toolbar } from '@/components/ui'
import type { Normalization } from '@/lib/types'
import { MIN_MINUTES_OPTIONS, minMinutesLabel } from './format'
import { POPULATION_LABEL, type PopulationKind } from './model'

type Props = {
  season: string
  seasons: string[]
  setSeason: (s: string) => void
  norm: Normalization
  setNorm: (n: Normalization) => void
  populationKind: PopulationKind
  setPopulationKind: (p: PopulationKind) => void
  minMinutes: number
  setMinMinutes: (m: number) => void
}

export const NORM_OPTIONS: Array<{ value: Normalization; label: string; title: string }> = [
  { value: 'per_game', label: 'Per game', title: 'Totals divided by games played' },
  { value: 'per_36', label: 'Per 36', title: 'Totals per 36 minutes played' },
  { value: 'per_100', label: 'Per 100 poss', title: 'Totals per 100 possessions' },
  { value: 'totals', label: 'Totals', title: 'Season totals' },
]

export function Controls(p: Props) {
  return (
    <Toolbar label="Season, normalisation and population">
      <Select label="Season in focus" value={p.season} onChange={(e) => p.setSeason(e.target.value)}>
        {p.seasons.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <div className="flex flex-col gap-1 text-xs text-ink-3">
        <span>Normalisation</span>
        <Segmented ariaLabel="Normalisation" value={p.norm} onChange={p.setNorm} options={NORM_OPTIONS} />
      </div>
      <div className="flex flex-col gap-1 text-xs text-ink-3">
        <span>Percentile population</span>
        <Segmented
          ariaLabel="Percentile population"
          value={p.populationKind}
          onChange={p.setPopulationKind}
          options={(Object.keys(POPULATION_LABEL) as PopulationKind[]).map((k) => ({ value: k, label: POPULATION_LABEL[k] }))}
        />
      </div>
      <Select label="Minimum minutes (eligibility)" value={String(p.minMinutes)} onChange={(e) => p.setMinMinutes(Number(e.target.value))}>
        {MIN_MINUTES_OPTIONS.map((m) => <option key={m} value={m}>{minMinutesLabel(m)}</option>)}
      </Select>
    </Toolbar>
  )
}
