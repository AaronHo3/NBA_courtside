import { describe, expect, it } from 'vitest'
import { availabilityTone, availabilityLabel, clockLabel, periodLabel, eventTitle } from './helpers'

describe('evidence helpers', () => {
  it('maps availability states to badge tones and copy', () => {
    expect(availabilityTone('available')).toBe('good')
    expect(availabilityTone('unverified')).toBe('neutral')
    expect(availabilityTone('stale')).toBe('warning')
    expect(availabilityTone('unavailable')).toBe('critical')
    expect(availabilityLabel('unverified')).toBe('Unverified reference')
    expect(availabilityLabel('available')).toBe('Clip listed by provider')
  })
  it('formats game clock and periods', () => {
    expect(clockLabel(708000)).toBe('11:48')
    expect(clockLabel(7300)).toBe('0:07')
    expect(clockLabel(null)).toBe('–')
    expect(periodLabel(1)).toBe('Q1')
    expect(periodLabel(5)).toBe('OT1')
    expect(periodLabel(null)).toBe('–')
  })
  it('builds an event title from description or action type', () => {
    expect(eventTitle({ description: "Tatum 27' 3PT Pullup Jump Shot", action_type: 'Made Shot', sub_type: null })).toBe("Tatum 27' 3PT Pullup Jump Shot")
    expect(eventTitle({ description: null, action_type: 'Rebound', sub_type: 'Unknown' })).toBe('Rebound')
    expect(eventTitle({ description: null, action_type: 'Made Shot', sub_type: 'Jump Shot' })).toBe('Made Shot · Jump Shot')
    expect(eventTitle({ description: null, action_type: null, sub_type: null })).toBe('Event')
  })
})
