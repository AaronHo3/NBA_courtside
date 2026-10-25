import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { downloadCsv } from '@/components/table/DataTable'
import { Button, EmptyState, ErrorState, Panel, Refetching, SkeletonChart } from '@/components/ui'
import { useExplorer, useMetricIndex } from '@/hooks/useApi'
import { useSeason } from '@/hooks/useSeason'
import { csvUrl } from '@/lib/api'
import { NORMALIZATION_LABEL } from '@/lib/format'
import type { PlayerRow } from '@/lib/types'
import { MAX_COMPARE, useCompare } from '@/store/compare'
import { ExplorerChart } from './explorer/ExplorerChart'
import { ExplorerTable } from './explorer/ExplorerTable'
import { FilterRow } from './explorer/FilterRow'
import { clampSelection, groupMetricOptions, type Preset } from './explorer/helpers'
import { PARAM_KEYS, useExplorerState } from './explorer/useExplorerState'

const CSV_PATH = '/api/analytics/league/explorer.csv'

export default function LeagueExplorer() {
  const navigate = useNavigate()
  const { season, seasonType, ready } = useSeason()
  const state = useExplorerState()
  const metrics = useMetricIndex()
  const compare = useCompare()
  const [notice, setNotice] = useState<string | null>(null)
  const [hoverId, setHoverId] = useState<number | null>(null)

  const params = useMemo(() => ({ season, season_type: seasonType, ...state.apiFilters }), [season, seasonType, state.apiFilters])
  const query = useExplorer(params, ready)
  // Same filters without eligibility thresholds, so we can say how many players the thresholds hide.
  const baseline = useExplorer({ ...params, min_gp: 0, min_minutes: 0 }, ready)

  const rows = useMemo(() => query.data?.data ?? [], [query.data])
  const population = query.data?.meta.population ?? null
  const hidden = baseline.data && population !== null ? Math.max(0, baseline.data.meta.population - population) : null
  const groups = useMemo(() => groupMetricOptions(metrics.list, rows, state.normalization), [metrics.list, rows, state.normalization])

  const compareIds = useMemo(() => compare.players.map((p) => p.player_id), [compare.players])
  const highlightedIds = useMemo(() => [...compareIds, ...(state.selected ? [state.selected] : []), ...(hoverId ? [hoverId] : [])], [compareIds, state.selected, hoverId])
  const rowById = useMemo(() => new Map(rows.map((r) => [r.player_id, r])), [rows])

  const openPlayer = useCallback((id: number) => navigate(`/players/${id}?season=${encodeURIComponent(season)}`), [navigate, season])

  const onRowClick = useCallback(
    (row: PlayerRow) => {
      if (state.selected === row.player_id) openPlayer(row.player_id)
      else state.setSelected(row.player_id)
    },
    [state, openPlayer],
  )

  const onToggleCompare = useCallback(
    (row: PlayerRow) => {
      const ok = compare.has(row.player_id) ? (compare.remove(row.player_id), true) : compare.add({ player_id: row.player_id, full_name: row.full_name, team_abbreviation: row.team_abbreviation })
      setNotice(ok ? null : `The comparison group is full (${MAX_COMPARE}). Remove a player before adding another.`)
    },
    [compare],
  )

  const onLasso = useCallback(
    (ids: number[]) => {
      const { kept, dropped } = clampSelection([...compareIds, ...ids], MAX_COMPARE)
      const players = kept.map((id) => compare.players.find((p) => p.player_id === id) ?? rowById.get(id)).filter((p): p is NonNullable<typeof p> => Boolean(p))
      compare.set(players.map((p) => ({ player_id: p.player_id, full_name: p.full_name, team_abbreviation: p.team_abbreviation })))
      const added = kept.filter((id) => !compareIds.includes(id)).length
      setNotice(dropped > 0 ? `Selected ${ids.length} players but the comparison group holds ${MAX_COMPARE}: kept the first ${added} new ones and dropped ${dropped}.` : added > 0 ? `Added ${added} player${added === 1 ? '' : 's'} to the comparison group.` : null)
    },
    [compareIds, compare, rowById],
  )

  const onChartChange = useCallback(
    (patch: { x?: string; y?: string; size?: string; color?: string; medians?: boolean }) =>
      state.setMany({
        ...(patch.x !== undefined ? { [PARAM_KEYS.x]: patch.x } : {}),
        ...(patch.y !== undefined ? { [PARAM_KEYS.y]: patch.y } : {}),
        ...(patch.size !== undefined ? { [PARAM_KEYS.size]: patch.size === 'none' ? null : patch.size } : {}),
        ...(patch.color !== undefined ? { [PARAM_KEYS.color]: patch.color === 'none' ? null : patch.color } : {}),
        ...(patch.medians !== undefined ? { [PARAM_KEYS.medians]: patch.medians ? '1' : null } : {}),
      }),
    [state],
  )
  const onPreset = useCallback((p: Preset) => state.applyPreset(p), [state])

  const exportAllHref = csvUrl(CSV_PATH, params)
  const exportSelectionHref = csvUrl(CSV_PATH, { ...params, ids: compareIds })
  const fallbackCsv = () => downloadCsv(`explorer-${season}-${state.normalization}.csv`, rows as Record<string, unknown>[])

  const normLabel = NORMALIZATION_LABEL[state.normalization].toLowerCase()
  const activeMetrics = [state.x, state.y, state.size, state.color]

  return (
    <>
      <PageHeader
        title="Who does what, league-wide?"
        lede={`Every eligible player for ${season || '…'} ${seasonType} on one plot, with counting stats shown ${normLabel}. Pick two metrics, size and colour a third and fourth, then lasso a cluster to compare.`}
      />
      <FilterRow state={state} population={population} hidden={hidden} />

      {notice && (
        <div role="status" className="mb-3 flex items-center justify-between gap-3 rounded-[var(--radius-control)] border border-line-strong bg-raised px-3 py-2 text-sm text-ink">
          <span>{notice}</span>
          <Button size="sm" variant="ghost" onClick={() => setNotice(null)} aria-label="Dismiss notice">Dismiss</Button>
        </div>
      )}

      <Panel
        question="Where does each player sit on the two things you care about?"
        method="Each marker is one player-season; traded players appear once as their pooled TOT row. Marker size and colour are optional third and fourth metrics."
        info="Counting stats are normalised server-side (totals, per game, per 36 minutes or per 100 possessions). Percentages, rates and ratings are not re-scaled. Combine measurements (wingspan, reach) exist only for players who attended the combine. On/off net rating needs lineup data and is blank for pooled TOT rows."
        actions={
          <>
            <a href={exportAllHref} download className="inline-flex items-center rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 py-1 text-xs font-medium text-ink hover:border-accent">Export CSV</a>
            {compareIds.length > 0 && (
              <a href={exportSelectionHref} download className="inline-flex items-center rounded-[var(--radius-control)] border border-line-strong bg-surface px-2 py-1 text-xs font-medium text-ink hover:border-accent">Export selection ({compareIds.length})</a>
            )}
            <Button size="sm" variant="ghost" onClick={fallbackCsv} disabled={!rows.length} title="Builds the file in the browser from the rows currently loaded">Download loaded rows</Button>
          </>
        }
      >
        {query.isError ? (
          <ErrorState error={query.error} retry={() => query.refetch()} />
        ) : query.isPending ? (
          <SkeletonChart />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No players meet these filters"
            body={
              hidden && hidden > 0
                ? `${hidden} players are hidden by the ${state.minGp}-game / ${state.minMinutes}-minute thresholds. Lower them, widen the age range, or clear the team, position and name filters.`
                : `Nothing matches for ${season} ${seasonType}. This season type may have no data yet; try the regular season or clear the filters.`
            }
            action={
              <div className="flex gap-2">
                {hidden && hidden > 0 ? <Button size="sm" onClick={state.relaxThresholds}>Lower thresholds to 0</Button> : null}
                <Button size="sm" variant="ghost" onClick={state.reset}>Reset filters</Button>
              </div>
            }
          />
        ) : (
          <Refetching loading={query.isFetching}>
            <ExplorerChart
              rows={rows}
              groups={groups}
              getMetric={metrics.get}
              normalization={state.normalization}
              x={state.x}
              y={state.y}
              size={state.size}
              color={state.color}
              medians={state.medians}
              minGp={state.minGp}
              minMinutes={state.minMinutes}
              highlightedIds={highlightedIds}
              onChange={onChartChange}
              onPreset={onPreset}
              onPointClick={openPlayer}
              onLasso={onLasso}
              onPointHover={setHoverId}
            />
          </Refetching>
        )}
      </Panel>

      {rows.length > 0 && !query.isError && (
        <Panel
          className="mt-4"
          question="What are the numbers behind each marker?"
          method="Same players as the chart, with the plotted metrics first and a standard set after. Headers carry definitions; sort any column."
          info="TOT rows pool a traded player's stints into one line. Low-sample badges mark players under the current game and minute thresholds. Per-100 columns are blank when a row has no possession estimate."
        >
          <Refetching loading={query.isFetching}>
            <ExplorerTable
              rows={rows}
              getMetric={metrics.get}
              normalization={state.normalization}
              activeMetrics={activeMetrics}
              selectedId={state.selected}
              hoveredId={hoverId}
              onRowHover={setHoverId}
              compareIds={compareIds}
              compareFull={compareIds.length >= MAX_COMPARE}
              minGp={state.minGp}
              minMinutes={state.minMinutes}
              textFilter={state.tableFilter}
              onTextFilter={(v) => state.setTableFilter(v || null)}
              onRowClick={onRowClick}
              onToggleCompare={onToggleCompare}
            />
          </Refetching>
        </Panel>
      )}
    </>
  )
}
