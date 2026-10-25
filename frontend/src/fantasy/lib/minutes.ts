import type { MinutesView } from '../api/types'
import { fmtNum } from './format'

/** One line on how a player's minutes were set, for the MIN cell's tooltip. */
export function minutesTitle(m: MinutesView | null | undefined, projected: number | undefined): string {
  if (!m) return projected === undefined ? 'projected minutes per game' : `projected ${fmtNum(projected, 1)} min per game (no stored games yet)`
  const recent = m.recent === null || m.recent === undefined ? 'no stored games' : `recent ${fmtNum(m.recent, 1)} over ${m.games} game${m.games === 1 ? '' : 's'}`
  return `projected ${fmtNum(m.projected, 1)}, ${recent}, used ${fmtNum(m.used, 1)} (${m.source === 'override' ? 'your override' : 'blend'})`
}
