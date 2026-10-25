import type { ReactNode } from 'react'
import { clsx } from 'clsx'

/**
 * Page title block. `title` is the display heading; `lede` is one sentence (keep it under ~160
 * characters); `context` (season, freshness, scope) sits right-aligned on the title row; `actions`
 * align with the bottom of the text; `chips` sit under the lede; `tabs` run full width underneath.
 */
export function PageHeader({ title, lede, context, actions, tabs, chips, className }: { title: ReactNode; lede?: ReactNode; context?: ReactNode; actions?: ReactNode; tabs?: ReactNode; chips?: ReactNode; className?: string }) {
  const side = context || actions
  return (
    <div className={clsx('mb-5', className)}>
      <div className="flex flex-wrap items-stretch justify-between gap-x-6 gap-y-3">
        <div className="min-w-0 max-w-3xl">
          <h1 className="display text-[30px] font-semibold leading-none tracking-tight text-ink sm:text-[34px]">{title}</h1>
          {lede && <p className="mt-2 max-w-[72ch] text-[13px] leading-5 text-ink-2">{lede}</p>}
          {chips && <div className="mt-2 flex flex-wrap items-center gap-1.5">{chips}</div>}
        </div>
        {side && (
          <div className="flex flex-col items-end justify-between gap-2">
            {context && <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-ink-2" data-slot="context">{context}</div>}
            {actions && <div className="mt-auto flex flex-wrap items-center justify-end gap-2">{actions}</div>}
          </div>
        )}
      </div>
      {tabs && <div className="mt-4">{tabs}</div>}
    </div>
  )
}
