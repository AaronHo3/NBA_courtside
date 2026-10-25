import { clsx } from 'clsx'
import type { ReactNode } from 'react'

/** Native `<details>` for methods and assumptions: closed by default so results lead; keyboard and find-in-page work for free. */
export function Disclosure({ summary, children, defaultOpen = false, testId, className }: { summary: string; children: ReactNode; defaultOpen?: boolean; testId?: string; className?: string }) {
  return (
    <details open={defaultOpen || undefined} data-testid={testId} className={clsx('group rounded-[var(--radius-control)] border border-line', className)}>
      <summary className="t-fast flex min-h-[34px] cursor-pointer list-none items-center gap-2 px-3 py-1.5 text-sm font-medium text-ink-2 select-none hover:text-ink [&::-webkit-details-marker]:hidden">
        <svg aria-hidden="true" viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-ink-3 transition-transform duration-[var(--dur-fast)] group-open:rotate-90">
          <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span>{summary}</span>
      </summary>
      <div className="border-t border-line px-3 py-3 text-sm leading-6 text-ink-2">{children}</div>
    </details>
  )
}
