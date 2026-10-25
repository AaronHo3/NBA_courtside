import { Link } from 'react-router-dom'
import type { CSSProperties } from 'react'
import { Badge, Select, StatRow, StatTile, TeamMark } from '@/components/ui'
import { teamColour } from '@/lib/teamColours'
import { ordinal } from '@/lib/format'
import type { TeamSeason } from '@/lib/types'
import { rankOf } from './analysis'
import { formatTeamMetric, numberAt, teamMetric, wl } from './teamMetrics'

const TILES = ['net_rating', 'off_rating', 'def_rating', 'pace'] as const

function rankText(key: string, team: TeamSeason, league: TeamSeason[]): string | undefined {
  const m = teamMetric(key)
  if (m.higherIsBetter === null) return undefined
  const r = rankOf(numberAt(team, key), league.map((row) => numberAt(row, key)), m.higherIsBetter)
  return r ? `${ordinal(r.rank)} of ${r.of}` : undefined
}

export function TeamHeader({ team, league, season, seasons, setSeason }: { team: TeamSeason; league: TeamSeason[]; season: string; seasons: string[]; setSeason: (s: string) => void }) {
  const colour = teamColour(team.abbreviation)
  return (
    <>
      <header className="rise-in relative -mx-4 mb-5 border-b border-line px-4 pb-5 pt-2 sm:-mx-6 sm:px-6" style={{ ['--team' as string]: colour } as CSSProperties}>
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${colour} 16%, transparent), transparent 60%)` }} />
        <div className="flex flex-wrap items-center gap-5">
          <span className="inline-flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-surface ring-2 ring-[var(--team)] ring-offset-2 ring-offset-page"><TeamMark abbreviation={team.abbreviation} teamId={team.team_id} size={56} /></span>
          <div className="min-w-0 flex-1">
            <h1 className="display text-[34px] font-semibold leading-none tracking-tight text-ink sm:text-[40px]">{team.full_name}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-ink-2">
              <span className="tnum font-medium text-ink">{wl(team)}</span>
              <span>· {Math.round(team.gp)} games · {team.conference} / {team.division}</span>
              <Badge>{team.abbreviation}</Badge>
              <span className="text-ink-4">NBA team</span>
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Select aria-label="Season" value={season} onChange={(e) => setSeason(e.target.value)}>
              {seasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <Link to={`/shooting?team=${team.team_id}&season=${encodeURIComponent(season)}`} className="text-sm font-medium text-accent hover:underline">Shooting profile →</Link>
            <Link to={`/teams?season=${encodeURIComponent(season)}`} className="text-sm text-ink-2 hover:text-ink hover:underline">All teams</Link>
          </div>
        </div>
      </header>
      <StatRow className="mb-5">
        {TILES.map((k) => (
          <StatTile key={k} label={teamMetric(k).label} value={formatTeamMetric(k, numberAt(team, k))} sub={rankText(k, team, league)} />
        ))}
      </StatRow>
    </>
  )
}
