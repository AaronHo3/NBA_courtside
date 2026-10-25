import { Link } from 'react-router-dom'
import { Badge, Button, EmptyState, ErrorState, Loading } from '@/components/ui'
import { EvidenceList } from '@/components/evidence/EvidenceList'
import { clockLabel, eventTitle, mapMethodLabel, periodLabel } from '@/components/evidence/helpers'
import { useShotEvidence } from '@/hooks/useApi'

/** Play-by-play event and evidence behind one shot, resolved through event_id_map on the server. */
export function ShotEvidencePanel({ gameId, gameEventId, onClose }: { gameId: string; gameEventId: number; onClose: () => void }) {
  const res = useShotEvidence(gameId, gameEventId)
  const header = (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm font-medium text-ink">Shot {gameEventId} · game {gameId}</span>
      <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
    </div>
  )
  if (res.isLoading) return <div className="flex flex-col gap-3">{header}<Loading label="Loading event" /></div>
  if (res.error) return <div className="flex flex-col gap-3">{header}<ErrorState error={res.error} retry={() => res.refetch()} /></div>
  const data = res.data?.data ?? null
  const meta = res.data?.meta
  if (!data) {
    return (
      <div className="flex flex-col gap-3" data-testid="shot-evidence">
        {header}
        <EmptyState title="No play-by-play event is mapped for this shot" body={meta?.reason ?? 'Events for this game have not been ingested.'} />
      </div>
    )
  }
  const e = data.event
  return (
    <div className="flex flex-col gap-3" data-testid="shot-evidence">
      {header}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-base font-medium text-ink">{eventTitle(e)}</span>
        <span className="text-sm text-ink-2">{periodLabel(e.period)} · {clockLabel(e.clock_ms)}</span>
        <Badge tone={meta?.confidence === 'exact' ? 'good' : 'warning'}>{mapMethodLabel(meta?.event_id_map_method ?? null, meta?.confidence ?? null)}</Badge>
        <Link to={`/games/${gameId}?ev=${e.source_event_system}:${e.source_event_id}`} className="text-sm text-accent hover:underline">Game page</Link>
      </div>
      {data.participants.length > 0 && (
        <p className="text-xs text-ink-3">
          Participants from the source: {data.participants.map((p) => `${p.role} · player ${p.person_id}`).join('; ')}. Defenders and lineups are not inferred.
        </p>
      )}
      <EvidenceList items={data.evidence} emptyText="No clip reference registered for this event yet." />
    </div>
  )
}
