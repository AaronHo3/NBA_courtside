import { Link } from 'react-router-dom'
import { Badge, Panel, Refetching } from '@/components/ui'
import { useScoutingProfile } from '@/hooks/useApi'
import { TraitTable } from '@/pages/scouting/TraitTable'

/** The player's scouting profile: evidence classes apart, with the snapshot that produced it. */
export function ScoutingPanel({ playerId, season, seasonType }: { playerId: number; season: string; seasonType: string }) {
  const q = useScoutingProfile(playerId, { season, season_type: seasonType })
  const p = q.data?.data
  return (
    <Panel
      question={`What does the scouting profile say for ${season}?`}
      method="Statistical traits from the registry (percentiles within the default cohort), reviewed observations from exported annotations, model estimates only once validated. Interpretations are written by people."
      actions={p && <Badge>snapshot {p.snapshot.snapshot_id.slice(-6)} · data {p.snapshot.data_fingerprint}</Badge>}
    >
      <Refetching loading={q.isFetching} error={q.error} retry={() => { void q.refetch() }}>
        {p && (
          <div className="flex flex-col gap-4">
            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink">Statistical measurements</h3>
              <TraitTable traits={p.traits.statistical} dense />
            </div>
            <div>
              <h3 className="mb-1 text-sm font-semibold text-ink">Reviewed observations</h3>
              <TraitTable traits={p.traits.reviewed_observation} dense />
            </div>
            <p className="text-xs text-ink-3">Model estimates: {p.traits.model_estimate.length ? p.traits.model_estimate.length : 'none validated yet'}. Evidence items: <Link to={`/evidence?player_id=${playerId}`} className="text-accent hover:underline">{p.evidence_ids.length}</Link>.</p>
            <ul className="list-disc pl-5 text-[11px] text-ink-3">{p.limits.map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        )}
      </Refetching>
    </Panel>
  )
}
