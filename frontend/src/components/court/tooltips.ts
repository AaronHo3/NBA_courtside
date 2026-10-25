import type { HexBin, Shot, ZoneSummary } from '@/lib/types'
import { formatPct } from '@/lib/format'
import { formatMetricValue, type AccuracyMetric } from './colour'
import type { DiffBin } from './diff'
import { zoneLabel } from './geometry'

const side = (x: number) => (Math.abs(x) < 0.05 ? 'centre' : x < 0 ? `${Math.abs(x).toFixed(1)} ft left` : `${x.toFixed(1)} ft right`)

export function hexTooltip(bin: HexBin, metric: AccuracyMetric, threshold: number | undefined): string[] {
  const low = threshold !== undefined ? bin.fga < threshold : bin.low_sample
  return [
    `${formatMetricValue(metric, bin[metric])} · ${bin.fga} FGA, ${bin.fgm} made${low ? ' · low sample' : ''}`,
    `FG% ${formatPct(bin.fg_pct)} (Wilson 95%: ${formatPct(bin.ci_low, 0)}–${formatPct(bin.ci_high, 0)}) · league zone ${formatPct(bin.league_fg_pct)}`,
    `Points per FGA ${formatMetricValue('pts_per_fga', bin.pts_per_fga)} · ${(bin.frequency * 100).toFixed(1)}% of attempts`,
    `${zoneLabel(bin.zone)} · ${side(bin.x_ft)}, ${bin.y_ft.toFixed(1)} ft up`,
  ]
}

export function diffTooltip(bin: DiffBin, metric: AccuracyMetric, labels: [string, string]): string[] {
  const va = bin.a?.[metric] ?? null
  const vb = bin.b?.[metric] ?? null
  const head = bin.delta === null ? `Only ${bin.a ? labels[0] : labels[1]} shot from here` : `${formatMetricValue(metric, bin.delta, true)} (A − B)${bin.low_sample ? ' · low sample' : ''}`
  return [
    head,
    `A ${labels[0]}: ${formatMetricValue(metric, va)} on ${bin.a?.fga ?? 0} FGA`,
    `B ${labels[1]}: ${formatMetricValue(metric, vb)} on ${bin.b?.fga ?? 0} FGA`,
    `${zoneLabel(bin.zone)} · ${side(bin.x_ft)}, ${bin.y_ft.toFixed(1)} ft up`,
  ]
}

export function zoneTooltip(z: ZoneSummary | null, zone: string, metric: AccuracyMetric, threshold: number | undefined): string[] {
  if (!z) return [`No attempts · ${zoneLabel(zone)}`]
  const low = threshold !== undefined ? z.fga < threshold : z.low_sample
  return [
    `${formatMetricValue(metric, z[metric])} · ${z.fga} FGA, ${z.fgm} made${low ? ' · low sample' : ''}`,
    `FG% ${formatPct(z.fg_pct)} (Wilson 95%: ${formatPct(z.ci_low, 0)}–${formatPct(z.ci_high, 0)}) · league ${formatPct(z.league_fg_pct)} · rel ${formatMetricValue('rel_fg_pct', z.rel_fg_pct)}`,
    `Points per FGA ${formatMetricValue('pts_per_fga', z.pts_per_fga)} · ${(z.frequency * 100).toFixed(1)}% of attempts`,
    zoneLabel(zone),
  ]
}

export function shotTooltip(sh: Shot, teamName?: (id: number) => string): string[] {
  const clock = `${sh.minutes_remaining}:${String(sh.seconds_remaining).padStart(2, '0')}`
  const opp = teamName ? teamName(sh.opponent_team_id) : String(sh.opponent_team_id)
  return [
    `${sh.shot_made_flag ? 'Made' : 'Missed'} · ${sh.shot_distance} ft · ${sh.shot_type.replace(' Field Goal', '')}`,
    `${sh.action_type} · ${zoneLabel(sh.shot_zone_basic)}`,
    `Q${sh.period} ${clock} · ${sh.game_date.slice(0, 10)} ${sh.home ? 'vs' : 'at'} ${opp}`,
  ]
}
