import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Drawer } from './Drawer'

function Harness({ onClose }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open detail</button>
      <Drawer open={open} onClose={() => { onClose?.(); setOpen(false) }} title="Player detail" testId="detail">
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
})
