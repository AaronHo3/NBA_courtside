import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable } from '@/components/table/DataTable'
import { EmptyState, Panel, Refetching } from '@/components/ui'
import { useGames, useTeams } from '@/hooks/useApi'
import { useSeason } from '@/hooks/useSeason'
import type { Game } from '@/lib/types'

export default function Games() {
  const { season, seasonType, has } = useSeason()
  const teams = useTeams()
  const games = useGames({ season, season_type: seasonType, limit: 200 })
  const navigate = useNavigate()
  const abbr = (id: number) => teams.data?.data.find((t) => t.team_id === id)?.abbreviation ?? String(id)
  const columns = useMemo<ColumnDef<Game, unknown>[]>(() => [
    { id: 'date', header: 'Date', accessorFn: (g) => g.game_date.slice(0, 10) },
    { id: 'matchup', header: 'Matchup', accessorFn: (g) => `${abbr(g.away_team_id)} ${g.neutral_site ? 'vs' : '@'} ${abbr(g.home_team_id)}` },
    { id: 'score', header: 'Score', accessorFn: (g) => (g.home_score !== null && g.away_score !== null ? `${g.away_score}–${g.home_score}` : '–'), meta: { numeric: true } },
    { id: 'id', header: 'Game id', accessorKey: 'game_id' },
  ], [teams.data])  // eslint-disable-line react-hooks/exhaustive-deps
  const rows = games.data?.data ?? []
  return (
    <>
      <PageHeader title="Games" lede="Every game of the selected season, derived from the team game logs. Open a game for its play-by-play and clip references (ingested per game, on demand)." />
      <Panel question={`Which games exist for ${season} ${seasonType}?`} method="First 200 games by date. Click a row to open the game." >
        {!has('games') && !rows.length ? (
          <EmptyState title="No games for this season" body="Run the games family for the season (make ingest SEASONS=... FAMILIES=games)." />
        ) : (
          <Refetching loading={games.isFetching} error={games.error} retry={() => { void games.refetch() }}>
            <DataTable data={rows} columns={columns} rowKey={(g) => g.game_id} onRowClick={(g) => navigate(`/games/${g.game_id}?season=${season}&type=${encodeURIComponent(seasonType)}`)} dense height={600} initialSort={[{ id: 'date', desc: false }]} />
          </Refetching>
        )}
      </Panel>
    </>
  )
}
