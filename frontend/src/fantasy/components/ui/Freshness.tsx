import { freshnessTone, relativeTime } from '../../lib/format'

interface FreshnessProps {
  label: string
  at: string | null
  detail?: string
}

/** "Label · 2h ago" with a dot toned by age (≤ 24h accent, ≤ 7d neutral, older or never a warning). */
export function Freshness({ label, at, detail }: FreshnessProps) {
  const tone = freshnessTone(at)
  const absolute = at && !Number.isNaN(Date.parse(at)) ? new Date(at).toLocaleString() : undefined
  return (
    <span className={`freshness ${tone}`} data-tone={tone}>
      <span className="freshness-dot" aria-hidden="true" />
      <span>
        {label} ·{' '}
        {at ? (
          <time dateTime={at} title={absolute}>
            {relativeTime(at)}
          </time>
        ) : (
          <span>never</span>
        )}
      </span>
      {detail && <span className="freshness-detail">{detail}</span>}
    </span>
  )
}
