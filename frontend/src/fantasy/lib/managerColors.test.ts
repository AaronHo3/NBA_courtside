import { describe, expect, it } from 'vitest'
import { MANAGER_PALETTE, managerColors } from './managerColors'

describe('managerColors', () => {
  it('gives every manager a distinct colour and keeps the assignment stable for the same list', () => {
    const ids = Array.from({ length: 13 }, (_, i) => `m${String(i + 1).padStart(2, '0')}`)
    const colors = managerColors(ids)
    expect(colors.size).toBe(13)
    expect(new Set(colors.values()).size).toBe(13)
    expect(managerColors(ids).get('m07')).toBe(colors.get('m07'))
    expect(colors.get('m01')).toBe(MANAGER_PALETTE[0])
  })

  it('cycles the palette rather than failing when there are more managers than colours', () => {
    const ids = Array.from({ length: MANAGER_PALETTE.length + 2 }, (_, i) => `t${i}`)
    const colors = managerColors(ids)
    expect(colors.size).toBe(ids.length)
    expect(colors.get(`t${MANAGER_PALETTE.length}`)).toBe(MANAGER_PALETTE[0])
  })
})
