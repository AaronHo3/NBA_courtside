import { clsx } from 'clsx'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'
import { useId, useState } from 'react'
import { Link, type LinkProps } from 'react-router-dom'

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger'
type ButtonSize = 'sm' | 'md'

function buttonClass(variant: ButtonVariant, size: ButtonSize, className?: string) {
  return clsx(
    't-fast press inline-flex items-center gap-1.5 rounded-[var(--radius-control)] border font-medium disabled:opacity-50 disabled:cursor-not-allowed disabled:active:transform-none',
    size === 'sm' ? 'min-h-7 px-2 py-1 text-xs' : 'min-h-[34px] px-3 py-1.5 text-sm',
    variant === 'primary' && 'bg-accent text-accent-ink border-accent hover:bg-[var(--c-accent-hover)] hover:border-[var(--c-accent-hover)]',
    variant === 'default' && 'bg-surface border-line-strong hover:border-accent text-ink',
    variant === 'ghost' && 'bg-transparent border-transparent hover:bg-accent-soft text-ink-2',
    variant === 'danger' && 'bg-transparent border-line-strong text-critical hover:border-critical',
    className,
  )
}

export function Button({ className, variant = 'default', size = 'md', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button {...props} className={buttonClass(variant, size, className)} />
}

/** A router link that looks like a `Button`; use it for navigation so middle-click and copy-link work. */
export function LinkButton({ className, variant = 'default', size = 'md', ...props }: LinkProps & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <Link {...props} className={buttonClass(variant, size, clsx('no-underline', className))} />
}

export function Select({ label, className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className={clsx('flex flex-col gap-1 text-xs text-ink-3', className)}>
      {label && <span>{label}</span>}
      <select id={id} {...props} className="control text-sm text-ink">
        {children}
      </select>
    </label>
  )
}

export function Input({ label, className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const id = useId()
  return (
    <label htmlFor={id} className={clsx('flex flex-col gap-1 text-xs text-ink-3', className)}>
      {label && <span>{label}</span>}
      <input id={id} {...props} className={clsx('control text-sm text-ink', props.type === 'range' && 'p-0 border-0 min-h-0 bg-transparent')} />
    </label>
  )
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-[var(--accent)] h-4 w-4" />
      <span>{label}</span>
    </label>
  )
}

export function Segmented<T extends string>({ value, onChange, options, ariaLabel }: { value: T; onChange: (v: T) => void; options: Array<{ value: T; label: string; title?: string }>; ariaLabel: string }) {
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="inline-flex rounded-[var(--radius-control)] border border-line-strong overflow-hidden">
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={clsx('t-fast px-2.5 py-1 text-xs font-medium border-r border-line-strong last:border-r-0', value === o.value ? 'bg-accent text-accent-ink' : 'bg-surface text-ink-2 hover:bg-raised hover:text-ink')}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

/** Hover/focus tooltip rendered inline; content is text, never HTML. */
export function Info({ text, children }: { text: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <span className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}>
      <button type="button" aria-label={text} className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-line-strong text-meta text-ink-3 hover:text-ink hover:border-accent leading-none">
        {children ?? 'i'}
      </button>
      {open && (
        <span role="tooltip" className="absolute left-1/2 top-full z-30 mt-1 w-64 -translate-x-1/2 rounded-[var(--radius-control)] border border-line-strong bg-surface p-2 text-xs text-ink-2 shadow-none">
          {text}
        </span>
      )}
    </span>
  )
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warning' | 'good' | 'critical'; className?: string }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-meta font-medium',
        tone === 'neutral' && 'border-line-strong text-ink-2',
        tone === 'accent' && 'border-accent text-accent',
        tone === 'warning' && 'border-warning text-warning',
        tone === 'good' && 'border-good text-good',
        tone === 'critical' && 'border-critical text-critical',
        className,
      )}
    >
      {children}
    </span>
  )
}

/** A titled section. `question` is the basketball question the panel answers; `method` is one line on how. */
export function Panel({ question, method, actions, children, className, info, tone = 'surface', padded = true, compact = false }: { question: string; method?: string; info?: string; actions?: ReactNode; children: ReactNode; className?: string; tone?: 'surface' | 'plain'; padded?: boolean; /** Tighter header and body padding for dense dashboards. */ compact?: boolean }) {
  return (
    <section className={clsx('rise-in', tone === 'surface' ? 'rounded-[var(--radius-panel)] border border-line bg-surface' : 'border-t border-line', className)}>
      <header className={clsx('flex flex-wrap items-start justify-between gap-2', tone === 'surface' ? clsx('border-b border-line', compact ? 'px-3 py-2' : 'px-4 py-3') : compact ? 'py-2' : 'py-3')}>
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold leading-5 text-ink">{question}</h2>
          {method && (
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-ink-3">
              <span>{method}</span>
              {info && <Info text={info} />}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={clsx(padded && (tone === 'surface' ? (compact ? 'p-3' : 'p-4') : compact ? 'pb-3' : 'pb-4'))}>{children}</div>
    </section>
  )
}

export function EmptyState({ title, body, action, icon }: { title: string; body?: string; action?: ReactNode; /** Small decorative glyph shown above the title. */ icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 rounded-[var(--radius-control)] border border-dashed border-line-strong p-5 text-sm">
      {icon && <span aria-hidden="true" className="text-ink-3">{icon}</span>}
      <p className="font-medium text-ink">{title}</p>
      {body && <p className="text-ink-2 max-w-prose">{body}</p>}
      {action}
    </div>
  )
}

const NOTICE_TONE = {
  info: 'border-line-strong text-ink-2',
  warning: 'border-warning/60 text-ink-2',
  critical: 'border-critical/60 text-ink-2',
  demo: 'border-demo/60 text-ink-2',
} as const

/** Inline page notice (stale data, demo mode, partial coverage); a left rule carries the tone, text stays readable. */
export function Notice({ tone = 'info', title, children, action, className }: { tone?: keyof typeof NOTICE_TONE; title?: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div role={tone === 'critical' ? 'alert' : 'status'} data-tone={tone} className={clsx('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 rounded-[var(--radius-control)] border border-l-[3px] bg-surface px-3 py-2 text-sm', NOTICE_TONE[tone], className)}>
      <div className="min-w-0">
        {title && <p className="font-medium text-ink">{title}</p>}
        {children && <div className={clsx(title && 'mt-0.5', 'text-xs leading-5')}>{children}</div>}
      </div>
      {action && <div className="flex items-center gap-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ error, retry }: { error: unknown; retry?: () => void }) {
  const msg = error instanceof Error ? error.message : String(error)
  return (
    <div role="alert" className="flex flex-col items-start gap-2 rounded-[var(--radius-control)] border border-critical/60 p-4 text-sm">
      <p className="font-medium text-critical">Couldn't load this view</p>
      <p className="text-ink-2 break-words">{msg}</p>
      {retry && <Button size="sm" onClick={retry}>Try again</Button>}
    </div>
  )
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return <p className="text-sm text-ink-3" aria-live="polite">{label}…</p>
}

/** Wrap content that refetches: keeps the frame, dims while loading, surfaces errors. */
export function Refetching({ loading, error, retry, children, className }: { loading: boolean; error?: unknown; retry?: () => void; children: ReactNode; className?: string }) {
  if (error) return <ErrorState error={error} retry={retry} />
  return <div className={clsx('transition-opacity', loading && 'opacity-50 pointer-events-none', className)} aria-busy={loading}>{children}</div>
}

export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-0.5', className)}>
      <span className="text-xs text-ink-3">{label}</span>
      <span className="text-xl font-semibold text-ink tnum leading-6">{value}</span>
      {sub && <span className="text-xs text-ink-2">{sub}</span>}
    </div>
  )
}

export { Portrait, TeamMark, PlayerIdentity, nbaHeadshotUrl, nbaLogoUrl, initials } from './identity'
export { Delta, StatTile, StatRow, MiniBar } from './stats'
export { Tabs } from './Tabs'
export { Skeleton, SkeletonTable, SkeletonChart } from './Skeleton'
export { Toolbar } from './Toolbar'
export { Disclosure } from './Disclosure'
export { Drawer } from './Drawer'
export { Freshness } from './Freshness'
