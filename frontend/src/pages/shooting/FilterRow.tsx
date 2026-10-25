import type { ShotFilterOptions } from '@/lib/types'
import { Button, Input, Select } from '@/components/ui'
import { zoneLabel } from '@/components/court/geometry'
import type { ShootingState } from './state'

const day = (s: string | null | undefined) => (s ? s.slice(0, 10) : undefined)

/** One row of server-supported shot filters; unsupported ones are listed with the server's reasons. */
export function FilterRow({ st, options }: { st: ShootingState; options: ShotFilterOptions | undefined }) {
  const f = st.filters
  const set = st.setFilter
  const active = Object.values(f).some(Boolean)
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-2">
        <Select label="Opponent" value={f.opp} onChange={(e) => set('opp', e.target.value)}>
          <option value="">All</option>
          {(options?.opponents ?? []).map((o) => <option key={o.team_id} value={o.team_id}>{o.abbreviation} · {o.full_name}</option>)}
        </Select>
        <Select label="Period" value={f.period} onChange={(e) => set('period', e.target.value)}>
          <option value="">All</option>
          {(options?.periods ?? [1, 2, 3, 4]).map((p) => <option key={p} value={p}>{p > 4 ? `OT${p - 4}` : `Q${p}`}</option>)}
        </Select>
        <Select label="Shot type" value={f.st} onChange={(e) => set('st', e.target.value)}>
          <option value="">All</option>
          <option value="2PT">2PT</option>
          <option value="3PT">3PT</option>
        </Select>
        <Select label="Result" value={f.made} onChange={(e) => set('made', e.target.value)}>
          <option value="">Made and missed</option>
          <option value="made">Made</option>
          <option value="missed">Missed</option>
        </Select>
        <Input label="Min distance (ft)" type="number" min={0} max={94} step={1} value={f.dmin} onChange={(e) => set('dmin', e.target.value)} className="w-28" inputMode="numeric" />
        <Input label="Max distance (ft)" type="number" min={0} max={94} step={1} value={f.dmax} onChange={(e) => set('dmax', e.target.value)} className="w-28" inputMode="numeric" />
        <Input label="From" type="date" min={day(options?.date_range.min)} max={day(options?.date_range.max)} value={f.from} onChange={(e) => set('from', e.target.value)} />
        <Input label="To" type="date" min={day(options?.date_range.min)} max={day(options?.date_range.max)} value={f.to} onChange={(e) => set('to', e.target.value)} />
        <Select label="Zone" value={f.zone} onChange={(e) => set('zone', e.target.value)}>
          <option value="">All</option>
          {(options?.zones ?? []).map((z) => <option key={z} value={z}>{zoneLabel(z)}</option>)}
        </Select>
        <Select label="Action" value={f.action} onChange={(e) => set('action', e.target.value)}>
          <option value="">All</option>
          {(options?.action_types ?? []).map((a) => <option key={a.action_type} value={a.action_type}>{a.action_type} ({a.n})</option>)}
        </Select>
        <Select label="Home/away" value={f.home} onChange={(e) => set('home', e.target.value)}>
          <option value="">Both</option>
          <option value="home">Home</option>
          <option value="away">Away</option>
        </Select>
        <Button size="sm" onClick={st.resetFilters} disabled={!active} className="mb-0.5">Reset filters</Button>
      </div>
      {options && options.unsupported.length > 0 && (
        <details className="text-xs text-ink-3">
          <summary className="cursor-pointer select-none hover:text-ink">Not available in this data ({options.unsupported.length})</summary>
          <ul className="mt-1 list-disc pl-5 text-ink-2">
            {options.unsupported.map((u) => <li key={u.key}><span className="text-ink">{u.key.replace(/_/g, ' ')}</span>: {u.reason}</li>)}
          </ul>
        </details>
      )}
    </div>
  )
}
