import { useState } from 'react'
import { Button, Input, Segmented } from '@/components/ui'
import { useGameEvents } from '@/hooks/useApi'
import { clockLabel, periodLabel } from '@/components/evidence/helpers'
import type { Segment } from '@/lib/types'
import { fmtMs } from './state'

/** Tie a play-by-play event to the selected segment: by hand (the [ ] window) or by interpolation between anchors. */
export function LinkEventDialog({ gameId, onGameId, segment, windowMs, onLink, busy, error }: {
  gameId: string; onGameId: (g: string) => void; segment: Segment | null; windowMs: [number, number] | null
  onLink: (args: { gameId: string; eventId: number; body: Record<string, unknown> }) => void; busy: boolean; error?: unknown
}) {
  const [mode, setMode] = useState<'interpolated' | 'manual'>('interpolated')
  const [eventId, setEventId] = useState('')
  const valid = /^[0-9A-Z]\d{9}$/.test(gameId)
  const events = useGameEvents(valid ? gameId : null, { is_field_goal: true, limit: 200 })
  const submit = () => {
    const id = Number(eventId)
    if (!segment || !valid || !Number.isFinite(id)) return
    const body: Record<string, unknown> = { asset_id: segment.asset_id, segment_id: segment.segment_id, mode }
    if (mode === 'manual' && windowMs) { body.media_start_ms = windowMs[0]; body.media_end_ms = windowMs[1] }
    onLink({ gameId, eventId: id, body })
  }
  return (
    <div className="flex flex-col gap-3" data-testid="link-event">
      <div className="flex flex-wrap items-end gap-2">
        <Input label="Game id" value={gameId} onChange={(e) => onGameId(e.target.value.trim())} placeholder="0022400061" className="w-36" />
        <Input label="Event id" value={eventId} onChange={(e) => setEventId(e.target.value)} inputMode="numeric" className="w-24" list="event-options" />
        <Segmented ariaLabel="Placement" value={mode} onChange={setMode} options={[{ value: 'interpolated', label: 'Interpolate', title: 'between this segment\'s anchors' }, { value: 'manual', label: 'Manual window', title: 'use the [ ] window' }]} />
        <Button size="sm" variant="primary" onClick={submit} disabled={busy || !segment || !valid || !eventId || (mode === 'manual' && !windowMs)}>Link event</Button>
      </div>
      {!segment && <p className="text-xs text-ink-2">Select the segment that shows the event first.</p>}
      {mode === 'manual' && windowMs && <p className="text-xs text-ink-3">Window {fmtMs(windowMs[0])} – {fmtMs(windowMs[1])}</p>}
      {events.data && (
        <datalist id="event-options">
          {events.data.data.map((e) => <option key={e.source_event_id} value={String(e.source_event_id)}>{periodLabel(e.period)} {clockLabel(e.clock_ms)} {e.description ?? e.action_type ?? ''}</option>)}
        </datalist>
      )}
      {events.data && !events.data.data.length && valid && <p className="text-xs text-ink-2">No play-by-play for {gameId} in this namespace; ingest it with the CLI (`FAMILIES=events GAME_IDS=…`).</p>}
      {error ? <p className="text-xs text-critical" role="alert">{error instanceof Error ? error.message : String(error)}</p> : null}
    </div>
  )
}
