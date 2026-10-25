import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@/components/layout/PageHeader'
import { Badge, Button, Input, Panel, Refetching, Select, Toolbar } from '@/components/ui'
import { EvidenceList } from '@/components/evidence/EvidenceList'
import { useCapabilities, useEvidence, useStatus } from '@/hooks/useApi'
import { useEvidenceMutations, useMediaList, useSnapshots } from '@/hooks/useEvidenceApi'
import { ApiError } from '@/lib/api'
import { useBoolParam, useParam } from '@/lib/urlState'
import { AssetTable } from './evidence/AssetTable'
import { UploadDialog } from './evidence/UploadDialog'

const KINDS = ['', 'video_segment', 'annotation', 'external_reference', 'statistic', 'model_estimate']
const STATUSES = ['', 'active', 'stale', 'superseded', 'deleted']

/** `/evidence`: managed footage (local only), evidence items with filters, snapshot export. */
export default function EvidenceLibrary() {
  const nav = useNavigate()
  const status = useStatus()
  const caps = useCapabilities()
  const [playerId, setPlayerId] = useParam('player_id')
  const [kind, setKind] = useParam('kind')
  const [itemStatus, setItemStatus] = useParam('status')
  const [gameId, setGameId] = useParam('game_id')
  const [showUpload, setShowUpload] = useBoolParam('upload')
  const items = useEvidence({ player_id: playerId || undefined, kind: kind || undefined, status: itemStatus || undefined, game_id: gameId || undefined, limit: 100 })
  const media = useMediaList()
  const snapshots = useSnapshots()
  const m = useEvidenceMutations(null)
  const localOnly = media.error instanceof ApiError && media.error.status === 404
  const c = caps.data?.data
  const drains = c ? c.worker_alive || Boolean(c.jobs?.inline) : true

  return (
    <>
      <PageHeader title="Evidence library" lede="Footage you are authorised to use, the segments and annotations on it, and every evidence item a report can cite." />
      <div className="flex flex-col gap-4">
        {c && (
          <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="capability-banner">
            <Badge tone={c.ffmpeg.available ? 'good' : 'critical'}>ffmpeg {c.ffmpeg.available ? c.ffmpeg.version : 'missing'}</Badge>
            <Badge tone={drains ? 'good' : 'warning'}>{c.jobs?.inline ? 'jobs inline' : c.worker_alive ? 'worker alive' : 'no worker running'}</Badge>
            {c.jobs && <span className="text-ink-3">{c.jobs.queued} queued · {c.jobs.running} running</span>}
            {!drains && <span className="text-ink-2">Uploads will wait in the queue until `make worker` runs (or JOBS_INLINE=1).</span>}
          </div>
        )}
        <Panel
          question="Which footage is on this machine?"
          method="Managed originals are hashed and stored under data/<namespace>/media with a permission statement. Provider clips are references only and never downloaded (DEC-08, DEC-18)."
          actions={!localOnly && <Button size="sm" onClick={() => setShowUpload(!showUpload)}>{showUpload ? 'Hide upload' : 'Upload footage'}</Button>}
        >
          {status.data?.data.read_only || localOnly ? (
            <p className="text-sm text-ink-2" data-testid="local-only">Managed footage, jobs and annotation tools are local-only and are not available on this public read-only host (DEC-19). Evidence items below are still listed.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {showUpload && (
                <UploadDialog
                  ffmpegAvailable={c?.ffmpeg.available ?? true}
                  maxBytes={c?.media_limits?.max_upload_bytes ?? null}
                  busy={m.upload.isPending}
                  onSubmit={(form) => m.upload.mutate(form, { onSuccess: (r) => { setShowUpload(false); nav(`/evidence/${r.data.asset.asset_id}`) } })}
                />
              )}
              {m.upload.error ? <p className="text-xs text-critical" role="alert">{m.upload.error.message}</p> : null}
              <Refetching loading={media.isFetching} error={localOnly ? undefined : media.error} retry={() => { void media.refetch() }}>
                <AssetTable assets={media.data?.data ?? []} onOpen={(a) => nav(`/evidence/${a.asset_id}`)} />
              </Refetching>
            </div>
          )}
        </Panel>
        <Panel
          question="Which evidence items exist?"
          method="One row per citable item. Class is shown on every item; references never count as observations. Superseded or deleted items stay listed with their status so old citations still resolve."
          actions={<span className="text-xs text-ink-3">{items.data?.meta.total ?? 0} items</span>}
        >
          <Toolbar label="Filter evidence items">
            <Input label="Player id" value={playerId} onChange={(e) => setPlayerId(e.target.value)} inputMode="numeric" className="w-32" />
            <Input label="Game id" value={gameId} onChange={(e) => setGameId(e.target.value)} className="w-36" />
            <Select label="Kind" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map((k) => <option key={k} value={k}>{k ? k.replace(/_/g, ' ') : 'any kind'}</option>)}</Select>
            <Select label="Status" value={itemStatus} onChange={(e) => setItemStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{s || 'any status'}</option>)}</Select>
          </Toolbar>
          <Refetching loading={items.isFetching} error={items.error} retry={() => { void items.refetch() }}>
            <EvidenceList items={items.data?.data ?? []} emptyText="No evidence items match. Link footage to events or annotate clips to create some." />
          </Refetching>
        </Panel>
        {!localOnly && !status.data?.data.read_only && (
          <Panel
            question="Are the snapshots the trait layer reads up to date?"
            method="Reviewed observations enter profiles only through exported Parquet snapshots (DEC-03). Export after a labeling session; readers take the latest version."
            actions={<Button size="sm" onClick={() => m.exportSnapshot.mutate()} disabled={m.exportSnapshot.isPending}>Export snapshot now</Button>}
          >
            <Refetching loading={snapshots.isFetching} error={snapshots.error} retry={() => { void snapshots.refetch() }}>
              {snapshots.data && (
                <p className="text-sm text-ink-2" data-testid="snapshots">
                  Latest version {snapshots.data.meta.latest_version}
                  {snapshots.data.data.length ? ` · ${snapshots.data.data.slice(-1)[0].families.annotation_snapshots?.rows ?? 0} annotations and ${snapshots.data.data.slice(-1)[0].families.evidence_snapshots?.rows ?? 0} evidence items in it` : ' (nothing exported yet)'}
                  {m.exportSnapshot.data ? ` · last export job ${m.exportSnapshot.data.data.status}` : ''}
                </p>
              )}
            </Refetching>
          </Panel>
        )}
      </div>
    </>
  )
}
