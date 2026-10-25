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
  const [failed, setFailed] = useState(false)
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
      <img src={src} alt="" width={px} height={px} style={{ width: px, height: px }} loading="lazy" decoding="async" className="h-full w-full object-cover object-top scale-[1.15] translate-y-[6%]" onError={() => setFailed(true)} />
    </span>
  )
}

/**
 * Team logo with the tricode as fallback; `teamId` is the NBA team id. Logo and fallback occupy the same
 * `size`×`size` box so rows never shift when the CDN is blocked or a team has no logo.
 */
export function TeamMark({ abbreviation, teamId, size = 20, className }: { abbreviation: string | null | undefined; teamId?: number | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false)
  const box: CSSProperties = { width: size, height: size }
  if (!teamId || failed) {
    const code = abbreviation ?? '—'
    return (
      <span
        data-testid="teammark-fallback"
        role="img"
        aria-label={abbreviation ?? 'Unknown team'}
        className={clsx('inline-flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-raised font-display font-semibold leading-none tracking-tight text-ink-2', className)}
        style={{ ...box, fontSize: Math.max(7, Math.round(size * (code.length > 2 ? 0.4 : 0.5))), boxShadow: `inset 0 -2px 0 ${teamColour(abbreviation)}` }}
      >
        {code}
      </span>
    )
  }
  return <img src={nbaLogoUrl(teamId)} alt={abbreviation ?? ''} width={size} height={size} style={box} loading="lazy" className={clsx('inline-block shrink-0', className)} onError={() => setFailed(true)} />
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
