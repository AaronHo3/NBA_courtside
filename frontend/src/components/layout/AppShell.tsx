import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { clsx } from 'clsx'
import { Menu, Moon, Search, Sun, X } from 'lucide-react'
import { useStatus } from '@/hooks/useApi'
import { useTheme } from '@/store/theme'
import { useCompare } from '@/store/compare'
import { useShortlist } from '@/store/shortlist'
import { useFantasyContext, useFantasySessions } from '@/lib/fantasyBridge'
import { PlayerSearch } from '../PlayerSearch'
import { SeasonPicker } from '../SeasonPicker'
import { CompareTray } from '../CompareTray'
import { CommandPalette } from '../CommandPalette'
import { Badge, Button } from '../ui'
import { NAV_GROUPS, activeNavId, navGroupOf, navHref, navItemById, type NavItem } from './nav'

/** Kept for existing imports; the grouped structure lives in ./nav.ts. */
export const NAV = NAV_GROUPS.flatMap((g) => g.items)

function useCmdK(toggle: () => void) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); toggle() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [toggle])
}

function Brand() {
  return (
    <Link to="/" className="flex items-center gap-2.5 px-3 py-1 text-ink" aria-label="Courtside home">
      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-accent text-accent-ink" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.6"><circle cx="12" cy="12" r="9" /><path d="M5 7c3 1.5 5 4 5 8M19 7c-3 1.5-5 4-5 8M3 12h18M12 3v18" /></svg>
      </span>
      <span className="display text-[17px] font-semibold tracking-tight">Courtside</span>
    </Link>
  )
}

function SideNav({ activeId, sessionId, isComplete, onNavigate }: { activeId: string | null; sessionId: string | null; isComplete: boolean; onNavigate?: () => void }) {
  const navRef = useRef<HTMLElement>(null)
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null)
  const measure = useCallback(() => {
    const nav = navRef.current
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !el) { setPill(null); return }
    const a = el.getBoundingClientRect(), b = nav.getBoundingClientRect()
    setPill({ top: a.top - b.top + nav.scrollTop, height: a.height })
  }, [])
  useLayoutEffect(measure, [activeId, isComplete, measure])
  useEffect(() => { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure) }, [measure])
  const visible = (i: NavItem) => !i.afterDraft || isComplete
  return (
    <nav ref={navRef} aria-label="Primary" className="relative flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-2">
      {pill && <span aria-hidden="true" className="pointer-events-none absolute left-2 right-2 rounded-[var(--radius-control)] bg-accent-soft transition-[top,height] duration-[var(--dur-panel)] ease-[var(--ease)]" style={{ top: pill.top, height: pill.height }} />}
      {NAV_GROUPS.map((g) => (
        <div key={g.id} className="relative flex flex-col gap-px">
          {g.label && <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-ink-4">{g.label}</p>}
          {g.items.filter(visible).map((i) => {
            const Icon = i.icon
            const active = i.id === activeId
            return (
              <a
                key={i.id}
                href={navHref(i, sessionId)}
                aria-current={active ? 'page' : undefined}
                onClick={onNavigate}
                className={clsx('t-fast relative z-10 flex items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-[7px] text-[13px] leading-4', active ? 'font-medium text-ink' : 'text-ink-2 hover:bg-raised hover:text-ink')}
                title={i.hint}
              >
                <Icon size={15} strokeWidth={1.75} className={clsx('shrink-0', active ? 'text-accent' : 'text-ink-3')} aria-hidden="true" />
                <span className="truncate">{i.label}</span>
              </a>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function FantasyContext() {
  const ctx = useFantasyContext()
  const sessions = useFantasySessions()
  const navigate = useNavigate()
  const list = sessions.data ?? []
  const onPick = (id: string) => {
    const hash = window.location.hash || '#/draft'
    navigate(`/fantasy?session=${encodeURIComponent(id)}${hash}`)
    window.dispatchEvent(new Event('locationchange'))
  }
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2" aria-label="Fantasy context">
      <label className="flex items-center gap-1.5 text-xs text-ink-3">
        <span className="sr-only">Session</span>
        <select aria-label="Session" className="control max-w-[220px] truncate text-[13px] text-ink" value={ctx.sessionId ?? ''} onChange={(e) => e.target.value && onPick(e.target.value)}>
          {!ctx.sessionId && <option value="">No session</option>}
          {ctx.sessionId && !list.some((s) => s.id === ctx.sessionId) && <option value={ctx.sessionId}>{ctx.sessionName ?? ctx.sessionId}</option>}
          {list.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      </label>
      {ctx.sessionId && (
        <span className="hidden items-center gap-2 text-xs text-ink-2 sm:inline-flex">
          <span className="text-ink-4">·</span>
          <span>{ctx.linked ? (ctx.leagueName ?? 'Linked to ESPN') : ctx.isComplete ? 'Not linked' : 'Draft in progress'}</span>
          {ctx.period != null && <><span className="text-ink-4">·</span><span className="tnum">Week {ctx.period}</span></>}
          {ctx.syncedAt && <><span className="text-ink-4">·</span><span title={ctx.syncedAt}>synced {new Date(ctx.syncedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></>}
        </span>
      )}
      {ctx.isDemo && <Badge tone="warning">Demo data</Badge>}
    </div>
  )
}

export function AppShell() {
  const status = useStatus()
  const { theme, toggle } = useTheme()
  const loc = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const togglePalette = useCallback(() => setPaletteOpen((o) => !o), [])
  useCmdK(togglePalette)
  const banner = status.data?.data.banner
  const namespace = status.data?.data.namespace
  const syncNamespace = useCompare((s) => s.syncNamespace)
  const syncShortlistNamespace = useShortlist((s) => s.syncNamespace)
  useEffect(() => {
    if (namespace) { syncNamespace(namespace); syncShortlistNamespace(namespace) }
  }, [namespace, syncNamespace, syncShortlistNamespace])
  const isDemo = status.data?.data.is_demo
  const fantasy = useFantasyContext()
  const isFantasyRoute = loc.pathname.startsWith('/fantasy')
  // The copilot's hash router changes the hash without a React Router navigation; follow it.
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const update = () => setHash(window.location.hash)
    update()
    window.addEventListener('hashchange', update); window.addEventListener('popstate', update); window.addEventListener('locationchange', update)
    return () => { window.removeEventListener('hashchange', update); window.removeEventListener('popstate', update); window.removeEventListener('locationchange', update) }
  }, [loc])
  const activeId = activeNavId(loc.pathname, hash)
  const activeItem = navItemById(activeId)
  const group = navGroupOf(activeId)
  useEffect(() => { setDrawerOpen(false) }, [loc.pathname, hash])

  const sidebar = (onNavigate?: () => void) => (
    <>
      <div className="flex items-center justify-between py-3 pr-2">
        <Brand />
        {onNavigate && <button type="button" aria-label="Close navigation" onClick={onNavigate} className="t-fast rounded p-1 text-ink-3 hover:text-ink"><X size={16} /></button>}
      </div>
      <div className="px-3 pb-2">
        <button type="button" onClick={() => setPaletteOpen(true)} className="t-fast flex w-full items-center gap-2 rounded-[var(--radius-control)] border border-line bg-raised/60 px-2 py-1.5 text-xs text-ink-3 hover:border-line-strong hover:text-ink-2">
          <Search size={13} aria-hidden="true" /><span className="flex-1 text-left">Search players, pages</span><kbd className="font-mono text-[10px] text-ink-4">⌘K</kbd>
        </button>
      </div>
      <SideNav activeId={activeId} sessionId={fantasy.sessionId} isComplete={fantasy.isComplete} onNavigate={onNavigate} />
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5 text-[11px] text-ink-3">
        <span className="truncate">{status.data ? <>NBA data: <span className="text-ink-2">{status.data.data.namespace}</span>{status.data.data.generated_at ? <span title={status.data.data.generated_at}> · {new Date(status.data.data.generated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span> : null}</> : '…'}</span>
        <button type="button" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} className="t-fast press rounded p-1 text-ink-3 hover:bg-raised hover:text-ink">{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-[var(--sidebar-w)] shrink-0 flex-col border-r border-line bg-page lg:flex">{sidebar()}</aside>
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <aside className="rise-in absolute inset-y-0 left-0 flex w-[min(86vw,300px)] flex-col border-r border-line bg-page shadow-[var(--shadow-float)]">{sidebar(() => setDrawerOpen(false))}</aside>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        {isDemo && (
          <div role="status" className="flex items-center gap-3 border-b border-line bg-demo/10 px-4 py-1 text-xs text-ink">
            <span className="rounded-sm bg-demo px-1.5 py-0.5 font-semibold text-[#15110d]">Demo data</span>
            <span className="text-ink-2">{banner ?? 'Synthetic dataset: fictional teams, players and statistics.'}</span>
            <Link to="/methodology" className="ml-auto whitespace-nowrap text-accent hover:underline">How to load real data</Link>
          </div>
        )}
        <header className="sticky top-0 z-20 flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-page/90 px-4 py-2 backdrop-blur">
          <button type="button" aria-label="Open navigation" onClick={() => setDrawerOpen(true)} className="t-fast rounded p-1 text-ink-2 hover:bg-raised lg:hidden"><Menu size={18} /></button>
          <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13px] sm:flex">
            {group?.label && <><span className="text-ink-3">{group.label}</span><span className="text-ink-4">/</span></>}
            <span className="truncate font-medium text-ink">{activeItem?.label ?? 'Courtside'}</span>
          </nav>
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            {isFantasyRoute ? <FantasyContext /> : (
              <>
                <div className="hidden w-56 md:block"><PlayerSearch inputId="global-player-search" placeholder="Search players" /></div>
                <SeasonPicker compact />
                <CompareTray />
              </>
            )}
            <Button size="sm" variant="ghost" onClick={() => setPaletteOpen(true)} aria-label="Open command palette" className="md:hidden"><Search size={14} /></Button>
          </div>
        </header>
        <main key={loc.pathname} className="flex-1 px-4 py-5 sm:px-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} sessionId={fantasy.sessionId} />
    </div>
  )
}
