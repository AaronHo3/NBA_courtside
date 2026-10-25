import { formatNumber, formatPct, formatSigned, isNil } from '@/lib/format'
import type { RosterMetricsRow, TeamSeason } from '@/lib/types'

/**
 * Team-level metric registry. The server catalog (/api/meta/metrics) covers player metrics; team rows mix
 * 0–1 fractions (eFG%, TOV%, OREB%, FTA rate) with ratings and counts, so each key records its scale explicitly.
 */
export type TeamMetricScale = 'rating' | 'signed' | 'fraction' | 'percent100' | 'number' | 'count' | 'inches'

export type TeamMetricDef = {
  key: string
  label: string
  short: string
  scale: TeamMetricScale
  decimals: number
  /** null when neither direction is "better" (pace, roster shape descriptors). */
  higherIsBetter: boolean | null
  definition: string
}

const def = (key: string, label: string, short: string, scale: TeamMetricScale, decimals: number, higherIsBetter: boolean | null, definition: string): TeamMetricDef =>
  ({ key, label, short, scale, decimals, higherIsBetter, definition })

export const TEAM_METRICS: readonly TeamMetricDef[] = [
  def('net_rating', 'Net rating', 'NetRtg', 'signed', 1, true, 'Points scored minus points allowed per 100 possessions. Provider/derived estimate.'),
  def('off_rating', 'Offensive rating', 'ORtg', 'rating', 1, true, 'Points scored per 100 possessions. Provider/derived estimate.'),
  def('def_rating', 'Defensive rating', 'DRtg', 'rating', 1, false, 'Points allowed per 100 possessions. Lower is better.'),
  def('pace', 'Pace', 'Pace', 'number', 1, null, 'Possessions per 48 minutes.'),
  def('efg_pct', 'eFG%', 'eFG%', 'fraction', 1, true, 'Effective field-goal percentage: (FGM + 0.5 × 3PM) / FGA.'),
  def('tm_tov_pct', 'TOV%', 'TOV%', 'fraction', 1, false, 'Turnovers per 100 plays. Lower is better.'),
  def('oreb_pct', 'OREB%', 'OREB%', 'fraction', 1, true, 'Share of available offensive rebounds grabbed.'),
  def('fta_rate', 'FTA rate', 'FTr', 'fraction', 1, true, 'Free-throw attempts per field-goal attempt.'),
  def('opp_efg_pct', 'Opponent eFG%', 'Opp eFG%', 'fraction', 1, false, 'Opponents’ effective field-goal percentage. Lower is better.'),
  def('opp_tov_pct', 'Opponent TOV%', 'Opp TOV%', 'fraction', 1, true, 'Opponent turnovers per 100 plays.'),
  def('opp_oreb_pct', 'Opponent OREB%', 'Opp OREB%', 'fraction', 1, false, 'Share of available offensive rebounds grabbed by opponents. Lower is better.'),
  def('opp_fta_rate', 'Opponent FTA rate', 'Opp FTr', 'fraction', 1, false, 'Opponent free-throw attempts per field-goal attempt. Lower is better.'),
  def('fg3a_rate', '3PA rate', '3PAr', 'fraction', 1, null, 'Share of field-goal attempts taken from three.'),
  def('ts_pct', 'TS%', 'TS%', 'fraction', 1, true, 'True shooting: PTS / (2 × (FGA + 0.44 × FTA)).'),
  def('pie', 'PIE', 'PIE', 'fraction', 1, true, 'Player impact estimate aggregated to the team.'),
  def('w', 'Wins', 'W', 'count', 0, true, 'Regular-season wins.'),
]

/** Roster-shape descriptors from /api/teams/roster-metrics. Server definitions (meta.definitions) take precedence when present. */
export const ROSTER_DESCRIPTORS: readonly TeamMetricDef[] = [
  def('usage_gini', 'Usage concentration (Gini)', 'Gini', 'number', 3, null, 'Gini coefficient of players’ share of team points (0 = perfectly even, 1 = one player).'),
  def('usg_pct_top', 'Top player USG%', 'Top USG%', 'fraction', 1, null, 'Usage rate of the team’s most-used player.'),
  def('top3_min_share', 'Top-3 minutes share', 'Top-3 min', 'fraction', 1, null, 'Share of team minutes played by the three most-used players.'),
  def('continuity_min_share', 'Continuity (minutes share)', 'Continuity', 'fraction', 1, null, 'Share of minutes played by players who were on the team the previous season.'),
  def('avg_height_in', 'Average height', 'Height', 'inches', 1, null, 'Minutes-weighted roster-listed height, in inches.'),
  def('avg_wingspan_in', 'Average wingspan', 'Wingspan', 'inches', 1, null, 'Minutes-weighted wingspan, in inches (combine measurement where available).'),
  def('avg_age', 'Average age', 'Age', 'number', 1, null, 'Minutes-weighted age at season start.'),
  def('players_used', 'Players used', 'Players', 'count', 0, null, 'Number of players who logged minutes for the team.'),
  def('fg3a_rate', '3PA rate', '3PAr', 'fraction', 1, null, 'Share of field-goal attempts taken from three.'),
]

export const ROSTER_OUTCOMES = ['net_rating', 'off_rating', 'def_rating', 'w'] as const

export type ScatterPreset = { key: string; label: string; x: string; y: string }
export const SCATTER_PRESETS: readonly ScatterPreset[] = [
  { key: 'ratings', label: 'Offense vs defense', x: 'off_rating', y: 'def_rating' },
  { key: 'efg', label: 'eFG% vs net', x: 'efg_pct', y: 'net_rating' },
  { key: 'tov', label: 'TOV% vs net', x: 'tm_tov_pct', y: 'net_rating' },
  { key: 'oreb', label: 'OREB% vs net', x: 'oreb_pct', y: 'net_rating' },
  { key: 'ftr', label: 'FTA rate vs net', x: 'fta_rate', y: 'net_rating' },
  { key: 'pace', label: 'Pace vs net', x: 'pace', y: 'net_rating' },
  { key: 'three', label: '3PA rate vs offense', x: 'fg3a_rate', y: 'off_rating' },
]

const INDEX = new Map<string, TeamMetricDef>([...TEAM_METRICS, ...ROSTER_DESCRIPTORS].map((m) => [m.key, m]))

export function teamMetric(key: string): TeamMetricDef {
  return INDEX.get(key) ?? def(key, key, key, 'number', 1, null, key)
}

export function formatTeamMetric(key: string, value: number | null | undefined): string {
  if (isNil(value)) return '–'
  const m = teamMetric(key)
  switch (m.scale) {
    case 'signed': return formatSigned(value, m.decimals)
    case 'fraction': return formatPct(value, m.decimals)
    case 'percent100': return `${value.toFixed(m.decimals)}%`
    case 'inches': return `${value.toFixed(m.decimals)} in`
    case 'count': return formatNumber(value, 0)
    default: return formatNumber(value, m.decimals)
  }
}

/** Axis tick configuration so Plotly shows fractions as percentages. */
export function axisFormat(key: string): { tickformat?: string; ticksuffix?: string } {
  const m = teamMetric(key)
  if (m.scale === 'fraction') return { tickformat: `.${Math.min(m.decimals, 1)}%` }
  if (m.scale === 'percent100') return { ticksuffix: '%' }
  return {}
}

export function numberAt(row: TeamSeason | RosterMetricsRow, key: string): number | null {
  const v = row[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

export function wl(row: Pick<TeamSeason, 'w' | 'l'>): string {
  return `${Math.round(row.w)}–${Math.round(row.l)}`
}

/** Axis label incl. direction hint so a reversed axis is never a surprise. */
export function axisTitle(key: string): string {
  const m = teamMetric(key)
  return m.higherIsBetter === false ? `${m.label} (axis reversed: up/right is better)` : m.label
}
