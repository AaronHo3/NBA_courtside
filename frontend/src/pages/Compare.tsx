import { useEffect, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { PlayerSearch } from '@/components/PlayerSearch'
import { useChartTheme } from '@/components/charts/Plot'
import { EmptyState, Panel, Refetching, Toggle } from '@/components/ui'
import { useSeason } from '@/hooks/useSeason'
import { useBoolParam, useNumberParam, useParam } from '@/lib/urlState'
import type { Normalization, PlayerProfile, PlayerSearchHit } from '@/lib/types'
import { useCompare } from '@/store/compare'
import { ComparisonTable } from './compare/ComparisonTable'
import { Controls } from './compare/Controls'
import { num, type AlignMode } from './compare/math'
import { METRICS, PANELS, RADAR_METRICS, TABLE_METRICS } from './compare/metrics'
import { buildCompareModel, type ComparedPlayer, type PopulationKind } from './compare/model'
import { MultiplesPanel } from './compare/MultiplesPanel'
import { Radar } from './compare/Radar'
import { RosterStrip } from './compare/RosterStrip'
import { EvidencePanel } from './compare/EvidencePanel'
import { ShotProfiles } from './compare/ShotProfiles'
import { isPlaceholderName, useCompareSync } from './compare/sync'
import { Trajectories } from './compare/Trajectories'
import { useProfiles, usePopulationTotals, useZoneProfiles } from './compare/useCompareData'
import type { Rec } from './compare/metrics'

const NORMS: Normalization[] = ['per_game', 'per_36', 'per_100', 'totals']
const POPS: PopulationKind[] = ['all', 'position', 'group']
const MODES: AlignMode[] = ['season', 'age', 'career_year']
const pick = <T extends string>(raw: string, allowed: T[], fallback: T): T => (allowed.includes(raw as T) ? (raw as T) : fallback)

function physicalFrom(profile: PlayerProfile): Rec {
  const c = profile.measurements.combine
  return {
    height_in: profile.measurements.roster.height_in,
    weight_lb: profile.measurements.roster.weight_lb,
    height_wo_shoes_in: c?.height_wo_shoes_in ?? null,
    wingspan_in: c?.wingspan_in ?? null,
    standing_reach_in: c?.standing_reach_in ?? null,
    wingspan_height_ratio: c?.wingspan_height_ratio ?? null,
  }
}

export default function Compare() {
  const { players: storePlayers, overflow } = useCompareSync()
  const add = useCompare((s) => s.add)
  const remove = useCompare((s) => s.remove)
  const clear = useCompare((s) => s.clear)
  const setPlayers = useCompare((s) => s.set)
  const { season, seasonType, setSeason, seasons } = useSeason()
  const [normRaw, setNormRaw] = useParam('norm', 'per_game')
  const [popRaw, setPopRaw] = useParam('pop', 'all')
  const [minMinutes, setMinMinutes] = useNumberParam('min_min', 0)
  const [modeRaw, setModeRaw] = useParam('align', 'season')
  const [showRadar, setShowRadar] = useBoolParam('radar', false)
  const norm = pick(normRaw, NORMS, 'per_game')
  const populationKind = pick(popRaw, POPS, 'all')
  const mode = pick(modeRaw, MODES, 'season')

  const ids = useMemo(() => storePlayers.map((p) => p.player_id), [storePlayers])
  const profileQueries = useProfiles(ids)
  const population = usePopulationTotals(season, seasonType)
  const zoneQueries = useZoneProfiles(ids, season, seasonType)
  const t = useChartTheme()

  const profiles = useMemo(() => {
    const m = new Map<number, PlayerProfile>()
    profileQueries.forEach((q, i) => { if (q.data) m.set(ids[i], q.data.data) })
    return m
  }, [profileQueries, ids])

  // Ids that arrived via the URL get real names once their profiles load.
  useEffect(() => {
    const next = storePlayers.map((p) => {
      const prof = profiles.get(p.player_id)
      if (!prof || (!isPlaceholderName(p) && p.team_abbreviation)) return p
      const team = prof.timeline.at(-1)?.team_abbreviation ?? p.team_abbreviation ?? null
      return { player_id: p.player_id, full_name: prof.bio.full_name, team_abbreviation: team }
    })
    if (next.some((p, i) => p !== storePlayers[i])) setPlayers(next)
  }, [profiles, storePlayers, setPlayers])

  const popRows = useMemo(() => population.data?.data ?? [], [population.data])
  const players = useMemo<ComparedPlayer[]>(
    () =>
      storePlayers.map((p, slot) => {
        const prof = profiles.get(p.player_id)
        const row = popRows.find((r) => r.player_id === p.player_id) ?? null
        const record: Rec | null = row ? { ...row, ...(prof ? physicalFrom(prof) : {}) } : prof ? physicalFrom(prof) : null
        return {
          id: p.player_id,
          name: prof?.bio.full_name ?? p.full_name,
          team: row?.team_abbreviation ?? p.team_abbreviation ?? null,
          position: prof?.bio.position ?? row?.position ?? null,
          slot,
          record,
          totalMin: num(row?.min),
          hasSeason: row !== null,
        }
      }),
    [storePlayers, profiles, popRows],
  )
  const colors = useMemo(() => players.map((_, i) => t.series[i % t.series.length]), [players, t.series])
  const model = useMemo(
    () => buildCompareModel({ players, population: popRows, norm, populationKind, minMinutes, specs: TABLE_METRICS.map((k) => METRICS[k]) }),
    [players, popRows, norm, populationKind, minMinutes],
  )
  const radarModel = useMemo(
    () => (showRadar ? buildCompareModel({ players, population: popRows, norm: 'per_36', populationKind, minMinutes, specs: RADAR_METRICS.map((k) => METRICS[k]) }) : null),
    [showRadar, players, popRows, populationKind, minMinutes],
  )

  const onAdd = (hit: PlayerSearchHit) => { add({ player_id: hit.player_id, full_name: hit.full_name, team_abbreviation: hit.team_abbreviation }) }
  const missingSeason = players.filter((p) => !p.hasSeason && profiles.has(p.id))
  const enough = players.length >= 2
  const loadError = population.error ?? profileQueries.find((q) => q.error)?.error
  const loading = population.isLoading || profileQueries.some((q) => q.isLoading)

  return (
    <>
      <PageHeader title="How do these players stack up?" lede="Two to six players side by side: same-season small multiples with percentiles, a full table, career trajectories and shot profiles." />
      <RosterStrip players={players} colors={colors} onAdd={onAdd} onRemove={remove} onClear={clear} overflow={overflow} />
      {!enough && (
        <EmptyState
          title={players.length === 0 ? 'Pick at least two players to compare' : 'Add one more player to start comparing'}
          body="Search above to add players, or lasso a group on the League explorer and send them here. Each player keeps the same colour on every chart."
          action={
            <div className="flex flex-wrap items-center gap-3">
              <div className="w-64"><PlayerSearch placeholder="Search players to add" onSelect={onAdd} /></div>
              <Link to="/" className="text-sm font-medium text-accent hover:underline">Open the League explorer</Link>
            </div>
          }
        />
      )}
      {enough && (
        <>
          <Controls season={season} seasons={seasons} setSeason={setSeason} norm={norm} setNorm={setNormRaw} populationKind={populationKind} setPopulationKind={setPopRaw} minMinutes={minMinutes} setMinMinutes={setMinMinutes} />
          {missingSeason.length > 0 && (
            <p role="status" className="mb-3 text-xs text-warning">No {season} data for {missingSeason.map((p) => p.name).join(', ')}: their bars are blank and they are left out of ranks. Trajectories still show their other seasons.</p>
          )}
          <Refetching loading={loading} error={loadError} retry={() => { population.refetch(); profileQueries.forEach((q) => q.refetch()) }}>
            <div className="flex flex-col gap-4">
              {PANELS.map((panel) => (
                <MultiplesPanel key={panel.key} panel={panel} model={model} players={players} colors={colors} norm={norm} populationKind={populationKind} minMinutes={minMinutes} />
              ))}
              <ComparisonTable model={model} players={players} colors={colors} norm={norm} populationKind={populationKind} season={season} />
              <Trajectories players={players} colors={colors} profiles={profiles} mode={mode} setMode={setModeRaw} />
              <ShotProfiles players={players} colors={colors} results={zoneQueries.map((q) => q.data)} season={season} />
              <EvidencePanel players={storePlayers} season={season} />
              <Panel
                question="Percentile radar (optional)"
                method="Off by default: radars exaggerate shape. Normalisation and cohort are stated beside the chart."
                actions={<Toggle checked={showRadar} onChange={setShowRadar} label="Show radar" />}
              >
                {showRadar && radarModel ? (
                  <Radar model={radarModel} players={players} colors={colors} populationKind={populationKind} minMinutes={minMinutes} season={season} />
                ) : (
                  <p className="text-sm text-ink-3">Turn on the radar to see percentiles within the chosen population for true shooting, usage, assist %, rebound %, steals and blocks per 36, turnover % (flipped) and net rating.</p>
                )}
              </Panel>
            </div>
          </Refetching>
        </>
      )}
    </>
  )
}
