import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Drawer } from './Drawer'

function Harness({ modal, onClose }: { modal?: boolean; onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open player</button>
      <input aria-label="Search players" />
      <button type="button">Draft</button>
      <Drawer open={open} onClose={() => { onClose?.(); setOpen(false) }} title="Player details" closeLabel="Close player details" testId="player-drawer" modal={modal}>
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

  it('modal: a pointerdown on the scrim closes it', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open player' }))
    const scrim = document.querySelector('.drawer-scrim') as HTMLElement
    expect(scrim).not.toBeNull()
    await userEvent.click(scrim)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('non-modal: no scrim or aria-modal, the picker stays usable, Esc closes and focus returns', async () => {
    render(<Harness modal={false} />)
    const trigger = screen.getByRole('button', { name: 'Open player' })
    await userEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Player details' })
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(document.querySelector('.drawer-scrim')).toBeNull()
    expect(dialog.contains(document.activeElement)).toBe(true)
    const search = screen.getByRole('textbox', { name: 'Search players' })
    await userEvent.click(search)
    await userEvent.type(search, 'jok')
    expect(search).toHaveValue('jok')
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Draft' }))
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
