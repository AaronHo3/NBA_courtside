import { clsx } from 'clsx'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'

export type TabOption<T extends string> = { value: T; label: ReactNode; count?: number; testId?: string }

/** Underline tabs with a sliding active indicator (transform-based, honours reduced motion via CSS). */
export function Tabs<T extends string>({ value, onChange, options, ariaLabel, className, size = 'md' }: { value: T; onChange: (v: T) => void; options: TabOption<T>[]; ariaLabel: string; className?: string; size?: 'sm' | 'md' }) {
  const listRef = useRef<HTMLDivElement>(null)
  const [indicator, setIndicator] = useState<{ left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')
    if (el) setIndicator({ left: el.offsetLeft, width: el.offsetWidth })
  }, [value, options.length])
  return (
    <div ref={listRef} role="tablist" aria-label={ariaLabel} className={clsx('relative flex gap-1 border-b border-line', className)}>
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          type="button"
          aria-selected={value === o.value}
          data-testid={o.testId}
          onClick={() => onChange(o.value)}
          className={clsx('t-fast -mb-px inline-flex items-center gap-1.5 rounded-t-[var(--radius-control)] px-2.5 font-medium hover:text-ink', size === 'sm' ? 'min-h-8 py-1.5 text-xs' : 'min-h-9 py-2 text-xs', value === o.value ? 'text-ink' : 'text-ink-3')}
        >
          {o.label}
          {o.count != null && <span className="rounded-full bg-raised px-1.5 text-meta text-ink-3 tnum">{o.count}</span>}
        </button>
      ))}
      <span aria-hidden="true" className="absolute bottom-[-1px] h-0.5 rounded-full bg-accent transition-[left,width] duration-[var(--dur-panel)] ease-[var(--ease)]" style={indicator ? { left: indicator.left, width: indicator.width } : { width: 0 }} />
    </div>
  )
}
