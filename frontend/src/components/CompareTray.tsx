import { Link } from 'react-router-dom'
import { useCompare, MAX_COMPARE } from '@/store/compare'
import { useChartTheme } from '@/components/charts/Plot'
import { Button } from './ui'

export function CompareTray() {
  const { players, remove, clear } = useCompare()
  const { series } = useChartTheme()
  if (!players.length) return <span className="text-xs text-ink-3">Add players to compare (up to {MAX_COMPARE}).</span>
  return (
    <div className="flex flex-wrap items-center gap-1.5" aria-label="Comparison group">
      {players.map((p, i) => (
        <span key={p.player_id} className="pop-in inline-flex items-center gap-1.5 rounded-full border border-line-strong bg-surface pl-1.5 pr-1 text-xs">
          <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: series[i % series.length] }} />
          {p.full_name}
          <button aria-label={`Remove ${p.full_name} from comparison`} onClick={() => remove(p.player_id)} className="h-4 w-4 rounded-full text-ink-3 hover:text-critical">×</button>
        </span>
      ))}
      <Link to={`/compare?ids=${players.map((p) => p.player_id).join(',')}`} className="text-xs font-medium text-accent hover:underline">Compare {players.length}</Link>
      <Button size="sm" variant="ghost" onClick={clear}>Clear</Button>
    </div>
  )
}
