import { useId, useRef, type ReactNode } from 'react'
import { Icon } from './Icon'
import { useDialogFocus } from './useDialogFocus'

interface DrawerProps {
  open: boolean
  onClose: () => void
  /** Names the dialog (aria-labelledby). Shown as the heading, or as a kicker above `head` when one is given. */
  title: ReactNode
  children: ReactNode
  width?: 'md' | 'lg'
  testId?: string
  /** Rich header content (identity block) rendered under the title, beside the close button. */
  head?: ReactNode
  /** Accessible name of the close button; defaults to "Close". */
  closeLabel?: string
  className?: string
}

/** Slide-in side panel: modal dialog labelled by its title, focus moves in and is trapped, Esc closes, focus returns on close. */
export function Drawer({ open, onClose, title, children, width = 'md', testId, head, closeLabel, className }: DrawerProps) {
  const panelRef = useRef<HTMLElement>(null)
  const titleId = useId()
  useDialogFocus(panelRef, open, onClose)
  if (!open) return null
  const cls = ['drawer', width === 'lg' ? 'drawer-lg' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <aside ref={panelRef} className={cls} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} data-testid={testId}>
      <div className="drawer-head">
        <div className="drawer-head-main">
          {head ? (
            <>
              <p className="drawer-kicker" id={titleId}>
                {title}
              </p>
              {head}
            </>
          ) : (
            <h2 id={titleId}>{title}</h2>
          )}
        </div>
        <button type="button" onClick={onClose} aria-label={closeLabel}>
          <Icon name="close" size={14} /> Close
        </button>
      </div>
      {children}
    </aside>
  )
}
