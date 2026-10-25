import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { useSetCrumb } from '@/store/crumb'
import { EmptyState, ErrorState, Loading, Panel, Refetching, Select, Toggle } from '@/components/ui'
import { useGame, useGameEvents, useTeams } from '@/hooks/useApi'
import { useBoolParam, useNumberParam, useParam } from '@/lib/urlState'
import { EventDetailPanel } from './games/EventDetailPanel'
import { EventTable } from './games/EventTable'
import { GameHeader, teamLabel } from './games/GameHeader'

const PAGE = 100

export default function GameDetail() {
  const { gameId = '' } = useParams()
  const teams = useTeams()
  const game = useGame(gameId || null)
  const [period, setPeriod] = useParam('period')
  const [fgOnly, setFgOnly] = useBoolParam('fg', false)
  const [offset, setOffset] = useNumberParam('off', 0)
  const [evRaw, setEv] = useParam('ev')
  const selected = useMemo(() => {
    const [system, id] = evRaw.split(':')
    const n = Number(id)
    return system && Number.isFinite(n) ? { system, id: n } : null
  }, [evRaw])
  const params = { period: period || undefined, is_field_goal: fgOnly ? true : undefined, limit: PAGE, offset }
  const events = useGameEvents(gameId || null, params)
  const list = events.data?.data ?? []

  const g = game.data?.data
  const title = g ? `${teamLabel(teams.data?.data, g.game.away_team_id)} ${g.game.neutral_site ? 'vs' : 'at'} ${teamLabel(teams.data?.data, g.game.home_team_id)}` : null
  useSetCrumb(title ? [{ label: 'Games', to: '/games' }, { label: title }] : null)

  if (game.isLoading) return <Loading label="Loading game" />
  if (game.error) return <ErrorState error={game.error} retry={() => game.refetch()} />
  if (!g || !title) return <EmptyState title={`Game ${gameId} not found`} body="Games come from the ingested team game logs; check the season on the Data & methods page." />

  return (
    <>
      <PageHeader title={title} lede={<>Play-by-play as the provider published it, in source order, with the evidence registered for each event. <Link to="/games" className="text-accent hover:underline">All games</Link></>} />
      <div className="flex flex-col gap-4">
        <Panel question="What is this game and what do we hold for it?" method="Derived from both teams' game logs; coverage counts come from the events, shots, id-map and evidence tables.">
          <GameHeader game={g.game} coverage={g.coverage} teams={teams.data?.data} />
        </Panel>
        <Panel
          question="What happened, action by action?"
          method="One row per provider action. Repeated action numbers are kept and marked (dup). 'video' is the provider's own flag, not a permission. Click a row for participants and clip references."
          actions={
            <div className="flex flex-wrap items-center gap-3">
              <Select label="Period" value={period} onChange={(e) => { setPeriod(e.target.value || null); setOffset(null) }}>
                <option value="">All</option>
                {[1, 2, 3, 4, 5, 6].map((p) => <option key={p} value={p}>{p > 4 ? `OT${p - 4}` : `Q${p}`}</option>)}
              </Select>
              <Toggle checked={fgOnly} onChange={(v) => { setFgOnly(v); setOffset(null) }} label="Field goals only" />
            </div>
          }
        >
          <Refetching loading={events.isFetching} error={events.error} retry={() => { void events.refetch() }}>
            <EventTable events={list} meta={events.data?.meta} selectedId={selected?.id ?? null} onSelect={(e) => setEv(selected?.id === e.source_event_id ? null : `${e.source_event_system}:${e.source_event_id}`)} onPage={(o) => setOffset(o || null)} />
          </Refetching>
        </Panel>
        {selected && (
          <Panel question="What do we know about the selected event?" method="Source participants, every duplicate copy, the mapped shot, and evidence items. Clip references open on the provider's site.">
            <EventDetailPanel system={selected.system} gameId={gameId} eventId={selected.id} />
          </Panel>
        )}
      </div>
    </>
  )
}
