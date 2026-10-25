import { useState } from 'react'
import { Badge, Button, Input, Select } from '@/components/ui'
import type { Segment, SegmentClassification } from '@/lib/types'
import { CLASSIFICATION_LABEL, REVIEW_LABEL, fmtMs } from './state'

const CLASSES: SegmentClassification[] = ['live', 'replay', 'unknown', 'non_game']

export function SegmentList({ segments, selected, windowMs, canDetect, onSelect, onCreate, onPatch, onDetect, busy }: {
  segments: Segment[]; selected: string | null; windowMs: [number, number] | null; canDetect: boolean
  onSelect: (id: string | null) => void; onCreate: (body: Record<string, unknown>) => void; onPatch: (id: string, body: Record<string, unknown>) => void; onDetect: () => void; busy: boolean
}) {
  const [cls, setCls] = useState<SegmentClassification>('live')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const useWindow = () => { if (windowMs) { setStart(String(windowMs[0])); setEnd(String(windowMs[1])) } }
  const create = () => {
    const s = Number(start), e = Number(end)
    if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return
    onCreate({ media_start_ms: Math.round(s), media_end_ms: Math.round(e), classification: cls })
    setStart(''); setEnd('')
  }
  return (
    <div className="flex flex-col gap-3" data-testid="segment-list">
      <div className="flex flex-wrap items-end gap-2">
        <Input label="Start (ms)" value={start} onChange={(e) => setStart(e.target.value)} inputMode="numeric" className="w-28" />
        <Input label="End (ms)" value={end} onChange={(e) => setEnd(e.target.value)} inputMode="numeric" className="w-28" />
        <Select label="Classification" value={cls} onChange={(e) => setCls(e.target.value as SegmentClassification)}>
          {CLASSES.map((c) => <option key={c} value={c}>{CLASSIFICATION_LABEL[c]}</option>)}
        </Select>
        <Button size="sm" onClick={useWindow} disabled={!windowMs}>Use [ ] window</Button>
        <Button size="sm" variant="primary" onClick={create} disabled={busy}>Add segment</Button>
        <Button size="sm" onClick={onDetect} disabled={busy || !canDetect} title={canDetect ? 'ffmpeg scene detection proposes unreviewed segments' : 'needs the thumbnail permission and ffmpeg'}>Detect cuts</Button>
      </div>
      {!segments.length && <p className="text-sm text-ink-2">No segments. Mark the live broadcast stretches first; anchors and annotations live inside segments.</p>}
      <ul className="flex flex-col gap-1">
        {segments.map((s) => (
          <li key={s.segment_id} data-selected={s.segment_id === selected} className={`flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border p-2 text-sm ${s.segment_id === selected ? 'border-ink' : 'border-line'}`}>
            <button type="button" className="tnum text-left text-ink hover:underline" onClick={() => onSelect(s.segment_id === selected ? null : s.segment_id)}>{fmtMs(s.media_start_ms)} – {fmtMs(s.media_end_ms)}</button>
            <Select aria-label="Segment classification" value={s.classification} onChange={(e) => onPatch(s.segment_id, { classification: e.target.value })} disabled={busy}>
              {CLASSES.map((c) => <option key={c} value={c}>{CLASSIFICATION_LABEL[c]}</option>)}
            </Select>
            <Badge tone={s.review_status === 'reviewed_ok' ? 'good' : s.review_status === 'rejected' ? 'critical' : 'neutral'}>{REVIEW_LABEL[s.review_status]}</Badge>
            <span className="text-meta text-ink-3">{s.origin}{s.model_version ? ` ${s.model_version}` : ''}</span>
            <span className="ml-auto flex gap-1">
              <Button size="sm" onClick={() => onPatch(s.segment_id, { review_status: 'reviewed_ok', reviewer: 'user' })} disabled={busy}>OK</Button>
              <Button size="sm" variant="ghost" onClick={() => onPatch(s.segment_id, { review_status: 'rejected', reviewer: 'user' })} disabled={busy}>Reject</Button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
