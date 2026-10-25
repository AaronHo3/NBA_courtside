import { Link } from 'react-router-dom'
import { Badge, EmptyState, ErrorState, Loading } from '@/components/ui'
import { EvidenceList } from '@/components/evidence/EvidenceList'
import { clockLabel, eventTitle, periodLabel } from '@/components/evidence/helpers'
import { useEventDetail } from '@/hooks/useApi'

export function EventDetailPanel({ system, gameId, eventId }: { system: string; gameId: string; eventId: number }) {
  const res = useEventDetail(system, gameId, eventId)
  if (res.isLoading) return <Loading label="Loading event" />
  if (res.error) return <ErrorState error={res.error} retry={() => res.refetch()} />
  const d = res.data?.data
  if (!d) return <EmptyState title="Event not found" />
  const e = d.event
  return (
    <div className="flex flex-col gap-3" data-testid="event-detail">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-base font-medium text-ink">{eventTitle(e)}</span>
        <span className="text-sm text-ink-2">{periodLabel(e.period)} · {clockLabel(e.clock_ms)}</span>
        {d.duplicates.length > 1 && <Badge tone="warning">{d.duplicates.length} source rows share this action number</Badge>}
        {d.shot && <Badge tone={d.shot.map.confidence === 'exact' ? 'good' : 'warning'}>shot {d.shot.game_event_id} · {d.shot.map.confidence}</Badge>}
      </div>
      {e.person_id !== null && <p className="text-xs text-ink-3">Actor: <Link to={`/players/${e.person_id}`} className="text-accent hover:underline">player {e.person_id}</Link>{e.team_id ? ` · team ${e.team_id}` : ''}. Participants from the source only: {d.participants.map((p) => p.role).join(', ') || 'none'}.</p>}
      <EvidenceList items={d.evidence} emptyText="No clip reference registered for this event." />
    </div>
  )
}
