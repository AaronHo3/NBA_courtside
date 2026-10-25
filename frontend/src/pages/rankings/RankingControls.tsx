import { Input, Segmented, Select, Toolbar } from '@/components/ui'
import { CUSTOM_LENS } from './model'
import type { RankingState } from './useRankingState'

const POSITIONS = [
  { value: '', label: 'All positions' },
  { value: 'G', label: 'Guards' },
  { value: 'F', label: 'Forwards' },
  { value: 'C', label: 'Centers' },
]

/** Single page-level filter row. Every control writes to the URL so the view is shareable. */
export function RankingControls({ s }: { s: RankingState }) {
  return (
    <Toolbar label="Lens, population and scale">
      <Select label="Lens" value={s.lens} onChange={(e) => s.setLens(e.target.value)} className="min-w-44">
        {s.lenses.map((l) => <option key={l.key} value={l.key}>{l.label}</option>)}
        <option value={CUSTOM_LENS}>Custom composite</option>
      </Select>
      <div className="flex flex-col gap-1 text-xs text-ink-3">
        <span>Counting stats</span>
        <Segmented
          ariaLabel="Counting stats as per game rates or season totals"
          value={s.mode}
          onChange={s.setMode}
          options={[
            { value: 'rate', label: 'Rate (per game)', title: 'Counting stats divided by games played. Percentages and ratings are unchanged.' },
            { value: 'cumulative', label: 'Cumulative (totals)', title: 'Season totals, so availability and minutes count. Percentages and ratings are unchanged.' },
          ]}
        />
      </div>
      <div className="flex flex-col gap-1 text-xs text-ink-3">
        <span>Normalisation</span>
        <Segmented
          ariaLabel="Normalisation method"
          value={s.norm}
          onChange={s.setNorm}
          options={[
            { value: 'percentile', label: 'Percentile', title: 'Mid-rank percentile (0–100) within the eligible population; robust to outliers.' },
            { value: 'zscore', label: 'Z-score', title: 'Standard deviations from the population mean; preserves distance between players.' },
          ]}
        />
      </div>
      <Input label="Min games" type="number" min={0} step={1} inputMode="numeric" value={s.minGp} onChange={(e) => s.setMinGp(Math.max(0, Number(e.target.value) || 0))} className="w-24" />
      <Input label="Min minutes" type="number" min={0} step={10} inputMode="numeric" value={s.minMin} onChange={(e) => s.setMinMin(Math.max(0, Number(e.target.value) || 0))} className="w-28" />
      <Select label="Position" value={s.position} onChange={(e) => s.setPosition(e.target.value || null)}>
        {POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </Select>
    </Toolbar>
  )
}
