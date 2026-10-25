import type { Availability } from '@/lib/types'

type Tone = 'neutral' | 'accent' | 'warning' | 'good' | 'critical'

export function availabilityTone(a: Availability): Tone {
  return a === 'available' ? 'good' : a === 'stale' ? 'warning' : a === 'unavailable' ? 'critical' : 'neutral'
}

export function availabilityLabel(a: Availability): string {
  switch (a) {
    case 'available': return 'Clip listed by provider'
    case 'stale': return 'Listing not re-checked recently'
    case 'unavailable': return 'No clip listed'
    default: return 'Unverified reference'
  }
}

/** Game clock remaining, from milliseconds to m:ss. */
export function clockLabel(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '–'
  const total = Math.floor(ms / 1000)
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function periodLabel(p: number | null | undefined): string {
  if (p === null || p === undefined) return '–'
  return p > 4 ? `OT${p - 4}` : `Q${p}`
}

export function eventTitle(e: { description: string | null; action_type: string | null; sub_type: string | null }): string {
  if (e.description) return e.description
  if (e.action_type && e.sub_type && e.sub_type !== 'Unknown') return `${e.action_type} · ${e.sub_type}`
  return e.action_type ?? 'Event'
}

export function mapMethodLabel(method: string | null, confidence: string | null): string {
  if (!method) return 'not mapped'
  const how = method === 'equal_ids' ? 'equal ids' : method === 'matched_on_clock_player_result' ? 'clock, player and result' : method
  return `mapped by ${how}${confidence ? ` (${confidence})` : ''}`
}
