import { useEffect, useState } from 'react'
import { useTeams } from '@/hooks/useApi'
import { Input, Select } from '@/components/ui'
import { POSITIONS } from './helpers'
import type { ExplorerState } from './useExplorerState'

interface FilterRowProps {
  state: ExplorerState
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

/** Who is on the plot: name, team, position, eligibility thresholds and age. Everything here is mirrored in the URL. */
export function FilterRow({ state }: FilterRowProps) {
  const teams = useTeams()
  const teamList = [...(teams.data?.data ?? [])].sort((a, b) => a.abbreviation.localeCompare(b.abbreviation))

  return (
    <div className="flex flex-col gap-2">
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
      </div>
      <p className="text-xs text-ink-3">
        Players under the game or minute thresholds are hidden from the plot. Thresholds are season totals: games played and total minutes. Combo positions (G-F, F-C) match either of their letters. Age is in years at the season's reference date.
      </p>
    </div>
  )
}
