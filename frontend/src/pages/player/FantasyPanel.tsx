import { Link } from 'react-router-dom'
import { EmptyState, Panel } from '@/components/ui'
import { fantasyHref, useFantasyPlayer } from '@/lib/fantasyBridge'

const ROWS: Array<{ key: string; label: string; digits?: number; lower?: boolean }> = [
  { key: 'GP', label: 'Games', digits: 0 }, { key: 'MIN', label: 'Minutes' }, { key: 'PTS', label: 'Points' }, { key: 'REB', label: 'Rebounds' }, { key: 'AST', label: 'Assists' },
  { key: 'STL', label: 'Steals' }, { key: 'BLK', label: 'Blocks' }, { key: 'FG3M', label: 'Threes made' }, { key: 'TOV', label: 'Turnovers', lower: true },
]

/** The copilot's per-game projection for this player. Percentages are makes ÷ attempts, never averaged. */
export function FantasyPanel({ playerId }: { playerId: number }) {
  const { player, hasSession, sessionId, isLoading } = useFantasyPlayer(playerId)
  if (!hasSession) return <EmptyState title="No fantasy session open" body="Open or create a copilot session to see this player's projection, eligibility and ownership." action={<Link to="/fantasy#/setup" className="text-sm font-medium text-accent hover:underline">Open setup →</Link>} />
  if (isLoading) return <p className="text-sm text-ink-3">Loading projection…</p>
  if (!player) return <EmptyState title="Not in the active snapshot" body="The copilot's projection snapshot does not include this player." />
  const pg = player.per_game, sd = player.per_game_sd
  const pct = (m: string, a: string) => (pg[a] ? (pg[m] / pg[a]) : null)
  const fg = pct('FGM', 'FGA'), ft = pct('FTM', 'FTA')
  return (
    <Panel question="What does the copilot project per game?" method={`Projection (copilot snapshot · ${player.projection_source}); ± is one standard deviation where the model has one. ESPN eligibility: ${player.eligible_positions.join('/') || '—'}.`} tone="plain" actions={<Link to={fantasyHref('draft', sessionId)} className="text-xs font-medium text-accent hover:underline">Open in fantasy →</Link>}>
      <table className="w-full max-w-lg text-sm">
        <thead><tr className="text-xs uppercase tracking-wide text-ink-3"><th className="py-1 text-left font-medium">Category</th><th className="py-1 text-right font-medium">Per game</th><th className="py-1 text-right font-medium">± sd</th></tr></thead>
        <tbody>
          {ROWS.filter((r) => pg[r.key] != null).map((r) => (
            <tr key={r.key} className="border-t border-line">
              <td className="py-1 text-ink-2">{r.label}{r.lower ? <span className="text-ink-3"> · lower is better</span> : null}</td>
              <td className="py-1 text-right tnum text-ink">{pg[r.key].toFixed(r.digits ?? 1)}</td>
              <td className="py-1 text-right tnum text-ink-3">{sd[r.key] != null && sd[r.key] > 0 ? `± ${sd[r.key].toFixed(r.digits ?? 1)}` : '—'}</td>
            </tr>
          ))}
          {fg != null && <tr className="border-t border-line"><td className="py-1 text-ink-2">FG% <span className="text-ink-3">({pg.FGM.toFixed(1)} / {pg.FGA.toFixed(1)})</span></td><td className="py-1 text-right tnum text-ink">{(fg * 100).toFixed(1)}%</td><td className="py-1 text-right text-ink-3">—</td></tr>}
          {ft != null && <tr className="border-t border-line"><td className="py-1 text-ink-2">FT% <span className="text-ink-3">({pg.FTM.toFixed(1)} / {pg.FTA.toFixed(1)})</span></td><td className="py-1 text-right tnum text-ink">{(ft * 100).toFixed(1)}%</td><td className="py-1 text-right text-ink-3">—</td></tr>}
        </tbody>
      </table>
    </Panel>
  )
}
