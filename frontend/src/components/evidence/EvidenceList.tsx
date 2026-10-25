import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui'
import type { EvidenceItem } from '@/lib/types'
import { ExternalReferenceButton } from './ExternalReferenceButton'

const CLASS_LABEL: Record<EvidenceItem['evidence_class'], string> = {
  statistical: 'Statistic',
  reviewed_observation: 'Reviewed observation',
  model_estimate: 'Model estimate',
  interpretation: 'Interpretation',
  reference: 'Clip reference',
}

/** Evidence items for one event or player; each item names its class so references are never read as observations. */
export function EvidenceList({ items, emptyText = 'No evidence recorded.' }: { items: EvidenceItem[]; emptyText?: string }) {
  if (!items.length) return <p className="text-sm text-ink-2">{emptyText}</p>
  return (
    <ul className="flex flex-col gap-3" data-testid="evidence-list">
      {items.map((it) => (
        <li key={it.evidence_id} className="flex flex-col gap-1.5 rounded-[var(--radius-control)] border border-line p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={it.evidence_class === 'reviewed_observation' ? 'good' : it.evidence_class === 'reference' ? 'neutral' : 'accent'}>{CLASS_LABEL[it.evidence_class]}</Badge>
            {it.status !== 'active' && <Badge tone="warning">{it.status}</Badge>}
            <span className="text-sm text-ink">{it.summary}</span>
          </div>
          {it.reference && <ExternalReferenceButton url={it.reference.external_url} availability={it.reference.availability} checkedAt={it.reference.availability_checked_at} metadata={it.reference.metadata} />}
          <div className="flex flex-wrap gap-x-3 text-xs text-ink-3">
            <span>id {it.evidence_id}</span>
            {it.player_ids?.map((p) => <Link key={p} to={`/players/${p}`} className="text-accent hover:underline">player {p}</Link>)}
          </div>
        </li>
      ))}
    </ul>
  )
}
