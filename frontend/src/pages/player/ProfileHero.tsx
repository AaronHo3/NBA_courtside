import { useId, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, LinkButton, Portrait, Select, TeamMark, nbaHeadshotUrl } from '@/components/ui'
import { MAX_COMPARE, useCompare } from '@/store/compare'
import { teamColour } from '@/lib/teamColours'
import { fantasyHref, useFantasyPlayer } from '@/lib/fantasyBridge'
import type { PlayerProfile } from '@/lib/types'
import { ageFromBirthdate, draftText, seasonLabelFromYear, type TimelineSeason } from './helpers'

type Props = {
  profile: PlayerProfile
  focusSeason: string
  focusTimeline: TimelineSeason | undefined
  playedSeasons: string[]
  onFocusChange: (season: string) => void
}

/** ESPN status codes ("DAY_TO_DAY") as words; null means the feed has no status for the player. */
const statusText = (raw: string) => raw.replace(/_/g, '-')

function useFantasyHero(playerId: number) {
  const f = useFantasyPlayer(playerId)
  const status = f.player?.injury_status ?? null
  const badge = !f.hasSession || !status ? null : status === 'ACTIVE' ? { tone: 'good' as const, label: 'Active' } : { tone: 'warning' as const, label: 'Injured' }
  return { ...f, status, badge }
}

/** One plain-text line: "Fantasy: C · ACTIVE · drafted #12 · rank 176 · projection blend". */
function FantasyLine({ f }: { f: ReturnType<typeof useFantasyHero> }) {
  const { player, hasSession, sessionId, isLoading, status } = f
  const lead = <span className="font-medium text-ink-2">Fantasy:</span>
  if (!hasSession) return <p className="text-xs text-ink-3">{lead} no session open · <Link to="/fantasy#/setup" className="text-accent hover:underline">open the copilot</Link></p>
  if (isLoading) return <p className="text-xs text-ink-3">{lead} loading…</p>
  if (!player) return <p className="text-xs text-ink-3">{lead} not in the active snapshot</p>
  const positions = player.eligible_positions.length ? player.eligible_positions.join('/') : player.primary_position
  const parts = [
    positions ? `${positions}${player.eligibility_verified ? '' : ' (unverified)'}` : null,
    status ? statusText(status) : null,
    player.drafted_overall != null ? `drafted #${player.drafted_overall}` : 'undrafted',
    player.rank != null ? `rank ${Math.round(player.rank)}` : null,
    player.adp != null ? `ADP ${player.adp.toFixed(1)}` : null,
    `projection ${player.projection_source}`,
  ].filter(Boolean)
  return (
    <p className="text-xs text-ink-3 tnum" data-testid="hero-fantasy-line">
      {lead} {parts.join(' · ')} · <Link to={fantasyHref('draft', sessionId)} className="text-accent hover:underline">Open in fantasy →</Link>
    </p>
  )
}

/** Hero header: portrait, identity, team colours as a low-alpha wash, fantasy status, and the page actions. */
export function ProfileHero({ profile, focusSeason, focusTimeline, playedSeasons, onFocusChange }: Props) {
  const { bio, career, measurements } = profile
  const compare = useCompare()
  const fantasy = useFantasyHero(bio.player_id)
  const seasonHelpId = useId()
  const inCompare = compare.has(bio.player_id)
  const [note, setNote] = useState<string | null>(null)
  const [justAdded, setJustAdded] = useState(false)
  const age = ageFromBirthdate(bio.birthdate)
  const span = [seasonLabelFromYear(bio.from_year), seasonLabelFromYear(bio.to_year)].filter(Boolean)
  const seasonsPlayed = typeof career.seasons === 'number' ? career.seasons : null
  const stints = focusTimeline?.stints ?? []
  const team = stints[0]
  const colour = teamColour(team?.team_abbreviation)
  const height = measurements.roster.height_in
  const weight = measurements.roster.weight_lb
  const heightText = height == null ? null : `${Math.floor(height / 12)}′${Math.round(height % 12)}″`

  const toggleCompare = () => {
    if (inCompare) { compare.remove(bio.player_id); setNote(null); return }
    const ok = compare.add({ player_id: bio.player_id, full_name: bio.full_name, team_abbreviation: team?.team_abbreviation ?? null })
    setNote(ok ? null : `The comparison group is full (${MAX_COMPARE} players). Remove one first.`)
    if (ok) { setJustAdded(true); setTimeout(() => setJustAdded(false), 400) }
  }

  return (
    <header className="rise-in relative -mx-4 mb-5 border-b border-line px-4 pb-5 pt-2 sm:-mx-6 sm:px-6" style={{ ['--team' as string]: colour } as CSSProperties}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10" style={{ background: `linear-gradient(90deg, color-mix(in srgb, ${colour} 14%, transparent), transparent 60%)` }} />
      <div className="flex flex-wrap items-start gap-5">
        <Portrait name={bio.full_name} src={nbaHeadshotUrl(bio.player_id)} team={team?.team_abbreviation} size="xl" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="display text-[34px] font-semibold leading-none tracking-tight text-ink sm:text-[40px]">{bio.full_name}</h1>
            {fantasy.badge && <Badge tone={fantasy.badge.tone}>{fantasy.badge.label}</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
            {team && <span className="inline-flex items-center gap-1.5"><TeamMark abbreviation={team.team_abbreviation} teamId={team.team_id} size={20} /><span className="text-ink">{stints.map((t) => t.team_name ?? t.team_abbreviation).join(' → ')}</span>{stints.length > 1 && <span className="text-warning">traded during {focusSeason}</span>}</span>}
            {!team && <span>Did not play in {focusSeason}</span>}
            {bio.position && <span>{bio.position}</span>}
            {age !== null && <span className="tnum">Age {age}</span>}
            {heightText && <span className="tnum">{heightText}{weight != null ? ` · ${weight} lb` : ''}</span>}
            {!bio.is_active && <span>Retired</span>}
            {span.length > 0 && <span className="tnum">{span.join('–')}{seasonsPlayed !== null ? ` · ${seasonsPlayed} season${seasonsPlayed === 1 ? '' : 's'}` : ''}</span>}
            <span className="text-ink-3">{draftText(bio)}</span>
            {bio.country && <span className="text-ink-3">{[bio.country, bio.school].filter(Boolean).join(' · ')}</span>}
          </div>
          <FantasyLine f={fantasy} />
          {note && <span role="status" className="text-xs text-warning">{note}</span>}
        </div>
        <div className="flex w-full flex-col gap-2 lg:w-auto lg:max-w-[360px] lg:items-end">
          <div className="flex flex-col gap-1 sm:w-[300px] lg:items-end">
            <Select label="Profile season" value={focusSeason} onChange={(e) => onFocusChange(e.target.value)} aria-describedby={seasonHelpId} className="w-full sm:w-40 lg:items-end">
              {playedSeasons.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
            <p id={seasonHelpId} className="max-w-[300px] text-meta text-ink-3 lg:text-right">NBA research season (toolbar) sets the league context; this picks the season the profile reads</p>
          </div>
          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
            <Button variant={inCompare ? 'default' : 'primary'} aria-pressed={inCompare} onClick={toggleCompare} className={justAdded ? 'pop-in' : undefined}>
              {inCompare ? 'Remove from compare' : 'Add to compare'}
            </Button>
            <LinkButton to={`/shooting?player=${bio.player_id}&season=${focusSeason}`}>Shots</LinkButton>
            <LinkButton to={`/matchups?player=${bio.player_id}&season=${focusSeason}`}>Matchups</LinkButton>
          </div>
        </div>
      </div>
    </header>
  )
}
