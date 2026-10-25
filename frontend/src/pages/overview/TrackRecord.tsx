import type { PredictionsResponse } from '@/fantasy/api/types'
import { StatTile } from '@/components/ui'

/** Hit rate of the frozen weekly projections, with correct/decided per week as a small bar chart. No bands: there is no uncertainty estimate. */
export function TrackRecord({ data }: { data: PredictionsResponse }) {
  const s = data.summary
  const periods = Object.entries(s.by_period ?? {})
    .map(([p, v]) => ({ period: Number(p), decided: Number(v.n_decided ?? v.decided ?? 0), correct: Number(v.n_correct ?? v.correct ?? 0) }))
    .sort((a, b) => a.period - b.period)
  const w = 320, h = 96, pad = 18
  const bw = periods.length ? Math.min(28, (w - pad * 2) / periods.length - 6) : 0
  if (s.n_decided === 0) {
    return <p className="text-sm text-ink-2">Results are scored after each scoring period ends; the first arrives after week 1.</p>
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-8 gap-y-3">
        <StatTile label="Projection hit rate" value={s.hit_rate == null ? '—' : `${Math.round(s.hit_rate * 100)}%`} sub={`${s.n_correct} of ${s.n_decided} decided matchups`} tone={s.hit_rate == null ? 'neutral' : s.hit_rate >= 0.5 ? 'pos' : 'neg'} />
        <StatTile label="Brier score" value={s.brier == null ? '—' : s.brier.toFixed(3)} sub="lower is better · 0.25 = coin flip" />
      </div>
      {periods.length > 0 && (
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full max-w-sm" role="img" aria-label={`Correct projections per week: ${periods.map((p) => `week ${p.period} ${p.correct} of ${p.decided}`).join(', ')}`}>
          {periods.map((p, i) => {
            const x = pad + i * ((w - pad * 2) / periods.length) + 3
            const full = h - 26
            const dh = p.decided ? full : 2
            const ch = p.decided ? (p.correct / p.decided) * full : 0
            return (
              <g key={p.period}>
                <rect x={x} y={h - 18 - dh} width={bw} height={dh} fill="var(--raised)" />
                <rect x={x} y={h - 18 - ch} width={bw} height={ch} fill="var(--pos)" />
                <text x={x + bw / 2} y={h - 5} textAnchor="middle" fontSize="10" fill="var(--ink-3)">W{p.period}</text>
                <text x={x + bw / 2} y={h - 22 - dh} textAnchor="middle" fontSize="10" fill="var(--ink-2)" className="tnum">{p.decided ? `${p.correct}/${p.decided}` : ''}</text>
              </g>
            )
          })}
        </svg>
      )}
    </div>
  )
}
