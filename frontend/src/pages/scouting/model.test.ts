import { describe, expect, it } from 'vitest'
import { claimBadge, contributionShares, coverageChip, eligibilityLabel, formatTraitValue, roleCaveatText } from './model'

describe('scouting view model', () => {
  it('formats trait values by units and never prints zero for missing', () => {
    expect(formatTraitValue('fraction', 0.4312)).toBe('43.1%')
    expect(formatTraitValue('fraction (difference)', -0.0231)).toBe('-2.3 pts')
    expect(formatTraitValue('per 36 min', 26.508)).toBe('26.5')
    expect(formatTraitValue('ratio', 2.0623)).toBe('2.06')
    expect(formatTraitValue('inches', 84)).toBe('84.0')
    expect(formatTraitValue('fraction', null)).toBe('–')
  })
  it('labels eligibility from the composite result', () => {
    expect(eligibilityLabel({ eligible: true, missing: [] })).toEqual({ text: 'Eligible', tone: 'good' })
    expect(eligibilityLabel({ eligible: false, missing: ['d_fg3_pct_diff'] })).toEqual({ text: 'Ineligible: missing d_fg3_pct_diff', tone: 'warning' })
    expect(eligibilityLabel({ eligible: null, missing: [] })).toEqual({ text: 'Added manually (unscored)', tone: 'neutral' })
  })
  it('maps video coverage to a chip', () => {
    expect(coverageChip('none')).toEqual({ text: 'No clips', tone: 'neutral' })
    expect(coverageChip('references_only')).toEqual({ text: 'Clip references only', tone: 'neutral' })
    expect(coverageChip('limited')).toEqual({ text: 'Reviewed: limited', tone: 'warning' })
    expect(coverageChip('adequate')).toEqual({ text: 'Reviewed: adequate', tone: 'good' })
    expect(coverageChip('unknown')).toEqual({ text: 'Coverage unknown', tone: 'neutral' })
  })
  it('maps validated claims to badges without upgrading', () => {
    expect(claimBadge({ claim_type: 'statistical', original_type: 'statistical', validation_status: 'valid' })).toEqual({ text: 'Statistic', tone: 'accent' })
    expect(claimBadge({ claim_type: 'interpretation', original_type: 'reviewed_observation', validation_status: 'downgraded' })).toEqual({ text: 'Interpretation (downgraded from reviewed observation)', tone: 'warning' })
    expect(claimBadge({ claim_type: 'statistical', original_type: 'statistical', validation_status: 'dropped' })).toEqual({ text: 'Dropped', tone: 'critical' })
    expect(claimBadge({ claim_type: 'limitation', original_type: 'limitation', validation_status: 'valid' })).toEqual({ text: 'Limitation', tone: 'neutral' })
  })
  it('turns contributions into shares of the total score', () => {
    const shares = contributionShares([
      { metric: 'fg3_pct', contribution: 60, weight: 0.5 },
      { metric: 'efg_pct', contribution: 20, weight: 0.25 },
      { metric: 'tov_per100', contribution: 20, weight: 0.25 },
    ])
    expect(shares.map((s) => s.share)).toEqual([0.6, 0.2, 0.2])
    expect(contributionShares([])).toEqual([])
  })
  it('joins role caveats into one sentence list', () => {
    expect(roleCaveatText(['a.', 'b'])).toBe('a. b.')
    expect(roleCaveatText([])).toBe('')
  })
})
