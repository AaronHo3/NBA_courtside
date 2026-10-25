import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { useCompare } from '@/store/compare'
import { CompareTray } from './CompareTray'

vi.mock('@/components/charts/Plot', () => ({ useChartTheme: () => ({ series: ['#111', '#222'] }) }))

const renderTray = () => render(<MemoryRouter><CompareTray /></MemoryRouter>)

describe('CompareTray', () => {
  beforeEach(() => useCompare.setState({ players: [] }))

  it('reads Compare · 0/6 and explains how to add players when empty', () => {
    renderTray()
    const button = screen.getByRole('button', { name: 'Compare · 0/6' })
    expect(button).toHaveAttribute('aria-disabled', 'true')
    expect(button).toHaveAttribute('title', 'Add players from the explorer or a profile')
    fireEvent.click(button)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens a popover listing the group with remove buttons and a link to compare', () => {
    useCompare.setState({ players: [{ player_id: 1, full_name: 'Ann A' }, { player_id: 2, full_name: 'Bo B' }] })
    renderTray()
    fireEvent.click(screen.getByRole('button', { name: 'Compare · 2/6' }))
    const dialog = screen.getByRole('dialog', { name: 'Comparison group' })
    expect(dialog).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Open comparison' })).toHaveAttribute('href', '/compare?ids=1,2')
    fireEvent.click(screen.getByRole('button', { name: 'Remove Ann A from comparison' }))
    expect(screen.getByRole('button', { name: 'Compare · 1/6' })).toBeInTheDocument()
  })
})

const PLAYERS = [
  { player_id: 1, full_name: 'Ada One', team_abbreviation: 'AAA' },
  { player_id: 2, full_name: 'Bea Two', team_abbreviation: 'BBB' },
]

function renderTrayWithOther() {
  return render(
    <MemoryRouter>
      <button type="button">Elsewhere</button>
      <CompareTray />
    </MemoryRouter>,
  )
}

describe('CompareTray focus', () => {
  beforeEach(() => useCompare.setState({ players: PLAYERS }))

  it('moves focus into the popover on open and back to the trigger on Escape', () => {
    renderTrayWithOther()
    const trigger = screen.getByRole('button', { name: /Compare · 2/ })
    trigger.focus()
    fireEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Comparison group' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(screen.getByRole('link', { name: 'Ada One' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('returns focus to the trigger after Clear empties the group', () => {
    renderTrayWithOther()
    const trigger = screen.getByRole('button', { name: /Compare · 2/ })
    trigger.focus()
    fireEvent.click(trigger)
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(trigger).toHaveFocus()
  })

  it('wraps Tab from the last control back to the first while focus is inside', () => {
    renderTrayWithOther()
    const trigger = screen.getByRole('button', { name: /Compare · 2/ })
    trigger.focus()
    fireEvent.click(trigger)
    const last = screen.getByRole('link', { name: 'Open comparison' })
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(screen.getByRole('link', { name: 'Ada One' })).toHaveFocus()
  })
})
