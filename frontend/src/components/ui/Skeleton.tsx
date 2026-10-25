import { clsx } from 'clsx'

/** Loading placeholders that keep the page's shape; shimmer is disabled under reduced motion. */
export function Skeleton({ className, lines }: { className?: string; lines?: number }) {
  if (lines) {
    return (
      <div className={clsx('flex flex-col gap-2', className)} aria-hidden="true">
        {Array.from({ length: lines }, (_, i) => <span key={i} className="skeleton h-3" style={{ width: `${90 - (i % 3) * 18}%` }} />)}
      </div>
    )
  }
  return <span className={clsx('skeleton block', className)} aria-hidden="true" />
}

export function SkeletonTable({ rows = 6, cols = 5, className }: { rows?: number; cols?: number; className?: string }) {
  return (
    <div className={clsx('flex flex-col gap-1.5', className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3">
          {Array.from({ length: cols }, (_, c) => <span key={c} className="skeleton h-4" style={{ flex: c === 0 ? 3 : 1 }} />)}
        </div>
      ))}
    </div>
  )
}

export function SkeletonChart({ className }: { className?: string }) {
  return <div className={clsx('skeleton h-[360px] w-full', className)} aria-hidden="true" />
}
