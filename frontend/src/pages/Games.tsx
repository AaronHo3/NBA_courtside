import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import type { ColumnDef } from '@tanstack/react-table'
import { PageHeader } from '@/components/layout/PageHeader'
import { DataTable } from '@/components/table/DataTable'
import { EmptyState, Panel, Refetching, TeamMark } from '@/components/ui'
import { useGames, useTeams } from '@/hooks/useApi'
import { useSeason } from '@/hooks/useSeason'
import type { Game, Team } from '@/lib/types'

/** Team mark and abbreviation from the teams list; an id with no team on file stays a plain id. */
function TeamCell({ team, id }: { team: Team | undefined; id: number }) {
  if (!team) return <span className="tnum text-ink-3">{id}</span>
  return (
    <span className="inline-flex items-center gap-1.5" title={team.full_name}>
      <TeamMark abbreviation={team.abbreviation} teamId={team.team_id} size={18} />
      <span className="font-medium text-ink">{team.abbreviation}</span>
    </span>
  )
}

export default function Games() {
  const { season, seasonType, has } = useSeason()
  const teams = useTeams()
  const games = useGames({ season, season_type: seasonType, limit: 200 })
  const navigate = useNavigate()
  const byId = useMemo(() => new Map((teams.data?.data ?? []).map((t) => [t.team_id, t])), [teams.data])
  const columns = useMemo<ColumnDef<Game, unknown>[]>(() => {
    const abbr = (id: number) => byId.get(id)?.abbreviation ?? String(id)
    return [
      { id: 'date', header: 'Date', accessorFn: (g) => g.game_date.slice(0, 10), cell: (c) => <span className="tnum">{c.getValue<string>()}</span> },
      {
        id: 'matchup', header: 'Matchup', accessorFn: (g) => `${abbr(g.away_team_id)} ${g.neutral_site ? 'vs' : '@'} ${abbr(g.home_team_id)}`,
        cell: ({ row }) => (
          <span className="inline-flex items-center gap-2 whitespace-nowrap">
            <TeamCell team={byId.get(row.original.away_team_id)} id={row.original.away_team_id} />
            <span className="text-ink-3">{row.original.neutral_site ? 'vs' : '@'}</span>
            <TeamCell team={byId.get(row.original.home_team_id)} id={row.original.home_team_id} />
          </span>
        ),
      },
      { id: 'score', header: 'Score', accessorFn: (g) => (g.home_score !== null && g.away_score !== null ? `${g.away_score}–${g.home_score}` : '–'), cell: (c) => <span className="tnum">{c.getValue<string>()}</span>, meta: { numeric: true } },
      { id: 'id', header: 'Game id', accessorKey: 'game_id', cell: (c) => <span className="tnum text-ink-3">{c.getValue<string>()}</span> },
    ]
  }, [byId])
  const rows = games.data?.data ?? []
  return (
    <>
      <PageHeader title="Games" lede="Every game of the selected season, from the team game logs. Open one for its play-by-play and clip references (ingested per game, on demand)." />
      <Panel question={`Which games exist for ${season} ${seasonType}?`} method="First 200 games by date. Click a row to open the game.">
        {!has('games') && !rows.length ? (
          <EmptyState title="No games for this season" body="Run the games family for the season (make ingest SEASONS=... FAMILIES=games)." />
        ) : (
          <Refetching loading={games.isFetching} error={games.error} retry={() => { void games.refetch() }}>
            <DataTable data={rows} columns={columns} rowKey={(g) => g.game_id} onRowClick={(g) => navigate(`/games/${g.game_id}?season=${season}&type=${encodeURIComponent(seasonType)}`)} dense focusable maxHeight={600} pinFirstColumn initialSort={[{ id: 'date', desc: false }]} emptyMessage="No games on file for this season." />
          </Refetching>
        )}
      </Panel>
    </>
  )
}
