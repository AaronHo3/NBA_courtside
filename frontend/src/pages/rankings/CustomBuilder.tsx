import { useEffect, useRef, useState } from 'react'
import { Badge, Button, Panel, Segmented, Select } from '@/components/ui'
import { MetricLabel } from '@/components/ui/MetricLabel'
import type { Metric } from '@/lib/types'
import { addComponent, detectOverlaps, MAX_COMPONENTS, MAX_WEIGHT, MIN_WEIGHT, normalizeWeights, removeComponent, selectableMetrics, updateComponent, WEIGHT_STEP, type ComponentDraft } from './model'
import { Swatch } from './ComponentChips'

const COMMIT_DELAY_MS = 300

/**
 * Build a composite from the metric catalog. Edits are held locally and written to the URL after a
 * short pause so dragging a slider does not fire a request per pixel.
 */
export function CustomBuilder({ components, onChange, catalog, colors }: { components: ComponentDraft[]; onChange: (next: ComponentDraft[]) => void; catalog: Metric[]; colors: Map<string, string> }) {
  const [draft, setDraft] = useState<ComponentDraft[]>(components)
  const [pick, setPick] = useState('')
  const timer = useRef<number | null>(null)
  const pending = useRef<ComponentDraft[] | null>(null)

  // Adopt external URL changes (back/forward, shared link) unless they are our own pending commit.
  useEffect(() => {
    if (pending.current && sameComponents(pending.current, components)) { pending.current = null; return }
    setDraft(components)
  }, [components])
  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current) }, [])

  const commit = (next: ComponentDraft[], immediate = false) => {
    setDraft(next)
    pending.current = next
    if (timer.current) window.clearTimeout(timer.current)
    if (immediate) onChange(next)
    else timer.current = window.setTimeout(() => onChange(next), COMMIT_DELAY_MS)
  }

  const options = selectableMetrics(catalog, draft)
  const shares = normalizeWeights(draft)
  const overlaps = detectOverlaps(draft)
  const chosenMetric = options.find((m) => m.key === pick) ?? options[0]

  return (
    <Panel
      question="Which components, with which weights?"
      method="Pick up to eight metrics; weights are turned into shares that sum to one. A player missing any component is ineligible, never re-weighted."
      actions={
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => { e.preventDefault(); if (chosenMetric) { commit(addComponent(draft, chosenMetric), true); setPick('') } }}
        >
          <Select aria-label="Metric to add" value={chosenMetric?.key ?? ''} onChange={(e) => setPick(e.target.value)} disabled={draft.length >= MAX_COMPONENTS || options.length === 0}>
            {options.map((m) => <option key={m.key} value={m.key}>{m.label} · {m.kind}</option>)}
          </Select>
          <Button type="submit" size="sm" disabled={!chosenMetric || draft.length >= MAX_COMPONENTS}>Add</Button>
        </form>
      }
    >
      {draft.length === 0 ? (
        <p className="text-sm text-ink-2">No components yet. Add a metric above to start a composite.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {draft.map((c, i) => (
            <li key={c.metric} className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 py-2 sm:grid-cols-[minmax(9rem,14rem)_1fr_auto_auto_auto]">
              <span className="inline-flex items-center gap-2 text-sm">
                <Swatch color={colors.get(c.metric)} />
                <MetricLabel metric={c.metric} normalization="per_game" />
              </span>
              <label className="col-span-3 flex items-center gap-2 text-xs text-ink-3 sm:col-span-1">
                <span className="sr-only">Weight for {c.metric}</span>
                <input
                  type="range"
                  min={MIN_WEIGHT}
                  max={MAX_WEIGHT}
                  step={WEIGHT_STEP}
                  value={c.weight}
                  aria-label={`Weight for ${c.metric}`}
                  aria-valuetext={`${c.weight}, ${(shares[i] * 100).toFixed(0)}% of the score`}
                  onChange={(e) => commit(updateComponent(draft, c.metric, { weight: Number(e.target.value) }))}
                  className="w-full min-w-24"
                />
                <span className="w-20 shrink-0 text-right tnum text-ink-2">{c.weight.toFixed(2)} · {(shares[i] * 100).toFixed(0)}%</span>
              </label>
              <Segmented
                ariaLabel={`Direction for ${c.metric}`}
                value={c.higher_is_better ? 'h' : 'l'}
                onChange={(v) => commit(updateComponent(draft, c.metric, { higher_is_better: v === 'h' }), true)}
                options={[{ value: 'h', label: 'Higher ↑', title: 'Higher values score better' }, { value: 'l', label: 'Lower ↓', title: 'Lower values score better' }]}
              />
              <Button size="sm" variant="ghost" aria-label={`Remove ${c.metric}`} onClick={() => commit(removeComponent(draft, c.metric), true)}>Remove</Button>
            </li>
          ))}
        </ul>
      )}
      {draft.length > 0 && shares.every((s) => s === 0) && (
        <p role="alert" className="mt-3 text-xs text-critical">All weights are zero, so there is nothing to rank. Raise at least one weight.</p>
      )}
      {overlaps.length > 0 && (
        <div role="status" className="mt-3 rounded-[var(--radius-control)] border border-warning/60 p-3 text-xs text-ink-2">
          <p className="mb-1 flex items-center gap-2 font-medium text-ink"><Badge tone="warning">Overlap</Badge> Two chosen metrics largely measure the same thing</p>
          <ul className="list-disc space-y-0.5 pl-5">
            {overlaps.map((w) => (
              <li key={`${w.a}-${w.b}`}><span className="font-medium">{labelOf(catalog, w.a)}</span> and <span className="font-medium">{labelOf(catalog, w.b)}</span>: {w.reason} Their combined share counts that signal twice; lower one weight or drop one.</li>
            ))}
          </ul>
        </div>
      )}
      <p className="mt-3 text-xs text-ink-3">
        Eligibility: a player with any component missing (for example wingspan without a combine record, or on/off without lineup data) is listed under ineligible with the gap named. Weights are shares of the whole index, not of the metrics a player happens to have.
      </p>
    </Panel>
  )
}

function labelOf(catalog: Metric[], key: string): string {
  return catalog.find((m) => m.key === key)?.label ?? key
}

function sameComponents(a: ComponentDraft[], b: ComponentDraft[]): boolean {
  return a.length === b.length && a.every((x, i) => x.metric === b[i].metric && x.weight === b[i].weight && x.higher_is_better === b[i].higher_is_better)
}
