// Both useDialogFocus copies (analytics and copilot, DEC-31) must share one layer stack, so a palette opened
// over a fantasy Modal is the top layer for both. This test imports both on purpose; it ships no runtime code.
import { useRef, useState } from 'react'
import { render, screen, fireEvent } from '@testing-library/react'
import { useDialogFocus as useAnalyticsDialogFocus } from '@/components/ui/useDialogFocus'
import { Modal } from '@/fantasy/components/common/Modal'

function Palette({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useAnalyticsDialogFocus(ref, true, onClose)
  return <div ref={ref} role="dialog" aria-label="Palette"><input aria-label="Search" /><button type="button">Go</button></div>
}

function Harness() {
  const [modal, setModal] = useState(true)
  const [palette, setPalette] = useState(false)
  return (
    <>
      {modal && (
        <Modal title="Correct pick" onClose={() => setModal(false)}>
          <button type="button" onClick={() => setPalette(true)}>Open palette</button>
        </Modal>
      )}
      {palette && <Palette onClose={() => setPalette(false)} />}
    </>
  )
}

describe('dialog layers across the analytics and copilot hooks', () => {
  it('a palette over a fantasy Modal keeps focus, takes Escape first, and returns focus into the Modal', () => {
    render(<Harness />)
    const opener = screen.getByRole('button', { name: 'Open palette' })
    opener.focus()
    fireEvent.click(opener)
    const search = screen.getByRole('textbox', { name: 'Search' })
    expect(search).toHaveFocus()
    fireEvent.keyDown(search, { key: 'Tab', shiftKey: true })
    expect(screen.getByRole('button', { name: 'Go' })).toHaveFocus()
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' })
    expect(screen.queryByRole('dialog', { name: 'Palette' })).toBeNull()
    expect(screen.getByRole('dialog', { name: 'Correct pick' })).toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})
