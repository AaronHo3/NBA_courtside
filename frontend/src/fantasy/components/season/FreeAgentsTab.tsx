import { useEffect, useState } from 'react'
import type { ActualsScope, FreeAgentView } from '../../api/types'
import { categoryLabel, fmtDate, fmtNum, fmtSigned, PRIMITIVE_POSITIONS, positionsText } from '../../lib/format'
import { readHashQuery, setHashQuery } from '../../lib/hashQuery'
import { useDraftStore } from '../../store/draftStore'
import { useSeasonStore } from '../../store/seasonStore'
import { Diverging } from '../charts/Diverging'
import { Badge } from '../common/Badge'
import { ChartFrame } from '../ui/ChartFrame'
import { Icon } from '../ui/Icon'
import { PlayerIdentity } from '../ui/PlayerIdentity'
import { EmptyState, ErrorState } from '../ui/States'
import { minutesTitle } from '../../lib/minutes'
import { FreeAgentsTable } from './FreeAgentsTable'
import { MinutesOverride } from './MinutesOverride'
import { Segmented } from '../ui/Segmented'
import { SwapActuals } from './SwapActuals'

type RankBy = 'projection' | 'actual-week' | 'actual-season'
const RANKS: Array<{ id: RankBy; label: string }> = [
  { id: 'projection', label: 'Projection' },
  { id: 'actual-week', label: 'This week (actual)' },
  { id: 'actual-season', label: 'Season to date (actual)' },
]
const rankFromHash = (): RankBy => {
  const r = readHashQuery(window.location.hash).rank
  return r === 'actual-week' || r === 'actual-season' ? r : 'projection'
}

/** Unowned players ranked by what they add; selecting a row explains the add/drop swap category by category. */
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
  const [rankBy, setRankBy] = useState<RankBy>(rankFromHash)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const scope: ActualsScope = rankBy === 'actual-season' ? 'season' : 'week'
  const query = { limit: 60, q: q || null, position: position || null, actuals: scope }
  useEffect(() => {
    const t = setTimeout(() => void loadFreeAgents(sessionId, query), 150)
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
  const visible = actualMode
    ? [...filtered].sort((a, b) => (b.actual?.value_actual ?? Number.NEGATIVE_INFINITY) - (a.actual?.value_actual ?? Number.NEGATIVE_INFINITY))
    : filtered
  const actualsMeta = freeAgents?.actuals ?? null
  const minutesMeta = freeAgents?.minutes ?? null
  const reload = () => loadFreeAgents(sessionId, query)
  const hasLogs = Boolean(gameLogs?.fetched_at)
  const selected: FreeAgentView | null = visible.find((f) => f.player.player_id === selectedId) ?? visible[0] ?? null
  const cats = overview?.league_categories ?? []
  const filtersActive = q !== '' || position !== '' || !hideOut
  return (
    <div className="stack">
      <div className="filter-bar">
        <span className="field search-field" style={{ width: 220 }}>
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
          Hide OUT players
        </label>
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
        <span className="status">{faStatus === 'loading' ? 'Loading…' : freeAgents ? `${visible.length} shown` : ''}</span>
      </div>
      <div className="rank-row" data-testid="rank-row">
        <Segmented<RankBy> variant="pill" label="Rank by" value={rankBy} onChange={setRankBy} options={RANKS.map((r) => ({ id: r.id, label: r.label, testId: `rank-${r.id}` }))} />
        <button type="button" className="small" onClick={() => void refreshGameLogs(sessionId, query)} disabled={logsStatus === 'refreshing'} data-testid="refresh-logs" title="Fetch this season's NBA game logs (the only network call on this tab)">
          <Icon name="refresh" size={13} className={logsStatus === 'refreshing' ? 'spin' : undefined} /> {logsStatus === 'refreshing' ? 'Refreshing…' : 'Refresh game logs'}
        </button>
        <span className="status" data-testid="logs-status">
          {hasLogs ? `NBA game logs through ${gameLogs?.max_game_date ?? '—'} · refreshed ${fmtDate(gameLogs?.fetched_at).slice(0, 16)}` : 'No game logs stored yet'}
        </span>
      </div>
      {logsError && <ErrorState title="Could not refresh game logs">{logsError}</ErrorState>}
      {actualMode && !hasLogs && logsStatus !== 'refreshing' && (
        <p className="callout" data-testid="actuals-callout">
          Ranking by actual production needs this season's game logs. Refresh them once; they are stored locally and never fetched while ranking.
        </p>
      )}
      {faError && <ErrorState title="Could not load free agents">{faError}</ErrorState>}
      {minutesMeta && !actualMode && (
        <p className="muted small-text" data-testid="minutes-basis">
          Minutes: {minutesMeta.players_adjusted} players ranked on in-season minutes
          {minutesMeta.blend ? ` (projected minutes blended with the last ${minutesMeta.window_games} stored games, weight games ÷ (games + ${fmtNum(minutesMeta.k_games, 0)}))` : ''}
          {minutesMeta.overrides > 0 ? `, ${minutesMeta.overrides} override${minutesMeta.overrides === 1 ? '' : 's'}` : ''}. Per-minute rates stay projected; only the role changes.
        </p>
      )}
      {freeAgents && overview && visible.length === 0 && <EmptyState title="No free agents match">Clear the search or position filter to see the full list.</EmptyState>}
      {selected && overview && (
        <ChartFrame
          title="Proposed swap"
          description="Value is the fast-ranking score against your current roster (weighted z); the best drop is the roster player whose loss costs you least; net Δ is the swap's change in weighted z. Bars show the added player's z by category."
          testId="swap-panel"
          legend={[
            { label: 'strength', swatch: 'good' },
            { label: 'weakness', swatch: 'bad' },
          ]}
        >
          <div className="swap">
            <div className="swap-sides">
              <div className="swap-side add">
                <span className="swap-k">
                  <Icon name="arrow-up" size={13} /> Add
                </span>
                <PlayerIdentity name={selected.player.name} team={selected.player.team} positions={selected.player.eligible_positions} espnId={selected.player.espn_id} size={40} meta={selected.percent_owned != null ? `${fmtNum(selected.percent_owned, 0)}% owned` : undefined} />
                <span className="swap-val">
                  value <b>{fmtNum(selected.score, 2)}</b>
                </span>
                {selected.flags.includes('out') && <Badge tone="error">OUT</Badge>}
                {selected.flags.includes('day-to-day') && <Badge tone="warn">day-to-day</Badge>}
              </div>
              <Icon name="swap" size={20} className="swap-icon" />
              <div className="swap-side drop">
                <span className="swap-k">
                  <Icon name="arrow-down" size={13} /> Drop
                </span>
                {selected.best_drop ? (
                  <>
                    <PlayerIdentity name={selected.best_drop.name} team={selected.best_drop.team} positions={selected.best_drop.eligible_positions} espnId={selected.best_drop.espn_id} size={40} />
                    <span className="swap-val">
                      value <b>{fmtNum(selected.drop_value, 2)}</b>
                    </span>
                  </>
                ) : (
                  <span className="muted">No drop needed (open roster spot)</span>
                )}
              </div>
              <div className={`swap-net ${selected.swap_delta > 0 ? 'good' : selected.swap_delta < 0 ? 'bad' : ''}`}>
                <span className="swap-k">Net Δ</span>
                <span className="swap-big">{fmtSigned(selected.swap_delta, 2)}</span>
                <span className="muted small-text">weighted z</span>
              </div>
            </div>
            <div className="swap-cats">
              <Diverging
                rows={cats.map((c) => ({ id: c.key, label: categoryLabel(c.key, cats), value: selected.z[c.key] ?? null, sublabel: c.higher_is_better ? undefined : 'lower is better' }))}
                format={(v) => v.toFixed(1)}
                unit="z (season value vs league pool)"
                negativeLabel="below pool"
                positiveLabel="above pool"
              />
            </div>
          </div>
          {actualsMeta && <SwapActuals add={selected.player} addActual={selected.actual} drop={selected.best_drop} dropActual={selected.drop_actual} meta={actualsMeta} />}
          {!actualMode && (
            <div className="row" style={{ marginTop: 8, flexWrap: 'wrap', gap: 12 }} data-testid="swap-minutes">
              <span className="muted small-text" title={minutesTitle(selected.minutes, selected.player.per_game.MIN)}>
                Minutes used <b>{fmtNum(selected.minutes ? selected.minutes.used : (selected.player.per_game.MIN ?? null), 1)}</b>
                {selected.minutes ? ` · projected ${fmtNum(selected.minutes.projected, 1)}` : ' · projected'}
                {selected.minutes && selected.minutes.recent !== null && selected.minutes.recent !== undefined ? ` · last ${selected.minutes.games} game${selected.minutes.games === 1 ? '' : 's'} ${fmtNum(selected.minutes.recent, 1)}` : ''}
                {selected.minutes?.source === 'override' ? ' · your override' : ''}
              </span>
              {strategy && <MinutesOverride key={`${selected.player.player_id}:${strategy.minutes_overrides?.[selected.player.player_id] ?? ''}`} playerId={selected.player.player_id} playerName={selected.player.name} strategy={strategy} onSave={async (next) => (await setStrategy(next)) && void reload()} />}
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="small" onClick={() => openDrawer(selected.player.player_id)}>
              <Icon name="eye" size={13} /> Player details
            </button>
            <span className="muted small-text">
              {selected.player.team ?? 'FA'} · {positionsText(selected.player.eligible_positions)} · {selected.injury_status ?? 'status unknown'}
            </span>
          </div>
        </ChartFrame>
      )}
      {freeAgents && overview && visible.length > 0 && (
        <FreeAgentsTable items={visible} categories={overview.league_categories} selectedId={selected?.player.player_id ?? null} onSelect={(id) => setSelectedId(id)} onOpen={(id) => openDrawer(id)} mode={actualMode ? 'actual' : 'projection'} actuals={actualsMeta} />
      )}
    </div>
  )
}
