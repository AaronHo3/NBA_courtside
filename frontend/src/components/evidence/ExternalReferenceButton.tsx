import { Badge } from '@/components/ui'
import type { Availability } from '@/lib/types'
import { availabilityLabel, availabilityTone } from './helpers'

/**
 * External-reference mode: the clip stays on the provider's site. We never embed, proxy or download it;
 * the button opens the provider page in a new tab. Metadata shown here came from the provider's own listing.
 */
export function ExternalReferenceButton({ url, availability, checkedAt, metadata }: { url: string | null; availability: Availability; checkedAt?: string | null; metadata?: Record<string, unknown> | null }) {
  const duration = typeof metadata?.duration_ms === 'number' ? `${(metadata.duration_ms / 1000).toFixed(1)} s clip` : null
  const checked = checkedAt ? new Date(checkedAt) : null
  const canOpen = Boolean(url) && availability !== 'unavailable'
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
      {canOpen ? (
        <a
          href={url ?? undefined}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 rounded-[var(--radius-control)] border border-line bg-surface px-2.5 py-1 text-sm text-ink hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
        >
          Open on nba.com
          <span aria-hidden="true">↗</span>
        </a>
      ) : (
        <span className="text-sm text-ink-2">No clip is listed by the provider for this event.</span>
      )}
      <Badge tone={availabilityTone(availability)}>{availabilityLabel(availability)}</Badge>
      {duration && <span>{duration}</span>}
      {checked && !Number.isNaN(checked.getTime()) && <span>checked {checked.toLocaleDateString()}</span>}
    </div>
  )
}
