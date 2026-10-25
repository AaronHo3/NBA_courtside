import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { Badge, Button, Portrait, Select, TeamMark, nbaHeadshotUrl } from '@/components/ui'
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

function FantasyStatus({ playerId }: { playerId: number }) {
  const { player, hasSession, sessionId, isLoading } = useFantasyPlayer(playerId)
  if (!hasSession) return <p className="text-xs text-ink-3">No fantasy session open · <Link to="/fantasy#/setup" className="text-accent hover:underline">open the copilot</Link></p>
  if (isLoading) return <p className="text-xs text-ink-3">Loading fantasy status…</p>
  if (!player) return <p className="text-xs text-ink-3">Not in the active fantasy snapshot.</p>
  const owned = player.drafted_overall != null
  return (
    <div className="flex flex-col gap-1.5 text-xs" aria-label="Fantasy status">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge tone={owned ? 'accent' : 'good'}>{owned ? `Drafted #${player.drafted_overall}` : 'Undrafted'}</Badge>
        {player.injury_status && <Badge tone="warning">{player.injury_status}</Badge>}
        {player.eligible_positions.map((p) => <Badge key={p}>{p}</Badge>)}
        <span className="text-ink-3">ESPN eligibility{player.eligibility_verified ? '' : ' (unverified)'}</span>
      </div>
      <p className="text-ink-3 tnum">
        {player.adp != null && <>ADP {player.adp.toFixed(1)} · </>}
        {player.rank != null && <>rank {player.rank} · </>}
        projection: {player.projection_source}
        {' · '}<Link to={fantasyHref('draft', sessionId)} className="text-accent hover:underline">Open in fantasy →</Link>
      </p>
    </div>
  )
}

/** Hero header: portrait, identity, team colours as a low-alpha wash, fantasy status, and the page actions. */
export function ProfileHero({ profile, focusSeason, focusTimeline, playedSeasons, onFocusChange }: Props) {
  const { bio, career, measurements } = profile
  const compare = useCompare()
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
            <Badge tone={bio.is_active ? 'good' : 'neutral'}>{bio.is_active ? 'Active' : 'Retired'}</Badge>
            {stints.length > 1 && <Badge tone="warning">Traded during {focusSeason}</Badge>}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-ink-2">
            {team && <span className="inline-flex items-center gap-1.5"><TeamMark abbreviation={team.team_abbreviation} teamId={team.team_id} size={18} /><span className="text-ink">{stints.map((t) => t.team_name ?? t.team_abbreviation).join(' · ')}</span></span>}
            {!team && <span>Did not play in {focusSeason}</span>}
            {bio.position && <span>{bio.position}</span>}
            {age !== null && <span className="tnum">Age {age}</span>}
            {heightText && <span className="tnum">{heightText}{weight != null ? ` · ${weight} lb` : ''}</span>}
            {span.length > 0 && <span className="tnum">{span.join('–')}{seasonsPlayed !== null ? ` · ${seasonsPlayed} season${seasonsPlayed === 1 ? '' : 's'}` : ''}</span>}
            <span className="text-ink-3">{draftText(bio)}</span>
            {bio.country && <span className="text-ink-3">{[bio.country, bio.school].filter(Boolean).join(' · ')}</span>}
          </div>
          <FantasyStatus playerId={bio.player_id} />
          {note && <span role="status" className="text-xs text-warning">{note}</span>}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <Select label="Season in focus" value={focusSeason} onChange={(e) => onFocusChange(e.target.value)}>
            {playedSeasons.map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
          <Button variant={inCompare ? 'default' : 'primary'} aria-pressed={inCompare} onClick={toggleCompare} className={justAdded ? 'pop-in' : undefined}>
            {inCompare ? 'Remove from compare' : 'Add to compare'}
          </Button>
          <Link to={`/shooting?player=${bio.player_id}&season=${focusSeason}`} className="t-fast inline-flex items-center rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-accent">Shots</Link>
          <Link to={`/matchups?player=${bio.player_id}&season=${focusSeason}`} className="t-fast inline-flex items-center rounded-[var(--radius-control)] border border-line-strong bg-surface px-3 py-1.5 text-sm font-medium text-ink hover:border-accent">Matchups</Link>
        </div>
      </div>
    </header>
  )
}
