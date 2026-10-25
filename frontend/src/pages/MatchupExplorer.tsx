import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Button, Disclosure, EmptyState, Info, Panel, Refetching } from '@/components/ui'
import { useMatchupAvailability, useMatchupDefense, useMatchupOffense, usePlayer, useStatus } from '@/hooks/useApi'
import { useSeason } from '@/hooks/useSeason'
import { useNumberParam, useParam } from '@/lib/urlState'
import type { MatchupRow } from '@/lib/types'
import { CalloutStrip } from './matchups/CalloutStrip'
import { DefenseDashPanel } from './matchups/DefenseDashPanel'
import { MatchupChart, MatchupChartControls } from './matchups/MatchupChart'
import { MatchupTable } from './matchups/MatchupTable'
import { PairDetail } from './matchups/PairDetail'
import { SubjectBar } from './matchups/SubjectBar'
import { TeamHeatmap } from './matchups/TeamHeatmap'
import { DEFAULT_HEATMAP_LIMIT, DEFAULT_HEATMAP_MIN_POSS, DEFAULT_MIN_POSS, DEFAULT_PRIOR_STRENGTH, extremes, opponentOf, priorText, qualifyingRows, seasonsWithMatchups, type ChartMetric, type MatchupView } from './matchups/helpers'

export default function MatchupExplorer() {
  const { season, seasonType, setSeason, ready } = useSeason()
  const status = useStatus()
  const [playerId] = useNumberParam('player', 0)
  const [viewRaw, setView] = useParam('view', 'offense')
  const view: MatchupView = viewRaw === 'defense' ? 'defense' : 'offense'
  const [minPoss, setMinPoss] = useNumberParam('min_poss', DEFAULT_MIN_POSS)
  const [prior, setPrior] = useNumberParam('prior', DEFAULT_PRIOR_STRENGTH)
  const [metricRaw, setMetric] = useParam('metric', 'pts_per_poss')
  const metric: ChartMetric = metricRaw === 'fg_pct_shrunk' ? 'fg_pct_shrunk' : 'pts_per_poss'
  const [limitRaw, setLimitRaw] = useParam('rows', '20')
  const limit = limitRaw === 'all' ? null : Number(limitRaw) || 20
  const [teamA, setTeamA] = useNumberParam('team_a', 0)
  const [teamB, setTeamB] = useNumberParam('team_b', 0)
  const [hmMin, setHmMin] = useNumberParam('hm_min', DEFAULT_HEATMAP_MIN_POSS)
  const [hmLimit, setHmLimit] = useNumberParam('hm_limit', DEFAULT_HEATMAP_LIMIT)
  const [pairOff] = useNumberParam('pair_off', 0)
  const [pairDef] = useNumberParam('pair_def', 0)
  const [, setSp] = useSearchParams()
  /** Several keys in one URL write: consecutive single-key setters would each overwrite the other. */
  const setMany = useCallback((entries: Record<string, string | null>) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev)
      for (const [k, v] of Object.entries(entries)) { if (v === null) next.delete(k); else next.set(k, v) }
      return next
    }, { replace: true })
  }, [setSp])

  const id = playerId > 0 ? playerId : null
  const avail = useMatchupAvailability(season, seasonType)
  const available = avail.data?.data.available ?? false
  const profile = usePlayer(id)
  const playerName = profile.data?.data.bio.full_name ?? null
  const playerPosition = profile.data?.data.bio.position ?? null
  const playerTeamId = profile.data?.data.seasons.find((s) => s.season === season && s.season_type === seasonType)?.team_id ?? null

  const params = { season, season_type: seasonType, min_poss: minPoss, prior_strength: prior }
  const offense = useMatchupOffense(available && view === 'offense' ? id : null, params)
  const defense = useMatchupDefense(available && view === 'defense' ? id : null, params)
  const res = view === 'offense' ? offense : defense
  const rows: MatchupRow[] = useMemo(() => res.data?.data ?? [], [res.data])
  const meta = res.data?.meta ?? null
  const priorObj = meta?.prior && typeof meta.prior.mean === 'number' ? meta.prior : null
  const qualifying = useMemo(() => qualifyingRows(rows, minPoss), [rows, minPoss])
  const { lowest, highest } = useMemo(() => extremes(rows, minPoss), [rows, minPoss])

  const setPair = useCallback((off: number, def: number) => setMany({ pair_off: String(off), pair_def: String(def) }), [setMany])
  const openPair = useCallback((row: MatchupRow) => setPair(row.off_player_id, row.def_player_id), [setPair])
  const clearPair = useCallback(() => setMany({ pair_off: null, pair_def: null }), [setMany])
  const selectedOpponentId = view === 'offense' ? (pairOff === playerId ? pairDef : null) : (pairDef === playerId ? pairOff : null)
  const effectiveTeamA = teamA > 0 ? teamA : playerTeamId
  const seasonsAvailable = seasonsWithMatchups(status.data?.data.coverage, seasonType)

  return (
    <>
      <PageHeader
        title="Who guards whom, and how did it go?"
        lede="Tracked scorer–defender matchups: how a player's efficiency varied across the defenders he faced, or across the scorers he guarded. Observations, not verdicts."
      />
      <div className="flex flex-col gap-5">
        <SubjectBar
          playerName={playerName}
          playerPosition={playerPosition}
          view={view}
          minPoss={minPoss}
          priorStrength={prior}
          onSelectPlayer={(hit) => setMany({ player: String(hit.player_id), pair_off: null, pair_def: null })}
          onClearPlayer={() => setMany({ player: null, pair_off: null, pair_def: null })}
          onViewChange={(v) => setView(v)}
          onMinPossChange={setMinPoss}
          onPriorStrengthChange={setPrior}
        />

        {ready && avail.data && !available && (
          <EmptyState
            title={`No matchup data for ${season}`}
            body={avail.data.data.reason ?? 'Matchups were not collected for this season.'}
            action={seasonsAvailable.length ? (
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
                <span>Seasons with matchups:</span>
                {seasonsAvailable.map((s) => <Button key={s} size="sm" onClick={() => setSeason(s)}>{s}</Button>)}
              </div>
            ) : undefined}
          />
        )}

        {available && !id && (
          <EmptyState title="Pick a player to begin" body="Search above. The page then shows the defenders he faced (as scorer) or the scorers he guarded (as defender), his lowest and highest observed efficiency among qualifying matchups, and a season-by-season pair history." />
        )}

        {available && id && (
          <>
            <Panel
              question={view === 'offense' ? `Which defenders limited ${playerName ?? 'him'}, and against whom did he score freely?` : `Which scorers did ${playerName ?? 'he'} limit, and who scored on him?`}
              method={`${season} ${seasonType}. Qualifying = at least ${minPoss} partial possessions. ${priorText(priorObj)}.`}
              info={meta?.shrinkage ?? 'Shrunk FG% pulls small samples toward the league matchup FG% by a prior worth k attempts.'}
            >
              <Refetching loading={res.isFetching} error={res.error} retry={() => res.refetch()}>
                {res.isLoading ? <p className="text-sm text-ink-3">Loading…</p> : (
                  <CalloutStrip lowest={lowest} highest={highest} view={view} minPoss={minPoss} qualifyingCount={qualifying.length} totalCount={rows.length} onOpenPair={openPair} />
                )}
              </Refetching>
              {meta?.wording && (
                <Disclosure summary="What matchup data can and cannot show" className="mt-3" testId="matchup-wording">
                  <p>{meta.wording}</p>
                </Disclosure>
              )}
            </Panel>

            <Panel
              question={view === 'offense' ? 'Against whom did his efficiency differ?' : 'Whose efficiency differed against him?'}
              method={metric === 'pts_per_poss' ? 'Points per partial possession, qualifying matchups only, sorted ascending. Marker area tracks possessions.' : 'Shrunk FG% (filled) beside raw FG% (open) with its 95% Wilson interval; dotted line is the prior mean. Marker area tracks possessions.'}
              info="Click a marker to open the pair history. The chart keeps the most-sampled qualifying matchups by default; switch to all qualifying to see every row."
              actions={<MatchupChartControls metric={metric} limit={limit} onMetricChange={(m) => setMetric(m)} onLimitChange={(n) => setLimitRaw(n === null ? 'all' : String(n))} />}
            >
              <Refetching loading={res.isFetching} error={res.error} retry={() => res.refetch()}>
                <MatchupChart rows={rows} view={view} minPoss={minPoss} metric={metric} limit={limit} prior={priorObj} onMetricChange={(m) => setMetric(m)} onLimitChange={(n) => setLimitRaw(n === null ? 'all' : String(n))} onSelectRow={openPair} />
              </Refetching>
            </Panel>

            <Panel
              question="Every tracked matchup"
              method="All rows, including those below the threshold (greyed). Sort any column; click a row for pair detail."
              actions={<span className="flex items-center gap-1 text-xs text-ink-3">FG% shrunk <Info text={meta?.shrinkage ?? 'Shrinkage definition unavailable'} /></span>}
            >
              <Refetching loading={res.isFetching} error={res.error} retry={() => res.refetch()}>
                <MatchupTable rows={rows} view={view} minPoss={minPoss} selectedOpponentId={selectedOpponentId} csvName={`matchups_${view}_${playerId}_${season}.csv`} onSelectRow={openPair} />
              </Refetching>
            </Panel>
          </>
        )}

        {available && (
          <PairDetail offId={pairOff > 0 ? pairOff : null} defId={pairDef > 0 ? pairDef : null} priorStrength={prior} onClear={clearPair} />
        )}

        {available && (
          <TeamHeatmap
            season={season}
            seasonType={seasonType}
            teamA={effectiveTeamA}
            teamB={teamB > 0 ? teamB : null}
            minPoss={hmMin}
            limit={hmLimit}
            onTeamA={(t) => setTeamA(t)}
            onTeamB={(t) => setTeamB(t)}
            onMinPoss={setHmMin}
            onLimit={setHmLimit}
            onSelectPair={setPair}
          />
        )}

        {id && <DefenseDashPanel playerId={id} playerName={playerName} season={season} seasonType={seasonType} />}

        {id && rows.length > 0 && selectedOpponentId && (
          <p className="sr-only">Selected pair: {opponentOf(rows.find((r) => opponentOf(r, view).id === selectedOpponentId) ?? rows[0], view).name}</p>
        )}
      </div>
    </>
  )
}
