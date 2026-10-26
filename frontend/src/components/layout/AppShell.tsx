import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { clsx } from 'clsx'
import { Menu, Moon, Search, Sun, X } from 'lucide-react'
import { useStatus } from '@/hooks/useApi'
import { useTheme } from '@/store/theme'
import { useCompare } from '@/store/compare'
import { useShortlist } from '@/store/shortlist'
import { useFantasyContext } from '@/lib/fantasyBridge'
import { onLocationChange, readHashQuery } from '@/fantasy/lib/hashQuery'
import { useCrumb } from '@/store/crumb'
import { CommandPalette } from '../CommandPalette'
import { Button } from '../ui'
import { NAV_GROUPS, SEASON_TABS, activeNavId, buildBreadcrumb, navHref, seasonTabFrom, type NavItem, type SeasonTabId, type ShellCrumb } from './nav'
import { FantasyContextBar, ResearchContextBar } from './ShellContext'
import { useDocumentTitle } from './useDocumentTitle'

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

/**
 * `window.location.hash`, kept current across hash edits, back/forward and in-app hash-query writes
 * (subscribed events) and React Router navigations (pushState fires no event, but the shell re-renders
 * on every router location change and the snapshot is re-read on each render).
 */
function useLocationHash(): string {
  return useSyncExternalStore(onLocationChange, () => window.location.hash)
}

const NAV_LINK = 't-fast relative z-10 flex items-center gap-2.5 rounded-[var(--radius-control)] px-2 py-[7px] text-[13px] leading-4'

/** "My league" sub-items: the season tabs, shown only while the league is the active page. */
function SeasonSubNav({ item, sessionId, activeTab, onNavigate }: { item: NavItem; sessionId: string | null; activeTab: SeasonTabId; onNavigate?: () => void }) {
  return (
    <ul aria-label="My league views" className="relative flex flex-col gap-px pb-1">
      {SEASON_TABS.map((t) => {
        const active = t.id === activeTab
        return (
          <li key={t.id}>
            <a
              href={`${navHref(item, sessionId)}?tab=${t.id}`}
              aria-current={active ? 'page' : undefined}
              onClick={onNavigate}
              className={clsx(NAV_LINK, 'py-[5px] pl-[34px] text-xs', active ? 'font-medium text-ink' : 'text-ink-2 hover:bg-raised hover:text-ink')}
            >
              <span className="truncate">{t.label}</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

function SideNav({ activeId, activeTab, sessionId, isComplete, onNavigate }: { activeId: string | null; activeTab: SeasonTabId | null; sessionId: string | null; isComplete: boolean; onNavigate?: () => void }) {
  const navRef = useRef<HTMLElement>(null)
  const [pill, setPill] = useState<{ top: number; height: number } | null>(null)
  const measure = useCallback(() => {
    const nav = navRef.current
    const el = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (!nav || !el) { setPill(null); return }
    const a = el.getBoundingClientRect(), b = nav.getBoundingClientRect()
    setPill({ top: a.top - b.top + nav.scrollTop, height: a.height })
  }, [])
  useLayoutEffect(measure, [activeId, activeTab, isComplete, measure])
  useEffect(() => { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure) }, [measure])
  const visible = (i: NavItem) => !i.afterDraft || isComplete
  return (
    <nav ref={navRef} aria-label="Primary" className="relative flex flex-1 flex-col gap-4 overflow-y-auto px-2 py-2">
      {pill && <span aria-hidden="true" className="pointer-events-none absolute left-2 right-2 rounded-[var(--radius-control)] bg-accent-soft transition-[top,height] duration-[var(--dur-panel)] ease-[var(--ease)]" style={{ top: pill.top, height: pill.height }} />}
      {NAV_GROUPS.map((g) => (
        <div key={g.id} className="relative flex flex-col gap-px">
          {g.label && <p className="px-2 pb-1 text-meta font-semibold uppercase tracking-[0.1em] text-ink-3">{g.label}</p>}
          {g.items.filter(visible).map((i) => {
            const Icon = i.icon
            const active = i.id === activeId
            // With a season tab open the tab is the page; the league item is its parent.
            const sub = active && activeTab !== null
            return (
              <div key={i.id} className="contents">
                <a
                  href={navHref(i, sessionId)}
                  aria-current={sub ? 'true' : active ? 'page' : undefined}
                  onClick={onNavigate}
                  className={clsx(NAV_LINK, active ? 'font-medium text-ink' : 'text-ink-2 hover:bg-raised hover:text-ink')}
                  title={i.hint}
                >
                  <Icon size={15} strokeWidth={1.75} className={clsx('shrink-0', active ? 'text-accent' : 'text-ink-3')} aria-hidden="true" />
                  <span className="truncate">{i.label}</span>
                </a>
                {sub && <SeasonSubNav item={i} sessionId={sessionId} activeTab={activeTab} onNavigate={onNavigate} />}
              </div>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

function Breadcrumb({ crumbs }: { crumbs: ShellCrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" className="hidden min-w-0 items-center gap-1.5 text-[13px] sm:flex">
      {crumbs.map((c, i) => {
        const last = i === crumbs.length - 1
        const body = last
          ? <span aria-current="page" className="truncate font-medium text-ink">{c.label}</span>
          : c.href
            ? c.fantasy
              ? <a href={c.href} className="t-fast truncate text-ink-2 hover:text-ink hover:underline">{c.label}</a>
              : <Link to={c.href} className="t-fast truncate text-ink-2 hover:text-ink hover:underline">{c.label}</Link>
            : <span className="truncate text-ink-3">{c.label}</span>
        return (
          <span key={`${i}:${c.label}`} className="flex min-w-0 items-center gap-1.5">
            {body}
            {!last && <span aria-hidden="true" className="text-ink-3">/</span>}
          </span>
        )
      })}
    </nav>
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
  // The copilot's hash router and hash-query writes change the hash without a React Router navigation; follow them.
  const hash = useLocationHash()
  // React Router navigations (links, palette, programmatic) push without an event; announce each one so
  // listeners outside the router context (the copilot's hash router, hash-query readers) follow too.
  useEffect(() => { window.dispatchEvent(new Event('locationchange')) }, [loc.key])
  const activeId = activeNavId(loc.pathname, hash)
  const activeTab = isFantasyRoute && activeId === 'season' ? seasonTabFrom(readHashQuery(hash).tab) : null
  const pageParts = useCrumb((s) => s.parts)
  const { crumbs, title } = buildBreadcrumb(loc.pathname, hash, pageParts, fantasy.sessionId)
  useDocumentTitle(title)
  useEffect(() => { setDrawerOpen(false) }, [loc.pathname, hash])

  const sidebar = (onNavigate?: () => void) => (
    <>
      <div className="flex items-center justify-between py-3 pr-2">
        <Brand />
        {onNavigate && <button type="button" aria-label="Close navigation" onClick={onNavigate} className="t-fast rounded p-1 text-ink-3 hover:text-ink"><X size={16} /></button>}
      </div>
      <div className="px-3 pb-2">
        <button type="button" onClick={() => setPaletteOpen(true)} className="t-fast flex w-full items-center gap-2 rounded-[var(--radius-control)] border border-line bg-raised/60 px-2 py-1.5 text-xs text-ink-3 hover:border-line-strong hover:text-ink-2">
          <Search size={13} aria-hidden="true" /><span className="flex-1 text-left">Search players, pages</span><kbd className="font-mono text-meta text-ink-3">⌘K</kbd>
        </button>
      </div>
      <SideNav activeId={activeId} activeTab={activeTab} sessionId={fantasy.sessionId} isComplete={fantasy.isComplete} onNavigate={onNavigate} />
      <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2.5 text-xs text-ink-3">
        <span className="truncate">{status.data ? <>NBA data: <span className="text-ink-2">{status.data.data.namespace}</span>{status.data.data.generated_at ? <span title={status.data.data.generated_at}> · {new Date(status.data.data.generated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span> : null}</> : '…'}</span>
        <button type="button" onClick={toggle} aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'} className="t-fast press inline-flex h-7 w-7 items-center justify-center rounded text-ink-3 hover:bg-raised hover:text-ink">{theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}</button>
      </div>
    </>
  )

  return (
    <div className="flex min-h-full">
      <a href="#main-content" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('main-content')?.focus() }}>Skip to content</a>
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
            <span className="rounded-sm bg-amber-fill px-1.5 py-0.5 font-semibold text-on-fill">Demo data</span>
            <span className="text-ink-2">{banner ?? 'Synthetic dataset: fictional teams, players and statistics.'}</span>
            <Link to="/methodology" className="ml-auto whitespace-nowrap text-accent hover:underline">How to load real data</Link>
          </div>
        )}
        <header className="z-20 flex min-h-12 flex-wrap items-center gap-x-3 gap-y-2 border-b border-line bg-page/90 px-4 py-2 backdrop-blur sm:sticky sm:top-0">
          <button type="button" aria-label="Open navigation" onClick={() => setDrawerOpen(true)} className="t-fast -ml-2 inline-flex h-10 w-10 items-center justify-center rounded text-ink-2 hover:bg-raised lg:hidden"><Menu size={18} /></button>
          <Breadcrumb crumbs={crumbs} />
          <div className="ml-auto flex min-w-0 flex-wrap items-center justify-end gap-2">
            {isFantasyRoute ? <FantasyContextBar /> : <ResearchContextBar />}
            <Button size="sm" variant="ghost" onClick={() => setPaletteOpen(true)} aria-label="Open command palette" className="h-10 w-10 justify-center md:hidden"><Search size={14} /></Button>
          </div>
        </header>
        <main key={loc.pathname} id="main-content" tabIndex={-1} className="flex-1 px-4 py-5 outline-none sm:px-6">
          <Outlet />
        </main>
      </div>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} sessionId={fantasy.sessionId} />
    </div>
  )
}
