import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDraftStore } from '../../store/draftStore'
import { makeCandidate, makeIds, makeRec, makeState } from '../../test/fixtures'
import { RecommendationCard } from './RecommendationCard'

const state = makeState({ on_clock_manager_id: 'm06', picks_until_user_turn: 0, format_confirmed: true })

function candidate(id: string, name: string) {
  return { ...makeCandidate(id, name), reasons: ['r1', 'r2', 'r3', 'r4'], per_game: { PTS: 24.1, REB: 5.2, AST: 7.9 }, contributions: { PTS: 1.2, TOV: -0.4 } }
}

beforeEach(() => {
  const rec = makeRec(state, [])
  const best = candidate('best', 'Best Guy')
  useDraftStore.setState({
    state,
    rec: { ...rec, highlighted: best, shortlist: [best, candidate('alt', 'Alt Guy')] },
    recStatus: 'ready',
    recError: null,
    pendingCommit: null,
    previewPlayerId: null,
    previewCandidate: null,
    refineJob: null,
    refineResult: null,
    compareIds: [],
  })
})

describe('RecommendationCard', () => {
  it('shows the preview kicker and a way back when previewing', () => {
    const setPreview = vi.fn()
    const preview = candidate('pv', 'Preview Guy')
    useDraftStore.setState({ previewPlayerId: 'pv', previewCandidate: preview, setPreview })
    render(<RecommendationCard />)
    expect(screen.getByRole('heading', { name: 'Previewing Preview Guy' })).toBeInTheDocument()
    expect(screen.getByTestId('rec-name')).toHaveAttribute('data-player-id', 'pv')
    fireEvent.click(screen.getByRole('button', { name: 'Back to recommendation' }))
    expect(setPreview).toHaveBeenCalledWith(null)
  })

  it('reads "Best pick now" outside preview and puts the draft action right after the name', () => {
    render(<RecommendationCard />)
    expect(screen.getByRole('heading', { name: 'Best pick now' })).toBeInTheDocument()
    const card = screen.getByTestId('rec-card')
    const focusables = Array.from(card.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], [tabindex="0"]'))
    const nameIdx = focusables.findIndex((el) => screen.getByTestId('rec-name').contains(el))
    expect(nameIdx).toBeGreaterThanOrEqual(0)
    expect(focusables[nameIdx + 1]).toBe(screen.getByTestId('rec-draft'))
    for (const label of ['Projected', 'Fantasy value', 'Category impact']) expect(within(card).getByRole('heading', { name: label })).toBeInTheDocument()
    // three reasons up front, the rest behind the disclosure
    expect(within(card).getByText('r3')).toBeInTheDocument()
    expect(within(card).queryByText('r4')).toBeNull()
    fireEvent.click(within(card).getByRole('button', { name: /all reasons and model notes/i }))
    expect(within(card).getByText('r4')).toBeInTheDocument()
  })

  it('keeps the card height while refining', () => {
    useDraftStore.setState({ rec: { ...useDraftStore.getState().rec!, notes: ['model note'] } })
    const { rerender } = render(<RecommendationCard />)
    // jsdom has no layout: assert that the same sections and rows stay rendered across states
    const structure = () => {
      const card = screen.getByTestId('rec-card')
      return {
        minHeight: card.style.minHeight,
        name: screen.queryByTestId('rec-name') !== null,
        draft: screen.queryByTestId('rec-draft') !== null,
        why: screen.queryByTestId('rec-why') !== null,
        alts: within(card).queryByTestId('rec-alts')?.querySelectorAll('.player-link').length ?? 0,
        disclosure: within(card).queryByRole('button', { name: /all reasons and model notes/i }) !== null,
        reasons: within(card).queryByRole('list', { name: 'Reasons' })?.children.length ?? 0,
        impactRows: within(card).queryByRole('list', { name: /category impact/i })?.children.length ?? 0,
        blocks: ['Projected', 'Fantasy value', 'Category impact'].filter((h) => within(card).queryByRole('heading', { name: h })).length,
      }
    }
    const ready = structure()
    expect(ready).toEqual({ minHeight: '300px', name: true, draft: true, why: true, alts: 1, disclosure: true, reasons: 3, impactRows: 9, blocks: 3 })
    // a refine job runs on the current ranking: same card, same rows
    useDraftStore.setState({ refineJob: { jobId: 'j', ids: makeIds(state), status: 'running', startedAt: 0, elapsedMs: null, error: null } })
    rerender(<RecommendationCard />)
    expect(structure()).toEqual(ready)
    // the board moved on and the ranking is recalculating: the last ranking stays on screen, dimmed and not draftable
    const stale = useDraftStore.getState().rec!
    useDraftStore.setState({ recStatus: 'updating', rec: { ...stale, ids: makeIds(state, { draft_revision: 99 }) } })
    rerender(<RecommendationCard />)
    expect(screen.getByTestId('rec-updating')).toBeInTheDocument()
    expect(structure()).toEqual(ready)
    expect(screen.getByTestId('rec-draft')).toBeDisabled()
    expect(screen.getByTestId('rec-why')).toHaveTextContent(/recalculating/i)
  })
})
