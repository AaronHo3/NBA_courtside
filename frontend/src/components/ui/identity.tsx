import { clsx } from 'clsx'
import { useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { teamColour } from '@/lib/teamColours'

/** NBA's public headshot CDN (image host, not the stats provider). */
export const nbaHeadshotUrl = (playerId: number, size: '260x190' | '1040x760' = '260x190') =>
  `https://cdn.nba.com/headshots/nba/latest/${size}/${playerId}.png`
/** NBA's public logo CDN; team ids are the stats.nba.com team ids. */
export const nbaLogoUrl = (teamId: number) => `https://cdn.nba.com/logos/nba/${teamId}/primary/L/logo.svg`

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

const SIZES = { xs: 24, sm: 32, md: 44, lg: 64, xl: 96 } as const
export type PortraitSize = keyof typeof SIZES

/**
 * Player headshot with a team-coloured initials fallback. `src` may be any headshot URL (NBA or ESPN);
 * the fallback carries the same ring so identity blocks keep their shape when a photo is missing.
 */
export function Portrait({ name, src, team, size = 'md', className, ring = true }: { name: string; src: string | null; team?: string | null; size?: PortraitSize; className?: string; ring?: boolean }) {
  // Track which src failed, so a new player's headshot is tried again instead of inheriting the fallback.
  const [failedSrc, setFailedSrc] = useState<string | null>(null)
  const failed = src != null && failedSrc === src
  const px = SIZES[size]
  const colour = teamColour(team)
  const style: CSSProperties = { width: px, height: px, ['--team' as string]: colour }
  const base = clsx('relative shrink-0 overflow-hidden rounded-full bg-raised', ring && 'ring-2 ring-[var(--team)] ring-offset-2 ring-offset-page', className)
  if (!src || failed) {
    return (
      <span data-testid="portrait-fallback" className={clsx(base, 'inline-flex items-center justify-center font-display font-semibold text-ink-2')} style={{ ...style, fontSize: Math.max(10, Math.round(px * 0.36)) }} aria-hidden="true">
        {initials(name)}
      </span>
    )
  }
  return (
    <span className={base} style={style}>
      <img src={src} alt="" width={px} height={px} style={{ width: px, height: px }} loading="lazy" decoding="async" className="h-full w-full object-cover object-top scale-[1.15] translate-y-[6%]" onError={() => setFailedSrc(src)} />
    </span>
  )
}

/** Smallest box and text for a failed logo's tricode, so it stays legible wherever the mark is used. */
const FALLBACK_MIN_BOX = 18
const FALLBACK_MIN_FONT = 10

/**
 * Team logo with the tricode as fallback; `teamId` is the NBA team id. Without a `teamId` there is no logo
 * to match, so the tricode is readable inline text. When a logo fails to load, the tricode fills a fixed
 * box the size of the logo (at least 18px, text at least 10px) so the row does not shift.
 */
export function TeamMark({ abbreviation, teamId, size = 20, className }: { abbreviation: string | null | undefined; teamId?: number | null; size?: number; className?: string }) {
  const [failedId, setFailedId] = useState<number | null>(null)
  const underline = `inset 0 -2px 0 ${teamColour(abbreviation)}`
  if (!teamId) {
    return <span data-testid="teammark-inline" className={clsx('inline-flex items-center rounded-sm px-1 font-mono text-meta font-medium text-ink-2', className)} style={{ boxShadow: underline }}>{abbreviation ?? '—'}</span>
  }
  if (failedId === teamId) {
    const box = Math.max(size, FALLBACK_MIN_BOX)
    return (
      <span
        data-testid="teammark-fallback"
        role="img"
        aria-label={abbreviation ?? 'Unknown team'}
        className={clsx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-raised font-display font-semibold leading-none tracking-tight text-ink-2', className)}
        style={{ width: box, height: box, fontSize: Math.max(FALLBACK_MIN_FONT, Math.round(box * 0.45)), boxShadow: underline }}
      >
        {abbreviation ?? '—'}
      </span>
    )
  }
  return <img src={nbaLogoUrl(teamId)} alt={abbreviation ?? ''} width={size} height={size} style={{ width: size, height: size }} loading="lazy" className={clsx('inline-block shrink-0', className)} onError={() => setFailedId(teamId)} />
}

export type PlayerIdentityProps = {
  playerId: number | null
  name: string
  team?: string | null
  teamId?: number | null
  position?: string | null
  /** Secondary line under the name (age, status, ownership…). */
  meta?: React.ReactNode
  /** Override the headshot (e.g. ESPN for fantasy-only players). */
  src?: string | null
  size?: PortraitSize
  /** Wrap the name in a link to the profile (default when playerId is known). */
  link?: boolean
  className?: string
  rail?: boolean
}

/** Portrait + name + team mark + position, the one way a player appears across the app. */
export function PlayerIdentity({ playerId, name, team, teamId, position, meta, src, size = 'sm', link = true, className, rail = false }: PlayerIdentityProps) {
  const headshot = src !== undefined ? src : playerId != null ? nbaHeadshotUrl(playerId) : null
  const nameEl = link && playerId != null ? <Link to={`/players/${playerId}`} className="text-ink hover:text-accent t-fast">{name}</Link> : <span className="text-ink">{name}</span>
  return (
    <span className={clsx('inline-flex min-w-0 items-center gap-2', rail && 'team-rail pl-2', className)} style={rail ? ({ ['--team' as string]: teamColour(team) } as CSSProperties) : undefined}>
      <Portrait name={name} src={headshot} team={team} size={size} ring={size !== 'xs'} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={clsx('truncate font-medium', size === 'lg' || size === 'xl' ? 'text-base' : 'text-xs')}>{nameEl}</span>
        <span className="flex items-center gap-1.5 text-meta text-ink-3">
          {(team || teamId) && <TeamMark abbreviation={team} teamId={teamId} size={14} />}
          {position && <span>{position}</span>}
          {meta}
        </span>
      </span>
    </span>
  )
}
