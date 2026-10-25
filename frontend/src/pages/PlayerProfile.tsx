import { useCallback, useEffect, useMemo } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { PlayerSearch } from '@/components/PlayerSearch'
import { EmptyState, ErrorState, Skeleton, Tabs } from '@/components/ui'
import { useRecent } from '@/store/recent'
import { usePercentiles, usePlayer } from '@/hooks/useApi'
import { useSeason } from '@/hooks/useSeason'
import { ApiError } from '@/lib/api'
import { useParam } from '@/lib/urlState'
import { CareerTimeline } from './player/CareerTimeline'
import { FocusSummary } from './player/FocusSummary'
import { groupTimeline, playedSeasons, resolveFocusSeason, seasonRows, teamOrder } from './player/helpers'
import { MatchupSummary } from './player/MatchupSummary'
import { MeasurementsPanel } from './player/MeasurementsPanel'
import { PercentilesPanel } from './player/PercentilesPanel'
import { ProfileHero } from './player/ProfileHero'
import { FantasyPanel } from './player/FantasyPanel'
import { EvidencePanel } from './player/EvidencePanel'
import { ScoutingPanel } from './player/ScoutingPanel'
import { SeasonTable } from './player/SeasonTable'
import { ShootingSummary } from './player/ShootingSummary'
import { TrendGrid } from './player/TrendGrid'

type ProfileTab = 'performance' | 'shooting' | 'advanced' | 'fantasy'

function NotFoundPlayer({ id }: { id: string }) {
  return (
    <>
      <PageHeader title="Player not found" lede={`No player with id ${id} exists in this dataset.`} />
      <EmptyState
        title="Find another player"
        body="Search by name to open a profile."
        action={<div className="w-full max-w-sm"><PlayerSearch autoFocus placeholder="Search players by name" /></div>}
      />
    </>
  )
}

export default function PlayerProfile() {
  const { playerId: rawId = '' } = useParams()
  const playerId = Number(rawId)
  const validId = Number.isInteger(playerId) && playerId > 0
  const { season: globalSeason, seasonType } = useSeason()
  const [focusParam, setFocusParam] = useParam('focus', '')
  const [tabParam, setTabParam] = useParam('tab', 'performance')
  const tab = (['performance', 'shooting', 'advanced', 'fantasy'] as const).includes(tabParam as ProfileTab) ? (tabParam as ProfileTab) : 'performance'
  const location = useLocation()
  const from = (location.state as { from?: { href: string; label: string } } | null)?.from
  const touch = useRecent((s) => s.touch)
  const q = usePlayer(validId ? playerId : null)
  const profile = q.data?.data

  const seasonsPlayed = useMemo(() => playedSeasons(profile?.seasons ?? []), [profile])
  const focusSeason = resolveFocusSeason(focusParam, globalSeason, seasonsPlayed)
  const setFocus = useCallback((s: string) => setFocusParam(s === globalSeason ? null : s), [setFocusParam, globalSeason])

  const timeline = useMemo(() => groupTimeline(profile?.timeline ?? []), [profile])
  const teams = useMemo(() => teamOrder(profile?.timeline ?? []), [profile])
  const perSeason = useMemo(() => seasonRows(profile?.seasons ?? []), [profile])
  const focusRow = perSeason.find((r) => r.season === focusSeason)

  // On/off net is not part of the season log; the percentile call for the focus season carries the raw value.
  const pct = usePercentiles(validId && focusSeason ? playerId : null, { season: focusSeason, season_type: seasonType, population: 'all' })
  const onOffNet = useMemo(() => {
    const fromRow = focusRow && typeof focusRow.on_off_net === 'number' ? focusRow.on_off_net : null
    if (fromRow !== null) return fromRow
    const e = pct.data?.data.metrics.find((m) => m.metric === 'on_off_net')
    return typeof e?.value === 'number' ? e.value : null
  }, [focusRow, pct.data])

  useEffect(() => {
    if (!profile) return
    const stint = profile.timeline.filter((t) => t.season === focusSeason)[0] ?? profile.timeline[profile.timeline.length - 1]
    touch({ player_id: profile.bio.player_id, full_name: profile.bio.full_name, team_abbreviation: stint?.team_abbreviation ?? null, position: profile.bio.position })
  }, [profile, focusSeason, touch])

  if (!validId) return <NotFoundPlayer id={rawId} />
  if (q.error instanceof ApiError && q.error.status === 404) return <NotFoundPlayer id={rawId} />
  if (q.error) return <><PageHeader title="Player profile" /><ErrorState error={q.error} retry={() => q.refetch()} /></>
  if (!profile) return <><PageHeader title="Player profile" /><Skeleton className="h-24 max-w-xl" /><Skeleton lines={4} className="mt-4 max-w-xl" /></>

  return (
    <>
      {from && <Link to={from.href} className="t-fast mb-2 inline-flex items-center gap-1 text-xs text-ink-3 hover:text-accent">← Back to {from.label}</Link>}
      <ProfileHero
        profile={profile}
        focusSeason={focusSeason}
        focusTimeline={timeline.find((s) => s.season === focusSeason)}
        playedSeasons={seasonsPlayed}
        onFocusChange={setFocus}
      />
      <div className="flex flex-col gap-5">
        <FocusSummary season={focusSeason} row={focusRow} onOffNet={onOffNet} />
        <Tabs<ProfileTab>
          ariaLabel="Profile sections"
          value={tab}
          onChange={(t) => setTabParam(t === 'performance' ? null : t)}
          options={[
            { value: 'performance', label: 'Performance & trends' },
            { value: 'shooting', label: 'Shooting' },
            { value: 'advanced', label: 'Advanced' },
            { value: 'fantasy', label: 'Fantasy' },
          ]}
        />
        {tab === 'performance' && (
          <div key="performance" className="rise-in flex flex-col gap-4">
            <CareerTimeline seasons={timeline} teams={teams} focusSeason={focusSeason} onFocus={setFocus} />
            <TrendGrid rows={perSeason} focusSeason={focusSeason} onFocus={setFocus} />
            <SeasonTable rows={profile.seasons} focusSeason={focusSeason} />
          </div>
        )}
        {tab === 'shooting' && (
          <div key="shooting" className="rise-in flex flex-col gap-4">
            <ShootingSummary playerId={playerId} season={focusSeason} seasonType={seasonType} />
          </div>
        )}
        {tab === 'advanced' && (
          <div key="advanced" className="rise-in flex flex-col gap-4">
            <PercentilesPanel playerId={playerId} season={focusSeason} seasonType={seasonType} />
            <MatchupSummary playerId={playerId} season={focusSeason} seasonType={seasonType} />
            <div className="grid gap-4 xl:grid-cols-2">
              <MeasurementsPanel measurements={profile.measurements} />
              <ScoutingPanel playerId={playerId} season={focusSeason} seasonType={seasonType} />
            </div>
            <EvidencePanel playerId={playerId} />
          </div>
        )}
        {tab === 'fantasy' && (
          <div key="fantasy" className="rise-in flex flex-col gap-4">
            <FantasyPanel playerId={playerId} />
          </div>
        )}
      </div>
    </>
  )
}
