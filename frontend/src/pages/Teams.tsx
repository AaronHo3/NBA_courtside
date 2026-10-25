import { useMemo } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, ErrorState, Loading } from '@/components/ui'
import { useTeamLeague, useTeamList } from '@/hooks/useApi'
import { useSeason } from '@/hooks/useSeason'
import { CompareStrip } from './teams/CompareStrip'
import { LeagueTable } from './teams/LeagueTable'
import { ProfileScatter } from './teams/ProfileScatter'
import { RosterShapePanel } from './teams/RosterShapePanel'

export default function Teams() {
  const { season, seasons, ready } = useSeason()
  const league = useTeamLeague({ season })
  const teams = useTeamList()
  const rows = useMemo(() => league.data?.data ?? [], [league.data])
  const teamList = useMemo(() => teams.data?.data ?? [], [teams.data])

  return (
    <>
      <PageHeader
        title="How is each team built, and does it work?"
        lede="Ratings and four factors for one season, roster shape against results, and team comparisons: descriptive associations across 30 teams, never causes."
        context={<Badge tone="accent">{season || 'Season'}</Badge>}
      />
      {!ready ? (
        <Loading />
      ) : league.error ? (
        <ErrorState error={league.error} retry={() => league.refetch()} />
      ) : (
        <div className="flex flex-col gap-4">
          <LeagueTable rows={rows} season={season} caveat={league.data?.meta.caveat} />
          <ProfileScatter rows={rows} season={season} />
          <RosterShapePanel season={season} />
          <CompareStrip season={season} seasons={seasons} teams={teamList} league={rows} />
        </div>
      )}
    </>
  )
}
