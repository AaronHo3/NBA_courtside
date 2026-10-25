import { Input, Select } from '@/components/ui'

/** Cohort thresholds as bare controls; the page places them in its Toolbar beside the role template. */
export function CohortControls({ minGp, minMinutes, position, onMinGp, onMinMinutes, onPosition }: {
  minGp: number; minMinutes: number; position: string
  onMinGp: (v: number | null) => void; onMinMinutes: (v: number | null) => void; onPosition: (v: string | null) => void
}) {
  return (
    <>
      <Input label="Min games" type="number" min={0} value={minGp} onChange={(e) => onMinGp(Number(e.target.value) || 0)} className="w-24" />
      <Input label="Min minutes" type="number" min={0} step={50} value={minMinutes} onChange={(e) => onMinMinutes(Number(e.target.value) || 0)} className="w-28" />
      <Select label="Position" value={position} onChange={(e) => onPosition(e.target.value || null)}>
        <option value="">Any</option>
        <option value="G">Guards</option>
        <option value="F">Forwards</option>
        <option value="C">Centers</option>
      </Select>
    </>
  )
}
