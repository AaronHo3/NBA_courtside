import { describe, expect, it, vi } from 'vitest'
import { useRef, useState, type ReactNode } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { openDialogLayerCount, useDialogFocus } from './useDialogFocus'

function Layer({ name, onClose, modal = true, children }: { name: string; onClose: () => void; modal?: boolean; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(ref, true, onClose, modal)
  return (
    <div ref={ref} role="dialog" aria-label={name} tabIndex={-1}>
      <button type="button">{name} first</button>
      {children}
      <button type="button" onClick={onClose}>Close {name}</button>
    </div>
  )
}

function Stack({ lowerModal = true }: { lowerModal?: boolean }) {
  const [a, setA] = useState(false)
  const [b, setB] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setA(true)}>Open A</button>
      {a && (
        <Layer name="A" modal={lowerModal} onClose={() => setA(false)}>
          <button type="button" onClick={() => setB(true)}>Open B</button>
        </Layer>
      )}
      {b && <Layer name="B" onClose={() => setB(false)} />}
    </>
  )
}

function openBoth() {
  const openA = screen.getByRole('button', { name: 'Open A' })
  openA.focus()
  fireEvent.click(openA)
  const openB = screen.getByRole('button', { name: 'Open B' })
  openB.focus()
  fireEvent.click(openB)
  return { openA, openB }
}

describe('useDialogFocus layer stack', () => {
  it.each([true, false])('only the topmost layer handles Escape (lower modal: %s)', (lowerModal) => {
    render(<Stack lowerModal={lowerModal} />)
    const { openB } = openBoth()
    expect(openDialogLayerCount()).toBe(2)
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'B' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'A' })).toBeInTheDocument()
    expect(openB).toHaveFocus()
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByRole('button', { name: 'Open A' })).toHaveFocus()
    expect(openDialogLayerCount()).toBe(0)
  })

  it('a newer layer takes focus without the older guard pulling it back', () => {
    render(<Stack />)
    openBoth()
    expect(screen.getByRole('button', { name: 'B first' })).toHaveFocus()
    screen.getByRole('button', { name: 'Close B' }).focus()
    expect(screen.getByRole('button', { name: 'Close B' })).toHaveFocus()
  })

  it('only the topmost modal layer wraps Tab and pulls escaped focus back', () => {
    render(<Stack />)
    openBoth()
    const closeB = screen.getByRole('button', { name: 'Close B' })
    closeB.focus()
    fireEvent.keyDown(closeB, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'B first' })).toHaveFocus()
    screen.getByRole('button', { name: 'A first' }).focus()
    expect(screen.getByRole('dialog', { name: 'B' }).contains(document.activeElement)).toBe(true)
  })

  it('closing the top layer restores focus to its opener inside the lower layer', () => {
    render(<Stack />)
    const { openB } = openBoth()
    fireEvent.click(screen.getByRole('button', { name: 'Close B' }))
    expect(openB).toHaveFocus()
    // The lower layer is the top again: its Escape and guard are live.
    screen.getByRole('button', { name: 'Open A' }).focus()
    expect(screen.getByRole('dialog', { name: 'A' }).contains(document.activeElement)).toBe(true)
  })

  it('ignores an Escape that another handler already handled', () => {
    const onClose = vi.fn()
    function One() {
      const ref = useRef<HTMLDivElement>(null)
      useDialogFocus(ref, true, onClose)
      return <div ref={ref} tabIndex={-1} onKeyDown={(e) => { if (e.key === 'Escape') e.preventDefault() }}><button type="button">x</button></div>
    }
    render(<One />)
    fireEvent.keyDown(screen.getByRole('button', { name: 'x' }), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('initialFocus: data-autofocus by default, an explicit element, or the panel for null', () => {
    function Probe({ initial }: { initial?: 'first' | null }) {
      const ref = useRef<HTMLDivElement>(null)
      useDialogFocus(ref, true, () => {}, true, initial === undefined ? {} : { initialFocus: initial })
      return <div ref={ref} data-testid="panel" tabIndex={-1}><button type="button">first</button><input aria-label="auto" data-autofocus /></div>
    }
    const { unmount } = render(<Probe />)
    expect(screen.getByRole('textbox', { name: 'auto' })).toHaveFocus()
    unmount()
    const r2 = render(<Probe initial="first" />)
    expect(screen.getByRole('button', { name: 'first' })).toHaveFocus()
    r2.unmount()
    render(<Probe initial={null} />)
    expect(screen.getByTestId('panel')).toHaveFocus()
  })
})
