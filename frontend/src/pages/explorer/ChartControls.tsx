import type { ReactNode } from 'react'
import { Button, Select, Toggle } from '@/components/ui'
import { useStatus } from '@/hooks/useApi'
import { NORMALIZATION_LABEL } from '@/lib/format'
import { Toolbar } from '@/components/ui/Toolbar'
import type { Normalization } from '@/lib/types'
import { activePreset, NONE, POSITION, PRESETS, type MetricGroup, type Preset } from './helpers'

export type ChartPatch = { x?: string; y?: string; size?: string; color?: string; medians?: boolean }

export interface ChartControlsProps {
  groups: MetricGroup[]
  normalization: Normalization
  x: string
  y: string
  size: string
  color: string
  medians: boolean
  onChange: (patch: ChartPatch) => void
  onPreset: (p: Preset) => void
  onNormalization: (n: Normalization) => void
  onReset: () => void
}

const NORMALIZATIONS: Normalization[] = ['totals', 'per_game', 'per_36', 'per_100']

interface MetricSelectProps {
  label: string
  value: string
  onChange: (v: string) => void
  groups: MetricGroup[]
  extras?: ReactNode
}

function MetricSelect({ label, value, onChange, groups, extras }: MetricSelectProps) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs text-ink-3">
      <span className="whitespace-nowrap">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="control w-full text-sm text-ink sm:w-44">
        {extras}
        {groups.map((g) => (
          <optgroup key={g.kind} label={g.label}>
            {g.options.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </optgroup>
        ))}
      </select>
    </label>
  )
}

/** The chart's own controls, directly above it: presets, the four encodings, normalization, median lines and Reset. */
export function ChartControls({ groups, normalization, x, y, size, color, medians, onChange, onPreset, onNormalization, onReset }: ChartControlsProps) {
  const status = useStatus()
  const normLabels = status.data?.data.normalizations ?? NORMALIZATION_LABEL
  const current = activePreset({ x, y, size, color })
  return (
    <Toolbar
      label="Chart controls"
      actions={<Button size="sm" variant="ghost" onClick={onReset} aria-label="Reset all filters and axes">Reset</Button>}
    >
      <div className="-mx-1 flex w-[calc(100%+0.5rem)] items-center gap-1.5 overflow-x-auto px-1 pb-1 sm:mx-0 sm:w-full sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0" role="group" aria-label="Quick presets">
        <span className="mr-1 shrink-0 text-xs text-ink-3">Presets</span>
        {PRESETS.map((p) => (
          <Button key={p.key} className="shrink-0 whitespace-nowrap" size="sm" variant={current?.key === p.key ? 'primary' : 'default'} aria-pressed={current?.key === p.key} title={p.note} onClick={() => onPreset(p)}>
            {p.label}
          </Button>
        ))}
      </div>
      <div className="grid w-full grid-cols-2 gap-x-3 gap-y-2 sm:flex sm:w-auto sm:flex-wrap sm:items-end">
        <MetricSelect label="X axis" value={x} onChange={(v) => onChange({ x: v })} groups={groups} />
        <MetricSelect label="Y axis" value={y} onChange={(v) => onChange({ y: v })} groups={groups} />
        <MetricSelect label="Bubble size" value={size} onChange={(v) => onChange({ size: v })} groups={groups} extras={<option value={NONE}>None (uniform)</option>} />
        <MetricSelect
          label="Colour"
          value={color}
          onChange={(v) => onChange({ color: v })}
          groups={groups}
          extras={<><option value={NONE}>None</option><option value={POSITION}>Position (G / F / C)</option></>}
        />
        <Select label="Normalization" value={normalization} onChange={(e) => onNormalization(e.target.value as Normalization)} className="w-full sm:w-32">
          {NORMALIZATIONS.map((n) => <option key={n} value={n}>{normLabels[n] ?? NORMALIZATION_LABEL[n]}</option>)}
        </Select>
      </div>
      <div className="flex h-[34px] items-center"><Toggle checked={medians} onChange={(v) => onChange({ medians: v })} label="Median lines" /></div>
    </Toolbar>
  )
}
