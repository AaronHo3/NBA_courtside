import type { ClaimType, Contribution, VideoCoverage } from '@/lib/types'

type Tone = 'neutral' | 'accent' | 'warning' | 'good' | 'critical'
export type Chip = { text: string; tone: Tone }

/** Values follow the trait's units; missing stays a dash, never zero. */
export function formatTraitValue(units: string | null, value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '–'
  if (units === 'fraction') return `${(value * 100).toFixed(1)}%`
  if (units === 'fraction (difference)') return `${value > 0 ? '+' : ''}${(value * 100).toFixed(1)} pts`
  if (units === 'ratio') return value.toFixed(2)
  if (units === 'count') return value.toFixed(0)
  return value.toFixed(1)
}

export function eligibilityLabel(row: { eligible: boolean | null; missing: string[] }): Chip {
  if (row.eligible === null) return { text: 'Added manually (unscored)', tone: 'neutral' }
  if (row.eligible) return { text: 'Eligible', tone: 'good' }
  return { text: `Ineligible: missing ${row.missing.join(', ')}`, tone: 'warning' }
}

export function coverageChip(c: VideoCoverage): Chip {
  switch (c) {
    case 'references_only': return { text: 'Clip references only', tone: 'neutral' }
    case 'limited': return { text: 'Reviewed: limited', tone: 'warning' }
    case 'adequate': return { text: 'Reviewed: adequate', tone: 'good' }
    case 'none': return { text: 'No clips', tone: 'neutral' }
    default: return { text: 'Coverage unknown', tone: 'neutral' }
  }
}

export const TYPE_LABEL: Record<ClaimType, string> = {
  statistical: 'Statistic',
  reviewed_observation: 'Reviewed observation',
  model_estimate: 'Model estimate',
  interpretation: 'Interpretation',
  limitation: 'Limitation',
}
const TYPE_TONE: Record<ClaimType, Tone> = { statistical: 'accent', reviewed_observation: 'good', model_estimate: 'accent', interpretation: 'neutral', limitation: 'neutral' }

/** The badge names the validated type; a downgrade stays visible so the label is never read as upgraded. */
export function claimBadge(c: { claim_type: ClaimType; original_type: ClaimType; validation_status: 'valid' | 'downgraded' | 'dropped' }): Chip {
  if (c.validation_status === 'dropped') return { text: 'Dropped', tone: 'critical' }
  if (c.validation_status === 'downgraded') return { text: `${TYPE_LABEL[c.claim_type]} (downgraded from ${TYPE_LABEL[c.original_type].toLowerCase()})`, tone: 'warning' }
  return { text: TYPE_LABEL[c.claim_type], tone: TYPE_TONE[c.claim_type] }
}

export function contributionShares(contributions: Array<Pick<Contribution, 'metric' | 'contribution'>>): Array<{ metric: string; share: number }> {
  const total = contributions.reduce((s, c) => s + c.contribution, 0)
  if (!contributions.length || total === 0) return contributions.map((c) => ({ metric: c.metric, share: 0 }))
  return contributions.map((c) => ({ metric: c.metric, share: c.contribution / total }))
}

export function roleCaveatText(caveats: string[]): string {
  return caveats.map((c) => (c.trim().endsWith('.') ? c.trim() : `${c.trim()}.`)).join(' ')
}
