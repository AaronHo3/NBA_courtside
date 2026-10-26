import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useDraftStore } from '../../store/draftStore'
import { makeState } from '../../test/fixtures'
import { CorrectPickDialog } from './CorrectPickDialog'

describe('CorrectPickDialog', () => {
  beforeEach(() => {
    useDraftStore.setState({
      state: makeState({ picks: [{ overall: 7, manager_id: 'm07', player_id: 'p1', is_keeper: false, source: 'manual', seq: 2 }] }),
      players: {},
      snapshotId: null,
    })
  })

  it('opens with focus in the replacement search box (data-autofocus), not on Close', () => {
    render(<CorrectPickDialog overall={7} onClose={vi.fn()} />)
    expect(screen.getByRole('dialog', { name: 'Correct pick #7' })).toBeInTheDocument()
    expect(screen.getByRole('searchbox', { name: 'Search replacement player' })).toHaveFocus()
  })
})
