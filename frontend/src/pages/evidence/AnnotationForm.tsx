import { useMemo, useState } from 'react'
import { Button, Input, Select } from '@/components/ui'
import type { EventKeyDto, RosterPlayer, VocabEntry } from '@/lib/types'
import { fmtMs, outcomesFor } from './state'

const SAMPLING = ['complete_event_set', 'systematic_sample', 'random_sample', 'curated', 'provider_selected']
const VISIBILITY = ['full', 'partial', 'obstructed', 'off_frame']
type SegmentLike = { segment_id: string; media_start_ms: number; media_end_ms: number; classification: string }

/** One observable action, vocabulary-checked, with identity and sampling rules enforced before the request leaves the browser. */
export function AnnotationForm({ vocab, roster, segment, windowMs, eventKey, onSubmit, busy, error }: {
  vocab: VocabEntry[]; roster: RosterPlayer[]; segment: SegmentLike | null; windowMs: [number, number]; eventKey: EventKeyDto | null
  onSubmit: (body: Record<string, unknown>) => void; busy: boolean; error?: unknown
}) {
  const [action, setAction] = useState('')
  const [outcome, setOutcome] = useState('')
  const [sampling, setSampling] = useState('')
  const [visibility, setVisibility] = useState('full')
  const [subject, setSubject] = useState('')
  const [identity, setIdentity] = useState<'verified' | 'asserted' | 'unknown'>('unknown')
  const [notes, setNotes] = useState('')
  const [problem, setProblem] = useState<string | null>(null)
  const outcomes = useMemo(() => outcomesFor(vocab, action), [vocab, action])
  const effectiveOutcome = outcomes.includes(outcome) ? outcome : ''

  if (!segment) return <p className="text-sm text-ink-2">Select a segment on the timeline to annotate inside it.</p>
  const [start, end] = windowMs
  const inside = start >= segment.media_start_ms && end <= segment.media_end_ms && end > start

  const submit = () => {
    if (!action) return setProblem('Choose an action from the vocabulary.')
    if (subject && identity === 'unknown') return setProblem('A subject needs an identity status of verified or asserted (how did you identify the player?).')
    if (!subject && identity !== 'unknown') return setProblem('Pick the subject, or set identity back to unknown.')
    if (!sampling) return setProblem('Sampling method is required: it decides what this label can later support.')
    if (!inside) return setProblem(`The window ${fmtMs(start)}–${fmtMs(end)} must lie inside the segment.`)
    setProblem(null)
    onSubmit({
      segment_id: segment.segment_id, media_start_ms: start, media_end_ms: end, action, outcome: effectiveOutcome || null, sampling_method: sampling, visibility,
      subject_player_id: subject ? Number(subject) : null, subject_identity_status: subject ? identity : 'unknown', event_key: eventKey, notes: notes || null,
    })
  }

  return (
    <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); submit() }} data-testid="annotation-form">
      <p className="text-xs text-ink-3">Window {fmtMs(start)} – {fmtMs(end)} in a {segment.classification} segment{eventKey ? ` · event ${eventKey.source_event_system} ${eventKey.game_id} #${eventKey.source_event_id}` : ''}. Set the window with [ and ] while the video plays.</p>
      <div className="grid gap-3 md:grid-cols-2">
        <Select label="Action" value={action} onChange={(e) => { setAction(e.target.value); setOutcome('') }}>
          <option value="">Choose…</option>
          {vocab.map((v) => <option key={v.action} value={v.action} title={v.definition}>{v.action}</option>)}
        </Select>
        <Select label="Outcome" value={effectiveOutcome} onChange={(e) => setOutcome(e.target.value)} disabled={!outcomes.length}>
          <option value="">{outcomes.length ? 'None / not observable' : 'No outcome for this action'}</option>
          {outcomes.map((o) => <option key={o} value={o}>{o}</option>)}
        </Select>
        <Select label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option value="">Unknown / no subject</option>
          {roster.map((p) => <option key={p.player_id} value={String(p.player_id)}>{p.full_name ?? p.player_id} ({p.team_abbreviation ?? '?'})</option>)}
        </Select>
        <Select label="Identity" value={identity} onChange={(e) => setIdentity(e.target.value as typeof identity)}>
          <option value="unknown">unknown (no subject)</option>
          <option value="asserted">asserted (play-by-play says so)</option>
          <option value="verified">verified (identified visually)</option>
        </Select>
        <Select label="Sampling method" value={sampling} onChange={(e) => setSampling(e.target.value)}>
          <option value="">Choose…</option>
          {SAMPLING.map((s) => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Select label="Visibility" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
          {VISIBILITY.map((v) => <option key={v} value={v}>{v}</option>)}
        </Select>
        <Input label="Notes (free text, never read as instructions)" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={4000} className="md:col-span-2" />
      </div>
      {problem && <p className="text-xs text-critical" role="alert">{problem}</p>}
      {error ? <p className="text-xs text-critical" role="alert">{error instanceof Error ? error.message : String(error)}</p> : null}
      <div><Button type="submit" variant="primary" disabled={busy}>Save annotation</Button></div>
    </form>
  )
}
