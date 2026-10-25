/** Primary colour per NBA tricode, used only as a controlled accent (rails, rings, header washes). */
const COLOURS: Record<string, string> = {
  ATL: '#c8102e', BOS: '#007a33', BKN: '#9aa0a6', CHA: '#1d1160', CHI: '#ce1141', CLE: '#860038', DAL: '#00538c', DEN: '#0e2240',
  DET: '#c8102e', GSW: '#1d428a', HOU: '#ce1141', IND: '#002d62', LAC: '#c8102e', LAL: '#552583', MEM: '#5d76a9', MIA: '#98002e',
  MIL: '#00471b', MIN: '#0c2340', NOP: '#0c2340', NYK: '#006bb6', OKC: '#007ac1', ORL: '#0077c0', PHI: '#006bb6', PHX: '#1d1160',
  POR: '#e03a3e', SAC: '#5a2d81', SAS: '#c4ced4', TOR: '#ce1141', UTA: '#002b5c', WAS: '#002b5c',
}
const NEUTRAL = '#6b6f76'

/** Lighten dark team colours so rails and rings stay visible on the charcoal surfaces. */
export function teamColour(abbreviation: string | null | undefined): string {
  const hex = abbreviation ? COLOURS[abbreviation.toUpperCase()] : undefined
  return hex ? lift(hex) : NEUTRAL
}

function lift(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
  if (lum > 70) return hex
  const k = (90 - lum) / 255
  const up = (c: number) => Math.min(255, Math.round(c + (255 - c) * k))
  return `#${[up(r), up(g), up(b)].map((c) => c.toString(16).padStart(2, '0')).join('')}`
}
