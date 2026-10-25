import { Link } from 'react-router-dom'
import type { CategoryDef, MatchupOddsView } from '@/fantasy/api/types'
import { StatTile } from '@/components/ui'

/** The user's matchup this week: odds, expected categories and per-category probabilities. Odds are simulated projections, not results. */
export function MatchupSummary({ odds, me, categories, names, href }: { odds: MatchupOddsView; me: string; categories: CategoryDef[]; names: Record<string, string>; href: string }) {
  const amUser = odds.manager_a === me
  const pMe = amUser ? odds.p_win_a : odds.p_win_b
  const pThem = amUser ? odds.p_win_b : odds.p_win_a
  const expMe = amUser ? odds.expected_a : odds.expected_b
  const expThem = amUser ? odds.expected_b : odds.expected_a
  const them = amUser ? odds.manager_b : odds.manager_a
  const favoured = pMe >= pThem
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-3">Week {odds.period} · projected</p>
          <p className="display text-[22px] font-semibold text-ink">{names[me] ?? me} <span className="text-ink-3">vs</span> {names[them] ?? them}</p>
        </div>
        <Link to={href} className="text-xs font-medium text-accent hover:underline">Full matchup →</Link>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <StatTile label="Your win chance" value={`${Math.round(pMe * 100)}%`} tone={favoured ? 'pos' : 'neg'} size="lg" sub={`tie ${Math.round(odds.p_tie * 100)}% · ${names[them] ?? them} ${Math.round(pThem * 100)}%`} />
        <StatTile label="Expected categories" value={`${expMe.toFixed(1)}–${expThem.toFixed(1)}`} sub="of the scored categories" />
        <StatTile label="Games this week" value={`${amUser ? odds.games_a : odds.games_b} · ${amUser ? odds.games_b : odds.games_a}`} sub="yours · theirs" />
      </div>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {categories.map((c) => {
          const pa = odds.cat_p_a[c.key]
          const p = pa == null ? null : amUser ? pa : 1 - pa
          return (
            <li key={c.key} className="flex items-center gap-2 text-xs">
              <span className="w-28 shrink-0 text-ink-2">{c.label}{c.higher_is_better ? '' : <span className="text-ink-4"> ↓</span>}</span>
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-raised" aria-hidden="true">
                {p != null && <span className={p >= 0.5 ? 'absolute inset-y-0 left-0 rounded-full bg-pos' : 'absolute inset-y-0 left-0 rounded-full bg-neg'} style={{ width: `${p * 100}%` }} />}
              </span>
              <span className="w-10 text-right tnum text-ink">{p == null ? '—' : `${Math.round(p * 100)}%`}</span>
            </li>
          )
        })}
      </ul>
      {odds.notes.length > 0 && <ul className="list-disc pl-4 text-[11px] text-ink-3">{odds.notes.slice(0, 3).map((n) => <li key={n}>{n}</li>)}</ul>}
    </div>
  )
}
