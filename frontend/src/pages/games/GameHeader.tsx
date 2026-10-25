import { Badge, Stat } from '@/components/ui'
import type { Game, GameCoverage, Team } from '@/lib/types'

export function teamLabel(teams: Team[] | undefined, id: number): string {
  const t = teams?.find((x) => x.team_id === id)
  return t ? `${t.city} ${t.name}` : String(id)
}

/** Teams, score, date and what the data layer holds for this game. */
export function GameHeader({ game, coverage, teams }: { game: Game; coverage: GameCoverage; teams: Team[] | undefined }) {
  const date = game.game_date.slice(0, 10)
  const score = game.home_score !== null && game.away_score !== null ? `${game.away_score}–${game.home_score}` : 'score unknown'
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="text-lg font-semibold text-ink">{teamLabel(teams, game.away_team_id)} {game.neutral_site ? 'vs' : 'at'} {teamLabel(teams, game.home_team_id)}</h2>
        <span className="tnum text-base text-ink-2">{score}</span>
        <span className="text-sm text-ink-3">{date}</span>
        {game.neutral_site && <Badge tone="warning">Neutral site: home/away slots are arbitrary</Badge>}
        <Badge>{game.status}</Badge>
      </div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
        <Stat label="Play-by-play events" value={coverage.events.toLocaleString()} sub={coverage.events ? 'ingested for this game' : 'not ingested'} />
        <Stat label="Shots" value={coverage.shots.toLocaleString()} sub="shot-chart rows" />
        <Stat label="Shots mapped to events" value={coverage.mapped_shots.toLocaleString()} sub={coverage.shots ? `${Math.round((100 * coverage.mapped_shots) / coverage.shots)}% of shots` : '–'} />
        <Stat label="Evidence items" value={coverage.evidence_items.toLocaleString()} sub="clip references and more" />
      </div>
    </div>
  )
}
