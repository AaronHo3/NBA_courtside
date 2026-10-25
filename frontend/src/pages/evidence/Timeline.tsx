import type { Anchor, Annotation, Segment } from '@/lib/types'
import { fmtMs } from './state'

const FILL: Record<string, string> = { live: 'var(--color-good, #2f9e6a)', replay: 'var(--color-warning, #d08a1f)', unknown: 'var(--color-ink-3, #999)', non_game: 'var(--color-line, #ccc)' }

/**
 * The asset's presentation timeline: segments as bands, anchors as ticks, annotations as markers, the
 * playhead and the current in/out window. Clicking seeks; clicking a band also selects that segment.
 */
export function Timeline({ durationMs, timeMs, windowMs, segments, anchors, annotations, selectedSegment, selectedAnnotation, onSeek, onSelectSegment, onSelectAnnotation }: {
  durationMs: number; timeMs: number; windowMs: [number, number] | null; segments: Segment[]; anchors: Anchor[]; annotations: Annotation[]
  selectedSegment: string | null; selectedAnnotation: string | null; onSeek: (ms: number) => void; onSelectSegment: (id: string | null) => void; onSelectAnnotation: (id: string | null) => void
}) {
  const W = 1000
  const x = (ms: number) => (durationMs > 0 ? Math.min(W, Math.max(0, (ms / durationMs) * W)) : 0)
  const seekAt = (evt: React.MouseEvent<SVGElement>) => {
    const rect = evt.currentTarget.getBoundingClientRect()
    const frac = (evt.clientX - rect.left) / rect.width
    onSeek(Math.round(frac * durationMs))
  }
  return (
    <div className="flex flex-col gap-1" data-testid="timeline">
      <svg viewBox={`0 0 ${W} 64`} className="w-full select-none" role="img" aria-label="Media timeline" onClick={seekAt}>
        <rect x={0} y={20} width={W} height={16} fill="var(--color-raised, #eee)" />
        {segments.map((s) => (
          <g key={s.segment_id} onClick={(e) => { e.stopPropagation(); onSelectSegment(s.segment_id === selectedSegment ? null : s.segment_id); onSeek(s.media_start_ms) }} className="cursor-pointer">
            <rect x={x(s.media_start_ms)} y={20} width={Math.max(1, x(s.media_end_ms) - x(s.media_start_ms))} height={16} fill={FILL[s.classification]} opacity={s.review_status === 'rejected' ? 0.25 : 0.8} stroke={s.segment_id === selectedSegment ? 'var(--color-ink, #111)' : 'none'} strokeWidth={2} />
            <title>{s.classification} {fmtMs(s.media_start_ms)}–{fmtMs(s.media_end_ms)} ({s.review_status})</title>
          </g>
        ))}
        {anchors.map((a) => (
          <g key={a.anchor_id}><line x1={x(a.media_pts_ms)} x2={x(a.media_pts_ms)} y1={12} y2={44} stroke="var(--color-accent, #2563eb)" strokeWidth={2} /><title>anchor Q{a.period} {fmtMs(a.clock_ms)} at {fmtMs(a.media_pts_ms)}</title></g>
        ))}
        {annotations.map((an) => (
          <g key={an.annotation_id} onClick={(e) => { e.stopPropagation(); onSelectAnnotation(an.annotation_id === selectedAnnotation ? null : an.annotation_id); onSeek(an.media_start_ms) }} className="cursor-pointer">
            <rect x={x(an.media_start_ms)} y={46} width={Math.max(2, x(an.media_end_ms) - x(an.media_start_ms))} height={8} fill={an.annotation_id === selectedAnnotation ? 'var(--color-ink, #111)' : 'var(--color-accent, #2563eb)'} opacity={an.review_status === 'rejected' ? 0.3 : 0.9} />
            <title>{an.action}{an.outcome ? ` · ${an.outcome}` : ''} {fmtMs(an.media_start_ms)}–{fmtMs(an.media_end_ms)}</title>
          </g>
        ))}
        {windowMs && <rect x={x(windowMs[0])} y={4} width={Math.max(1, x(windowMs[1]) - x(windowMs[0]))} height={8} fill="var(--color-ink-2, #555)" opacity={0.6} />}
        <line x1={x(timeMs)} x2={x(timeMs)} y1={0} y2={64} stroke="var(--color-critical, #d33)" strokeWidth={2} />
      </svg>
      <div className="flex justify-between text-[11px] text-ink-3"><span>0:00.0</span><span>playhead {fmtMs(timeMs)}</span><span>{fmtMs(durationMs)}</span></div>
    </div>
  )
}
