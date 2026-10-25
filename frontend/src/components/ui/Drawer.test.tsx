import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Drawer } from './Drawer'

function Harness({ onClose, modal }: { onClose?: () => void; modal?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open detail</button>
      <button type="button">Outside</button>
      <button type="button">Outside next</button>
      <Drawer open={open} onClose={() => { onClose?.(); setOpen(false) }} title="Player detail" testId="detail" modal={modal}>
        <button type="button">First action</button>
        <button type="button">Last action</button>
      </Drawer>
    </>
  )
}

describe('Drawer', () => {
  it('renders nothing while closed', () => {
    render(<Harness />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('is a modal dialog labelled by its title, and focus moves inside on open', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open detail' }))
    const dialog = screen.getByRole('dialog', { name: 'Player detail' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveAttribute('data-testid', 'detail')
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('traps Tab inside the panel', async () => {
    render(<Harness />)
    await userEvent.click(screen.getByRole('button', { name: 'Open detail' }))
    screen.getByRole('button', { name: 'Last action' }).focus()
    await userEvent.tab()
    expect(screen.getByRole('dialog').contains(document.activeElement)).toBe(true)
    await userEvent.tab({ shift: true })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Last action' }))
  })

  it('closes on Escape and returns focus to the element that opened it', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    const trigger = screen.getByRole('button', { name: 'Open detail' })
    await userEvent.click(trigger)
    await userEvent.keyboard('{Escape}')
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })

  it('modal: a pointerdown on the scrim closes it', async () => {
    const onClose = vi.fn()
    render(<Harness onClose={onClose} />)
    await userEvent.click(screen.getByRole('button', { name: 'Open detail' }))
    const scrim = document.querySelector('[data-drawer-scrim]') as HTMLElement
    expect(scrim).not.toBeNull()
    await userEvent.click(scrim)
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('non-modal: no scrim or aria-modal, the page stays usable, Esc closes and focus returns', async () => {
    render(<Harness modal={false} />)
    const trigger = screen.getByRole('button', { name: 'Open detail' })
    await userEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Player detail' })
    expect(dialog).not.toHaveAttribute('aria-modal')
    expect(document.querySelector('[data-drawer-scrim]')).toBeNull()
    expect(dialog.contains(document.activeElement)).toBe(true)
    const outside = screen.getByRole('button', { name: 'Outside' })
    await userEvent.click(outside)
    expect(document.activeElement).toBe(outside)
    await userEvent.tab()
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Outside next' }))
    // Tab still wraps while focus is inside the panel
    screen.getByRole('button', { name: 'Last action' }).focus()
    await userEvent.tab()
    expect(dialog.contains(document.activeElement)).toBe(true)
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(document.activeElement).toBe(trigger)
  })
})
