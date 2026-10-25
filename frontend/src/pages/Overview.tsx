import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, EmptyState, ErrorState, PlayerIdentity, Skeleton, StatTile } from '@/components/ui'
import { useStatus } from '@/hooks/useApi'
import { fantasyHref } from '@/lib/fantasyBridge'
import { useRecent } from '@/store/recent'
import { FeatureCard } from './overview/FeatureCard'
import { MatchupSummary } from './overview/MatchupSummary'
import { TrackRecord } from './overview/TrackRecord'
import { useOverviewData } from './overview/useOverviewData'

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="rise-in border-t border-line pt-4">
      <header className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-wide text-ink-3">{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  )
}

export default function Overview() {
  const { ctx, overview, performers, predictions, userId, linked } = useOverviewData()
  const status = useStatus()
  const recent = useRecent((s) => s.players)
  const sid = ctx.sessionId
  const ov = overview.data
  const names = ov?.manager_names ?? {}
  const myPower = ov?.power.find((p) => p.is_user)
  const freshness = status.data?.data
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
        chips={<>{ctx.isDemo && <Badge tone="warning">Demo data</Badge>}{freshness && <span className="text-[11px] text-ink-3">NBA data: {freshness.namespace}{freshness.generated_at ? ` · updated ${new Date(freshness.generated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}</span>}</>}
        actions={sid ? <Link to={fantasyHref(ctx.isComplete ? 'season' : 'draft', sid)} className="t-fast rounded-[var(--radius-control)] bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink hover:bg-[var(--c-accent-hover)]">{ctx.isComplete ? 'Open my league' : 'Continue draft'}</Link> : undefined}
      />

      {!sid && (
        <EmptyState title="No fantasy session open" body="Create or resume a draft session in the copilot to see your league here." action={<Link to="/fantasy#/setup" className="text-sm font-medium text-accent hover:underline">Open setup →</Link>} />
      )}
      {sid && !ctx.isComplete && (
        <EmptyState title="Draft in progress" body="The league view unlocks once every pick is recorded." action={<Link to={fantasyHref('draft', sid)} className="text-sm font-medium text-accent hover:underline">Back to the draft →</Link>} />
      )}
      {sid && ctx.isComplete && overview.isLoading && <Skeleton lines={5} className="max-w-xl" />}
      {sid && ctx.isComplete && overview.error && <ErrorState error={overview.error} retry={() => overview.refetch()} />}
      {sid && ctx.isComplete && ov && !linked && (
        <EmptyState title="Not linked to an ESPN league" body="Link the session to your public ESPN league to get matchup odds, results and performers." action={<Link to={fantasyHref('season', sid)} className="text-sm font-medium text-accent hover:underline">Link and sync →</Link>} />
      )}

      {sid && ov && linked && (
        <div className="grid gap-6 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <Section title="This week's matchup">
              {ov.user_matchup?.odds && userId ? (
                <MatchupSummary odds={ov.user_matchup.odds} me={userId} categories={ov.league_categories} names={names} href={fantasyHref('season', sid, { tab: 'matchups' })} />
              ) : (
                <p className="text-sm text-ink-3">No matchup for you this period{ov.user_matchup && !ov.user_matchup.away_manager_id ? ' (bye week)' : ''}.</p>
              )}
            </Section>
          </div>
          <div className="flex flex-col gap-6 lg:col-span-5">
            <Section title="Power ranking" aside={<Link to={fantasyHref('season', sid, { tab: 'power' })} className="text-xs text-accent hover:underline">All teams →</Link>}>
              {myPower ? (
                <div className="flex flex-wrap gap-x-8 gap-y-3">
                  <StatTile label="Your rank" value={`#${myPower.rank}`} sub={`of ${ov.power.length} teams`} tone="accent" size="lg" />
                  <StatTile label="Expected categories won" value={myPower.expected_cats.toFixed(1)} sub="per week, simulated vs the league" />
                  <StatTile label="Roster" value={myPower.n_players} sub={`${myPower.n_ir} on IR`} />
                </div>
              ) : <p className="text-sm text-ink-3">Power rankings need a synced league.</p>}
            </Section>
            <Section title="Projection track record" aside={<Link to={fantasyHref('season', sid, { tab: 'predictions' })} className="text-xs text-accent hover:underline">Details →</Link>}>
              {predictions.isLoading && <Skeleton lines={3} />}
              {predictions.error && <ErrorState error={predictions.error} retry={() => predictions.refetch()} />}
              {predictions.data && <TrackRecord data={predictions.data} />}
            </Section>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:col-span-12">
            {performers.isLoading && <><Skeleton className="h-28" /><Skeleton className="h-28" /></>}
            {performers.error && <ErrorState error={performers.error} retry={() => performers.refetch()} />}
            {performers.data && userId && (
              <>
                <FeatureCard title="Leading contributor this week" row={performers.data.contributors[0]} metric="contribution" href={fantasyHref('performers', sid, { team: userId, week: String(performers.data.period ?? ov.current_period) })} />
                <FeatureCard title="Biggest overperformer this week" row={performers.data.overperformers[0]} metric="over_expected" href={fantasyHref('performers', sid, { team: userId, week: String(performers.data.period ?? ov.current_period) })} />
              </>
            )}
            {performers.data && <p className="text-[11px] text-ink-3 sm:col-span-2">Contribution is in copilot units (category standard deviations × games) from ESPN-counted box scores; "expected" is the frozen projection × games played. Source: {performers.data.source}.</p>}
          </div>
        </div>
      )}

      <Section title="Recently viewed players" aside={recent.length ? <Link to="/explorer" className="text-xs text-accent hover:underline">Explore all →</Link> : undefined}>
        {recent.length === 0 ? (
          <p className="text-sm text-ink-3">Profiles you open will appear here. <Link to="/explorer" className="text-accent hover:underline">Start in the explorer</Link> or press <kbd className="rounded border border-line-strong px-1 font-mono text-[10px]">⌘K</kbd>.</p>
        ) : (
          <ul className="flex flex-wrap gap-x-6 gap-y-3">
            {recent.map((p) => <li key={p.player_id}><PlayerIdentity playerId={p.player_id} name={p.full_name} team={p.team_abbreviation} position={p.position} size="sm" /></li>)}
          </ul>
        )}
      </Section>
    </>
  )
}
