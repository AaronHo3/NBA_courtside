import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Button, ErrorState, Loading, Panel, Refetching, Segmented } from '@/components/ui'
import { useCapabilities } from '@/hooks/useApi'
import { useAlignmentReport, useAnchors, useAnnotations, useEvidenceMutations, useMediaDetail, useRoster, useSegments, useVocabulary } from '@/hooks/useEvidenceApi'
import { ApiError } from '@/lib/api'
import type { EventKeyDto } from '@/lib/types'
import { useParam } from '@/lib/urlState'
import { AnchorEditor } from './evidence/AnchorEditor'
import { AnnotationForm } from './evidence/AnnotationForm'
import { AnnotationList } from './evidence/AnnotationList'
import { AssetStateCard } from './evidence/AssetStateCard'
import { JobStatusChip } from './evidence/JobStatusChip'
import { LinkEventDialog } from './evidence/LinkEventDialog'
import { SegmentList } from './evidence/SegmentList'
import { Timeline } from './evidence/Timeline'
import { VideoPlayer } from './evidence/VideoPlayer'
import { allows, assetState, fmtBytes, fmtMs, permissionSummary } from './evidence/state'

type Tab = 'segments' | 'anchors' | 'links' | 'annotations'
const EDITABLE = new Set(['INPUT', 'SELECT', 'TEXTAREA'])

/** `/evidence/:assetId`: the review workbench. URL carries ?t=<ms>&seg=<id>&ann=<id>&in=<ms>&out=<ms>&game=<id>. */
export default function EvidenceAsset() {
  const { assetId = '' } = useParams()
  const nav = useNavigate()
  const detail = useMediaDetail(assetId)
  const caps = useCapabilities()
  const segments = useSegments(assetId)
  const anchors = useAnchors(assetId)
  const report = useAlignmentReport(assetId)
  const annotations = useAnnotations({ asset_id: assetId, limit: 200 })
  const vocab = useVocabulary()
  const m = useEvidenceMutations(assetId)
  const [sp, setSp] = useSearchParams()
  const num = (k: string, fallback: number) => { const n = Number(sp.get(k)); return sp.has(k) && Number.isFinite(n) ? n : fallback }
  const urlT = num('t', 0)
  const inMs = num('in', -1)
  const outMs = num('out', -1)
  // several keys change in one keystroke; react-router's setter is not a chained updater, so write them together.
  const writeParams = useCallback((patch: Record<string, number | null>) => {
    // start from the live location, not the last rendered params: two keystrokes can land before a re-render
    setSp(() => { const next = new URLSearchParams(window.location.search); for (const [k, v] of Object.entries(patch)) { if (v === null || v < 0) next.delete(k); else next.set(k, String(Math.round(v))) } return next }, { replace: true })
  }, [setSp])
  const [seg, setSeg] = useParam('seg')
  const [ann, setAnn] = useParam('ann')
  const [gameId, setGameId] = useParam('game')
  const [tab, setTab] = useState<Tab>('segments')
  const [timeMs, setTimeMs] = useState(urlT)
  const [seekTo, setSeekTo] = useState<number | null>(urlT || null)
  const [duration, setDuration] = useState<number | null>(null)
  const roster = useRoster(gameId || null)

  const d = detail.data?.data
  const state = useMemo(() => (d ? assetState(d.asset, d.derivatives, d.permissions, caps.data?.data ?? null, d.job) : null), [d, caps.data])
  const durationMs = duration ?? d?.asset.duration_ms ?? 0
  const windowMs: [number, number] | null = inMs >= 0 && outMs > inMs ? [inMs, outMs] : null
  const selectedSegment = segments.data?.data.find((s) => s.segment_id === seg) ?? null
  const selectedAnnotation = annotations.data?.data.find((a) => a.annotation_id === ann) ?? null
  const eventKey: EventKeyDto | null = selectedAnnotation?.event_key ?? null

  const seek = useCallback((ms: number) => { const v = Math.max(0, Math.min(durationMs || ms, ms)); setTimeMs(v); setSeekTo(v); writeParams({ t: v }) }, [durationMs, writeParams])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (EDITABLE.has((e.target as HTMLElement)?.tagName)) return
      if (e.key === '[') writeParams({ in: timeMs, out: outMs <= timeMs ? null : outMs, t: timeMs })
      else if (e.key === ']') { if (timeMs > inMs) writeParams({ out: timeMs, t: timeMs }) }
      else if (e.key === 'ArrowLeft') seek(timeMs - (e.shiftKey ? 5000 : 1000))
      else if (e.key === 'ArrowRight') seek(timeMs + (e.shiftKey ? 5000 : 1000))
      else if (e.key === ' ') { const v = document.querySelector<HTMLVideoElement>('video[data-testid="video"]'); if (v) { e.preventDefault(); if (v.paused) void v.play(); else v.pause() } }
      else return
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [timeMs, inMs, outMs, seek, writeParams])
  useEffect(() => { if (selectedAnnotation && !gameId && selectedAnnotation.game_id) setGameId(selectedAnnotation.game_id) }, [selectedAnnotation, gameId, setGameId])

  if (detail.error instanceof ApiError && detail.error.status === 404) return <><PageHeader title="Footage not found" /><p className="text-sm text-ink-2">No asset {assetId} in this namespace, or it was deleted. <Button size="sm" onClick={() => nav('/evidence')}>Back to the library</Button></p></>
  if (detail.error) return <><PageHeader title="Footage" /><ErrorState error={detail.error} retry={() => { void detail.refetch() }} /></>
  if (!d || !state) return <><PageHeader title="Footage" /><Loading label="Loading asset" /></>
  const busy = Object.values(m).some((x) => x.isPending)
  const canDetect = (caps.data?.data.ffmpeg.available ?? false) && allows(d.permissions, 'thumbnail')
  const annotationWindow: [number, number] = windowMs ?? [Math.max(0, Math.round(timeMs) - 1000), Math.round(timeMs) + 1000]

  return (
    <>
      <PageHeader
        title={d.asset.original_filename ?? d.asset.asset_id}
        lede={`${fmtMs(d.asset.duration_ms)} · ${d.asset.width && d.asset.height ? `${d.asset.width}×${d.asset.height}` : 'size unknown'} · ${fmtBytes(d.asset.byte_size)} · ${d.asset.video_codec ?? 'codec unknown'} · ${permissionSummary(d.permissions)}`}
        actions={<div className="flex items-center gap-2"><JobStatusChip job={d.job} /><Button size="sm" variant="danger" onClick={() => { if (window.confirm('Soft-delete this asset? Files are purged after the retention window unless evidence cites them.')) m.deleteAsset.mutate(d.asset.asset_id, { onSuccess: () => nav('/evidence') }) }}>Delete</Button></div>}
      />
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <div className="flex flex-col gap-3">
          {state.canPlay ? (
            <VideoPlayer src={`/api/analytics/media/${assetId}/playback`} seekToMs={seekTo} onTime={(ms) => setTimeMs(ms)} onDuration={setDuration} />
          ) : (
            <div className="flex aspect-video items-center justify-center rounded-[var(--radius-control)] bg-raised text-sm text-ink-2">No in-app playback for this state.</div>
          )}
          <AssetStateCard state={state} busy={busy} onRetry={() => m.retryProbe.mutate()} />
          <Timeline
            durationMs={durationMs} timeMs={timeMs} windowMs={windowMs}
            segments={segments.data?.data ?? []} anchors={anchors.data?.data ?? []} annotations={annotations.data?.data ?? []}
            selectedSegment={seg || null} selectedAnnotation={ann || null}
            onSeek={seek} onSelectSegment={(id) => setSeg(id)} onSelectAnnotation={(id) => setAnn(id)}
          />
          <p className="text-xs text-ink-3">Shortcuts: space play/pause · ← → ±1 s (shift ±5 s) · [ set window start · ] set window end{windowMs ? ` · window ${fmtMs(windowMs[0])}–${fmtMs(windowMs[1])}` : ''}{windowMs && <Button size="sm" variant="ghost" className="ml-2" onClick={() => writeParams({ in: null, out: null })}>clear</Button>}</p>
          {m.retryProbe.error ? <p className="text-xs text-critical" role="alert">{m.retryProbe.error.message}</p> : null}
        </div>
        <Panel question="Review" method="Segments first, then clock anchors inside live segments, then events and annotations. Every action is saved with its reviewer and kept in history." actions={<Badge>{d.asset.status}</Badge>}>
          <Segmented ariaLabel="Review tab" value={tab} onChange={setTab} options={[{ value: 'segments', label: `Segments ${segments.data?.data.length ?? ''}` }, { value: 'anchors', label: `Anchors ${anchors.data?.data.length ?? ''}` }, { value: 'links', label: 'Events' }, { value: 'annotations', label: `Annotations ${annotations.data?.meta.total ?? ''}` }]} />
          <div className="mt-3">
            {tab === 'segments' && (
              <Refetching loading={segments.isFetching} error={segments.error} retry={() => { void segments.refetch() }}>
                <SegmentList segments={segments.data?.data ?? []} selected={seg || null} windowMs={windowMs} canDetect={canDetect} busy={busy}
                  onSelect={(id) => setSeg(id)} onCreate={(body) => m.createSegment.mutate(body)} onPatch={(id, body) => m.patchSegment.mutate({ id, body })} onDetect={() => m.detectBoundaries.mutate()} />
                {m.createSegment.error ? <p className="mt-2 text-xs text-critical" role="alert">{m.createSegment.error.message}</p> : null}
                {m.detectBoundaries.data ? <p className="mt-2 text-xs text-ink-3">Cut detection job {m.detectBoundaries.data.data.status}; proposals appear as unreviewed “unknown” segments.</p> : null}
              </Refetching>
            )}
            {tab === 'anchors' && (
              <Refetching loading={anchors.isFetching} error={anchors.error} retry={() => { void anchors.refetch() }}>
                <AnchorEditor anchors={anchors.data?.data ?? []} report={report.data?.data ?? null} timeMs={timeMs} busy={busy}
                  onCreate={(body) => m.createAnchor.mutate(body)} onReview={(id, status) => m.patchAnchor.mutate({ id, body: { review_status: status, reviewer: 'user' } })} />
                {m.createAnchor.error ? <p className="mt-2 text-xs text-critical" role="alert">{m.createAnchor.error.message}</p> : null}
              </Refetching>
            )}
            {tab === 'links' && (
              <LinkEventDialog gameId={gameId} onGameId={setGameId} segment={selectedSegment} windowMs={windowMs} busy={busy} error={m.createLink.error}
                onLink={({ gameId: g, eventId, body }) => m.createLink.mutate({ system: 'pbp_v3', gameId: g, eventId, body })} />
            )}
            {tab === 'annotations' && (
              <div className="flex flex-col gap-4">
                <AnnotationForm vocab={vocab.data?.data ?? []} roster={roster.data?.data ?? []} segment={selectedSegment} windowMs={annotationWindow} eventKey={eventKey} busy={busy} error={m.createAnnotation.error}
                  onSubmit={(body) => m.createAnnotation.mutate(body, { onSuccess: (r) => setAnn(r.data.annotation_id) })} />
                {!gameId && <p className="text-xs text-ink-3">Enter the game id in the Events tab to pick the subject from the game roster.</p>}
                <Refetching loading={annotations.isFetching} error={annotations.error} retry={() => { void annotations.refetch() }}>
                  <AnnotationList annotations={annotations.data?.data ?? []} selected={ann || null} busy={busy} onSelect={(id) => { setAnn(id); const a = annotations.data?.data.find((x) => x.annotation_id === id); if (a) seek(a.media_start_ms) }}
                    onReview={(id, status) => m.reviewAnnotation.mutate({ id, body: { review_status: status, reviewer: 'user' } })}
                    onDelete={(id) => { const reason = window.prompt('Reason for deleting (kept in the revision history)?'); if (reason !== null) m.deleteAnnotation.mutate({ id, reason: reason || 'deleted' }) }} />
                </Refetching>
              </div>
            )}
          </div>
        </Panel>
      </div>
    </>
  )
}
