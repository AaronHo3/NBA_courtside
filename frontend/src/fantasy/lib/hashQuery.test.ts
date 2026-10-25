import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { readHashQuery, setHashQuery, useHashQuery, withHashQuery } from './hashQuery'

describe('hashQuery', () => {
  it('reads params after the route in the hash', () => {
    expect(readHashQuery('#/season?tab=power&week=3')).toEqual({ tab: 'power', week: '3' })
    expect(readHashQuery('#/season')).toEqual({})
    expect(readHashQuery('')).toEqual({})
  })

  it('writes params without disturbing the route, dropping nulls', () => {
    expect(withHashQuery('#/season?tab=power&week=3', { week: '4', tab: null })).toBe('#/season?week=4')
    expect(withHashQuery('#/performers', { team: 'm05' })).toBe('#/performers?team=m05')
    expect(withHashQuery('#/performers?team=m05', { team: null })).toBe('#/performers')
  })

  it('setHashQuery dispatches locationchange and pushes when asked', () => {
    const seen: string[] = []
    const onChange = () => seen.push(window.location.hash)
    window.location.hash = '#/season?tab=matchups'
    window.addEventListener('locationchange', onChange)
    const before = window.history.length
    setHashQuery({ tab: 'power' }, { push: true })
    expect(window.location.hash).toBe('#/season?tab=power')
    expect(seen).toEqual(['#/season?tab=power'])
    expect(window.history.length).toBe(before + 1)
    setHashQuery({ week: '3' })
    expect(window.history.length).toBe(before + 1)
    window.removeEventListener('locationchange', onChange)
  })

  it('useHashQuery re-renders on locationchange', () => {
    window.location.hash = '#/season?tab=matchups'
    const { result } = renderHook(() => useHashQuery())
    expect(result.current.tab).toBe('matchups')
    act(() => setHashQuery({ tab: 'results' }, { push: true }))
    expect(result.current.tab).toBe('results')
    act(() => setHashQuery({ tab: 'power' }))
    expect(result.current.tab).toBe('power')
  })
})
