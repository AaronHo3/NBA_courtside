import { clsx } from 'clsx'
import type { ReactNode } from 'react'

/** Signed difference: colour never carries the meaning alone, the sign and glyph do. */
export function Delta({ value, format = (v) => v.toFixed(1), unit, invert = false, className, muted }: { value: number | null | undefined; format?: (v: number) => string; unit?: string; invert?: boolean; className?: string; muted?: boolean }) {
  if (value == null || Number.isNaN(value)) return <span className={clsx('text-ink-3', className)}>—</span>
  const good = invert ? value < 0 : value > 0
  const tone = value === 0 || muted ? 'text-ink-2' : good ? 'text-pos' : 'text-neg'
  const glyph = value === 0 ? '' : value > 0 ? '▲' : '▼'
  return (
    <span className={clsx('tnum inline-flex items-baseline gap-0.5', tone, className)}>
      {glyph && <span className="text-[0.7em]" aria-hidden="true">{glyph}</span>}
      <span>{value > 0 ? '+' : ''}{format(value)}{unit ? <span className="text-[0.8em] text-ink-3"> {unit}</span> : null}</span>
    </span>
  )
}

export type StatTone = 'neutral' | 'accent' | 'pos' | 'neg' | 'warning'

/** Big display numeral with a label and optional context line. Tone colours the value only. */
export function StatTile({ label, value, sub, tone = 'neutral', size = 'md', className, title, testId }: { label: ReactNode; value: ReactNode; sub?: ReactNode; tone?: StatTone; size?: 'md' | 'lg'; className?: string; title?: string; testId?: string }) {
  return (
    <div className={clsx('flex min-w-0 flex-col gap-0.5', className)} title={title} data-testid={testId}>
      <span className="text-meta uppercase tracking-wide text-ink-3">{label}</span>
      <span className={clsx('display font-semibold leading-none tnum', size === 'lg' ? 'text-[34px]' : 'text-[26px]', tone === 'accent' && 'text-accent', tone === 'pos' && 'text-pos', tone === 'neg' && 'text-neg', tone === 'warning' && 'text-warning', tone === 'neutral' && 'text-ink')}>{value}</span>
      {sub && <span className="text-xs text-ink-2">{sub}</span>}
    </div>
  )
}

/** A row of StatTiles separated by hairlines instead of cards. */
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={clsx('grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-4 sm:grid-cols-4 [&>*+*]:sm:border-l [&>*+*]:sm:border-line [&>*+*]:sm:pl-6', className)}>{children}</div>
}

/** Inline bar for percentile/normalised values (0..1), with the raw value beside it so both stay distinct. */
export function MiniBar({ fraction, label, tone = 'accent', className }: { fraction: number | null; label?: ReactNode; tone?: 'accent' | 'pos' | 'neg' | 'neutral'; className?: string }) {
  const f = fraction == null ? 0 : Math.max(0, Math.min(1, fraction))
  return (
    <span className={clsx('inline-flex items-center gap-2', className)}>
      <span className="relative h-1.5 w-20 overflow-hidden rounded-full bg-raised" aria-hidden="true">
        <span className={clsx('absolute inset-y-0 left-0 rounded-full transition-[width] duration-[var(--dur)]', tone === 'accent' && 'bg-accent', tone === 'pos' && 'bg-pos', tone === 'neg' && 'bg-neg', tone === 'neutral' && 'bg-ink-3')} style={{ width: `${f * 100}%` }} />
      </span>
      {label !== undefined && <span className="tnum text-xs text-ink-2">{label}</span>}
    </span>
  )
}
