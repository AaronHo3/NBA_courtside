import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui'
import type { ReportClaim } from '@/lib/types'
import { claimBadge } from './model'

/** Claims as validated: dropped ones stay visible but struck through with their reasons. */
export function ClaimList({ claims }: { claims: ReportClaim[] }) {
  if (!claims.length) return <p className="text-sm text-ink-2">No claims yet. Add one below; it is validated against the report's own numbers and evidence before it is kept.</p>
  return (
    <ul className="flex flex-col gap-2" data-testid="claim-list">
      {claims.map((c) => {
        const badge = claimBadge(c)
        return (
          <li key={c.claim_id} data-status={c.validation_status} className="flex flex-col gap-1 rounded-[var(--radius-control)] border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={badge.tone}>{badge.text}</Badge>
              <span className={c.validation_status === 'dropped' ? 'text-sm text-ink-3 line-through' : 'text-sm text-ink'}>{c.claim_text}</span>
            </div>
            {c.evidence_ids.length > 0 && (
              <div className="flex flex-wrap gap-2 text-xs">
                {c.evidence_ids.map((id) => <Link key={id} to={`/evidence?id=${id}`} className="text-accent hover:underline">{id}</Link>)}
              </div>
            )}
            {c.notes.length > 0 && <p className="text-xs text-ink-3">{c.notes.join(' · ')}</p>}
          </li>
        )
      })}
    </ul>
  )
}
