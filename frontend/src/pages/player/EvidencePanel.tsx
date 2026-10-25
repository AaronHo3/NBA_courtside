import { Link } from 'react-router-dom'
import { Panel, Refetching } from '@/components/ui'
import { EvidenceList } from '@/components/evidence/EvidenceList'
import { useEvidence } from '@/hooks/useApi'

/** Evidence items about this player, each labelled by class; the library page holds the full list and the footage. */
export function EvidencePanel({ playerId }: { playerId: number }) {
  const q = useEvidence({ player_id: playerId, limit: 25 })
  const total = q.data?.meta.total ?? 0
  return (
    <Panel
      question="What evidence is on record for this player?"
      method="Clip references point at footage without asserting anything; reviewed observations are human labels that passed review; statistics and model estimates are shown with their own class. Items never mix classes."
      actions={<Link to={`/evidence?player_id=${playerId}`} className="text-xs text-accent hover:underline">Open in evidence library ({total})</Link>}
    >
      <Refetching loading={q.isFetching} error={q.error} retry={() => { void q.refetch() }}>
        <EvidenceList items={q.data?.data ?? []} emptyText="No evidence items yet. Link footage to this player's events or annotate a clip." />
      </Refetching>
    </Panel>
  )
}
