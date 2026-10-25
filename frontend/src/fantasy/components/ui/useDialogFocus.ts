// Copy of src/components/ui/useDialogFocus.ts: the copilot stays self-contained (DEC-31), so it does not import from the analytics tree.
import { useEffect, useRef, type RefObject } from 'react'

const FOCUSABLE = 'a[href], area[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), iframe, [contenteditable="true"], [tabindex]:not([tabindex="-1"])'

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('inert') && el.getAttribute('aria-hidden') !== 'true')
}

/**
 * Modal focus management for a panel that is mounted while `open`: focus moves to the first focusable
 * (or the panel), Tab and Shift+Tab wrap inside it, Escape calls `onClose`, and focus returns to the
 * element that had it when the panel opened.
 */
export function useDialogFocus(panelRef: RefObject<HTMLElement | null>, open: boolean, onClose: () => void) {
  const onCloseRef = useRef(onClose)
  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open) return
    const panel = panelRef.current
    if (!panel) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const first = focusables(panel)[0]
    ;(first ?? panel).focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = focusables(panel)
      if (items.length === 0) {
        e.preventDefault()
        panel.focus()
        return
      }
      const active = document.activeElement
      const head = items[0]
      const tail = items[items.length - 1]
      if (!panel.contains(active)) {
        e.preventDefault()
        ;(e.shiftKey ? tail : head).focus()
      } else if (e.shiftKey && (active === head || active === panel)) {
        e.preventDefault()
        tail.focus()
      } else if (!e.shiftKey && active === tail) {
        e.preventDefault()
        head.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (opener && opener.isConnected) opener.focus()
    }
  }, [open, panelRef])
}
