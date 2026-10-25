import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useDraftStore } from '../store/draftStore'
import { makeRec, makeState } from '../test/fixtures'
import { DraftScreen } from './DraftScreen'

vi.mock('../api/client', async (orig) => {
  const real = await orig<typeof import('../api/client')>()
  const { makePlayer } = await import('../test/seasonFixtures')
  const players = [makePlayer('p1', 'First Guy'), makePlayer('p2', 'Second Guy')]
  return { ...real, api: new Proxy({}, { get: (_t, name) => async () => (name === 'players' ? players : []) }) }
})

/** Pretend the viewport is `width` px wide for the screen's matchMedia queries. */
function viewport(width: number) {
  window.matchMedia = ((query: string) => {
    const min = /min-width:\s*(\d+)px/.exec(query)
    const max = /max-width:\s*(\d+)px/.exec(query)
    const matches = (min ? width >= Number(min[1]) : true) && (max ? width <= Number(max[1]) : true)
    return { matches, media: query, onchange: null, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {}, dispatchEvent: () => false }
  }) as typeof window.matchMedia
}

const original = window.matchMedia
// jsdom has no layout; the picker scrolls the cursor row into view
Element.prototype.scrollIntoView ??= function scrollIntoView() {}
const state = makeState({ format_confirmed: true })

beforeEach(() => {
  useDraftStore.setState({ sessionId: 's1', snapshotId: 'snap', state, stateStatus: 'ready', rec: makeRec(state, ['a', 'b']), recStatus: 'ready', pendingCommit: null, previewPlayerId: null, previewCandidate: null })
})
afterEach(() => {
  window.matchMedia = original
})

describe('DraftScreen My team panel', () => {
  it('docks as a plain panel at 1180–1479px and ignores Esc pressed in the picker', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    viewport(1280)
    render(<DraftScreen />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    vi.useRealTimers()
    expect(await screen.findAllByTestId('picker-row')).toHaveLength(2)
    fireEvent.click(screen.getByTestId('tab-categories'))
    const panel = screen.getByRole('complementary', { name: 'My team' })
    expect(panel).toHaveAttribute('data-testid', 'team-drawer')
    expect(panel).not.toHaveAttribute('role', 'dialog')
    expect(screen.queryByRole('dialog')).toBeNull()
    // Enter selects a row (confirm step), Esc backs out of it: the panel stays open and focus stays in the search
    const search = screen.getByTestId('picker-search')
    search.focus()
    fireEvent.keyDown(search, { key: 'Enter' })
    expect(screen.getByTestId('confirm-pick-dialog')).toBeInTheDocument()
    fireEvent.keyDown(search, { key: 'Escape' })
    expect(screen.queryByTestId('confirm-pick-dialog')).toBeNull()
    expect(screen.getByRole('complementary', { name: 'My team' })).toBeInTheDocument()
    expect(document.activeElement).toBe(search)
    // the panel's own close button still closes it
    fireEvent.click(screen.getByRole('button', { name: /close/i }))
    expect(screen.queryByRole('complementary', { name: 'My team' })).toBeNull()
  })

  it('uses the overlay Drawer below 1180px', () => {
    viewport(1000)
    render(<DraftScreen />)
    fireEvent.click(screen.getByTestId('tab-roster'))
    expect(screen.getByRole('dialog', { name: 'My team' })).toBeInTheDocument()
  })
})
