import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { useSetCrumb } from '@/store/crumb'
import { EmptyState, ErrorState, Loading, Refetching } from '@/components/ui'
import { useTeamLeague, useTeamSeason, useTeamSeasons } from '@/hooks/useApi'
import { useSeason } from '@/hooks/useSeason'
import { ApiError } from '@/lib/api'
import { useNumberParam } from '@/lib/urlState'
import { LineupsPanel } from './teams/LineupsPanel'
import { OnOffPanel } from './teams/OnOffPanel'
import { RosterPanel } from './teams/RosterPanel'
import { StintsPanel } from './teams/StintsPanel'
import { TeamHeader } from './teams/TeamHeader'
import { TrendPanel } from './teams/TrendPanel'

const DEFAULT_MIN_POSS = 50

function NotFound({ teamId }: { teamId: string | undefined }) {
  return (
    <>
      <PageHeader title="Team season" />
      <EmptyState title="Team not found" body={`No team with id "${teamId ?? ''}" exists in this dataset.`} action={<Link to="/teams" className="text-sm font-medium text-accent hover:underline">Browse all teams</Link>} />
    </>
  )
}

export default function TeamDetail() {
  const { teamId } = useParams()
  const id = Number(teamId)
  const validId = Number.isInteger(id) && id > 0
  const { season, seasons, setSeason, ready } = useSeason()
  const [minPoss, setMinPoss] = useNumberParam('minposs', DEFAULT_MIN_POSS)
  // Lineups are fetched unfiltered and filtered in the browser so the floor is instant and the dot chart keeps context.
  const detail = useTeamSeason(validId ? id : null, { season, min_lineup_poss: 0 })
  const history = useTeamSeasons(validId ? id : null)
  const league = useTeamLeague({ season })
  const data = detail.data?.data
  const tradedIds = useMemo(() => new Set((data?.roster ?? []).filter((r) => r.traded).map((r) => r.player_id)), [data])

  useSetCrumb(data ? [{ label: 'Teams', to: '/teams' }, { label: data.team.full_name }] : null)

  if (!validId) return <NotFound teamId={teamId} />
  if (detail.error instanceof ApiError && detail.error.status === 404) return <NotFound teamId={teamId} />
  if (detail.error) return <ErrorState error={detail.error} retry={() => detail.refetch()} />
  if (!ready || !data) return <Loading label="Loading team season" />

  return (
    <Refetching loading={detail.isFetching && !detail.isLoading}>
      <TeamHeader team={data.team} league={league.data?.data ?? []} season={season} seasons={seasons} setSeason={setSeason} />
      <div className="flex flex-col gap-4">
        {history.error ? <ErrorState error={history.error} retry={() => history.refetch()} /> : <TrendPanel rows={history.data?.data ?? []} focus={season} />}
        <RosterPanel roster={data.roster} team={data.team} caveat={league.data?.meta.caveat} />
        <StintsPanel stints={data.stints} tradedIds={tradedIds} />
        <LineupsPanel lineups={data.lineups} minPoss={minPoss} setMinPoss={setMinPoss} team={data.team} />
        <OnOffPanel rows={data.on_off} />
      </div>
    </Refetching>
  )
}
