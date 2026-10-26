import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, EmptyState, ErrorState, Panel, PlayerIdentity, Skeleton } from '@/components/ui'
import { Disclosure } from '@/components/ui/Disclosure'
import type { SeasonOverview } from '@/fantasy/api/types'
import { useStatus } from '@/hooks/useApi'
import { fantasyHref } from '@/lib/fantasyBridge'
import { useRecent } from '@/store/recent'
import { FeatureCard } from './overview/FeatureCard'
import { managerName, weakestCategories } from './overview/format'
import { MatchupSummary } from './overview/MatchupSummary'
import { NextActions, type NextAction } from './overview/NextActions'
import { RankOutlook } from './overview/RankOutlook'
import { TrackRecord } from './overview/TrackRecord'
import { useOverviewData } from './overview/useOverviewData'

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rise-in border-t border-line pt-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-meta font-semibold uppercase tracking-wide text-ink-3">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}

/** The matchup feature, or why there is none (bye week, nothing scheduled, odds not simulated yet). */
function MatchupBlock({ ov, userId, names }: { ov: SeasonOverview; userId: string | null; names: Record<string, string> }) {
  const m = ov.user_matchup
  if (m?.odds && userId) return <MatchupSummary odds={m.odds} me={userId} categories={ov.league_categories} names={names} />
  const me = userId ? `${managerName(names, userId)} (you)` : 'You'
  const why = !m ? `No matchup is scheduled for you in week ${ov.current_period}.` : !m.away_manager_id ? `${me} · bye week: no opponent this period, so there are no odds to show.` : 'Odds for this matchup have not been simulated yet; sync the league to refresh them.'
  return <p data-testid="matchup-none" className="text-sm text-ink-2">{why}</p>
}

function buildNextActions(sid: string, ov: SeasonOverview, userId: string | null, period: number, names: Record<string, string>): NextAction[] {
  const me = ov.power.find((p) => p.is_user)
  const weak = me ? weakestCategories(me, ov.league_categories).map((w) => w.label) : []
  const opp = ov.user_matchup?.away_manager_id && userId ? (ov.user_matchup.home_manager_id === userId ? ov.user_matchup.away_manager_id : ov.user_matchup.home_manager_id) : null
  const actions: NextAction[] = [
    { label: 'Review free agents', detail: weak.length ? `Your weakest: ${weak.join(', ')}` : undefined, href: fantasyHref('season', sid, { tab: 'free-agents' }) },
  ]
  if (userId) actions.push({ label: "See this week's performers", detail: `Your roster, week ${period}`, href: fantasyHref('performers', sid, { team: userId, week: String(period) }) })
  actions.push({ label: 'Open my matchup', detail: opp ? `vs ${managerName(names, opp)}` : ov.user_matchup ? 'Bye week' : undefined, href: fantasyHref('season', sid, { tab: 'matchups' }) })
  return actions
}

export default function Overview() {
  const { ctx, overview, performers, predictions, userId, linked } = useOverviewData()
  const status = useStatus()
  const recent = useRecent((s) => s.players)
  const sid = ctx.sessionId
  // Until the session's state arrives, isComplete defaults to false: show a skeleton, not "Draft in progress".
  const pending = ctx.isLoading
  const ov = overview.data
  const names = ov?.manager_names ?? {}
  const myPower = ov?.power.find((p) => p.is_user)
  const freshness = status.data?.data
  const period = performers.data?.period ?? ov?.current_period ?? 1
  const performersHref = sid && userId ? fantasyHref('performers', sid, { team: userId, week: String(period) }) : ''
  const nextActions = sid && ov && linked ? buildNextActions(sid, ov, userId, period, names) : []
  const lede = sid
    ? linked && ov
      ? `${ov.league_name ?? 'Your league'} · week ${ov.current_period}${ov.synced_at ? ` · synced ${new Date(ov.synced_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}`
      : 'Your fantasy league this week, who carried it, and where to pick up.'
    : 'Your fantasy league this week, who carried it, and where to pick up.'

  return (
    <>
      <PageHeader
        title="Overview"
        lede={lede}
        chips={<>{ctx.isDemo && <Badge tone="warning">Demo data</Badge>}{freshness && <span className="text-xs text-ink-3">NBA data: {freshness.namespace}{freshness.generated_at ? ` · updated ${new Date(freshness.generated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</span>}</>}
        actions={sid && !pending ? <Link to={fantasyHref(ctx.isComplete ? 'season' : 'draft', sid)} className="t-fast rounded-[var(--radius-control)] bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-[var(--c-accent-hover)]">{ctx.isComplete ? 'Open my league' : 'Continue draft'}</Link> : undefined}
      />

      {!sid && (
        <EmptyState title="No fantasy session open" body="Create or resume a draft session in the copilot to see your league here." action={<Link to="/fantasy#/setup" className="text-sm font-medium text-accent hover:underline">Open setup →</Link>} />
      )}
      {sid && pending && <Skeleton lines={5} className="max-w-xl" />}
      {sid && !pending && !ctx.isComplete && (
        <EmptyState title="Draft in progress" body="The league view unlocks once every pick is recorded." action={<Link to={fantasyHref('draft', sid)} className="text-sm font-medium text-accent hover:underline">Back to the draft →</Link>} />
      )}
      {sid && ctx.isComplete && overview.isLoading && <Skeleton lines={5} className="max-w-xl" />}
      {sid && ctx.isComplete && overview.error && <ErrorState error={overview.error} retry={() => overview.refetch()} />}
      {sid && ctx.isComplete && ov && !linked && (
        <EmptyState title="Not linked to an ESPN league" body="Link the session to your public ESPN league to get matchup odds, results and performers." action={<Link to={fantasyHref('season', sid)} className="text-sm font-medium text-accent hover:underline">Link and sync →</Link>} />
      )}

      {sid && ov && linked && (
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 lg:grid-cols-12">
            <Panel question="This week's matchup" className="lg:col-span-8" actions={<Link to={fantasyHref('season', sid, { tab: 'matchups' })} className="text-xs text-accent hover:underline">Full matchup →</Link>}>
              <MatchupBlock ov={ov} userId={userId} names={names} />
            </Panel>
            <Panel question="Season outlook" className="lg:col-span-4" actions={<Link to={fantasyHref('season', sid, { tab: 'power' })} className="text-xs text-accent hover:underline">All teams →</Link>}>
              {myPower ? (
                <RankOutlook power={myPower} teams={ov.power.length} categories={ov.league_categories}>
                  <div className="flex flex-col gap-2 border-t border-line pt-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-meta font-semibold uppercase tracking-wide text-ink-3">Projection track record</h3>
                      <Link to={fantasyHref('season', sid, { tab: 'predictions' })} className="text-xs text-accent hover:underline">Details →</Link>
                    </div>
                    {predictions.isLoading && <Skeleton lines={2} />}
                    {predictions.error && <ErrorState error={predictions.error} retry={() => predictions.refetch()} />}
                    {predictions.data && <TrackRecord data={predictions.data} />}
                  </div>
                </RankOutlook>
              ) : <p className="text-sm text-ink-3">Power rankings need a synced league.</p>}
            </Panel>
          </div>

          <div className="grid gap-5 md:grid-cols-3">
            {performers.isLoading && <><Skeleton className="h-28" /><Skeleton className="h-28" /></>}
            {performers.error && <div className="md:col-span-2"><ErrorState error={performers.error} retry={() => performers.refetch()} /></div>}
            {performers.data && userId && (
              <>
                <FeatureCard title="Leading contributor this week" row={performers.data.contributors[0]} metric="contribution" href={performersHref} />
                <FeatureCard title="Biggest overperformer this week" row={performers.data.overperformers[0]} metric="over_expected" href={performersHref} />
              </>
            )}
            {!performers.isLoading && !performers.error && !(performers.data && userId) && <div className="hidden md:col-span-2 md:block" />}
            <NextActions actions={nextActions} />
          </div>
        </div>
      )}

      <Section title="Recently viewed players" aside={recent.length ? <Link to="/explorer" className="text-xs text-accent hover:underline">Explore all →</Link> : undefined}>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-3">Profiles you open will appear here. <Link to="/explorer" className="text-accent hover:underline">Start in the explorer</Link> or press <kbd className="rounded border border-line-strong px-1 font-mono text-meta">⌘K</kbd>.</p>
        ) : (
          <ul data-testid="recent-players" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {recent.map((p) => <li key={p.player_id} className="shrink-0 rounded-full border border-line bg-surface py-1 pl-1 pr-3"><PlayerIdentity playerId={p.player_id} name={p.full_name} team={p.team_abbreviation} position={p.position} size="xs" /></li>)}
          </ul>
        )}
      </Section>

      {sid && ov && linked && (
        <Disclosure summary="How the odds are made" testId="overview-method" className="mt-5">
          <div className="flex flex-col gap-2">
            <p>Win, tie and lose chances, expected categories and the per-category chances are simulated from projections for the games each roster has scheduled this week. They are projections, not results, and not ESPN's running totals. Expected categories in the season outlook are per week, simulated against every team in the league; the vulnerable categories are the three with your lowest simulated chance.</p>
            {ov.user_matchup?.odds && ov.user_matchup.odds.notes.length > 0 && (
              <ul className="list-disc pl-5 text-xs text-ink-3">{ov.user_matchup.odds.notes.map((n) => <li key={n}>{n}</li>)}</ul>
            )}
            {performers.data && <p className="text-xs text-ink-3">Contribution is in copilot units (category standard deviations × games) from ESPN-counted box scores; "expected" is the frozen projection × games played. Source: {performers.data.source}.</p>}
          </div>
        </Disclosure>
      )}
    </>
  )
}
