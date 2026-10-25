import type { ReactNode } from 'react'
import { clsx } from 'clsx'

/** Page title block: confident display title, one-line lede, actions on the right, context chips underneath. */
export function PageHeader({ title, lede, actions, chips, className }: { title: ReactNode; lede?: ReactNode; actions?: ReactNode; chips?: ReactNode; className?: string }) {
  return (
    <div className={clsx('mb-5 flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}>
      <div className="min-w-0 max-w-3xl">
        <h1 className="display text-[30px] font-semibold leading-none tracking-tight text-ink sm:text-[34px]">{title}</h1>
        {lede && <p className="mt-2 text-[13px] leading-5 text-ink-2">{lede}</p>}
        {chips && <div className="mt-2 flex flex-wrap items-center gap-1.5">{chips}</div>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  )
}
