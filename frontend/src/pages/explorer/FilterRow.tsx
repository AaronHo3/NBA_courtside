import { useEffect, useState } from 'react'
import { useStatus, useTeams } from '@/hooks/useApi'
import { NORMALIZATION_LABEL } from '@/lib/format'
import type { Normalization } from '@/lib/types'
import { Button, Info, Input, Select } from '@/components/ui'
import { POSITIONS } from './helpers'
import type { ExplorerState } from './useExplorerState'

const NORMALIZATIONS: Normalization[] = ['totals', 'per_game', 'per_36', 'per_100']

interface FilterRowProps {
  state: ExplorerState
  population: number | null
  hidden: number | null
}

/** Debounced text input so each keystroke does not refetch. */
function DebouncedInput({ value, onChange, ...rest }: { value: string; onChange: (v: string) => void; label: string; placeholder?: string; className?: string }) {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    // The URL changed from elsewhere (reset, back button): adopt it without an extra effect pass.
    setLastValue(value)
    setDraft(value)
  }
  useEffect(() => {
    if (draft === value) return
    const t = setTimeout(() => onChange(draft), 250)
    return () => clearTimeout(t)
  }, [draft, value, onChange])
  return <Input {...rest} type="search" value={draft} onChange={(e) => setDraft(e.target.value)} />
}

interface NumberFieldProps {
  label: string
  value: number
  onChange: (v: number | null) => void
  /** Thresholds show 0 as "0"; optional bounds show 0 as empty. */
  zeroMeansUnset?: boolean
  min?: number
  step?: number
  placeholder?: string
  className?: string
}

function NumberField({ label, value, onChange, zeroMeansUnset, min, step, placeholder, className }: NumberFieldProps) {
  return (
    <Input
      label={label}
      type="number"
      inputMode="decimal"
      min={min}
      step={step}
      placeholder={placeholder}
      className={className}
      value={zeroMeansUnset && value <= 0 ? '' : String(value)}
      onChange={(e) => {
        const n = Number(e.target.value)
        onChange(e.target.value === '' || !Number.isFinite(n) ? null : n)
      }}
    />
  )
}

/** One row of filters above the content. Everything here is mirrored in the URL. */
export function FilterRow({ state, population, hidden }: FilterRowProps) {
  const teams = useTeams()
  const status = useStatus()
  const normLabels = status.data?.data.normalizations ?? NORMALIZATION_LABEL
  const teamList = [...(teams.data?.data ?? [])].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))

  return (
    <div className="mb-4 rounded-[var(--radius-panel)] border border-line bg-surface px-4 py-3">
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <DebouncedInput label="Player" placeholder="Name contains…" value={state.query} onChange={state.setQuery} className="w-full sm:w-44" />
        <Select label="Team" value={state.teamId || ''} onChange={(e) => state.setTeamId(e.target.value ? Number(e.target.value) : null)} className="w-[calc(50%-0.375rem)] sm:w-36">
          <option value="">All teams</option>
          {teamList.map((t) => <option key={t.team_id} value={t.team_id}>{t.abbreviation} · {t.name}</option>)}
        </Select>
        <Select label="Position" value={state.position} onChange={(e) => state.setPosition(e.target.value || null)} className="w-[calc(50%-0.375rem)] sm:w-28">
          <option value="">All</option>
          {POSITIONS.map((p) => <option key={p} value={p}>{p === 'G' ? 'Guards' : p === 'F' ? 'Forwards' : 'Centers'}</option>)}
        </Select>
        <NumberField label="Min games" value={state.minGp} onChange={(v) => state.setMinGp(v ?? 0)} min={0} step={1} className="w-[calc(50%-0.375rem)] sm:w-24" />
        <NumberField label="Min minutes" value={state.minMinutes} onChange={(v) => state.setMinMinutes(v ?? 0)} min={0} step={10} className="w-[calc(50%-0.375rem)] sm:w-24" />
        <NumberField label="Age from" value={state.ageMin} onChange={state.setAgeMin} zeroMeansUnset min={0} step={1} placeholder="Any" className="w-[calc(50%-0.375rem)] sm:w-20" />
        <NumberField label="Age to" value={state.ageMax} onChange={state.setAgeMax} zeroMeansUnset min={0} step={1} placeholder="Any" className="w-[calc(50%-0.375rem)] sm:w-20" />
        <Select label="Normalization" value={state.normalization} onChange={(e) => state.setNormalization(e.target.value as Normalization)} className="w-full sm:w-44">
          {NORMALIZATIONS.map((n) => <option key={n} value={n}>{normLabels[n] ?? NORMALIZATION_LABEL[n]}</option>)}
        </Select>
        <div className="ml-auto flex items-center gap-3 self-end pb-1">
          <p className="whitespace-nowrap text-xs text-ink-2 tnum" aria-live="polite">
            {population === null ? 'Counting players…' : (
              <>
                <span className="font-medium text-ink">{population}</span> shown
                {hidden !== null && hidden > 0 && <>, <span className="font-medium text-ink">{hidden}</span> hidden by thresholds</>}
              </>
            )}
            {' '}
            <Info text="Eligibility thresholds are season totals: games played and total minutes. Combo positions (G-F, F-C) match either of their letters. Age is in years at the season's reference date." />
          </p>
          <Button size="sm" variant="ghost" onClick={state.reset} aria-label="Reset all filters and axes">Reset</Button>
        </div>
      </div>
    </div>
  )
}
