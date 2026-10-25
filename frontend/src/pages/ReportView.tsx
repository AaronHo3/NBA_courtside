import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Button, EmptyState, ErrorState, Input, Loading, Panel, Select } from '@/components/ui'
import { useReport, useScoutingMutations } from '@/hooks/useApi'
import type { ClaimType, ReportSection } from '@/lib/types'
import { ClaimList } from './scouting/ClaimList'
import { TYPE_LABEL } from './scouting/model'
import { TraitTable } from './scouting/TraitTable'

function Section({ s }: { s: ReportSection }) {
  if (s.key === 'statistical') return <>{(s.players ?? []).map((p) => <div key={p.player_id} className="mb-3"><h4 className="mb-1 text-sm font-medium text-ink"><Link to={`/players/${p.player_id}`} className="hover:underline">{p.full_name}</Link></h4><TraitTable traits={p.traits.filter((t) => t.value !== null)} dense /></div>)}</>
  if (s.key === 'reviewed_observation') return s.unsupported ? <p className="text-sm text-ink-2">No reviewed observations are available: {s.unsupported}.</p> : <>{(s.players ?? []).map((p) => <div key={p.player_id} className="mb-3"><h4 className="text-sm font-medium text-ink">{p.full_name}</h4><TraitTable traits={p.traits} dense /></div>)}</>
  if (s.key === 'model_estimate') return <p className="text-sm text-ink-2">{s.note}</p>
  if (s.key === 'limitations') return <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">{(s.items ?? []).map((it) => <li key={it}>{it}</li>)}</ul>
  return null
}

export default function ReportView() {
  const { reportId = '' } = useParams()
  const q = useReport(reportId || null)
  const m = useScoutingMutations()
  const [text, setText] = useState('')
  const [type, setType] = useState<ClaimType>('interpretation')
  const [evidence, setEvidence] = useState('')
  const [interp, setInterp] = useState<string | null>(null)
  if (q.isLoading) return <Loading label="Loading report" />
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />
  const r = q.data?.data
  if (!r) return <EmptyState title="Report not found" />
  const interpretation = r.sections.find((s) => s.key === 'interpretation')
  const addClaim = async () => {
    if (!text.trim()) return
    const players = r.shortlist ? r.shortlist.entries.map((e) => e.player_id) : (r.sections[0].players ?? []).map((p) => p.player_id)
    await m.addClaims.mutateAsync({ id: r.report_id, claims: [{ text, claim_type: type, player_ids: players, time_scope: { season: r.season, season_type: r.season_type }, evidence_ids: evidence.split(',').map((s) => s.trim()).filter(Boolean) }] })
    setText(''); setEvidence('')
  }
  const download = () => {
    const blob = new Blob([r.rendered_markdown], { type: 'text/markdown' })
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${r.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.md`; a.click(); URL.revokeObjectURL(a.href)
  }
  return (
    <>
      <PageHeader
        title={r.title}
        lede={<>Season {r.season} ({r.season_type}) · <Badge tone={r.status === 'final' ? 'good' : 'neutral'}>{r.status}</Badge> <Badge>{r.llm_mode === 'none' ? 'deterministic draft, no language model' : `model: ${r.model_id ?? r.llm_mode}`}</Badge>{r.shortlist && <> · from <Link to={`/scouting/shortlists/${r.shortlist.shortlist_id}`} className="text-accent hover:underline">{r.shortlist.label}</Link></>}</>}
        actions={<><Button onClick={download}>Download Markdown</Button><Button variant="primary" onClick={() => m.patchReport.mutate({ id: r.report_id, body: { status: r.status === 'final' ? 'draft' : 'final' } })}>{r.status === 'final' ? 'Reopen draft' : 'Mark final'}</Button></>}
      />
      <div className="flex flex-col gap-4">
        {r.sections.map((s) => (
          <Panel key={s.key} question={s.title} method={s.method}>
            {s.key === 'interpretation' ? (
              <div className="flex flex-col gap-2">
                <textarea className="control min-h-28 w-full text-sm text-ink" value={interp ?? interpretation?.text ?? ''} onChange={(e) => setInterp(e.target.value)} placeholder="Written by a person. Interpretations are kept apart from measurements and observations." />
                <div><Button size="sm" onClick={() => { m.patchReport.mutate({ id: r.report_id, body: { interpretation: interp ?? '' } }); }} disabled={interp === null}>Save interpretation</Button></div>
              </div>
            ) : <Section s={s} />}
          </Panel>
        ))}
        <Panel question="Which claims does this report make?" method="Every claim is validated on save: evidence ids must exist and be active, numbers must match the report's own values, and a claim typed above its support is downgraded, never upgraded.">
          <ClaimList claims={r.claims} />
          <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
            <Input label="Claim text" value={text} onChange={(e) => setText(e.target.value)} className="min-w-72 flex-1" />
            <Select label="Type" value={type} onChange={(e) => setType(e.target.value as ClaimType)}>
              {(Object.keys(TYPE_LABEL) as ClaimType[]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
            </Select>
            <Input label="Evidence ids (comma-separated)" value={evidence} onChange={(e) => setEvidence(e.target.value)} className="min-w-64" />
            <Button variant="primary" size="sm" onClick={() => void addClaim()} disabled={!text.trim() || m.addClaims.isPending}>Add claim</Button>
          </div>
        </Panel>
      </div>
    </>
  )
}
