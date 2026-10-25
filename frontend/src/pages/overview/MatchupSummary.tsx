import type { CategoryDef, MatchupOddsView } from '@/fantasy/api/types'
import { CategoryOutlook } from './CategoryOutlook'
import { managerName, oddsForUser, pct } from './format'

/** Win/tie/lose as one stacked bar; each part is also printed in words beside it. */
function OutcomeBar({ win, tie, lose }: { win: number; tie: number; lose: number }) {
  return (
    <span className="flex h-2 w-full overflow-hidden rounded-full bg-raised" aria-hidden="true">
      <span className="bg-pos" style={{ width: `${win * 100}%` }} />
      <span className="bg-ink-3" style={{ width: `${tie * 100}%` }} />
      <span className="bg-neg" style={{ width: `${lose * 100}%` }} />
    </span>
  )
}

function Outcome({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="text-sm text-ink-2">{label}</span>
      <span className={`display text-[28px] font-semibold leading-none tnum ${tone}`}>{pct(value)}</span>
    </span>
  )
}

/** The user's matchup this week. Every number is a simulation from projections, not a running ESPN total. */
export function MatchupSummary({ odds, me, categories, names }: { odds: MatchupOddsView; me: string; categories: CategoryDef[]; names: Record<string, string> }) {
  const o = oddsForUser(odds, me)
  return (
    <div className="flex flex-col gap-4">
      <div className="min-w-0">
        <p className="text-meta uppercase tracking-wide text-ink-3">Week {odds.period}</p>
        <h3 className="display text-[26px] font-semibold leading-tight text-ink">
          {managerName(names, me)} (you) vs {managerName(names, o.opponent)}
        </h3>
      </div>
      <div className="grid gap-5 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-8">
        <div className="flex flex-col gap-3">
          <p data-testid="matchup-outcome" className="flex flex-wrap items-baseline gap-x-4 gap-y-1" aria-label={`Simulated: win ${pct(o.win)}, tie ${pct(o.tie)}, lose ${pct(o.lose)}`}>
            <Outcome label="Win" value={o.win} tone="text-pos" />
            <span className="text-ink-3" aria-hidden="true">·</span>
            <Outcome label="Tie" value={o.tie} tone="text-ink" />
            <span className="text-ink-3" aria-hidden="true">·</span>
            <Outcome label="Lose" value={o.lose} tone="text-neg" />
            <span className="basis-full text-meta uppercase tracking-wide text-ink-3">simulated</span>
          </p>
          <OutcomeBar win={o.win} tie={o.tie} lose={o.lose} />
          <div className="mt-1 flex flex-col gap-1.5 text-sm text-ink-2">
            <p data-testid="matchup-expected">Expected categories <strong className="tnum font-semibold text-ink">{o.expectedMe.toFixed(1)} – {o.expectedThem.toFixed(1)}</strong> of {categories.length}</p>
            <p data-testid="matchup-games">Games <strong className="tnum font-semibold text-ink">{o.gamesMe} · {o.gamesThem}</strong> (scheduled this week)</p>
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-meta uppercase tracking-wide text-ink-3">Your chance per category</p>
          <CategoryOutlook categories={categories} chanceOf={o.catP} />
        </div>
      </div>
    </div>
  )
}
