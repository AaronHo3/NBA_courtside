import { clsx } from 'clsx'
import type { ReactNode } from 'react'

/** Page-level controls: filters on the left, actions on the right, a hairline underneath. */
export function Toolbar({ children, actions, className, label }: { children?: ReactNode; actions?: ReactNode; className?: string; label?: string }) {
  return (
    <div role={label ? 'group' : undefined} aria-label={label} className={clsx('mb-4 flex flex-wrap items-end gap-x-3 gap-y-2 border-b border-line pb-3', className)}>
      <div className="flex min-w-0 flex-1 flex-wrap items-end gap-x-3 gap-y-2">{children}</div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
