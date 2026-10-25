import { Badge } from '@/components/ui'
import { useCapabilities, useEvidence, useStatus } from '@/hooks/useApi'
import { availabilityLabel, availabilityTone } from '@/components/evidence/helpers'
import type { Availability } from '@/lib/types'
import { Code, P, Section, Ul } from './Prose'

const STATES: Availability[] = ['unverified', 'available', 'stale', 'unavailable']

/** What video evidence exists, in which form, and what it can and cannot support. */
export function VideoCoverageSection() {
  const status = useStatus()
  const caps = useCapabilities()
  const refs = useEvidence({ kind: 'external_reference', limit: 1 })
  const all = useEvidence({ limit: 1 })
  const coverage = status.data?.data.coverage ?? {}
  const seasonsWithEvents = Object.entries(coverage).filter(([, types]) => Object.values(types).some((fams) => fams.events === 'ok' || fams.events === 'partial')).map(([s]) => s).sort().reverse()
  const c = caps.data?.data
  return (
    <Section id="video-coverage" question="Which video evidence exists, and in what form?" method="Counts from the evidence registry of the active namespace; machine capabilities from /api/meta/capabilities.">
      <div className="flex flex-col gap-3">
        <P>
          Video exists here only as <strong>external references</strong>: a link to the provider's own event page plus the metadata the provider lists for that clip (description, period, duration). Nothing is downloaded, embedded or processed. A reference is not an observation and never feeds a statistic; it is a pointer a reviewer can follow.
        </P>
        <Ul items={[
          <>Evidence items in this namespace: <span className="tnum">{(all.data?.meta.total ?? 0).toLocaleString()}</span>, of which clip references: <span className="tnum">{(refs.data?.meta.total ?? 0).toLocaleString()}</span>.</>,
          <>Play-by-play events are ingested per game (<Code>FAMILIES=events --game-ids …</Code>); seasons with at least one game: {seasonsWithEvents.length ? seasonsWithEvents.join(', ') : 'none'}.</>,
          <>Machine: ffmpeg {c?.ffmpeg.available ? `available (${c.ffmpeg.version ?? 'version unknown'})` : 'not installed'}; computer-vision runtime {c?.cv_runtime ? 'available' : 'absent'}; language model provider <Code>{c?.llm_provider ?? '…'}</Code>; video sources {c?.video_sources.length ? c.video_sources.join(', ') : 'none'}.</>,
        ]} />
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-3">
          <span>Reference states:</span>
          {STATES.map((s) => <Badge key={s} tone={availabilityTone(s)}>{availabilityLabel(s)}</Badge>)}
        </div>
        <P>
          A clip listed by the provider for an event does not establish the defender, the lineup on court, or anything about what the clip shows; those require reviewed annotations, which do not exist yet. Managed media, annotations and alignment arrive in later phases and will be documented here when they do.
        </P>
      </div>
    </Section>
  )
}
