import { Badge } from '@/components/ui'
import type { Job } from '@/lib/types'

const TONE: Record<Job['status'], 'neutral' | 'accent' | 'warning' | 'good' | 'critical'> = { queued: 'neutral', running: 'accent', succeeded: 'good', failed: 'critical', cancelled: 'warning', partial: 'warning' }

export function JobStatusChip({ job }: { job: Job | null | undefined }) {
  if (!job) return <Badge>no job</Badge>
  const pct = job.progress !== null && job.progress !== undefined ? ` ${Math.round(job.progress * 100)}%` : ''
  return <Badge tone={TONE[job.status]}>{job.kind} · {job.status}{pct}</Badge>
}
