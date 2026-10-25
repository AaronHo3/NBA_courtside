import { useEffect } from 'react'
import { useSeason } from '@/hooks/useSeason'
import { useNumberParam, useParam } from '@/lib/urlState'
import { useShortlist } from '@/store/shortlist'

export const DEFAULT_ROLE = 'low_usage_perimeter_shooter'

/** Workspace state lives in the URL; the active shortlist is mirrored into the persisted store. */
export function useScoutingState() {
  const { season, seasonType } = useSeason()
  const [role, setRole] = useParam('role', DEFAULT_ROLE)
  const [minGp, setMinGp] = useNumberParam('min_gp', 20)
  const [minMinutes, setMinMinutes] = useNumberParam('min_min', 400)
  const [position, setPosition] = useParam('pos', '')
  const [shortlistParam, setShortlistParam] = useParam('shortlist', '')
  const activeId = useShortlist((s) => s.activeId)
  const setActive = useShortlist((s) => s.setActive)
  useEffect(() => {
    if (shortlistParam && shortlistParam !== activeId) setActive(shortlistParam)
    else if (!shortlistParam && activeId) setShortlistParam(activeId)
  }, [shortlistParam, activeId, setActive, setShortlistParam])
  const chooseShortlist = (id: string | null) => { setActive(id); setShortlistParam(id) }
  const params = { role, season, season_type: seasonType, min_gp: minGp, min_minutes: minMinutes, position: position || undefined, limit: 50 }
  return { season, seasonType, role, setRole, minGp, setMinGp, minMinutes, setMinMinutes, position, setPosition, params, shortlistId: shortlistParam || activeId, chooseShortlist }
}
