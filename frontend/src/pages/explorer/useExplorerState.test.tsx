import { act, renderHook } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createElement, type ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { PRESETS } from './helpers'
import { DEFAULTS, parseNormalization, useExplorerState } from './useExplorerState'

function wrapperFor(initial: string) {
  const qc = new QueryClient()
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: qc }, createElement(MemoryRouter, { initialEntries: [initial] }, children))
}
const useStateAndSearch = () => ({ state: useExplorerState(), search: useLocation().search })

describe('useExplorerState', () => {
  it('reads defaults when the URL is empty and rejects unknown normalizations', () => {
    const { result } = renderHook(useStateAndSearch, { wrapper: wrapperFor('/?season=2025-26&norm=bogus') })
    expect(result.current.state.minGp).toBe(DEFAULTS.minGp)
    expect(result.current.state.minMinutes).toBe(DEFAULTS.minMinutes)
    expect(result.current.state.normalization).toBe('per_game')
    expect(result.current.state.x).toBe('usg_pct')
    expect(result.current.state.selected).toBeNull()
    expect(parseNormalization('per_100')).toBe('per_100')
  })

  it('applies a preset as one URL write, dropping "none" keys', () => {
    const { result } = renderHook(useStateAndSearch, { wrapper: wrapperFor('/?season=2025-26&size=pts&color=position') })
    const preset = PRESETS.find((p) => p.key === 'off-def')!
    act(() => result.current.state.applyPreset(preset))
    const sp = new URLSearchParams(result.current.search)
    expect(sp.get('x')).toBe('off_rating')
    expect(sp.get('y')).toBe('def_rating')
    expect(sp.get('size')).toBe('min')
    expect(sp.get('color')).toBeNull()
    expect(sp.get('season')).toBe('2025-26')
  })

  it('exposes API filters and resets everything except the season context', () => {
    const { result } = renderHook(useStateAndSearch, { wrapper: wrapperFor('/?season=2024-25&type=Playoffs&team=9100001&pos=G&age_min=22&q=smith&min_gp=0') })
    expect(result.current.state.apiFilters).toMatchObject({ team_id: 9100001, position: 'G', age_min: 22, q: 'smith', min_gp: 0, min_minutes: 100 })
    expect(result.current.state.apiFilters.age_max).toBeUndefined()
    expect(result.current.state.isDefaultFilters).toBe(false)
    act(() => result.current.state.reset())
    expect(result.current.search).toBe('?season=2024-25&type=Playoffs')
    expect(result.current.state.isDefaultFilters).toBe(true)
  })

  it('relaxes thresholds to zero in a single update', () => {
    const { result } = renderHook(useStateAndSearch, { wrapper: wrapperFor('/?season=2025-26') })
    act(() => result.current.state.relaxThresholds())
    expect(result.current.state.minGp).toBe(0)
    expect(result.current.state.minMinutes).toBe(0)
    expect(new URLSearchParams(result.current.search).get('min_min')).toBe('0')
  })
})
