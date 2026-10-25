import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from '../ui/Icon'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
  testId?: string
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.getAttribute('aria-hidden') !== 'true')
}

/**
 * Accessible modal dialog: focus moves inside (to `[data-autofocus]` when present, else the first control),
 * Tab and Shift+Tab wrap inside it, focus that escapes is pulled back, Esc and a backdrop click close it, and
 * focus returns to the element that opened it on unmount.
 */
export function Modal({ title, onClose, children, wide, onKeyDown, testId }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const target = el.querySelector<HTMLElement>('[data-autofocus]') ?? focusables(el)[0] ?? el
    target.focus()
    const onFocusIn = (e: FocusEvent) => {
      if (e.target instanceof Node && !el.contains(e.target)) (focusables(el)[0] ?? el).focus()
    }
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('focusin', onFocusIn)
      if (opener && opener.isConnected) opener.focus()
    }
  }, [])

  const trapTab = (e: KeyboardEvent<HTMLDivElement>) => {
    const el = ref.current
    if (!el) return
    // Handled here so an outer modal drawer's document-level trap never sees this Tab.
    e.stopPropagation()
    const items = focusables(el)
    if (items.length === 0) {
      e.preventDefault()
      el.focus()
      return
    }
    const head = items[0]
    const tail = items[items.length - 1]
    const active = document.activeElement
    if (e.shiftKey && (active === head || active === el)) {
      e.preventDefault()
      tail.focus()
    } else if (!e.shiftKey && active === tail) {
      e.preventDefault()
      head.focus()
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        className={wide ? 'modal wide' : 'modal'}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={ref}
        data-testid={testId}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
            return
          }
          onKeyDown?.(e)
          if (e.key === 'Tab' && !e.defaultPrevented) trapTab(e)
        }}
      >
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" onClick={onClose} aria-label={`Close ${title}`}>
            <Icon name="close" size={14} /> Close
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
