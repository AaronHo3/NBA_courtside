import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Button, EmptyState, ErrorState, Loading, Panel } from '@/components/ui'
import { useReports, useRoles, useScoutingMutations, useShortlistDetail } from '@/hooks/useApi'
import { eligibilityLabel, roleLabel } from './scouting/model'

export default function ShortlistDetail() {
  const { shortlistId = '' } = useParams()
  const q = useShortlistDetail(shortlistId || null)
  const reports = useReports()
  const roles = useRoles()
  const m = useScoutingMutations()
  const navigate = useNavigate()
  if (q.isLoading) return <Loading label="Loading shortlist" />
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const sl = q.data?.data
  if (!sl) return <EmptyState title="Shortlist not found" body="It may belong to another namespace." />
  const meta = (sl.ranking_meta ?? {}) as { data_fingerprint?: string; funnel?: Array<{ stage: string; remaining: number }>; disclaimer?: string }
  const mine = (reports.data?.data ?? []).filter((r) => r.shortlist_id === sl.shortlist_id)
  const draft = async () => {
    const res = await m.createReport.mutateAsync({ shortlist_id: sl.shortlist_id, title: `${sl.label} · draft` })
    navigate(`/scouting/reports/${res.data.report_id}`)
  }
  return (
    <>
      <PageHeader title={sl.label} lede={<>Shortlist for {sl.season} {sl.season_type}. <Link to={`/scouting?shortlist=${sl.shortlist_id}&season=${sl.season}`} className="text-accent hover:underline">Back to the workspace</Link></>}
        actions={<Button variant="primary" onClick={() => void draft()} disabled={m.createReport.isPending}>Draft report</Button>} />
      <div className="flex flex-col gap-4">
        <Panel question="What was this list built from?" method="Frozen at save time: template, cohort, funnel and the manifest fingerprint of the data.">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-2">
            {sl.role_id ? <Badge tone="accent">{roleLabel(roles.data?.data ?? [], sl.role_id)} v{sl.role_version}</Badge> : <Badge>manual list</Badge>}
            {sl.cohort && <span>Cohort: ≥ {String(sl.cohort.min_gp)} games, ≥ {String(sl.cohort.min_minutes)} minutes, {sl.cohort.position ? `position ${String(sl.cohort.position)}` : 'any position'}</span>}
            {meta.data_fingerprint && <span className="tnum">data {meta.data_fingerprint}</span>}
            {meta.funnel?.map((f) => <Badge key={f.stage}>{f.stage}: {f.remaining}</Badge>)}
          </div>
          {sl.notes && <p className="mt-2 text-sm text-ink-2">{sl.notes}</p>}
        </Panel>
        <Panel question="Who is on it?" method="Scores and eligibility are those at save time; manual additions carry no score.">
          {!sl.entries.length && <EmptyState title="No players on this list" body="Add players from the scouting workspace or the compare group." />}
          <ul className="flex flex-col gap-1 text-sm">
            {sl.entries.map((e) => { const el = eligibilityLabel(e); return (
              <li key={e.player_id} className="flex flex-wrap items-center justify-between gap-2 border-b border-line/60 py-1.5">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="tnum text-ink-3">{e.rank}</span>
                  <Link to={`/players/${e.player_id}?season=${sl.season}`} className="text-ink hover:underline">Player {e.player_id}</Link>
                  <span className="tnum text-ink-2">{e.score === null ? '–' : e.score.toFixed(1)}</span>
                  <Badge tone={el.tone}>{el.text}</Badge>
                  {e.pinned && <Badge tone="accent">pinned</Badge>}
                  {e.note && <span className="text-xs text-ink-3">{e.note}</span>}
                </span>
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => m.patchEntry.mutate({ id: sl.shortlist_id, playerId: e.player_id, body: { pinned: !e.pinned } })}>{e.pinned ? 'Unpin' : 'Pin'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => m.removeEntry.mutate({ id: sl.shortlist_id, playerId: e.player_id })}>Remove</Button>
                </span>
              </li>
            ) })}
          </ul>
        </Panel>
        <Panel question="Which reports were drafted from it?" method="Each draft is deterministic for its data fingerprint; claims are validated on save.">
          {mine.length ? <ul className="text-sm">{mine.map((r) => <li key={r.report_id}><Link to={`/scouting/reports/${r.report_id}`} className="text-accent hover:underline">{r.title}</Link> <span className="text-xs text-ink-3">{r.status} · {r.claim_count} claims</span></li>)}</ul> : <EmptyState title="No reports yet" body="Draft a report to turn this list into validated claims." />}
        </Panel>
      </div>
    </>
  )
}
