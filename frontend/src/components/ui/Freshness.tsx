import { clsx } from 'clsx'
import { freshnessTone, relativeTime } from '@/lib/format'

const DOT: Record<ReturnType<typeof freshnessTone>, string> = {
  accent: 'bg-accent',
  neutral: 'bg-ink-2',
  warning: 'bg-warning',
}

/** "Label · 2h ago" with a dot toned by age (≤ 24h accent, ≤ 7d neutral, older or never a warning). */
export function Freshness({ label, at, detail, className }: { label: string; at: string | null; detail?: string; className?: string }) {
  const tone = freshnessTone(at)
  const absolute = at && !Number.isNaN(Date.parse(at)) ? new Date(at).toLocaleString() : undefined
  return (
    <span data-tone={tone} className={clsx('inline-flex items-center gap-1.5 text-xs text-ink-2', className)}>
      <span aria-hidden="true" className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', DOT[tone])} />
      <span>
        {label} ·{' '}
        {at ? <time dateTime={at} title={absolute}>{relativeTime(at)}</time> : <span>never</span>}
      </span>
      {detail && <span className="text-ink-3">{detail}</span>}
    </span>
  )
}
