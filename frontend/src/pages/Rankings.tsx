import { useMemo } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { downloadCsv } from '@/components/table/DataTable'
import { Button, Disclosure, EmptyState, Loading, Notice, Panel, Refetching, Segmented, Stat } from '@/components/ui'
import { ComponentLegend } from './rankings/ComponentChips'
import { ContributionChart } from './rankings/ContributionChart'
import { CustomBuilder } from './rankings/CustomBuilder'
import { IneligiblePanel } from './rankings/IneligiblePanel'
import { LensExplainer } from './rankings/LensExplainer'
import { csvRows, TOP_N_OPTIONS, type TopN } from './rankings/model'
import { RankingControls } from './rankings/RankingControls'
import { RankingTable } from './rankings/RankingTable'
import { useRankingState } from './rankings/useRankingState'

export default function Rankings() {
  const s = useRankingState()
  const eligible = useMemo(() => s.rows.filter((r) => r.eligible), [s.rows])
  const ineligible = useMemo(() => s.rows.filter((r) => !r.eligible), [s.rows])
  const topRows = useMemo(() => eligible.slice(0, s.top), [eligible, s.top])
  const meta = s.meta
  const title = s.isCustom ? 'Custom composite' : s.currentLens?.label ?? 'Lens'

  return (
    <>
      <PageHeader
        title="Who is best, by which lens?"
        lede="No single best player: each lens is a user-defined index of components, weights and population, and every score is shown as the sum of its parts."
      />

      <RankingControls s={s} />
      <div className="mb-4 flex flex-wrap items-start gap-x-8 gap-y-3">
        <Stat label="Met the thresholds" value={meta ? meta.population_size : '–'} sub={meta ? `${s.season} · ${s.seasonType} · ≥ ${meta.min_gp} games, ≥ ${meta.min_minutes} minutes${s.position ? ` · ${s.position}` : ''}` : 'Loading'} />
        <Stat label="Eligible (all components present)" value={meta ? eligible.length : '–'} sub={meta ? (ineligible.length ? `${ineligible.length} excluded, listed below` : 'Nobody excluded') : ' '} />
        {(s.disclaimer ?? meta?.disclaimer) && (
          <div className="flex min-w-0 max-w-prose flex-1 basis-72 flex-col gap-2">
            <Notice tone="info">Scores are user-defined indexes within one season; see limitations.</Notice>
            <Disclosure summary="What a lens score is, and is not">
              <p>{s.disclaimer ?? meta?.disclaimer}</p>
              <p className="mt-2 text-ink-3">Filters apply to one season. Thresholds define the comparison population that every component is normalised within.</p>
            </Disclosure>
          </div>
        )}
      </div>

      {s.lensesLoading && <Loading label="Loading lenses" />}

      <div className="mb-4 flex min-w-0 flex-col gap-4">
        {s.isCustom ? (
          <CustomBuilder components={s.components} onChange={s.setComponents} catalog={s.catalog.list} colors={s.colors} />
        ) : (
          s.currentLens && <LensExplainer lens={s.currentLens} meta={meta} colors={s.colors} />
        )}
      </div>

      {s.customIncomplete ? (
        <EmptyState title="Add at least one component with a positive weight" body="The composite is computed on the server from exactly the components you choose; nothing is assumed." />
      ) : (
        <Refetching loading={s.query.isFetching && !s.query.data} error={s.query.error} retry={() => s.query.refetch()}>
          {!meta ? (
            <Loading label="Scoring the population" />
          ) : (
            <div className="flex min-w-0 flex-col gap-4">
              <Panel
                question={`Top ${Math.min(s.top, eligible.length)} by ${title}: what makes up each score?`}
                method={`Each bar is the composite score split into component contributions (share × ${meta.normalization === 'zscore' ? 'z-score' : 'percentile'}). Hover a segment for raw value, normalised value, weight and population.`}
                actions={
                  <Segmented ariaLabel="How many players to chart" value={String(s.top)} onChange={(v) => s.setTop(Number(v) as TopN)} options={TOP_N_OPTIONS.map((n) => ({ value: String(n), label: `Top ${n}` }))} />
                }
              >
                <div className={s.query.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                  <div className="mb-2"><ComponentLegend components={meta.components} colors={s.colors} /></div>
                  {topRows.length === 0 ? (
                    <EmptyState title="No eligible players for these thresholds" body="Lower the minimum games or minutes, or widen the position filter." />
                  ) : (
                    <ContributionChart rows={topRows} meta={meta} colors={s.colors} />
                  )}
                </div>
              </Panel>

              <Panel
                question={`All ${eligible.length} eligible players, ranked`}
                method={`Raw component values are shown as ${meta.normalization_of_counting_stats === 'totals' ? 'season totals' : 'per-game rates'} for counting stats; percentages and ratings are as published.`}
                actions={<Button size="sm" onClick={() => downloadCsv(`rankings_${s.season}_${s.isCustom ? 'custom' : s.lens}_${meta.mode}_${meta.normalization}.csv`, csvRows(s.rows, meta))} disabled={!s.rows.length}>Download CSV</Button>}
              >
                <div className={s.query.isFetching ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
                  <RankingTable rows={eligible} meta={meta} colors={s.colors} />
                </div>
              </Panel>

              <IneligiblePanel rows={ineligible} meta={meta} />

              <Disclosure summary="Why only within one season? A note on eras">
                <p className="max-w-prose">
                  Every component is normalised against the players who qualified in the same season and season type, so a score says how a player compares with contemporaries under the same rules, pace and shot selection. Percentiles are therefore within-season by construction: a 90th-percentile three-point volume in 2016-17 and in 2025-26 describe different absolute numbers, and nothing here removes that era effect. Do not read scores across seasons as if they were on one scale; switch the season and read the new ranking on its own terms.
                </p>
              </Disclosure>
            </div>
          )}
        </Refetching>
      )}
    </>
  )
}
