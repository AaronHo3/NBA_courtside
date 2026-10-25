import { clsx } from 'clsx'
import type { ReactNode } from 'react'

/** Page-level controls: filters on the left, actions on the right, a hairline underneath. `sticky` pins it to the top of the scroll area. */
export function Toolbar({ children, actions, className, label, sticky = false }: { children?: ReactNode; actions?: ReactNode; className?: string; label?: string; sticky?: boolean }) {
  return (
    <div role={label ? 'group' : undefined} aria-label={label} data-sticky={sticky || undefined} className={clsx('mb-4 flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-line pb-3', sticky && 'sticky top-0 z-20 bg-page pt-3', className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-x-3 gap-y-2">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
