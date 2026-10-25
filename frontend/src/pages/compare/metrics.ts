/** Metric and panel definitions for the Compare page. Values are pure functions of a season-totals record. */
import type { Normalization } from '@/lib/types'
import { astTo, fg3aRate, ftaRate, normalizeCounting, num, safeDiv, shootingPct, tovPct } from './math'

export type Rec = Record<string, unknown>
export type MetricKindC = 'counting' | 'pct' | 'rate' | 'rating' | 'physical' | 'context' | 'ratio'

export type MetricSpec = {
  key: string
  label: string
  /** Key in /api/meta/metrics used for the definition tooltip, when one exists. */
  catalogKey?: string
  kind: MetricKindC
  higherIsBetter: boolean | null
  decimals: number
  unit?: '%' | 'in' | 'lb'
  signed?: boolean
  note?: string
  value: (r: Rec, norm: Normalization) => number | null
}

const denoms = (r: Rec) => ({ gp: num(r.gp), min: num(r.min), poss: num(r.poss) })
const counting = (key: string, label: string, decimals = 1, higherIsBetter: boolean | null = true, extra: Partial<MetricSpec> = {}): MetricSpec => ({
  key, label, catalogKey: key, kind: 'counting', higherIsBetter, decimals, value: (r, norm) => normalizeCounting(num(r[key]), denoms(r), norm), ...extra,
})
const direct = (key: string, label: string, kind: MetricKindC, decimals: number, higherIsBetter: boolean | null, extra: Partial<MetricSpec> = {}): MetricSpec => ({
  key, label, catalogKey: key, kind, higherIsBetter, decimals, value: (r) => num(r[key]), ...extra,
})

const LIST: MetricSpec[] = [
    counting('pts', 'Points'),
    counting('reb', 'Rebounds'),
    counting('oreb', 'Offensive rebounds'),
    counting('dreb', 'Defensive rebounds'),
    counting('ast', 'Assists'),
    counting('stl', 'Steals'),
    counting('blk', 'Blocks'),
    counting('tov', 'Turnovers', 1, false),
    counting('plus_minus', '+/-', 1, true, { signed: true, note: 'Raw, unadjusted for teammates, opponents or minutes.' }),
    direct('ts_pct', 'True shooting %', 'pct', 1, true),
    direct('efg_pct', 'Effective FG %', 'pct', 1, true),
    { key: 'fg3_pct', label: '3-point %', catalogKey: 'fg3_pct', kind: 'pct', higherIsBetter: true, decimals: 1, value: (r) => shootingPct(num(r.fg3m), num(r.fg3a)) },
    { key: 'ft_pct', label: 'Free-throw %', catalogKey: 'ft_pct', kind: 'pct', higherIsBetter: true, decimals: 1, value: (r) => shootingPct(num(r.ftm), num(r.fta)) },
    { key: 'fg3a_rate', label: '3PA rate', kind: 'pct', higherIsBetter: null, decimals: 1, note: 'Share of field-goal attempts from three: 3PA / FGA.', value: fg3aRate },
    { key: 'fta_rate', label: 'FTA rate', kind: 'pct', higherIsBetter: true, decimals: 1, note: 'Free-throw attempts per field-goal attempt: FTA / FGA.', value: ftaRate },
    { key: 'ast_to', label: 'Assist / turnover', catalogKey: 'ast_to', kind: 'ratio', higherIsBetter: true, decimals: 2, value: astTo },
    direct('ast_pct', 'Assist %', 'pct', 1, true),
    {
      key: 'tov_pct', label: 'Turnover %', catalogKey: 'tm_tov_pct', kind: 'pct', higherIsBetter: false, decimals: 1,
      note: 'Turnover share of plays: TOV / (FGA + 0.44·FTA + TOV). Computed from season totals when the source does not supply it.',
      value: (r) => num(r.tm_tov_pct) ?? tovPct(r),
    },
    direct('oreb_pct', 'Offensive rebound %', 'pct', 1, true),
    direct('dreb_pct', 'Defensive rebound %', 'pct', 1, true),
    direct('reb_pct', 'Rebound %', 'pct', 1, true),
    direct('usg_pct', 'Usage %', 'pct', 1, null),
    direct('def_rating', 'Defensive rating', 'rating', 1, false, { note: 'Points allowed per 100 possessions while on court. Lower is better.' }),
    direct('net_rating', 'Net rating', 'rating', 1, true, { signed: true }),
    direct('pie', 'PIE', 'rating', 3, true),
    direct('on_off_net', 'On/off net', 'rating', 1, true, { signed: true, note: 'Team net rating on court minus off court, per stint. Blank for a traded player’s season total.' }),
    { key: 'mpg', label: 'Minutes per game', catalogKey: 'min', kind: 'context', higherIsBetter: null, decimals: 1, value: (r) => safeDiv(num(r.min), num(r.gp)) },
    { key: 'gp', label: 'Games played', catalogKey: 'gp', kind: 'context', higherIsBetter: null, decimals: 0, value: (r) => num(r.gp) },
    { key: 'fga_pg', label: 'FGA per game', catalogKey: 'fga', kind: 'context', higherIsBetter: null, decimals: 1, value: (r) => safeDiv(num(r.fga), num(r.gp)) },
    direct('height_in', 'Height (roster)', 'physical', 1, null, { unit: 'in', note: 'Listed with shoes.' }),
    direct('weight_lb', 'Weight (roster)', 'physical', 0, null, { unit: 'lb' }),
    direct('height_wo_shoes_in', 'Height, no shoes', 'physical', 2, null, { unit: 'in', note: 'Draft-combine measurement without shoes.' }),
    direct('wingspan_in', 'Wingspan', 'physical', 2, null, { unit: 'in', note: 'Draft-combine measurement.' }),
    direct('standing_reach_in', 'Standing reach', 'physical', 2, null, { unit: 'in', note: 'Draft-combine measurement.' }),
    direct('wingspan_height_ratio', 'Wingspan / height', 'physical', 3, null),
    // Trajectory / radar-only helpers
    { key: 'pts_36', label: 'Points per 36', catalogKey: 'pts', kind: 'counting', higherIsBetter: true, decimals: 1, value: (r) => normalizeCounting(num(r.pts), denoms(r), 'per_36') },
    { key: 'stl_36', label: 'Steals per 36', catalogKey: 'stl', kind: 'counting', higherIsBetter: true, decimals: 1, value: (r) => normalizeCounting(num(r.stl), denoms(r), 'per_36') },
    { key: 'blk_36', label: 'Blocks per 36', catalogKey: 'blk', kind: 'counting', higherIsBetter: true, decimals: 1, value: (r) => normalizeCounting(num(r.blk), denoms(r), 'per_36') },
]
export const METRICS: Record<string, MetricSpec> = Object.fromEntries(LIST.map((m) => [m.key, m]))

export type PanelSpec = { key: string; question: string; method: string; caveat?: string; metrics: string[] }

export const PANELS: PanelSpec[] = [
  { key: 'production', question: 'Production', method: 'Box-score counting stats under the chosen normalisation.', metrics: ['pts', 'reb', 'ast', 'stl', 'blk', 'tov'] },
  { key: 'shooting', question: 'Scoring and shooting efficiency', method: 'Percentages and attempt rates computed from season totals.', metrics: ['ts_pct', 'efg_pct', 'fg3_pct', 'ft_pct', 'fg3a_rate', 'fta_rate'] },
  { key: 'passing', question: 'Passing and turnovers', method: 'Volume under the chosen normalisation; rates are normalisation-free.', metrics: ['ast', 'tov', 'ast_to', 'ast_pct', 'tov_pct'] },
  { key: 'rebounding', question: 'Rebounding', method: 'Rebounds under the chosen normalisation plus share of available rebounds.', metrics: ['oreb', 'dreb', 'oreb_pct', 'dreb_pct'] },
  {
    key: 'defense', question: 'Defensive indicators', method: 'Box-score defence only.',
    caveat: 'Steals and blocks reward gambling and say little about positioning; defensive rating is mostly team context. Lower defensive rating is better and is ranked that way.',
    metrics: ['stl', 'blk', 'def_rating', 'dreb_pct'],
  },
  { key: 'usage', question: 'Usage and role', method: 'Minutes, games and shot volume are always per game here, regardless of the normalisation toggle.', metrics: ['usg_pct', 'mpg', 'gp', 'fga_pg', 'fg3a_rate'] },
  {
    key: 'impact', question: 'Impact indicators', method: 'Team-level results while the player is on court.',
    caveat: 'Raw on/off and plus-minus are unadjusted for teammates, opponents or minutes. Treat them as indicators, not measurements. On/off is per team stint and blank for a traded player’s season total.',
    metrics: ['net_rating', 'pie', 'on_off_net', 'plus_minus'],
  },
  {
    key: 'physical', question: 'Physical', method: 'Roster listing and draft-combine measurements.',
    caveat: 'Roster height is listed with shoes; combine height is measured without. Missing combine measurements show as – and are never estimated. Percentiles here are ascending (share of the cohort at or below).',
    metrics: ['height_in', 'weight_lb', 'height_wo_shoes_in', 'wingspan_in', 'standing_reach_in', 'wingspan_height_ratio'],
  },
]

export const TABLE_METRICS: string[] = [...new Set(PANELS.flatMap((p) => p.metrics))]
export const TRAJECTORY_METRICS = ['pts_36', 'ts_pct', 'usg_pct', 'net_rating', 'mpg']
export const RADAR_METRICS = ['ts_pct', 'usg_pct', 'ast_pct', 'reb_pct', 'stl_36', 'blk_36', 'tov_pct', 'net_rating']

export const ZONE_ORDER = ['Restricted Area', 'In The Paint (Non-RA)', 'Mid-Range', 'Left Corner 3', 'Right Corner 3', 'Above the Break 3', 'Backcourt']

export const NORM_SUFFIX: Record<Normalization, string> = { totals: ' (totals)', per_game: ' per game', per_36: ' per 36', per_100: ' per 100 poss' }

export function labelFor(spec: MetricSpec, norm: Normalization): string {
  return spec.kind === 'counting' && spec.catalogKey === spec.key ? `${spec.label}${NORM_SUFFIX[norm]}` : spec.label
}
