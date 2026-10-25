import type { HexBin } from '@/lib/types'
import type { AccuracyMetric } from './colour'
import { hexCentre } from './geometry'

/** One lattice cell of an A − B comparison. `delta` is null when either side lacks the bin (drawn hollow). */
export type DiffBin = {
  q: number
  r: number
  x_ft: number
  y_ft: number
  zone: string
  a: HexBin | null
  b: HexBin | null
  /** A's metric minus B's metric; null when only one subject has attempts here. */
  delta: number | null
  /** Combined attempts, used for the size/opacity (frequency) encoding. */
  fga: number
  /** Combined share of both subjects' attempts. */
  frequency: number
  low_sample: boolean
}

export const binKey = (q: number, r: number) => `${q},${r}`

/**
 * Merge two hexbin sets on (q, r). Bins must come from the same `size_ft` so the lattices line up.
 * A bin is low-sample when either present side is below `minAttempts` (or flagged by the server).
 */
export function mergeDifference(a: readonly HexBin[], b: readonly HexBin[], metric: AccuracyMetric, sizeFt: number, minAttempts?: number): DiffBin[] {
  const byKey = new Map<string, { a: HexBin | null; b: HexBin | null }>()
  for (const bin of a) byKey.set(binKey(bin.q, bin.r), { a: bin, b: null })
  for (const bin of b) {
    const k = binKey(bin.q, bin.r)
    const cur = byKey.get(k)
    byKey.set(k, cur ? { ...cur, b: bin } : { a: null, b: bin })
  }
  const totalFga = [...a, ...b].reduce((s, x) => s + x.fga, 0)
  const low = (bin: HexBin | null) => (bin ? (minAttempts !== undefined ? bin.fga < minAttempts : bin.low_sample) : false)
  return [...byKey.entries()].map(([k, { a: ba, b: bb }]) => {
    const [q, r] = k.split(',').map(Number)
    const ref = ba ?? bb
    const centre = ref ? { x_ft: ref.x_ft, y_ft: ref.y_ft } : hexCentre(q, r, sizeFt)
    const va = ba?.[metric] ?? null
    const vb = bb?.[metric] ?? null
    const fga = (ba?.fga ?? 0) + (bb?.fga ?? 0)
    return {
      q,
      r,
      x_ft: centre.x_ft,
      y_ft: centre.y_ft,
      zone: ref?.zone ?? '',
      a: ba,
      b: bb,
      delta: ba && bb && va !== null && vb !== null ? va - vb : null,
      fga,
      frequency: totalFga ? fga / totalFga : 0,
      low_sample: low(ba) || low(bb),
    }
  })
}
