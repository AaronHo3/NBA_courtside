import { fireEvent, render, screen, within } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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

describe('FreeAgentsTab layout', () => {
  beforeEach(async () => {
    const { TWO_CATS } = await import('../../test/seasonFixtures')
    const ov = makeOverview({ league_categories: TWO_CATS })
    useSeasonStore.setState({
      overview: ov,
      freeAgents: { ids: ov.ids, items: [fa('a', 'Healthy Guy'), fa('b', 'Other Guy')], synced_at: null },
      faStatus: 'ready',
      faError: null,
      gameLogs: null,
      logsStatus: 'idle',
      logsError: null,
      loadFreeAgents: async () => {},
      loadGameLogsMeta: async () => {},
    })
    window.location.hash = ''
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('advanced toggle shows the full table', () => {
    render(<FreeAgentsTab sessionId="sess" />)
    const table = screen.getByRole('table', { name: 'Free agents' })
    expect(within(table).queryByRole('columnheader', { name: 'Points' })).toBeNull()
    expect(within(table).getAllByRole('button', { name: /category detail for/i })).toHaveLength(2)
    const toggle = screen.getByTestId('fa-advanced')
    expect(toggle).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-pressed', 'true')
    expect(within(table).getByRole('columnheader', { name: 'Points' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Turnovers' })).toBeInTheDocument()
    expect(within(table).queryByRole('button', { name: /category detail for/i })).toBeNull()
    // the swap panel sits below the table
    const panel = screen.getByTestId('swap-panel')
    expect(table.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(within(panel).getByRole('heading', { name: 'Add Healthy Guy, drop Bench Guy' })).toBeInTheDocument()
  })

  it('minutes override validates range and confirms a save', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const { makeMinutes, MINUTES_META } = await import('../../test/seasonFixtures')
    const { useDraftStore } = await import('../../store/draftStore')
    const saved: Array<Record<string, unknown>> = []
    let strategy = { mode: 'balanced', minutes_overrides: {}, in_season_minutes: true }
    useDraftStore.setState({
      state: { strategy } as never,
      setStrategy: async (s) => {
        saved.push(s as unknown as Record<string, unknown>)
        strategy = s as never
        useDraftStore.setState({ state: { strategy } as never })
        return true
      },
    })
    const ov = useSeasonStore.getState().overview!
    useSeasonStore.setState({ freeAgents: { ids: ov.ids, items: [fa('a', 'Blend Guy', [], null, makeMinutes())], synced_at: null, minutes: MINUTES_META } })
    render(<FreeAgentsTab sessionId="sess" />)
    const panel = screen.getByTestId('swap-panel')
    const input = within(panel).getByLabelText(/override minutes/i) as HTMLInputElement
    expect(input).toHaveAttribute('placeholder', 'projected 26.5')
    const apply = within(panel).getByRole('button', { name: /apply/i })
    fireEvent.change(input, { target: { value: '60' } })
    expect(within(panel).getByText(/between 0 and 48/i)).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(apply).toBeDisabled()
    fireEvent.change(input, { target: { value: '31' } })
    expect(within(panel).queryByText(/between 0 and 48/i)).toBeNull()
    await act(async () => {
      fireEvent.click(apply)
    })
    expect(saved).toHaveLength(1)
    expect(saved[0].minutes_overrides).toEqual({ a: 31 })
    expect(within(screen.getByTestId('swap-panel')).getByText('Saved · ranking refreshed')).toBeInTheDocument()
    await act(async () => {
      vi.advanceTimersByTime(3100)
    })
    expect(within(screen.getByTestId('swap-panel')).queryByText('Saved · ranking refreshed')).toBeNull()
  })

  it('freshness shows the logs age next to the refresh button', async () => {
    const { makeGameLogs } = await import('../../test/seasonFixtures')
    useSeasonStore.setState({ gameLogs: makeGameLogs(3) })
    const { unmount } = render(<FreeAgentsTab sessionId="sess" />)
    const group = screen.getByTestId('fa-logs')
    expect(within(group).getByTestId('refresh-logs')).toBeInTheDocument()
    expect(group).toHaveTextContent(/Game logs · 3h ago/)
    expect(group).toHaveAttribute('data-stale', 'false')
    unmount()
    useSeasonStore.setState({ gameLogs: makeGameLogs(30) })
    render(<FreeAgentsTab sessionId="sess" />)
    const stale = screen.getByTestId('fa-logs')
    expect(stale).toHaveTextContent(/Game logs · 1d ago/)
    expect(stale).toHaveAttribute('data-stale', 'true')
  })

  it('shows skeleton rows while the first load runs, and a retry on error', () => {
    let retried = 0
    useSeasonStore.setState({ freeAgents: null, faStatus: 'loading' })
    const { unmount } = render(<FreeAgentsTab sessionId="sess" />)
    expect(screen.getAllByTestId('fa-skeleton-row')).toHaveLength(5)
    unmount()
    useSeasonStore.setState({ freeAgents: null, faStatus: 'error', faError: 'boom', loadFreeAgents: async () => { retried += 1 } })
    render(<FreeAgentsTab sessionId="sess" />)
    expect(screen.getByRole('alert')).toHaveTextContent('boom')
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    expect(retried).toBeGreaterThan(0)
  })
})
