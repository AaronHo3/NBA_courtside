import { clsx } from 'clsx'
import { useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useDialogFocus } from './useDialogFocus'

const WIDTH = { md: 'w-[min(480px,100vw)]', lg: 'w-[min(640px,100vw)]' } as const

/**
 * Side panel labelled by its title; focus moves in, Esc closes, focus returns on close. `modal` (default)
 * adds a scrim that closes on pointerdown and traps Tab; `modal={false}` leaves the page behind usable.
 */
export function Drawer({ open, onClose, title, children, width = 'md', testId, modal = true }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; width?: 'md' | 'lg'; testId?: string; modal?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useDialogFocus(panelRef, open, onClose, modal)
  if (!open) return null
  return createPortal(
    <>
      {modal && <div aria-hidden="true" data-drawer-scrim="" className="fade-in fixed inset-0 z-50 bg-black/40" onPointerDown={onClose} />}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal={modal ? 'true' : undefined}
        aria-labelledby={titleId}
        tabIndex={-1}
        data-testid={testId}
        className={clsx('drawer-in fixed inset-y-0 right-0 z-50 flex max-w-full flex-col border-l border-line-strong bg-surface shadow-[var(--shadow-float)] outline-none', WIDTH[width])}
      >
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
          <h2 id={titleId} className="min-w-0 text-base font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="t-fast -mr-1 inline-flex min-h-7 items-center rounded-[var(--radius-control)] px-2 text-xs font-medium text-ink-2 hover:bg-raised hover:text-ink">
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-auto px-5 py-4">{children}</div>
      </div>
    </>,
    document.body,
  )
}
