import { Input, Select } from '@/components/ui'

export function CohortControls({ minGp, minMinutes, position, onMinGp, onMinMinutes, onPosition }: {
  minGp: number; minMinutes: number; position: string
  onMinGp: (v: number | null) => void; onMinMinutes: (v: number | null) => void; onPosition: (v: string | null) => void
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Input label="Min games" type="number" min={0} value={minGp} onChange={(e) => onMinGp(Number(e.target.value) || 0)} className="w-28" />
      <Input label="Min minutes" type="number" min={0} step={50} value={minMinutes} onChange={(e) => onMinMinutes(Number(e.target.value) || 0)} className="w-28" />
      <Select label="Position" value={position} onChange={(e) => onPosition(e.target.value || null)}>
        <option value="">Any</option>
        <option value="G">G</option>
        <option value="F">F</option>
        <option value="C">C</option>
      </Select>
    </div>
  )
}
