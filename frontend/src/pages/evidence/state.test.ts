import { describe, expect, it } from 'vitest'
import { assetState, permissionSummary, fmtMs, outcomesFor } from './state'
import type { Capabilities, MediaAsset, MediaDerivative, MediaPermission, Job } from '@/lib/types'

const caps = (over: Partial<Capabilities> = {}): Capabilities => ({
  ffmpeg: { available: true, version: '9.0.2' }, cv_runtime: false, llm_provider: 'none', worker_alive: true,
  jobs: { inline: false, queued: 0, running: 0 }, video_sources: ['nba_stats_events'], state_db: { namespace: 'nba', schema_version: 8 },
  media_limits: { max_upload_bytes: 1, max_duration_ms: 1, max_pixels: 1, purge_after_days: 7, reference_stale_after_days: 30 }, ...over,
})
const asset = (over: Partial<MediaAsset> = {}): MediaAsset => ({
  asset_id: '01A', kind: 'managed_original', original_filename: 'a.mp4', byte_size: 10, container: 'mp4', duration_ms: 60_000, width: 1280, height: 720,
  status: 'registered', availability: null, created_at: 't', updated_at: 't', sha256: 'x', storage_key: 'k', video_codec: null, audio_codec: null,
  frame_rate_num: null, frame_rate_den: null, time_base_num: null, time_base_den: null, variable_frame_rate: null, processing_version: 1, ...over,
})
const perm = (ops: string[], status: MediaPermission['permission_status'] = 'known'): MediaPermission => ({
  permission_id: 'p', source: 'user_upload', permission_status: status, allowed_operations: ops, authorization_ref: null, notes: null, expires_at: null, created_at: 't',
})
const playback: MediaDerivative = { derivative_id: 'd', kind: 'playback_mp4', storage_key: 'k', processing_version: 1, byte_size: 1, params: {}, created_at: 't' }
const job = (status: Job['status'], error: string | null = null): Job => ({ job_id: 'j', kind: 'probe_media', status, attempt: 1, max_attempts: 3, progress: null, progress_note: null, result: null, error, created_at: 't', started_at: null, finished_at: null, payload: {} })

describe('assetState (VIDEO_PIPELINE §5)', () => {
  it('permission unknown wins over everything else', () => {
    const s = assetState(asset({ status: 'ready' }), [playback], [perm(['view'], 'unknown')], caps(), null)
    expect(s.key).toBe('permission_unknown')
    expect(s.canPlay).toBe(false)
    expect(s.explanation).toMatch(/permission/i)
  })
  it('is ready when a playback derivative exists and viewing is allowed', () => {
    const s = assetState(asset({ status: 'ready' }), [playback], [perm(['view', 'playback_derivative'])], caps(), job('succeeded'))
    expect(s.key).toBe('ready')
    expect(s.canPlay).toBe(true)
  })
  it('reports ffmpeg unavailable instead of a queue when the machine cannot process', () => {
    const s = assetState(asset(), [], [perm(['view', 'playback_derivative'])], caps({ ffmpeg: { available: false, version: null } }), null)
    expect(s.key).toBe('no_ffmpeg')
    expect(s.explanation).toMatch(/ffmpeg/i)
  })
  it('reports that no worker is running when a job is queued and nothing drains the queue', () => {
    const s = assetState(asset(), [], [perm(['view', 'playback_derivative'])], caps({ worker_alive: false }), job('queued'))
    expect(s.key).toBe('no_worker')
    expect(s.explanation).toMatch(/worker/i)
  })
  it('shows processing when the worker or inline runner is on it', () => {
    expect(assetState(asset({ status: 'probed' }), [], [perm(['view', 'playback_derivative'])], caps(), job('running')).key).toBe('processing')
    expect(assetState(asset(), [], [perm(['view', 'playback_derivative'])], caps({ worker_alive: false, jobs: { inline: true, queued: 1, running: 0 } }), job('queued')).key).toBe('processing')
  })
  it('surfaces a failed job with its error and allows a retry', () => {
    const s = assetState(asset({ status: 'failed' }), [], [perm(['view'])], caps(), job('failed', 'duration exceeds limit'))
    expect(s.key).toBe('failed')
    expect(s.explanation).toContain('duration exceeds limit')
    expect(s.canRetry).toBe(true)
  })
  it('explains when the permission statement does not allow a playback derivative', () => {
    const s = assetState(asset({ status: 'probed' }), [], [perm(['view'])], caps(), job('succeeded'))
    expect(s.key).toBe('metadata_only')
    expect(s.explanation).toMatch(/playback_derivative/)
  })
})

describe('helpers', () => {
  it('summarises permissions', () => {
    expect(permissionSummary([])).toMatch(/no permission/i)
    expect(permissionSummary([perm(['view', 'thumbnail'])])).toBe('user_upload: view, thumbnail')
    expect(permissionSummary([perm(['view'], 'unknown')])).toMatch(/unknown/)
  })
  it('formats media time as m:ss.t', () => {
    expect(fmtMs(0)).toBe('0:00.0')
    expect(fmtMs(61_250)).toBe('1:01.3')
    expect(fmtMs(null)).toBe('–')
  })
  it('lists outcomes for an action from the vocabulary catalogue', () => {
    const vocab = [{ action: 'closeout', definition: 'd', outcomes: ['late', 'blown_by'] }, { action: 'unknown', definition: 'd', outcomes: [] }]
    expect(outcomesFor(vocab, 'closeout')).toEqual(['late', 'blown_by'])
    expect(outcomesFor(vocab, 'unknown')).toEqual([])
    expect(outcomesFor(vocab, 'nope')).toEqual([])
  })
})
