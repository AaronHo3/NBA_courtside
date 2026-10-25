import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { useSeasonStore } from '../../store/seasonStore'
import { makeFreeAgent as fa, makeOverview } from '../../test/seasonFixtures'
import { FreeAgentsTab } from './FreeAgentsTab'

const overview = makeOverview()

describe('FreeAgentsTab', () => {
  beforeEach(() => {
    useSeasonStore.setState({
      overview,
      freeAgents: { ids: overview.ids, items: [fa('a', 'Healthy Guy'), fa('b', 'Hurt Guy', ['out'])], synced_at: null },
      faStatus: 'ready',
      loadFreeAgents: async () => {},
    })
  })

  it('hides OUT players by default, shows them on demand, and explains the selected swap', () => {
    render(<FreeAgentsTab sessionId="sess" />)
    expect(screen.queryByText('Hurt Guy')).toBeNull()
    const panel = screen.getByTestId('swap-panel')
    expect(within(panel).getByText('Healthy Guy')).toBeInTheDocument()
    expect(within(panel).getByText('Bench Guy')).toBeInTheDocument()
    expect(within(panel).getByText('+1.30')).toBeInTheDocument()
    fireEvent.click(screen.getByLabelText(/hide out/i))
    const hurt = screen.getByText('Hurt Guy')
    expect(hurt).toBeInTheDocument()
    fireEvent.click(hurt.closest('tr')!.querySelector('td')!)
    expect(within(screen.getByTestId('swap-panel')).getByText('Hurt Guy')).toBeInTheDocument()
  })
})

describe('FreeAgentsTab actuals', () => {
  it('ranks by actual production on demand, asks for logs when none are stored, and refreshes them', async () => {
    const { makeActual } = await import('../../test/seasonFixtures')
    const calls: Array<Record<string, unknown>> = []
    const refreshed: string[] = []
    const meta = { scope: 'week' as const, period: 1, window_start: '2026-10-20', window_end: '2026-10-26', fetched_at: '2026-10-25T06:00:00+00:00', rows: 812, max_game_date: '2026-10-24' }
    useSeasonStore.setState({
      overview,
      freeAgents: { ids: overview.ids, items: [fa('a', 'Projected Guy'), fa('b', 'Hot Guy', [], makeActual())], synced_at: null, actuals: meta },
      faStatus: 'ready',
      gameLogs: null,
      logsStatus: 'idle',
      logsError: null,
      loadFreeAgents: async (_sid, q) => { calls.push(q ?? {}) },
      loadGameLogsMeta: async () => {},
      refreshGameLogs: async (sid) => { refreshed.push(sid); return true },
    })
    render(<FreeAgentsTab sessionId="sess" />)
    // projection order first
    const rowsBefore = screen.getAllByRole('row').map((r) => r.textContent ?? '')
    expect(rowsBefore.findIndex((t) => t.includes('Projected Guy'))).toBeLessThan(rowsBefore.findIndex((t) => t.includes('Hot Guy')))
    fireEvent.click(screen.getByTestId('rank-actual-week'))
    expect(screen.getByTestId('actuals-callout')).toBeInTheDocument()
    const rowsAfter = screen.getAllByRole('row').map((r) => r.textContent ?? '')
    expect(rowsAfter.findIndex((t) => t.includes('Hot Guy'))).toBeLessThan(rowsAfter.findIndex((t) => t.includes('Projected Guy')))
    expect(screen.getByTestId('swap-actuals')).toBeInTheDocument()
    fireEvent.click(screen.getByTestId('rank-actual-season'))
    await new Promise((r) => setTimeout(r, 200))
    expect(calls.some((c) => c.actuals === 'season')).toBe(true)
    fireEvent.click(screen.getByTestId('refresh-logs'))
    expect(refreshed).toEqual(['sess'])
  })
})

describe('FreeAgentsTab in-season minutes', () => {
  it('explains the minutes basis and lets the user override a player’s minutes from the swap panel', async () => {
    const { makeMinutes, MINUTES_META } = await import('../../test/seasonFixtures')
    const { useDraftStore } = await import('../../store/draftStore')
    const strategies: Array<Record<string, unknown>> = []
    const reloads: number[] = []
    useDraftStore.setState({
      state: { strategy: { mode: 'balanced', minutes_overrides: { z: 12 }, in_season_minutes: true } } as never,
      setStrategy: async (s) => {
        strategies.push(s as unknown as Record<string, unknown>)
        return true
      },
    })
    useSeasonStore.setState({
      overview,
      freeAgents: { ids: overview.ids, items: [fa('a', 'Blend Guy', [], null, makeMinutes())], synced_at: null, minutes: MINUTES_META },
      faStatus: 'ready',
      loadFreeAgents: async () => { reloads.push(1) },
      loadGameLogsMeta: async () => {},
    })
    window.location.hash = ''
    render(<FreeAgentsTab sessionId="sess" />)
    expect(screen.getByTestId('minutes-basis')).toHaveTextContent(/12 players/)
    const panel = screen.getByTestId('swap-panel')
    expect(within(panel).getByTestId('swap-minutes')).toHaveTextContent(/27\.6/)
    const input = within(panel).getByLabelText(/override minutes/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: '31' } })
    fireEvent.click(within(panel).getByRole('button', { name: /apply/i }))
    await new Promise((r) => setTimeout(r, 0))
    expect(strategies).toHaveLength(1)
    expect(strategies[0].minutes_overrides).toEqual({ z: 12, a: 31 })
    expect(reloads.length).toBeGreaterThan(0)
  })

  it('clears an existing override', async () => {
    const { makeMinutes, MINUTES_META } = await import('../../test/seasonFixtures')
    const { useDraftStore } = await import('../../store/draftStore')
    const strategies: Array<Record<string, unknown>> = []
    useDraftStore.setState({
      state: { strategy: { mode: 'balanced', minutes_overrides: { a: 0 }, in_season_minutes: true } } as never,
      setStrategy: async (s) => {
        strategies.push(s as unknown as Record<string, unknown>)
        return true
      },
    })
    useSeasonStore.setState({
      overview,
      freeAgents: { ids: overview.ids, items: [fa('a', 'Benched Guy', [], null, makeMinutes({ used: 0, source: 'override' }))], synced_at: null, minutes: { ...MINUTES_META, overrides: 1 } },
      faStatus: 'ready',
      loadFreeAgents: async () => {},
      loadGameLogsMeta: async () => {},
    })
    window.location.hash = ''
    render(<FreeAgentsTab sessionId="sess" />)
    fireEvent.click(within(screen.getByTestId('swap-panel')).getByRole('button', { name: /clear override/i }))
    await new Promise((r) => setTimeout(r, 0))
    expect(strategies[0].minutes_overrides).toEqual({})
  })
})
