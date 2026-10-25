import { useCallback, useMemo } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, EmptyState, ErrorState, Loading, Panel, Refetching } from '@/components/ui'
import { useCandidates, useRoles, useScoutingMutations, useShortlistDetail, useStatus, useTraitRegistry } from '@/hooks/useApi'
import type { CandidateRow } from '@/lib/types'
import { CandidateTable } from './scouting/CandidateTable'
import { CohortControls } from './scouting/CohortControls'
import { RolePicker } from './scouting/RolePicker'
import { ShortlistDrawer } from './scouting/ShortlistDrawer'
import { useScoutingState } from './scouting/useScoutingState'

export default function Scouting() {
  const st = useScoutingState()
  const status = useStatus()
  const roles = useRoles()
  const registry = useTraitRegistry()
  const candidates = useCandidates(st.params, Boolean(st.season))
  const shortlist = useShortlistDetail(st.shortlistId)
  const m = useScoutingMutations()
  const meta = candidates.data?.meta
  const rows = candidates.data?.data ?? []
  const roleList = roles.data?.data ?? []
  // units per trait key from the registry, so fractions render as percentages and rates as numbers
  const traitUnits = useMemo(() => Object.fromEntries((registry.data?.data ?? []).map((t) => [t.key, t.units])), [registry.data])
  const inShortlist = useCallback((id: number) => Boolean(shortlist.data?.data.entries.some((e) => e.player_id === id)), [shortlist.data])
  const onAdd = useCallback((row: CandidateRow) => {
    if (!st.shortlistId) return
    m.addEntries.mutate({ id: st.shortlistId, body: { player_ids: [row.player_id], added_by: 'candidates' } })
  }, [st.shortlistId, m.addEntries])

  return (
    <>
      <PageHeader
        title="Scouting workspace"
        lede="Describe a role, rank candidates by match to its criteria, keep a shortlist, and draft a report whose claims are validated against the data. Scores are a match to the selected criteria within one season, not a forecast."
        actions={status.data?.data.is_demo ? <Badge tone="warning">Demo data</Badge> : undefined}
      />
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel question="What role or need are we scouting for?" method="A template is a few trait components with weights plus filters applied before scoring; its caveats travel with every result.">
            {roles.error ? <ErrorState error={roles.error} retry={() => roles.refetch()} /> : roleList.length ? <RolePicker roles={roleList} value={st.role} onChange={st.setRole} /> : <Loading label="Loading templates" />}
          </Panel>
          <Panel question="Who counts?" method="Season-level cohort thresholds applied before the template's own filters. Percentiles are computed within the qualified cohort.">
            <CohortControls minGp={st.minGp} minMinutes={st.minMinutes} position={st.position} onMinGp={st.setMinGp} onMinMinutes={st.setMinMinutes} onPosition={st.setPosition} />
          </Panel>
          <Panel
            question={`Who matches the criteria in ${st.season}?`}
            method="Composite of the template's components, percentile-normalised within the filtered cohort; a player missing any component is ineligible rather than re-weighted. Video coverage is a label, never part of the score."
            actions={meta && (
              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {meta.funnel.map((f) => <Badge key={f.stage}>{f.stage}: {f.remaining}</Badge>)}
                {typeof meta.eligible === 'number' && <Badge tone="good">{meta.eligible} eligible</Badge>}
              </div>
            )}
          >
            <Refetching loading={candidates.isFetching} error={candidates.error} retry={() => { void candidates.refetch() }}>
              {!st.season ? <Loading /> : candidates.data && rows.length === 0 ? (
                <EmptyState title="No candidates" body={meta?.notes.join(' ') || 'Loosen the cohort thresholds or choose another template.'} />
              ) : (
                <CandidateTable rows={rows} traitUnits={traitUnits} onAdd={st.shortlistId ? onAdd : undefined} inShortlist={inShortlist} />
              )}
            </Refetching>
            {meta?.notes.length ? <p className="mt-2 text-xs text-ink-3">{meta.notes.join(' · ')}</p> : null}
            {meta && <p className="mt-2 max-w-prose text-xs text-ink-3">{meta.disclaimer} Template {meta.template.role_id} v{meta.template.version}, registry v{meta.trait_registry_version}, data {meta.data_fingerprint}.</p>}
          </Panel>
        </div>
        <aside className="min-w-0">
          <Panel question="Which players are we keeping?" method="A shortlist freezes the template, cohort and data fingerprint it was built from. Players added from the compare group carry no score.">
            <ShortlistDrawer shortlistId={st.shortlistId} onChoose={st.chooseShortlist} season={st.season} seasonType={st.seasonType} role={st.role} cohort={{ min_gp: st.minGp, min_minutes: st.minMinutes, position: st.position || undefined }} />
          </Panel>
        </aside>
      </div>
    </>
  )
}
