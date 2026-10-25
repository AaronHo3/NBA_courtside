import { Link } from 'react-router-dom'
import { Badge, Panel } from '@/components/ui'
import { useEvidence } from '@/hooks/useApi'
import type { ComparePlayer } from '@/store/compare'

function Row({ p, season }: { p: ComparePlayer; season: string }) {
  const refs = useEvidence({ player_id: p.player_id, kind: 'external_reference', limit: 1 })
  const all = useEvidence({ player_id: p.player_id, limit: 1 })
  const total = all.data?.meta.total ?? 0
  return (
    <tr className="border-b border-line/60">
      <td className="py-1 pr-3 text-ink"><Link to={`/players/${p.player_id}?season=${season}`} className="hover:underline">{p.full_name}</Link></td>
      <td className="tnum py-1 pr-3 text-right">{total}</td>
      <td className="tnum py-1 pr-3 text-right">{refs.data?.meta.total ?? 0}</td>
      <td className="py-1"><Badge tone="neutral">none yet</Badge></td>
    </tr>
  )
}

/** Evidence coverage per compared player; reviewed observations do not exist until annotations are exported. */
export function EvidencePanel({ players, season }: { players: ComparePlayer[]; season: string }) {
  return (
    <Panel question="What evidence exists for each player?" method="Counts from the evidence registry of the active namespace. Clip references point at the provider's site; reviewed observations require exported annotations.">
      <table className="w-full text-sm">
        <thead><tr className="border-b border-line text-left text-xs text-ink-3"><th className="py-1 pr-3 font-medium">Player</th><th className="py-1 pr-3 text-right font-medium">Evidence items</th><th className="py-1 pr-3 text-right font-medium">Clip references</th><th className="py-1 font-medium">Reviewed observations</th></tr></thead>
        <tbody>{players.map((p) => <Row key={p.player_id} p={p} season={season} />)}</tbody>
      </table>
    </Panel>
  )
}
