import { Badge, Stat } from '@/components/ui'
import { useIngestionStatus, useStatus } from '@/hooks/useApi'
import { Code, Formula, P, Section } from './Prose'

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '–'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

function reachability(v: boolean | null | undefined): { label: string; tone: 'good' | 'critical' | 'neutral' } {
  if (v === true) return { label: 'Reachable', tone: 'good' }
  if (v === false) return { label: 'Unreachable', tone: 'critical' }
  return { label: 'Not probed yet', tone: 'neutral' }
}

/** Namespace, reason, freshness and the live ingestion state (refreshed every 5 s). */
export function DataStatus() {
  const status = useStatus()
  const st = status.data?.data
  const readOnly = st?.read_only === true
  const ingestion = useIngestionStatus(!readOnly)
  const ing = ingestion.data?.data
  const reach = reachability(ing?.provider_reachable)
  const lastRun = ing?.last_run ? summarise(ing.last_run) : null
  return (
    <Section id="data-status" question="Which data is this app serving right now?" method="Status from /api/meta/status; ingestion state from /api/ingestion/status, refreshed every 5 seconds.">
      {!st ? (
        <P>Loading status…</P>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
            <Stat label="Namespace" value={<span className="inline-flex items-center gap-2">{st.namespace}<Badge tone={st.is_demo ? 'warning' : 'good'}>{st.is_demo ? 'Demo (synthetic)' : 'Real provider data'}</Badge></span>} sub={st.reason} />
            <Stat label="Generated" value={<span className="text-base">{fmtTime(st.generated_at)}</span>} sub="When this dataset was built" />
            <Stat label="Seasons available" value={st.seasons.length} sub={st.seasons.length ? `${st.seasons[st.seasons.length - 1]} to ${st.seasons[0]}` : 'None'} />
            <Stat label="Provider (stats.nba.com)" value={<Badge tone={reach.tone}>{reach.label}</Badge>} sub="Probed by the backend only; the browser never contacts the provider" />
            <Stat label="Ingestion" value={<Badge tone={readOnly ? 'neutral' : ing?.running ? 'accent' : 'neutral'}>{readOnly ? 'Read-only deployment' : ing?.running ? 'Running' : 'Idle'}</Badge>} sub={readOnly ? 'Data is ingested on the maintainer\'s machine and synced here' : (lastRun ?? 'No run recorded in this process')} />
          </div>
          {st.banner && (
            <p className="flex items-start gap-2 rounded-[var(--radius-control)] border border-demo/60 bg-demo/10 px-3 py-2 text-sm text-ink">
              <span className="shrink-0 rounded-sm bg-amber-fill px-1.5 py-0.5 text-meta font-semibold text-on-fill">Banner</span>
              <span>{st.banner}</span>
            </p>
          )}
          <div>
            <h3 className="mb-1 text-sm font-semibold text-ink">Real namespace (<Code>nba</Code>) manifest</h3>
            <P>
              {readOnly ? (
                'Not exposed on a read-only deployment; see the coverage matrix below for what is loaded.'
              ) : ing ? (
                <>
                  {ing.real_manifest.entries} entries · {ing.real_manifest.ok} ok · {ing.real_manifest.failed} failed · seasons: {ing.real_manifest.seasons.length ? ing.real_manifest.seasons.join(', ') : 'none'} · generated {fmtTime(ing.real_manifest.generated_at)}
                </>
              ) : 'Loading ingestion status…'}
            </P>
          </div>
          <div>
            <h3 className="mb-1 text-sm font-semibold text-ink">Loading real data</h3>
            <P>Run from the repository root. The pipeline is resumable and caches every raw response; re-running skips completed steps.</P>
            <Formula label="Ingest one or more seasons (all families), then print the coverage table for the real namespace.">{`make ingest SEASONS="2024-25"\nmake ingest SEASONS="2024-25 2023-24" FAMILIES=player_season,team_season,shots\nmake ingest-status`}</Formula>
            <P>
              The API switches to the <Code>nba</Code> namespace automatically once that manifest has usable data (<Code>NBA_NAMESPACE=auto</Code>); force a namespace with <Code>NBA_NAMESPACE=nba</Code> or <Code>NBA_NAMESPACE=demo</Code> in <Code>.env</Code>. Demo and real data are never mixed: every row carries its source.
            </P>
          </div>
        </div>
      )}
    </Section>
  )
}

function summarise(run: Record<string, unknown>): string {
  const parts = Object.entries(run)
    .filter(([, v]) => v !== null && typeof v !== 'object')
    .slice(0, 6)
    .map(([k, v]) => `${k}: ${String(v)}`)
  return parts.length ? `Last run · ${parts.join(' · ')}` : 'Last run recorded'
}
