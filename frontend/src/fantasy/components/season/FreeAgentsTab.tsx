import { useEffect, useRef, useState } from 'react'
import type { ActualsScope, FreeAgentView, Strategy } from '../../api/types'
import { fmtNum, PRIMITIVE_POSITIONS } from '../../lib/format'
import { readHashQuery, setHashQuery } from '../../lib/hashQuery'
import { useDraftStore } from '../../store/draftStore'
import { useSeasonStore } from '../../store/seasonStore'
import { Freshness } from '../ui/Freshness'
import { Icon } from '../ui/Icon'
import { Segmented } from '../ui/Segmented'
import { EmptyState, ErrorState } from '../ui/States'
import { FreeAgentsSkeleton, FreeAgentsTable } from './FreeAgentsTable'
import { SwapPanel } from './SwapPanel'

type RankBy = 'projection' | 'actual-week' | 'actual-season'
const RANKS: Array<{ id: RankBy; label: string }> = [
  { id: 'projection', label: 'Projection' },
  { id: 'actual-week', label: 'This week (actual)' },
  { id: 'actual-season', label: 'Season to date (actual)' },
]
const DEBOUNCE_MS = 150
const DAY_MS = 86_400_000

const rankFromHash = (): RankBy => {
  const r = readHashQuery(window.location.hash).rank
  return r === 'actual-week' || r === 'actual-season' ? r : 'projection'
}

/** Logs older than a day read as stale here (actual rankings move daily), stricter than the generic freshness tone. */
function logsStale(at: string | null | undefined): boolean {
  if (!at) return false
  const t = Date.parse(at)
  return Number.isFinite(t) && Date.now() - t > DAY_MS
}

const byActual = (a: FreeAgentView, b: FreeAgentView) => (b.actual?.value_actual ?? Number.NEGATIVE_INFINITY) - (a.actual?.value_actual ?? Number.NEGATIVE_INFINITY)

/** Unowned players ranked by what they add; the selected row's add/drop swap is explained below the table. */
export function FreeAgentsTab({ sessionId }: { sessionId: string }) {
  const overview = useSeasonStore((s) => s.overview)
  const freeAgents = useSeasonStore((s) => s.freeAgents)
  const faStatus = useSeasonStore((s) => s.faStatus)
  const faError = useSeasonStore((s) => s.faError)
  const loadFreeAgents = useSeasonStore((s) => s.loadFreeAgents)
  const gameLogs = useSeasonStore((s) => s.gameLogs)
  const logsStatus = useSeasonStore((s) => s.logsStatus)
  const logsError = useSeasonStore((s) => s.logsError)
  const loadGameLogsMeta = useSeasonStore((s) => s.loadGameLogsMeta)
  const refreshGameLogs = useSeasonStore((s) => s.refreshGameLogs)
  const openDrawer = useDraftStore((s) => s.openDrawer)
  const strategy = useDraftStore((s) => s.state?.strategy ?? null)
  const setStrategy = useDraftStore((s) => s.setStrategy)
  const [q, setQ] = useState('')
  const [position, setPosition] = useState('')
  const [hideOut, setHideOut] = useState(true)
  const [advanced, setAdvanced] = useState(false)
  const [rankBy, setRankBy] = useState<RankBy>(rankFromHash)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const scope: ActualsScope = rankBy === 'actual-season' ? 'season' : 'week'
  const query = { limit: 60, q: q || null, position: position || null, actuals: scope }
  useEffect(() => {
    const t = setTimeout(() => void loadFreeAgents(sessionId, query), DEBOUNCE_MS)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- query is derived from the listed state
  }, [sessionId, q, position, scope, loadFreeAgents])
  useEffect(() => {
    void loadGameLogsMeta(sessionId)
  }, [sessionId, loadGameLogsMeta])
  useEffect(() => {
    setHashQuery({ rank: rankBy === 'projection' ? null : rankBy })
  }, [rankBy])
  const items = freeAgents?.items ?? []
  const actualMode = rankBy !== 'projection'
  const filtered = hideOut ? items.filter((f) => !f.flags.includes('out')) : items
  const visible = actualMode ? [...filtered].sort(byActual) : filtered
  const actualsMeta = freeAgents?.actuals ?? null
  const minutesMeta = freeAgents?.minutes ?? null
  const reload = () => loadFreeAgents(sessionId, query)
  const hasLogs = Boolean(gameLogs?.fetched_at)
  const stale = hasLogs && logsStale(gameLogs?.fetched_at)
  // Selection is keyed by player id, so it survives list reloads; it falls back to the top row only while that player is not listed.
  const selected: FreeAgentView | null = visible.find((f) => f.player.player_id === selectedId) ?? visible[0] ?? null
  const cats = overview?.league_categories ?? []
  const filtersActive = q !== '' || position !== '' || !hideOut
  const refreshing = logsStatus === 'refreshing'
  const select = (id: string) => {
    setSelectedId(id)
    const reduce = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    panelRef.current?.scrollIntoView?.({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' })
  }
  const saveStrategy = async (next: Strategy) => {
    const ok = await setStrategy(next)
    if (!ok) return false
    await reload()
    // Confirm only when the ranking actually reloaded.
    return useSeasonStore.getState().faStatus === 'ready'
  }
  const statusText = faStatus === 'loading' ? (freeAgents ? 'Updating…' : 'Loading…') : freeAgents ? `${visible.length} shown` : ''
  return (
    <div className="stack fa-tab">
      <div className="filter-bar fa-filters">
        <span className="field search-field fa-search">
          <Icon name="search" size={14} />
          <input aria-label="Search free agents" placeholder="Search name" value={q} onChange={(e) => setQ(e.target.value)} />
        </span>
        <span className="field">
          <label htmlFor="fa-pos">Position</label>
          <select id="fa-pos" aria-label="Position" value={position} onChange={(e) => setPosition(e.target.value)}>
            <option value="">Any</option>
            {PRIMITIVE_POSITIONS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </span>
        <label className="field">
          <input type="checkbox" checked={hideOut} onChange={(e) => setHideOut(e.target.checked)} aria-label="Hide OUT players" />
          Hide OUT
        </label>
        <span className="rank-row" data-testid="rank-row">
          <Segmented<RankBy> variant="pill" label="Rank by" value={rankBy} onChange={setRankBy} options={RANKS.map((r) => ({ id: r.id, label: r.label, testId: `rank-${r.id}` }))} />
        </span>
        {filtersActive && (
          <button
            type="button"
            className="small ghost"
            onClick={() => {
              setQ('')
              setPosition('')
              setHideOut(true)
            }}
          >
            <Icon name="close" size={12} /> Reset filters
          </button>
        )}
        <span className={`fa-logs${stale ? ' stale' : ''}`} data-testid="fa-logs" data-stale={stale}>
          <span data-testid="logs-status" title={hasLogs ? `NBA game logs through ${gameLogs?.max_game_date ?? '—'}` : 'No game logs stored yet'}>
            <Freshness label="Game logs" at={gameLogs?.fetched_at ?? null} detail={hasLogs ? `through ${gameLogs?.max_game_date ?? '—'}${stale ? ' · stale' : ''}` : undefined} />
          </span>
          <button type="button" className="small" onClick={() => void refreshGameLogs(sessionId, query)} disabled={refreshing} data-testid="refresh-logs" title="Fetch this season's NBA game logs (the only network call on this tab)">
            <Icon name="refresh" size={13} className={refreshing ? 'spin' : undefined} /> {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </span>
      </div>
      {logsError && <ErrorState title="Could not refresh game logs">{logsError}</ErrorState>}
      {actualMode && !hasLogs && !refreshing && (
        <p className="callout" data-testid="actuals-callout">
          Ranking by actual production needs this season's game logs. Refresh them once; they are stored locally and never fetched while ranking.
        </p>
      )}
      {faError && (
        <ErrorState
          title="Could not load free agents"
          action={
            <button type="button" className="small" onClick={() => void reload()}>
              <Icon name="refresh" size={12} /> Retry
            </button>
          }
        >
          {faError}
        </ErrorState>
      )}
      {minutesMeta && !actualMode && (
        <p className="muted small-text fa-basis" data-testid="minutes-basis">
          Minutes: {minutesMeta.players_adjusted} players ranked on in-season minutes
          {minutesMeta.blend ? ` (projected minutes blended with the last ${minutesMeta.window_games} stored games, weight games ÷ (games + ${fmtNum(minutesMeta.k_games, 0)}))` : ''}
          {minutesMeta.overrides > 0 ? `, ${minutesMeta.overrides} override${minutesMeta.overrides === 1 ? '' : 's'}` : ''}. Per-minute rates stay projected; only the role changes.
        </p>
      )}
      {!freeAgents && faStatus === 'loading' && <FreeAgentsSkeleton rows={5} />}
      {freeAgents && overview && visible.length === 0 && <EmptyState title="No free agents match">Clear the search or position filter to see the full list.</EmptyState>}
      {freeAgents && overview && visible.length > 0 && (
        <div className="fa-table-block">
          <div className="fa-table-head">
            <span className="status" aria-live="polite">
              {statusText}
              {actualMode ? ' · ranked by actual value' : ' · ranked by value against your roster'}
            </span>
            {!actualMode && (
              <button type="button" className="small ghost" aria-pressed={advanced} onClick={() => setAdvanced((a) => !a)} data-testid="fa-advanced">
                <Icon name="list" size={12} /> Advanced table
              </button>
            )}
          </div>
          <FreeAgentsTable items={visible} categories={cats} selectedId={selected?.player.player_id ?? null} onSelect={select} onOpen={(id) => openDrawer(id)} mode={actualMode ? 'actual' : 'projection'} actuals={actualsMeta} advanced={advanced} />
        </div>
      )}
      {selected && overview && (
        <SwapPanel ref={panelRef} agent={selected} categories={cats} actuals={actualsMeta} actualMode={actualMode} strategy={strategy} onSaveStrategy={saveStrategy} onOpen={(id) => openDrawer(id)} />
      )}
    </div>
  )
}
