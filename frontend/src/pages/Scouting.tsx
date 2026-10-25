import { useCallback, useMemo } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Disclosure, EmptyState, ErrorState, Loading, Panel, Refetching, Toolbar } from '@/components/ui'
import { useCandidates, useRoles, useScoutingMutations, useShortlistDetail, useStatus, useTraitRegistry } from '@/hooks/useApi'
import type { CandidateRow } from '@/lib/types'
import { CandidateTable } from './scouting/CandidateTable'
import { CohortControls } from './scouting/CohortControls'
import { RoleSelect, RoleSummary } from './scouting/RolePicker'
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
  const rows = useMemo(() => candidates.data?.data ?? [], [candidates.data])
  const roleList = useMemo(() => roles.data?.data ?? [], [roles.data])
  const role = roleList.find((r) => r.role_id === st.role) ?? roleList[0]
  // units and display names per trait key from the registry, so fractions render as percentages and keys read as names
  const traitUnits = useMemo(() => Object.fromEntries((registry.data?.data ?? []).map((t) => [t.key, t.units])), [registry.data])
  const traitLabels = useMemo(() => Object.fromEntries((registry.data?.data ?? []).map((t) => [t.key, t.label])), [registry.data])
  const roleNames = useMemo(() => Object.fromEntries(roleList.map((r) => [r.role_id, r.label])), [roleList])
  const playerNames = useMemo(() => Object.fromEntries(rows.filter((r) => r.full_name).map((r) => [r.player_id, r.full_name as string])), [rows])
  const inShortlist = useCallback((id: number) => Boolean(shortlist.data?.data.entries.some((e) => e.player_id === id)), [shortlist.data])
  const onAdd = useCallback((row: CandidateRow) => {
    if (!st.shortlistId) return
    m.addEntries.mutate({ id: st.shortlistId, body: { player_ids: [row.player_id], added_by: 'candidates' } })
  }, [st.shortlistId, m.addEntries])

  return (
    <>
      <PageHeader
        title="Scouting workspace"
        lede="Rank candidates by match to a role's criteria, keep a shortlist and draft a validated report. Scores match criteria within one season; they are not forecasts."
        actions={status.data?.data.is_demo ? <Badge tone="warning">Demo data</Badge> : undefined}
      />
      <Toolbar label="Role and cohort">
        {roles.error ? null : roleList.length ? <RoleSelect roles={roleList} value={st.role} onChange={st.setRole} /> : <Loading label="Loading templates" />}
        <CohortControls minGp={st.minGp} minMinutes={st.minMinutes} position={st.position} onMinGp={st.setMinGp} onMinMinutes={st.setMinMinutes} onPosition={st.setPosition} />
      </Toolbar>
      <div className="flex flex-col gap-4 xl:grid xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Panel question={role ? `What does "${role.label}" ask for?` : 'What role or need are we scouting for?'} method="A template is a few weighted trait components plus filters applied before scoring; its caveats travel with every result.">
            {roles.error ? <ErrorState error={roles.error} retry={() => roles.refetch()} /> : role ? <RoleSummary role={role} traitLabels={traitLabels} /> : <Loading label="Loading templates" />}
          </Panel>
          <Panel
            question={`Who matches the criteria in ${st.season}?`}
            method="Percentile composite of the template's components within the filtered cohort. Video coverage is a label, never part of the score."
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
                <CandidateTable rows={rows} traitUnits={traitUnits} traitLabels={traitLabels} onAdd={st.shortlistId ? onAdd : undefined} inShortlist={inShortlist} />
              )}
            </Refetching>
            {meta && (
              <Disclosure summary="How the match score is built" className="mt-3">
                <p>Season-level cohort thresholds apply before the template's own filters, and percentiles are computed within the qualified cohort. A player missing any component is ineligible rather than re-weighted.</p>
                {meta.notes.length ? <p className="mt-2">{meta.notes.join(' · ')}</p> : null}
                <p className="mt-2 text-ink-3">{meta.disclaimer} Template {roleNames[meta.template.role_id] ?? meta.template.role_id} v{meta.template.version}, registry v{meta.trait_registry_version}, data {meta.data_fingerprint}.</p>
              </Disclosure>
            )}
          </Panel>
        </div>
        <aside className="min-w-0">
          <Panel question="Which players are we keeping?" method="A shortlist freezes the template, cohort and data fingerprint it was built from. Players added from the compare group carry no score.">
            <ShortlistDrawer shortlistId={st.shortlistId} onChoose={st.chooseShortlist} season={st.season} seasonType={st.seasonType} role={st.role} roleName={roleNames[st.role]} roleNames={roleNames} playerNames={playerNames} cohort={{ min_gp: st.minGp, min_minutes: st.minMinutes, position: st.position || undefined }} />
          </Panel>
        </aside>
      </div>
    </>
  )
}
