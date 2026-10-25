import { useState } from 'react'
import { Badge, Button, Input } from '@/components/ui'
import type { AlignmentReport, Anchor } from '@/lib/types'
import { REVIEW_LABEL, fmtMs } from './state'

function parseClock(text: string): number | null {
  const m = /^(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/.exec(text.trim())
  if (!m) return null
  return Number(m[1]) * 60_000 + Number(m[2]) * 1000 + (m[3] ? Number(m[3].padEnd(3, '0')) : 0)
}

/** Clock anchors for the live segments; the report shows every VIDEO_PIPELINE §6 rule with pass/fail. */
export function AnchorEditor({ anchors, report, timeMs, onCreate, onReview, busy }: {
  anchors: Anchor[]; report: AlignmentReport | null; timeMs: number
  onCreate: (body: Record<string, unknown>) => void; onReview: (id: string, status: string) => void; busy: boolean
}) {
  const [period, setPeriod] = useState('1')
  const [clock, setClock] = useState('')
  const [err, setErr] = useState('120')
  const [problem, setProblem] = useState<string | null>(null)
  const add = () => {
    const clockMs = parseClock(clock)
    if (clockMs === null) return setProblem('Clock as m:ss or m:ss.t, e.g. 11:48.0')
    setProblem(null)
    onCreate({ media_pts_ms: Math.round(timeMs), period: Number(period), clock_ms: clockMs, method: 'manual', error_ms: Number(err) || null })
    setClock('')
  }
  return (
    <div className="flex flex-col gap-3" data-testid="anchor-editor">
      <div className="flex flex-wrap items-end gap-2">
        <span className="text-xs text-ink-3">At playhead <span className="tnum text-ink">{fmtMs(timeMs)}</span> the game clock reads</span>
        <Input label="Period" value={period} onChange={(e) => setPeriod(e.target.value)} inputMode="numeric" className="w-16" />
        <Input label="Clock (m:ss.t)" value={clock} onChange={(e) => setClock(e.target.value)} placeholder="11:48.0" className="w-28" />
        <Input label="± ms" value={err} onChange={(e) => setErr(e.target.value)} inputMode="numeric" className="w-20" />
        <Button size="sm" variant="primary" onClick={add} disabled={busy}>Add anchor</Button>
      </div>
      {problem && <p className="text-xs text-critical" role="alert">{problem}</p>}
      {!anchors.length && <p className="text-sm text-ink-2">No anchors. Pause on a frame where the score bug clock is legible, inside a live segment, and record it. Two anchors per period and segment allow interpolation.</p>}
      <ul className="flex flex-col gap-1">
        {anchors.map((a) => (
          <li key={a.anchor_id} className="flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-line p-2 text-sm">
            <span className="tnum text-ink">{fmtMs(a.media_pts_ms)}</span>
            <span className="text-ink-2">Q{a.period} {fmtMs(a.clock_ms)}</span>
            <span className="text-[11px] text-ink-3">{a.method}{a.error_ms !== null ? ` ±${a.error_ms} ms` : ''}</span>
            <Badge tone={a.review_status === 'reviewed_ok' ? 'good' : a.review_status === 'rejected' ? 'critical' : 'neutral'}>{REVIEW_LABEL[a.review_status]}</Badge>
            <span className="ml-auto flex gap-1">
              <Button size="sm" onClick={() => onReview(a.anchor_id, 'reviewed_ok')} disabled={busy}>OK</Button>
              <Button size="sm" variant="ghost" onClick={() => onReview(a.anchor_id, 'rejected')} disabled={busy}>Reject</Button>
            </span>
          </li>
        ))}
      </ul>
      {report && (
        <div className="rounded-[var(--radius-control)] border border-line p-2" data-testid="alignment-report" data-ok={report.ok}>
          <div className="mb-1 flex items-center gap-2 text-xs"><Badge tone={report.ok ? 'good' : 'warning'}>{report.ok ? 'Alignment rules pass' : 'Alignment needs review'}</Badge><span className="text-ink-3">{report.segments} segments · {report.anchors} anchors · {report.links} links</span></div>
          <ul className="flex flex-col gap-0.5 text-xs">
            {report.rules.map((r) => <li key={r.rule} className={r.passed ? 'text-ink-3' : 'text-critical'}>{r.passed ? '✓' : '✗'} {r.rule}{r.details.length ? `: ${r.details.join('; ')}` : ''}</li>)}
          </ul>
        </div>
      )}
    </div>
  )
}
