import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Drawer } from './Drawer'

function Harness() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open player</button>
      <Drawer open={open} onClose={() => setOpen(false)} title="Player details" closeLabel="Close player details" testId="player-drawer">
        <button type="button">Add to compare</button>
      </Drawer>
    </>
  )
}

describe('fantasy Drawer', () => {
  it('renders nothing while closed', () => {
    render(<Harness />)
    expect(screen.queryByTestId('player-drawer')).toBeNull()
  })

  it('opens as a modal dialog named by its title with focus inside', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open player' }))
    const dialog = screen.getByRole('dialog', { name: 'Player details' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('data-testid', 'player-drawer')
    expect(dialog.contains(document.activeElement)).toBe(true)
    expect(screen.getByRole('button', { name: 'Close player details' })).toBeInTheDocument()
  })

  it('traps Tab, closes on Escape and returns focus to the opener', async () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Open player' })
    await userEvent.click(trigger)
    const dialog = screen.getByRole('dialog')
    await userEvent.tab()
    await userEvent.tab()
    await userEvent.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('closes from its close button', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open player' }))
    await userEvent.click(screen.getByRole('button', { name: 'Close player details' }))
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
