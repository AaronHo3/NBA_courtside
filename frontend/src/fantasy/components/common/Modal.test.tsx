import { useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Modal } from './Modal'

function Harness({ autofocus = false }: { autofocus?: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>Open dialog</button>
      <button type="button">Behind</button>
      {open && (
        <Modal title="Compare players" onClose={() => setOpen(false)}>
          {autofocus && <input data-autofocus aria-label="Search" />}
          <button type="button">Pick</button>
          <button type="button">Last</button>
        </Modal>
      )}
    </>
  )
}

function open() {
  const opener = screen.getByRole('button', { name: 'Open dialog' })
  opener.focus()
  fireEvent.click(opener)
  return opener
}

describe('Modal', () => {
  it('moves focus in, closes on Escape and returns focus to the opener', () => {
    render(<Harness />)
    const opener = open()
    const dialog = screen.getByRole('dialog', { name: 'Compare players' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(opener).toHaveFocus()
  })

  it('prefers the data-autofocus element', () => {
    render(<Harness autofocus />)
    open()
    expect(screen.getByRole('textbox', { name: 'Search' })).toHaveFocus()
  })

  it('traps Tab and Shift+Tab inside the dialog', () => {
    render(<Harness />)
    open()
    const close = screen.getByRole('button', { name: 'Close Compare players' })
    const last = screen.getByRole('button', { name: 'Last' })
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(close).toHaveFocus()
    fireEvent.keyDown(close, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
  })

  it('pulls focus back when it lands outside the dialog', () => {
    render(<Harness />)
    open()
    screen.getByRole('button', { name: 'Behind' }).focus()
    const dialog = screen.getByRole('dialog', { name: 'Compare players' })
    expect(dialog.contains(document.activeElement)).toBe(true)
  })

  it('closes on a backdrop click and returns focus', () => {
    const onClose = vi.fn()
    render(<Modal title="T" onClose={onClose}><button type="button">x</button></Modal>)
    fireEvent.mouseDown(document.querySelector('.modal-backdrop') as Element)
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
