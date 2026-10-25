import { Badge, Button } from '@/components/ui'
import type { Annotation } from '@/lib/types'
import { REVIEW_LABEL, fmtMs } from './state'

/** Annotations on this asset with the review bar; identity status is always visible (DEC-10). */
export function AnnotationList({ annotations, selected, onSelect, onReview, onDelete, busy }: {
  annotations: Annotation[]; selected: string | null; onSelect: (id: string | null) => void
  onReview: (id: string, status: string) => void; onDelete: (id: string) => void; busy: boolean
}) {
  if (!annotations.length) return <p className="text-sm text-ink-2">No annotations on this asset yet.</p>
  return (
    <ul className="flex flex-col gap-1" data-testid="annotation-list">
      {annotations.map((a) => (
        <li key={a.annotation_id} data-selected={a.annotation_id === selected} className={`flex flex-col gap-1 rounded-[var(--radius-control)] border p-2 text-sm ${a.annotation_id === selected ? 'border-ink' : 'border-line'}`}>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="tnum text-ink hover:underline" onClick={() => onSelect(a.annotation_id === selected ? null : a.annotation_id)}>{fmtMs(a.media_start_ms)} – {fmtMs(a.media_end_ms)}</button>
            <span className="font-medium text-ink">{a.action}</span>
            {a.outcome && <span className="text-ink-2">{a.outcome}</span>}
            <Badge tone={a.subject_identity_status === 'verified' ? 'good' : a.subject_identity_status === 'asserted' ? 'accent' : 'neutral'}>{a.subject_player_id ? `player ${a.subject_player_id} · ${a.subject_identity_status}` : 'no subject'}</Badge>
            <Badge>{a.sampling_method}</Badge>
            <Badge>{a.visibility}</Badge>
            <Badge tone={a.review_status === 'reviewed_ok' ? 'good' : a.review_status === 'rejected' ? 'critical' : a.review_status === 'reviewed_corrected' ? 'warning' : 'neutral'}>{REVIEW_LABEL[a.review_status]}</Badge>
            <span className="text-[11px] text-ink-3">rev {a.revision}</span>
            <span className="ml-auto flex gap-1" data-testid="review-bar">
              <Button size="sm" onClick={() => onReview(a.annotation_id, 'reviewed_ok')} disabled={busy}>OK</Button>
              <Button size="sm" onClick={() => onReview(a.annotation_id, 'reviewed_corrected')} disabled={busy}>Corrected</Button>
              <Button size="sm" variant="ghost" onClick={() => onReview(a.annotation_id, 'rejected')} disabled={busy}>Reject</Button>
              <Button size="sm" variant="danger" onClick={() => onDelete(a.annotation_id)} disabled={busy}>Delete</Button>
            </span>
          </div>
          {a.notes && <p className="text-xs text-ink-2"><span className="text-ink-3">notes (free text): </span>{a.notes.content}</p>}
        </li>
      ))}
    </ul>
  )
}
