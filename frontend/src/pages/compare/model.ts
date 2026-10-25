/** Turns the season population and the compared players into per-metric cells (value, rank, percentile, cohort). Pure. */
import type { Normalization, PlayerRow } from '@/lib/types'
import { bestIndex, num, percentileRank, rankInGroup } from './math'
import type { MetricSpec, Rec } from './metrics'

export type PopulationKind = 'all' | 'position' | 'group'
export const POPULATION_LABEL: Record<PopulationKind, string> = { all: 'All qualified players', position: 'Positional peers', group: 'This comparison group' }

export type ComparedPlayer = {
  id: number
  name: string
  team: string | null
  position: string | null
  slot: number
  /** Season-totals record merged with physical measurements; null when the player has no row for the season. */
  record: Rec | null
  totalMin: number | null
  hasSeason: boolean
}

export type MetricCell = { value: number | null; percentile: number | null; cohortSize: number; rank: number | null; belowThreshold: boolean }
export type MetricResult = { spec: MetricSpec; cells: MetricCell[]; best: number | null }

export type ModelInput = {
  players: ComparedPlayer[]
  population: PlayerRow[]
  norm: Normalization
  populationKind: PopulationKind
  minMinutes: number
  specs: MetricSpec[]
}

export const primaryPosition = (p: string | null | undefined) => (p ? p.split('-')[0] : null)
const hasPosition = (row: PlayerRow, pos: string) => String(row.position ?? '').split('-').includes(pos)

function cohortFor(input: ModelInput, player: ComparedPlayer): Rec[] {
  if (input.populationKind === 'group') return input.players.map((p) => p.record).filter((r): r is Rec => r !== null)
  const qualified = input.population.filter((r) => (num(r.min) ?? 0) >= input.minMinutes)
  if (input.populationKind === 'all') return qualified
  const pos = primaryPosition(player.position)
  return pos ? qualified.filter((r) => hasPosition(r, pos)) : []
}

export function buildCompareModel(input: ModelInput): Map<string, MetricResult> {
  const cohortCache = new Map<string, Rec[]>()
  const cohortKey = (p: ComparedPlayer) => (input.populationKind === 'position' ? `pos:${primaryPosition(p.position) ?? ''}` : input.populationKind)
  const cohortOf = (p: ComparedPlayer) => {
    const k = cohortKey(p)
    const hit = cohortCache.get(k)
    if (hit) return hit
    const c = cohortFor(input, p)
    cohortCache.set(k, c)
    return c
  }
  const out = new Map<string, MetricResult>()
  for (const spec of input.specs) {
    const values = input.players.map((p) => (p.record ? spec.value(p.record, input.norm) : null))
    const ranks = rankInGroup(values, spec.higherIsBetter)
    const cohortValues = new Map<string, Array<number | null>>()
    const cells: MetricCell[] = input.players.map((p, i) => {
      const k = cohortKey(p)
      let cv = cohortValues.get(k)
      if (!cv) {
        cv = cohortOf(p).map((r) => spec.value(r, input.norm))
        cohortValues.set(k, cv)
      }
      return {
        value: values[i],
        percentile: percentileRank(cv, values[i], spec.higherIsBetter),
        cohortSize: cv.filter((v) => v !== null).length,
        rank: ranks[i],
        belowThreshold: p.hasSeason && (p.totalMin ?? 0) < input.minMinutes,
      }
    })
    out.set(spec.key, { spec, cells, best: bestIndex(values, spec.higherIsBetter) })
  }
  return out
}
