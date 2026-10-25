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
