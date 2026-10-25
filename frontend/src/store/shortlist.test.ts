import { beforeEach, describe, expect, it } from 'vitest'
import { useShortlist } from './shortlist'

describe('shortlist store', () => {
  beforeEach(() => useShortlist.getState().clear())

  it('remembers the active shortlist for the current namespace', () => {
    useShortlist.getState().syncNamespace('nba')
    useShortlist.getState().setActive('01ABC')
    expect(useShortlist.getState().activeId).toBe('01ABC')
    expect(useShortlist.getState().namespace).toBe('nba')
  })

  it('drops the active shortlist when the namespace changes', () => {
    useShortlist.getState().syncNamespace('nba')
    useShortlist.getState().setActive('01ABC')
    useShortlist.getState().syncNamespace('demo')
    expect(useShortlist.getState().activeId).toBeNull()
    useShortlist.getState().syncNamespace('demo')
    expect(useShortlist.getState().namespace).toBe('demo')
  })
})
