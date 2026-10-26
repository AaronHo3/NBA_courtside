import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from '../ui/Icon'
import { useDialogFocus } from '../ui/useDialogFocus'

interface ModalProps {
  title: string
  onClose: () => void
  children: ReactNode
  wide?: boolean
  onKeyDown?: (e: KeyboardEvent<HTMLDivElement>) => void
  testId?: string
}

/**
 * Accessible modal dialog on the shared dialog-layer stack (`useDialogFocus`): focus moves inside (to
 * `[data-autofocus]` when present, else the first control), Tab wraps, focus that escapes is pulled back while
 * this is the top layer, Esc and a backdrop click close it, and focus returns to the opener on unmount.
 */
export function Modal({ title, onClose, children, wide, onKeyDown, testId }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  useDialogFocus(ref, true, onClose, true, { initialFocus: 'autofocus' })
  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={wide ? 'modal wide' : 'modal'} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref} data-testid={testId} onKeyDown={onKeyDown}>
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
