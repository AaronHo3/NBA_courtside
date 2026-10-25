import type { HexBin, Shot, ZoneSummary } from '@/lib/types'
import type { DiffBin } from './diff'

export type CourtSelection = { kind: 'hex'; q: number; r: number } | { kind: 'zone'; zone: string }
export type CourtLayer = 'markers' | 'hex' | 'zones' | 'density'
export type FrequencyEncoding = 'size' | 'opacity'
export type MarkerFilter = 'made' | 'missed' | 'both'

export const LAYER_LABEL: Record<CourtLayer, string> = { markers: 'Markers', hex: 'Hexbins', zones: 'Zones', density: 'Density' }

export type TooltipState = { x: number; y: number; lines: string[] } | null

export type HexTarget = { kind: 'hex'; bin: HexBin }
export type DiffTarget = { kind: 'diff'; bin: DiffBin }
export type ZoneTarget = { kind: 'zone'; summary: ZoneSummary | null; zone: string }
export type ShotTarget = { kind: 'shot'; shot: Shot }

export const sameSelection = (a: CourtSelection | null | undefined, b: CourtSelection | null | undefined) => {
  if (!a || !b || a.kind !== b.kind) return false
  if (a.kind === 'hex' && b.kind === 'hex') return a.q === b.q && a.r === b.r
  if (a.kind === 'zone' && b.kind === 'zone') return a.zone === b.zone
  return false
}

/** Serialise a selection for the URL: `h:q,r` or `z:Zone name`. */
export function selectionToParam(sel: CourtSelection | null): string | null {
  if (!sel) return null
  return sel.kind === 'hex' ? `h:${sel.q},${sel.r}` : `z:${sel.zone}`
}
export function selectionFromParam(raw: string): CourtSelection | null {
  if (raw.startsWith('h:')) {
    const [q, r] = raw.slice(2).split(',').map(Number)
    return Number.isFinite(q) && Number.isFinite(r) ? { kind: 'hex', q, r } : null
  }
  if (raw.startsWith('z:') && raw.length > 2) return { kind: 'zone', zone: raw.slice(2) }
  return null
}
