import { useSeason } from '@/hooks/useSeason'
import type { SeasonType } from '@/lib/types'
import { Select } from './ui'

export function SeasonPicker({ compact }: { compact?: boolean }) {
  const { season, seasonType, setSeason, setSeasonType, seasons, seasonTypes } = useSeason()
  return (
    <div className="flex items-end gap-2">
      <Select label={compact ? undefined : 'Season'} aria-label="Season" value={season} onChange={(e) => setSeason(e.target.value)}>
        {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
      <Select label={compact ? undefined : 'Season type'} aria-label="Season type" value={seasonType} onChange={(e) => setSeasonType(e.target.value as SeasonType)}>
        {seasonTypes.map((s) => <option key={s} value={s}>{s}</option>)}
      </Select>
    </div>
  )
}
