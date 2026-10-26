import { useEffect, useState } from 'react'
import { fantasyHref } from '@/lib/fantasyBridge'
import { api } from '../api/client'
import type { PerformerRow, PerformersResponse } from '../api/types'
import { Diverging } from '../components/charts/Diverging'
import { Heatmap } from '../components/charts/Heatmap'
import { Scatter } from '../components/charts/Scatter'
import { Explainer } from '../components/performers/Explainer'
import { type BackLink, FeatureCard } from '../components/performers/FeatureCards'
import { PerformerTable, type Metric, type MoveTags } from '../components/performers/PerformerTable'
import { ChartFrame } from '../components/ui/ChartFrame'
import { Icon } from '../components/ui/Icon'
import { PageHeader, type ContextChip } from '../components/ui/PageHeader'
import { Segmented } from '../components/ui/Segmented'
import { StatCard, StatRow } from '../components/ui/StatCard'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/States'
import { categoryLabel, fmtNum, fmtSigned } from '../lib/format'
import { readHashQuery, setHashQuery } from '../lib/hashQuery'
import { buildUrl } from '../lib/router'
import { teamColor } from '../lib/teamColors'
import { useDraftStore } from '../store/draftStore'
import { useSeasonStore } from '../store/seasonStore'

type Scope = 'week' | 'season'
type Unit = 'total' | 'per_game'

const UNIT_CAPTION = 'Units: category standard deviations × games (one unit ≈ one average starter-game in one category)'
const HEAT_ROWS = 16

/** The active unit mode, repeated on every caption that shows units. */
function UnitChip({ perGame }: { perGame: boolean }) {
  return (
    <span className="unit-chip" data-testid="unit-chip" title={perGame ? 'Units per game played (ESPN-counted games only)' : 'Cumulative units for the selection'}>
      {perGame ? 'Per game' : 'Totals'}
    </span>
  )
}

/** The biggest overperformer, skipping the leading contributor so the two key-player cards never show the same player. */
function pickOverperformer(data: PerformersResponse): { row: PerformerRow | undefined; leadAlsoOver: boolean } {
  const lead = data.contributors[0]
  const top = data.overperformers[0]
  if (!lead || !top || top.player.player_id !== lead.player.player_id) return { row: top, leadAlsoOver: false }
  return { row: data.overperformers.find((r) => r.player.player_id !== lead.player.player_id && r.over_expected !== null), leadAlsoOver: true }
}

/** Team performers: who produced the most for a fantasy team, and who beat their projection by the most. */
export function PerformersScreen() {
  const sessionId = useDraftStore((s) => s.sessionId)
  const state = useDraftStore((s) => s.state)
  const initial = readHashQuery(window.location.hash)
  const [manager, setManager] = useState<string | null>(initial.team ?? null)
  const [scope, setScope] = useState<Scope>(initial.scope === 'season' ? 'season' : 'week')
  const [period, setPeriod] = useState<number | null>(/^\d+$/.test(initial.week ?? '') ? Number(initial.week) : null)
  const [metric, setMetric] = useState<Metric>('contribution')
  const [unit, setUnit] = useState<Unit>('total')
  const perGame = unit === 'per_game'
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [data, setData] = useState<PerformersResponse | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)

  const managerId = manager ?? state?.league.user_manager_id ?? null
  const movesBody = useSeasonStore((s) => s.moves)
  const loadMoves = useSeasonStore((s) => s.loadMoves)

  useEffect(() => {
    if (!sessionId || !managerId) return
    let cancelled = false
    setStatus('loading')
    setError(null)
    setData(null)
    api
      .seasonPerformers(sessionId, managerId, scope === 'week' ? period : null)
      .then((res) => {
        if (cancelled) return
        setData(res)
        setStatus('ready')
        if (scope === 'week' && period === null && res.periods_available.length) setPeriod(res.periods_available[res.periods_available.length - 1])
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setStatus('error')
        setError(e instanceof Error ? e.message : String(e))
      })
    return () => {
      cancelled = true
    }
  }, [sessionId, managerId, scope, period])

  useEffect(() => {
    if (!sessionId || !state?.is_complete) return
    void loadMoves(sessionId, scope === 'week' ? period : null)
  }, [sessionId, scope, period, loadMoves, state?.is_complete])

  useEffect(() => {
    setHashQuery({ team: manager, scope: scope === 'season' ? 'season' : null, week: scope === 'week' && period !== null ? String(period) : null })
  }, [manager, scope, period])

  if (!sessionId || !state) {
    return (
      <EmptyState title="No session loaded" action={<a href={buildUrl('setup', null)}>Go to setup</a>}>
        Performers are computed from ESPN box scores for a drafted, linked session.
      </EmptyState>
    )
  }
  if (!state.is_complete) {
    return <EmptyState title="Team performers open once the draft is complete and the league is synced from ESPN" />
  }
  const periods = data?.periods_available ?? []
  const rows = data ? (metric === 'contribution' ? data.contributors : data.overperformers) : []
  const teamName = state.league.managers.find((m) => m.id === managerId)?.name ?? managerId ?? ''
  const withBaseline = data ? data.contributors.filter((r) => r.over_expected !== null) : []
  const totalContribution = data ? data.contributors.reduce((a, r) => a + r.contribution, 0) : 0
  const totalExpected = withBaseline.reduce((a, r) => a + (r.expected_contribution ?? 0), 0)
  const totalOver = withBaseline.reduce((a, r) => a + (r.over_expected ?? 0), 0)
  const totalGames = data ? data.contributors.reduce((a, r) => a + r.games, 0) : 0
  const select = (id: string) => {
    setSelectedId(id)
    setOpenId(id)
  }
  const moveTags: MoveTags = {}
  const wantPeriod = scope === 'week' ? period : null
  if (movesBody && movesBody.period === wantPeriod) {
    for (const m of movesBody.moves) {
      if (m.manager_id !== managerId) continue
      ;(moveTags[m.player.player_id] ??= []).push({ kind: m.kind, period: m.period })
    }
  }
  const nMoves = Object.values(moveTags).reduce((a, t) => a + t.length, 0)
  const backQuery: Record<string, string> = managerId ? { team: managerId } : {}
  if (scope === 'season') backQuery.scope = 'season'
  else if (period !== null) backQuery.week = String(period)
  const back: BackLink = { href: fantasyHref('performers', sessionId, backQuery), label: 'Performers' }
  const perGameOf = (total: number | null | undefined, games: number) => (total === null || total === undefined ? null : perGame ? (games ? total / games : null) : total)
  const chips: ContextChip[] = [{ label: 'Team', value: teamName, tone: managerId === state.league.user_manager_id ? 'amber' : 'neutral' }]
  if (data) chips.push({ label: 'Scoring', value: `${data.categories.length}-cat${data.categories.some((c) => c.key === 'TOV') ? '' : ', no TOV'}`, title: data.categories.map((c) => c.label).join(', ') })

  const heatRows = data ? data.contributors.slice(0, HEAT_ROWS) : []
  const byId = new Map((data?.contributors ?? []).map((r) => [r.player.player_id, r]))
  const heatValue = (id: string, key: string) => {
    const r = byId.get(id)
    return r ? perGameOf(r.contribution_by_category[key], r.games) : null
  }
  const heatMax = Math.max(1e-9, ...heatRows.flatMap((r) => (data?.categories ?? []).map((c) => Math.abs(heatValue(r.player.player_id, c.key) ?? 0))))
  const featuredOver = data ? pickOverperformer(data) : { row: undefined, leadAlsoOver: false }
  const leadRow = data?.contributors[0]
  const unitWord = perGame ? 'units / game' : 'units'

  return (
    <div className="stack performers-screen" data-testid="performers">
      <PageHeader
        title="Team performers"
        description="Who produced the most for a fantasy team, and who beat their projection by the most. Built from ESPN's applied box scores per matchup week; expected = projection per game × games actually played."
        chips={chips}
        filters={
          <>
            <span className="field">
              <label htmlFor="perf-team">Team</label>
              <select
                id="perf-team"
                value={managerId ?? ''}
                onChange={(e) => {
                  setManager(e.target.value)
                  setSelectedId(null)
                  setOpenId(null)
                }}
                data-testid="perf-team"
              >
                {state.league.managers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                    {m.id === state.league.user_manager_id ? ' (you)' : ''}
                  </option>
                ))}
              </select>
            </span>
            <Segmented<Scope>
              variant="pill"
              label="Scope"
              value={scope}
              onChange={setScope}
              options={[
                { id: 'week', label: 'Weekly', testId: 'scope-week' },
                { id: 'season', label: 'Season to date', testId: 'scope-season' },
              ]}
            />
            {scope === 'week' && (
              <span className="field">
                <label htmlFor="perf-week">Week</label>
                <select id="perf-week" value={period ?? ''} onChange={(e) => setPeriod(Number(e.target.value))} disabled={periods.length === 0} data-testid="perf-week">
                  {periods.length === 0 && <option value="">No weeks synced yet</option>}
                  {periods.map((p) => (
                    <option key={p} value={p}>
                      Week {p}
                    </option>
                  ))}
                </select>
              </span>
            )}
            <Segmented<Unit>
              variant="pill"
              label="Units"
              value={unit}
              onChange={setUnit}
              options={[
                { id: 'total', label: 'Totals', testId: 'unit-total' },
                { id: 'per_game', label: 'Per game', testId: 'unit-per-game' },
              ]}
            />
            {(selectedId || openId) && (
              <button
                type="button"
                className="small ghost"
                onClick={() => {
                  setSelectedId(null)
                  setOpenId(null)
                }}
              >
                <Icon name="close" size={12} /> Clear selection
              </button>
            )}
            {data && (
              <span className="status" title={data.baseline}>
                Source: {data.source}
              </span>
            )}
          </>
        }
      />

      {status === 'loading' && !data && <LoadingState title="Loading box scores" />}
      {status === 'error' && <ErrorState title="Could not load performers">{error}</ErrorState>}
      {data && data.contributors.length === 0 && (
        <EmptyState title="No box scores for this selection yet">{data.notes.join(' ') || 'Sync the league after games have been played; weekly stats fill in as ESPN applies them.'}</EmptyState>
      )}
      {data && data.contributors.length > 0 && (
        <>
          <section className="perf-summary" aria-label="Team summary">
            <StatRow>
              <StatCard label="Team contribution" value={fmtNum(perGame ? (totalGames ? totalContribution / totalGames : null) : totalContribution, 1)} detail={`${unitWord} · ${data.contributors.length} players`} />
              <StatCard label="Expected" value={withBaseline.length ? fmtNum(perGame ? totalExpected / Math.max(1, withBaseline.reduce((a, r) => a + r.games, 0)) : totalExpected, 1) : '—'} detail={withBaseline.length ? `${withBaseline.length} players with a baseline` : 'no baselines'} />
              <StatCard
                label="Vs expected"
                value={withBaseline.length ? fmtSigned(perGame ? totalOver / Math.max(1, withBaseline.reduce((a, r) => a + r.games, 0)) : totalOver, 1) : '—'}
                detail="players with a baseline only"
                tone={withBaseline.length ? (totalOver >= 0 ? 'good' : 'bad') : 'neutral'}
              />
              <StatCard label="Games counted" value={totalGames} detail={scope === 'week' ? 'this week' : `across ${periods.length} week${periods.length === 1 ? '' : 's'}`} />
            </StatRow>
            <p className="unit-caption">
              <UnitChip perGame={perGame} /> <span>{UNIT_CAPTION}</span>
            </p>
          </section>
          <section className="feature-cards" aria-label="Key players">
            <FeatureCard
              title="Leading contributor"
              row={leadRow}
              metric="contribution"
              perGame={perGame}
              categories={data.categories}
              selected={selectedId === leadRow?.player.player_id}
              onSelect={select}
              testId="feature-contributor"
              back={back}
              note={featuredOver.leadAlsoOver && leadRow ? <>Also the biggest overperformer: {fmtSigned(perGame ? leadRow.over_expected_per_game : leadRow.over_expected, 1)} {unitWord} vs expected.</> : undefined}
            />
            <FeatureCard
              title="Biggest overperformer"
              row={featuredOver.row}
              metric="over_expected"
              perGame={perGame}
              categories={data.categories}
              selected={selectedId === featuredOver.row?.player.player_id}
              onSelect={select}
              testId="feature-overperformer"
              back={back}
              note={featuredOver.leadAlsoOver ? 'Next best: the leading contributor also beat his projection by the most.' : undefined}
            />
          </section>
          <ChartFrame
            title="Contribution by player and category"
            description="Units each player added (teal) or cost (coral) in every scored category; Total is the row sum. Sort by any column; click a row to open that player."
            help="Each cell is (per-game stat ÷ unit size) × games counted; FG%/FT% are shooting impact against the pool rate. Rows sum to the contribution total. Per game divides every cell by games counted."
            legend={[{ label: 'added', swatch: 'good' }, { label: 'cost', swatch: 'bad' }]}
            actions={<UnitChip perGame={perGame} />}
            testId="chart-heatmap"
          >
            <Heatmap
              rows={heatRows.map((r) => ({ id: r.player.player_id, label: r.player.name }))}
              columns={data.categories.map((c) => ({ key: c.key, label: categoryLabel(c.key, data.categories), title: c.higher_is_better ? undefined : 'lower is better' }))}
              value={heatValue}
              format={(v) => fmtSigned(v, perGame ? 2 : 1)}
              tone={(v) => (v > 0.05 * (perGame ? 0.25 : 1) ? 'good' : v < -0.05 * (perGame ? 0.25 : 1) ? 'bad' : 'even')}
              intensity={(v) => 0.5 + Math.sign(v) * Math.min(0.5, Math.abs(v) / heatMax / 2)}
              scaleNote="shade = size of the effect within this team"
              lead={[
                { key: 'rank', label: '#', numeric: true, firstDir: 'asc', sortValue: (id) => byId.get(id)?.rank, render: (id) => String(byId.get(id)?.rank ?? '') },
                { key: 'name', label: 'Player', header: true, sortValue: (id) => byId.get(id)?.player.name, render: (id) => byId.get(id)?.player.name ?? id },
                { key: 'total', label: 'Total', numeric: true, sortValue: (id) => perGameOf(byId.get(id)?.contribution, byId.get(id)?.games ?? 0), render: (id) => fmtNum(perGameOf(byId.get(id)?.contribution, byId.get(id)?.games ?? 0), perGame ? 2 : 1) },
              ]}
              caption={`Contribution by category, ${perGame ? 'units per game' : 'total units'}`}
              legendLabels={{ bad: 'cost', even: 'neutral', good: 'added' }}
              selectedId={selectedId}
              onSelect={select}
              sortable
              testId="heatmap"
            />
            {data.contributors.length > HEAT_ROWS && <p className="table-note">Top {HEAT_ROWS} by contribution; the table below lists everyone.</p>}
          </ChartFrame>
          <div className="perf-charts">
            <ChartFrame
              title="Actual vs expected contribution"
              description="One point per player. The dashed diagonal is 'exactly as projected'; distance above it is overperformance."
              legend={[{ label: 'player (team colour)', swatch: 'team' }]}
              actions={<UnitChip perGame={perGame} />}
              unavailable={withBaseline.length === 0 ? 'Needs players with both a contribution and an expected value.' : undefined}
              testId="chart-scatter"
            >
              <Scatter
                points={data.contributors.map((r) => ({ id: r.player.player_id, label: r.player.name, x: perGameOf(r.expected_contribution, r.games), y: perGameOf(r.contribution, r.games), color: teamColor(r.player.team).primary }))}
                xLabel="Expected"
                yLabel="Actual"
                format={(v) => v.toFixed(perGame ? 1 : 0)}
                selectedId={selectedId}
                onSelect={select}
              />
            </ChartFrame>
            <ChartFrame
              title="Performance vs expectation"
              description="Contribution minus expected, per player, on the same units as the scatter. Right of zero beat the projection; left fell short. Players without a baseline are not shown."
              help="Expected = projected per-game line × games actually played, so missed games do not count against anyone."
              legend={[
                { label: 'above expectation', swatch: 'good' },
                { label: 'below expectation', swatch: 'bad' },
              ]}
              actions={<UnitChip perGame={perGame} />}
              unavailable={withBaseline.length === 0 ? 'No player on this team has a projection baseline for this selection.' : undefined}
              testId="chart-diverging"
            >
              <Diverging
                rows={[...withBaseline]
                  .map((r) => ({ r, v: (perGame ? r.over_expected_per_game : r.over_expected) ?? 0 }))
                  .sort((a, b) => b.v - a.v)
                  .map(({ r, v }) => ({ id: r.player.player_id, label: r.player.name, value: v, sublabel: r.flags.includes('small sample') ? `${r.games} GP · small sample` : `${r.games} GP` }))}
                format={(v) => v.toFixed(perGame ? 2 : 1)}
                unit={unitWord}
                selectedId={selectedId}
                onSelect={select}
              />
            </ChartFrame>
          </div>
          <section className="panel" aria-label="All players" data-testid="performers-table">
            <div className="panel-head">
              <h2>
                All players <UnitChip perGame={perGame} />
              </h2>
              <Segmented<Metric>
                variant="pill"
                label="Ranking"
                value={metric}
                onChange={setMetric}
                options={[
                  { id: 'contribution', label: 'By contribution' },
                  { id: 'over_expected', label: 'By performance vs expected' },
                ]}
              />
            </div>
            <PerformerTable rows={rows} metric={metric} selectedId={selectedId} onSelect={setSelectedId} openId={openId} onOpenChange={setOpenId} categories={data.categories} moves={moveTags} perGame={perGame} back={back} />
            {nMoves > 0 && (
              <p className="table-note">
                <span className="badge ok">added wk N</span> and <span className="badge error">dropped wk N</span> mark this team's roster moves {scope === 'week' ? 'this week' : 'this season'}; a dropped player keeps the games he played while rostered.
              </p>
            )}
            {data.notes.length > 0 && (
              <ul className="table-note" style={{ paddingLeft: 18 }}>
                {data.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
      {data && <Explainer unitSizes={data.unit_sizes} benchmarkRates={data.benchmark_rates} categories={data.categories} />}
    </div>
  )
}
