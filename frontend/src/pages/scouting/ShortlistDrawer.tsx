import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Badge, Button, Input, Select } from '@/components/ui'
import { useScoutingMutations, useShortlistDetail, useShortlists } from '@/hooks/useApi'
import { useCompare } from '@/store/compare'
import { eligibilityLabel } from './model'

/** The working shortlist: pick or create one, see its entries, add the compare group, draft a report. */
export function ShortlistDrawer({ shortlistId, onChoose, season, seasonType, role, cohort }: {
  shortlistId: string | null; onChoose: (id: string | null) => void; season: string; seasonType: string; role: string
  cohort: { min_gp: number; min_minutes: number; position?: string }
}) {
  const lists = useShortlists()
  const detail = useShortlistDetail(shortlistId)
  const compare = useCompare((s) => s.players)
  const m = useScoutingMutations()
  const navigate = useNavigate()
  const [label, setLabel] = useState('')
  const sl = detail.data?.data
  const saveTop = async () => {
    const res = await m.createShortlist.mutateAsync({ label: label || `${role} · ${season}`, season, season_type: seasonType, source: { role, ...cohort, limit: 20 } })
    onChoose(res.data.shortlist_id)
    setLabel('')
  }
  const addCompare = async () => {
    if (!shortlistId || !compare.length) return
    await m.addEntries.mutateAsync({ id: shortlistId, body: { player_ids: compare.map((p) => p.player_id), added_by: 'compare' } })
  }
  const draft = async () => {
    if (!shortlistId) return
    const res = await m.createReport.mutateAsync({ shortlist_id: shortlistId, title: `${sl?.label ?? 'Shortlist'} · draft` })
    navigate(`/scouting/reports/${res.data.report_id}`)
  }
  return (
    <div className="flex flex-col gap-3" data-testid="shortlist-drawer">
      <div className="flex flex-wrap items-end gap-2">
        <Select label="Shortlist" value={shortlistId ?? ''} onChange={(e) => onChoose(e.target.value || null)} className="min-w-48">
          <option value="">None selected</option>
          {(lists.data?.data ?? []).map((s) => <option key={s.shortlist_id} value={s.shortlist_id}>{s.label} ({s.entry_count})</option>)}
        </Select>
        <Input label="New shortlist name" value={label} onChange={(e) => setLabel(e.target.value)} placeholder={`${role} · ${season}`} className="min-w-48" />
        <Button variant="primary" size="sm" onClick={() => void saveTop()} disabled={m.createShortlist.isPending}>Save top 20 as shortlist</Button>
      </div>
      {sl ? (
        <>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
            <span>{sl.entries.length} players · {sl.season} {sl.season_type}</span>
            {sl.role_id && <Badge>{sl.role_id} v{sl.role_version}</Badge>}
            {sl.ranking_meta && <span>fingerprint {String((sl.ranking_meta as { data_fingerprint?: string }).data_fingerprint ?? '')}</span>}
            <Link to={`/scouting/shortlists/${sl.shortlist_id}`} className="text-accent hover:underline">Open</Link>
          </div>
          <ul className="flex max-h-72 flex-col gap-1 overflow-auto text-sm">
            {sl.entries.map((e) => {
              const el = eligibilityLabel(e)
              return (
                <li key={e.player_id} className="flex items-center justify-between gap-2 border-b border-line/60 py-1">
                  <span className="flex items-center gap-2">
                    <span className="tnum text-ink-3">{e.rank}</span>
                    <Link to={`/players/${e.player_id}`} className="text-ink hover:underline">player {e.player_id}</Link>
                    {e.pinned && <Badge tone="accent">pinned</Badge>}
                    <Badge tone={el.tone}>{el.text}</Badge>
                  </span>
                  <span className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => m.patchEntry.mutate({ id: sl.shortlist_id, playerId: e.player_id, body: { pinned: !e.pinned } })}>{e.pinned ? 'Unpin' : 'Pin'}</Button>
                    <Button size="sm" variant="ghost" onClick={() => m.removeEntry.mutate({ id: sl.shortlist_id, playerId: e.player_id })}>Remove</Button>
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void addCompare()} disabled={!compare.length || m.addEntries.isPending}>Add compare group ({compare.length})</Button>
            <Button size="sm" variant="primary" onClick={() => void draft()} disabled={m.createReport.isPending}>Draft report</Button>
          </div>
        </>
      ) : (
        <p className="text-sm text-ink-2">No shortlist selected. Save the current candidates or pick an existing list.</p>
      )}
    </div>
  )
}
