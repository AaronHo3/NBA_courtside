import { useCallback, useMemo } from 'react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Button, EmptyState, ErrorState, Loading, Panel, Refetching } from '@/components/ui'
import { useCourt, useExplorer, useShotFilters, useTeams } from '@/hooks/useApi'
import type { Shot, ZoneSummary } from '@/lib/types'
import { CourtChart } from '@/components/court/CourtChart'
import { METRIC_LABEL, colourDomain } from '@/components/court/colour'
import { mergeDifference } from '@/components/court/diff'
import { pointToHex, providerToFeet, zoneLabel } from '@/components/court/geometry'
import type { CourtSelection } from '@/components/court/types'
import { BinDetail } from './shooting/BinDetail'
import { FilterRow } from './shooting/FilterRow'
import { MethodNote } from './shooting/MethodNote'
import { ShotEvidencePanel } from './shooting/ShotEvidencePanel'
import { ShotTable } from './shooting/ShotTable'
import { SubjectPicker } from './shooting/SubjectPicker'
import { ViewControls } from './shooting/ViewControls'
import { subjectParams, useShootingState } from './shooting/state'
import { useSubjectLabel, useSubjectShots } from './shooting/useSubjectShots'
import { ZoneTable, type ZoneRow } from './shooting/ZoneTable'

const EMPTY: never[] = []
const LAYER_METHOD: Record<string, string> = {
  hex: 'Hexagon size or opacity = share of attempts; colour = accuracy on a fixed range; hatched = below the low-sample threshold.',
  zones: 'Provider zones filled by accuracy on a fixed range; labels print the metric, attempts and FG%.',
  markers: 'One mark per attempt in provider coordinates (tenths of a foot from the hoop): filled = made, ring = missed.',
  density: 'Hex opacity = share of attempts in one hue; no accuracy shown.',
}

export default function ShootingLab() {
  const st = useShootingState()
  const court = useCourt()
  const teams = useTeams()
  const teamName = useCallback((id: number) => teams.data?.data.find((t) => t.team_id === id)?.abbreviation ?? String(id), [teams.data])
  const labelA = useSubjectLabel(st.subjectA, st.season)
  const labelB = useSubjectLabel(st.subjectB, st.season)

  const wantMarkers = st.layer === 'markers' || st.selected !== null
  const A = useSubjectShots(st.subjectA, st.seasonType, st.filters, st.sizeFt, st.minAttempts, true)
  const B = useSubjectShots(st.subjectB, st.seasonType, st.filters, st.sizeFt, st.minAttempts, wantMarkers && st.view === 'side')
  const filterOpts = useShotFilters(st.subjectA ? subjectParams(st.subjectA, st.seasonType, { opp: '', period: '', st: '', made: '', dmin: '', dmax: '', from: '', to: '', zone: '', action: '', home: '' }) : { season: '' }, A.enabled)
  const suggestion = useExplorer({ season: st.season, season_type: st.seasonType, normalization: 'totals' }, !st.subjectA && Boolean(st.season))
  const topShooter = useMemo(() => {
    const rows = suggestion.data?.data ?? []
    return rows.reduce<typeof rows[number] | null>((best, r) => (!best || Number(r.fga ?? 0) > Number(best.fga ?? 0) ? r : best), null)
  }, [suggestion.data])

  const hexA = A.hexbins.data?.data ?? EMPTY
  const hexB = B.hexbins.data?.data ?? EMPTY
  const zonesA = A.zones.data?.data ?? EMPTY
  const zonesB = B.zones.data?.data ?? EMPTY
  const shotsA = A.markers.data?.data ?? EMPTY
  const diffBins = useMemo(() => (st.view === 'diff' && st.subjectB ? mergeDifference(hexA, hexB, st.metric, st.sizeFt, st.minAttempts) : undefined), [st.view, st.subjectB, hexA, hexB, st.metric, st.sizeFt, st.minAttempts])
  const domain = colourDomain(st.metric, st.range, st.view === 'diff')

  const inSelection = useCallback((s: Shot, sel: CourtSelection | null) => {
    if (!sel) return true
    if (sel.kind === 'zone') return s.shot_zone_basic === sel.zone
    const { x_ft, y_ft } = providerToFeet(s.loc_x, s.loc_y)
    const h = pointToHex(x_ft, y_ft, st.sizeFt)
    return h.q === sel.q && h.r === sel.r
  }, [st.sizeFt])
  const tableShots = useMemo(() => shotsA.filter((s) => inSelection(s, st.selected)), [shotsA, st.selected, inSelection])
  const emphasise = useCallback((s: Shot) => inSelection(s, st.selected), [inSelection, st.selected])

  const findCell = (sel: CourtSelection, hex: typeof hexA, zones: ZoneSummary[]) =>
    sel.kind === 'hex' ? hex.find((b) => b.q === sel.q && b.r === sel.r) ?? null : zones.find((z) => z.zone === sel.zone) ?? null
  const zoneRows: ZoneRow[] = useMemo(() => [
    ...zonesA.map((z) => ({ ...z, subject: labelA })),
    ...(st.subjectB ? zonesB.map((z) => ({ ...z, subject: labelB })) : []),
  ], [zonesA, zonesB, labelA, labelB, st.subjectB])

  const geometry = court.data?.data
  const loadingA = A.hexbins.isFetching || A.zones.isFetching || (st.layer === 'markers' && A.markers.isFetching)
  const loadingB = B.hexbins.isFetching || B.zones.isFetching
  const errorA = A.hexbins.error ?? A.zones.error ?? A.markers.error

  const courtFor = (hex: typeof hexA, zones: ZoneSummary[], shots: Shot[], title: string, label: string) => geometry && (
    <CourtChart
      geometry={geometry}
      layer={st.layer}
      shots={shots}
      markerFilter={st.markers}
      emphasiseShot={st.selected ? emphasise : undefined}
      hexbins={hex}
      zones={zones}
      sizeFt={st.sizeFt}
      metric={st.metric}
      domain={domain}
      encoding={st.encoding}
      lowSampleThreshold={st.minAttempts}
      hideLowSample={st.hideLow}
      selected={st.selected}
      onSelect={st.setSelected}
      teamName={teamName}
      title={`${title} shot chart for ${label}`}
      legendPlacement={st.view === 'side' ? 'below' : 'right'}
    />
  )

  const question = st.subjectA
    ? st.view === 'diff' ? `Where does ${labelA} shoot better or worse than ${labelB}?` : `Where does ${labelA} shoot from, and does it go in?`
    : 'Where do the shots come from, and do they go in?'

  return (
    <>
      <PageHeader
        title="Shooting lab"
        lede="Shot locations as hexbins, provider zones, raw markers or density. Frequency and accuracy are encoded separately, the colour range is fixed so subjects can be compared, and every FG% carries a Wilson interval."
      />
      <div className="flex flex-col gap-4">
        <Panel question="Who are we looking at?" method="Subject A is a player or team; subject B is optional: another player, a team, or the same subject in another season with shot detail.">
          <SubjectPicker st={st} labelA={labelA} labelB={labelB} />
        </Panel>

        {court.error && <ErrorState error={court.error} retry={() => court.refetch()} />}
        {!st.subjectA && (
          <EmptyState
            title="Pick a player or team to start"
            body={`Shot detail is available for ${st.seasonsWithShots.length ? st.seasonsWithShots.join(', ') : 'no seasons'} (${st.seasonType}).`}
            action={topShooter ? <Button variant="primary" onClick={() => st.chooseA('player', topShooter.player_id)}>Load {topShooter.full_name} ({st.season}, {Number(topShooter.fga).toLocaleString()} FGA)</Button> : undefined}
          />
        )}

        {st.subjectA && !A.available && (
          <EmptyState
            title={`No shot detail for ${labelA} in ${st.season} (${st.seasonType})`}
            body={`${(A.reason ?? 'The provider has no shot chart rows for this selection').replace(/[.\s]+$/, '')}. Seasons with shots for this season type: ${st.seasonsWithShots.length ? st.seasonsWithShots.join(', ') : 'none'}.`}
          />
        )}

        {st.subjectA && A.available && (
          <>
            <Panel question="Which shots count?" method="Filters are applied server-side to every layer and table. Filters the public shot-chart feed cannot support are listed below the row.">
              <FilterRow st={st} options={filterOpts.data?.data} />
            </Panel>

            <Panel
              question={question}
              method={LAYER_METHOD[st.layer]}
              info={`Colour = ${METRIC_LABEL[st.metric]}. Range is fixed (${st.range}) and identical for every court on this page. Low-sample threshold: ${st.minAttempts} attempts.`}
              actions={<div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
                {A.hexbins.data?.meta.total_fga !== undefined && <Badge>{A.hexbins.data.meta.total_fga.toLocaleString()} FGA{A.hexbins.data.meta.total_fgm !== undefined ? ` · ${A.hexbins.data.meta.total_fgm.toLocaleString()} FGM` : ''}</Badge>}
                {st.layer === 'markers' && A.markers.data?.meta.capped && <Badge tone="warning">Showing {A.markers.data.meta.returned?.toLocaleString()} of {A.markers.data.meta.total?.toLocaleString()} shots (capped)</Badge>}
              </div>}
            >
              <div className="mb-4 border-b border-line pb-4"><ViewControls st={st} /></div>
              {!geometry ? <Loading label="Loading court geometry" /> : (
                <Refetching loading={loadingA || (st.subjectB ? loadingB : false)} error={errorA} retry={() => { void A.hexbins.refetch(); void A.zones.refetch() }}>
                  {st.view === 'side' && st.subjectB ? (
                    <div className="grid gap-6 md:grid-cols-2">
                      <div><p className="mb-2 text-sm font-medium text-ink">A · {labelA}</p>{courtFor(hexA, zonesA, shotsA, 'Subject A', labelA)}</div>
                      <div>
                        <p className="mb-2 text-sm font-medium text-ink">B · {labelB}</p>
                        {B.available ? courtFor(hexB, zonesB, B.markers.data?.data ?? [], 'Subject B', labelB) : <EmptyState title={`No shot detail for ${labelB}`} body={B.reason} />}
                      </div>
                    </div>
                  ) : st.view === 'diff' && st.subjectB && diffBins ? (
                    !B.available ? <EmptyState title={`No shot detail for ${labelB}`} body={B.reason} /> : (
                      <CourtChart
                        geometry={geometry}
                        layer="hex"
                        diffBins={diffBins}
                        diffLabels={[labelA, labelB]}
                        sizeFt={st.sizeFt}
                        metric={st.metric}
                        domain={domain}
                        encoding={st.encoding}
                        lowSampleThreshold={st.minAttempts}
                        hideLowSample={st.hideLow}
                        selected={st.selected}
                        onSelect={st.setSelected}
                        title={`Difference shot chart, ${labelA} minus ${labelB}`}
                      />
                    )
                  ) : courtFor(hexA, zonesA, shotsA, 'Subject A', labelA)}
                </Refetching>
              )}
              {st.view === 'diff' && st.layer !== 'hex' && <p className="mt-2 text-xs text-ink-3">The difference view always uses hexbins; switch the view to see {st.layer} for A alone or side by side.</p>}
            </Panel>

            {st.selected && (
              <Panel question="What happened in the selected area?" method="Attempts, makes, FG% with its 95% Wilson interval, the league FG% in the same provider zone, and points per FGA (field goals only).">
                <BinDetail
                  selection={st.selected}
                  threshold={st.minAttempts}
                  onClear={() => st.setSelected(null)}
                  cells={[{ label: `A · ${labelA}`, cell: findCell(st.selected, hexA, zonesA) }, ...(st.subjectB ? [{ label: `B · ${labelB}`, cell: findCell(st.selected, hexB, zonesB) }] : [])]}
                />
              </Panel>
            )}

            <Panel question="How does each zone add up?" method="Provider zones with attempts, share, makes, FG%, league FG% in the same zone and season, the difference, points per FGA and the 95% Wilson interval. Click a row to select the zone." actions={st.selected?.kind === 'zone' ? <Badge tone="accent">{zoneLabel(st.selected.zone)}</Badge> : undefined}>
              <Refetching loading={A.zones.isFetching} error={A.zones.error} retry={() => { void A.zones.refetch() }}>
                <ZoneTable rows={zoneRows} showSubject={Boolean(st.subjectB)} threshold={st.minAttempts} selected={st.selected} onSelect={st.setSelected} />
              </Refetching>
            </Panel>

            <Panel question={st.selected ? `Which shots are in the selected ${st.selected.kind === 'hex' ? 'hex' : 'zone'}?` : `Which shots did ${labelA} take?`} method="Every attempt under the current filters for subject A; selecting a hex or zone narrows the list. Export writes the same rows as CSV." actions={A.markers.data?.meta.capped ? <Badge tone="warning">Capped at {A.markers.data.meta.cap?.toLocaleString()} shots</Badge> : undefined}>
              <Refetching loading={A.markers.isFetching} error={A.markers.error} retry={() => { void A.markers.refetch() }}>
                <ShotTable
                  shots={tableShots}
                  teamName={teamName}
                  filename={`shots-${st.subjectA.kind}-${st.subjectA.id}-${st.season}.csv`}
                  onSelect={(s) => st.setSelectedShot(st.selectedShot?.gameId === s.game_id && st.selectedShot.gameEventId === s.game_event_id ? null : { gameId: s.game_id, gameEventId: s.game_event_id })}
                  selectedKey={st.selectedShot ? `${st.selectedShot.gameId}:${st.selectedShot.gameEventId}` : null}
                />
              </Refetching>
            </Panel>

            {st.selectedShot && (
              <Panel question="What happened on the selected shot, and is there a clip?" method="The play-by-play action behind the shot via the verified id map, the participants the source names, and any clip reference. References open on the provider's site; nothing is downloaded or embedded.">
                <ShotEvidencePanel gameId={st.selectedShot.gameId} gameEventId={st.selectedShot.gameEventId} onClose={() => st.setSelectedShot(null)} />
              </Panel>
            )}
          </>
        )}

        <MethodNote />
      </div>
    </>
  )
}
