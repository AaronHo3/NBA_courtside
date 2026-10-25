import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiGet, apiSend, apiUpload, type Envelope, type QueryValue } from '@/lib/api'
import type {
  AlignmentReport, Anchor, Annotation, AnnotationRevision, EventLink, Job, MediaAsset, MediaDetail, Placement, RosterPlayer, Segment,
  SnapshotVersion, VocabEntry,
} from '@/lib/types'

type Params = Record<string, QueryValue>
const ACTIVE: ReadonlySet<Job['status']> = new Set(['queued', 'running'])

function useEnvelopeQuery<T, M = Record<string, unknown>>(key: unknown[], path: string, params?: Params, options: Record<string, unknown> = {}) {
  return useQuery<Envelope<T, M>>({ queryKey: key, queryFn: ({ signal }) => apiGet<T, M>(path, params, signal), ...options })
}

export const useMediaList = (params: Params = {}) => useEnvelopeQuery<MediaAsset[], { total: number }>(['media', params], '/api/analytics/media', params, { placeholderData: keepPreviousData })
/** Asset detail; polls while its probe job is still queued or running so the state card updates itself. */
export const useMediaDetail = (assetId: string | null) =>
  useEnvelopeQuery<MediaDetail>(['media-detail', assetId], `/api/analytics/media/${assetId}`, undefined, {
    enabled: Boolean(assetId),
    refetchInterval: (q: { state: { data?: Envelope<MediaDetail> } }) => (q.state.data?.data.job && ACTIVE.has(q.state.data.data.job.status) ? 3000 : false),
  })
export const useJob = (jobId: string | null) =>
  useEnvelopeQuery<Job>(['job', jobId], `/api/analytics/jobs/${jobId}`, undefined, {
    enabled: Boolean(jobId),
    refetchInterval: (q: { state: { data?: Envelope<Job> } }) => (q.state.data && ACTIVE.has(q.state.data.data.status) ? 2000 : false),
  })
export const useSegments = (assetId: string | null) => useEnvelopeQuery<Segment[]>(['segments', assetId], `/api/analytics/media/${assetId}/segments`, undefined, { enabled: Boolean(assetId) })
export const useAnchors = (assetId: string | null) => useEnvelopeQuery<Anchor[]>(['anchors', assetId], `/api/analytics/media/${assetId}/anchors`, undefined, { enabled: Boolean(assetId) })
export const useAlignmentReport = (assetId: string | null) => useEnvelopeQuery<AlignmentReport>(['alignment', assetId], `/api/analytics/media/${assetId}/alignment/validate`, undefined, { enabled: Boolean(assetId) })
export const usePlacement = (assetId: string | null, period: number | null, clockMs: number | null) =>
  useEnvelopeQuery<Placement | null, { reason?: string }>(['place', assetId, period, clockMs], `/api/analytics/media/${assetId}/alignment/place`, { period, clock_ms: clockMs }, { enabled: Boolean(assetId) && period !== null && clockMs !== null })
export const useAnnotations = (params: Params, enabled = true) =>
  useEnvelopeQuery<Annotation[], { total: number }>(['annotations', params], '/api/analytics/annotations', params, { enabled, placeholderData: keepPreviousData })
export const useAnnotationDetail = (id: string | null) =>
  useEnvelopeQuery<{ annotation: Annotation; revisions: AnnotationRevision[] }>(['annotation', id], `/api/analytics/annotations/${id}`, undefined, { enabled: Boolean(id) })
export const useVocabulary = () => useEnvelopeQuery<VocabEntry[], { vocab_version: number }>(['vocabulary'], '/api/analytics/annotations/vocabulary', undefined, { staleTime: Infinity })
export const useRoster = (gameId: string | null) => useEnvelopeQuery<RosterPlayer[], { players: number; teams: number }>(['roster', gameId], `/api/analytics/games/${gameId}/roster`, undefined, { enabled: Boolean(gameId && /^[0-9A-Z]\d{9}$/.test(gameId)) })
export const useSnapshots = () => useEnvelopeQuery<SnapshotVersion[], { latest_version: number; versions: number }>(['snapshots'], '/api/analytics/snapshots')
/** Every write the review pages need; each invalidates what it changes. */
export function useEvidenceMutations(assetId: string | null) {
  const qc = useQueryClient()
  const touch = (...keys: string[]) => () => { for (const k of keys) void qc.invalidateQueries({ queryKey: [k] }) }
  const base = `/api/analytics/media/${assetId}`
  return {
    upload: useMutation({ mutationFn: (form: FormData) => apiUpload<{ asset: MediaAsset; job: Job | null }, { created: boolean }>('/api/analytics/media/uploads', form), onSuccess: touch('media') }),
    deleteAsset: useMutation({ mutationFn: (id: string) => apiSend<{ deleted: string }>('DELETE', `/api/analytics/media/${id}`), onSuccess: touch('media', 'evidence') }),
    retryProbe: useMutation({ mutationFn: () => apiSend<Job>('POST', `${base}/jobs/retry`), onSuccess: touch('media-detail') }),
    detectBoundaries: useMutation({ mutationFn: () => apiSend<Job>('POST', `${base}/jobs/detect-boundaries`), onSuccess: touch('segments', 'media-detail') }),
    createSegment: useMutation({ mutationFn: (body: Record<string, unknown>) => apiSend<Segment>('POST', `${base}/segments`, body), onSuccess: touch('segments', 'alignment') }),
    patchSegment: useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiSend<Segment>('PATCH', `${base}/segments/${id}`, body), onSuccess: touch('segments', 'alignment') }),
    createAnchor: useMutation({ mutationFn: (body: Record<string, unknown>) => apiSend<Anchor>('POST', `${base}/anchors`, body), onSuccess: touch('anchors', 'alignment', 'place') }),
    patchAnchor: useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiSend<Anchor>('PATCH', `${base}/anchors/${id}`, body), onSuccess: touch('anchors', 'alignment') }),
    createLink: useMutation({
      mutationFn: ({ system, gameId, eventId, body }: { system: string; gameId: string; eventId: number; body: Record<string, unknown> }) =>
        apiSend<EventLink>('POST', `/api/analytics/events/${system}/${gameId}/${eventId}/links`, body),
      onSuccess: touch('evidence', 'alignment', 'asset-links'),
    }),
    reviewLink: useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiSend<EventLink>('PATCH', `/api/analytics/evidence/links/${id}`, body), onSuccess: touch('evidence', 'asset-links') }),
    createAnnotation: useMutation({ mutationFn: (body: Record<string, unknown>) => apiSend<Annotation>('POST', '/api/analytics/annotations', body), onSuccess: touch('annotations', 'evidence') }),
    patchAnnotation: useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiSend<Annotation>('PATCH', `/api/analytics/annotations/${id}`, body), onSuccess: touch('annotations', 'annotation', 'evidence') }),
    reviewAnnotation: useMutation({ mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => apiSend<Annotation>('POST', `/api/analytics/annotations/${id}/review`, body), onSuccess: touch('annotations', 'annotation', 'evidence') }),
    deleteAnnotation: useMutation({ mutationFn: ({ id, reason }: { id: string; reason: string }) => apiSend<Annotation>('DELETE', `/api/analytics/annotations/${id}?changed_by=user&reason=${encodeURIComponent(reason)}`), onSuccess: touch('annotations', 'annotation', 'evidence') }),
    exportSnapshot: useMutation({ mutationFn: () => apiSend<Job>('POST', '/api/analytics/snapshots/export'), onSuccess: touch('snapshots') }),
  }
}
