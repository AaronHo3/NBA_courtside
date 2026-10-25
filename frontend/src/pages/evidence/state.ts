import type { Capabilities, Job, MediaAsset, MediaDerivative, MediaPermission, VocabEntry } from '@/lib/types'

/** One of the UI states in VIDEO_PIPELINE §5, decided from the asset, its permissions, derivatives, the machine and the last job. */
export type AssetStateKey = 'permission_unknown' | 'ready' | 'no_ffmpeg' | 'no_worker' | 'processing' | 'failed' | 'metadata_only' | 'registered'
export type AssetState = { key: AssetStateKey; label: string; explanation: string; canPlay: boolean; canRetry: boolean }

const KNOWN = (p: MediaPermission) => p.permission_status === 'known'

export function allows(permissions: MediaPermission[], ...ops: string[]): boolean {
  return permissions.some((p) => KNOWN(p) && ops.every((o) => (p.allowed_operations ?? []).includes(o)))
}

export function assetState(asset: MediaAsset, derivatives: MediaDerivative[], permissions: MediaPermission[], caps: Capabilities | null, job: Job | null): AssetState {
  if (!permissions.length || permissions.every((p) => !KNOWN(p))) {
    return { key: 'permission_unknown', label: 'Permission unknown', explanation: 'The permission statement is unknown, so only metadata is shown. Record who authorised this footage and which operations are allowed (view, playback_derivative, thumbnail, cv_processing) before it can be processed or played.', canPlay: false, canRetry: false }
  }
  const playback = derivatives.some((d) => d.kind === 'playback_mp4')
  if (playback && allows(permissions, 'view')) {
    return { key: 'ready', label: 'Ready', explanation: 'Playback derivative available; segments, anchors and annotations can be reviewed in place.', canPlay: true, canRetry: false }
  }
  if (job?.status === 'failed') {
    return { key: 'failed', label: 'Processing failed', explanation: `${job.kind}: ${job.error ?? 'unknown error'} (attempt ${job.attempt} of ${job.max_attempts})`, canPlay: false, canRetry: true }
  }
  if (caps && !caps.ffmpeg.available) {
    return { key: 'no_ffmpeg', label: 'ffmpeg unavailable', explanation: 'This machine has no ffmpeg, so the upload cannot be probed or converted. Install ffmpeg (brew install ffmpeg) and retry; nothing is lost.', canPlay: false, canRetry: true }
  }
  if (!allows(permissions, 'playback_derivative')) {
    return { key: 'metadata_only', label: 'Metadata only', explanation: 'The permission statement does not include playback_derivative, so no in-app playback is produced. Add a permission that allows it if you are authorised to.', canPlay: false, canRetry: false }
  }
  if (job && (job.status === 'queued' || job.status === 'running')) {
    const drains = caps ? caps.worker_alive || Boolean(caps.jobs?.inline) : true
    if (job.status === 'queued' && !drains) {
      return { key: 'no_worker', label: 'Processing queued, no worker', explanation: 'The job is queued but no worker is running and inline mode is off. Start one with `make worker` (or set JOBS_INLINE=1 for development).', canPlay: false, canRetry: false }
    }
    return { key: 'processing', label: 'Processing', explanation: job.progress_note ? `${job.kind}: ${job.progress_note}` : `${job.kind} ${job.status}`, canPlay: false, canRetry: false }
  }
  if (asset.status === 'registered' || asset.status === 'probed') {
    const drains = caps ? caps.worker_alive || Boolean(caps.jobs?.inline) : true
    return drains
      ? { key: 'processing', label: 'Processing queued', explanation: 'Waiting for the probe and playback jobs.', canPlay: false, canRetry: true }
      : { key: 'no_worker', label: 'Processing queued, no worker', explanation: 'No worker is running and inline mode is off; start one with `make worker`.', canPlay: false, canRetry: true }
  }
  return { key: 'registered', label: asset.status, explanation: 'No playback derivative recorded for this asset.', canPlay: false, canRetry: true }
}

export function permissionSummary(permissions: MediaPermission[]): string {
  if (!permissions.length) return 'No permission statement recorded'
  return permissions.map((p) => (KNOWN(p) ? `${p.source}: ${(p.allowed_operations ?? []).join(', ') || 'nothing'}` : `${p.source}: ${p.permission_status}`)).join(' · ')
}

/** Media time as m:ss.t (tenths), the resolution a labeler reads off a timeline. */
export function fmtMs(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !Number.isFinite(ms)) return '–'
  const total = Math.max(0, ms)
  const m = Math.floor(total / 60_000)
  const s = Math.floor((total % 60_000) / 1000)
  const tenths = Math.round((total % 1000) / 100)
  const carry = tenths === 10
  const ss = carry ? s + 1 : s
  return `${m + (ss === 60 ? 1 : 0)}:${String(ss % 60).padStart(2, '0')}.${carry ? 0 : tenths}`
}

export function fmtBytes(n: number | null | undefined): string {
  if (!n) return '–'
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}

export function outcomesFor(vocab: VocabEntry[], action: string): string[] {
  return vocab.find((v) => v.action === action)?.outcomes ?? []
}

export const CLASSIFICATION_LABEL: Record<string, string> = { live: 'Live', replay: 'Replay', unknown: 'Unknown', non_game: 'Non-game' }
export const REVIEW_LABEL: Record<string, string> = { unreviewed: 'Unreviewed', reviewed_ok: 'Reviewed OK', reviewed_corrected: 'Corrected', rejected: 'Rejected' }
