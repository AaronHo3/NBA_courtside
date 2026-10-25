import { useMemo } from 'react'
import { EmptyState, ErrorState, Loading } from '@/components/ui'
import { useManifest, useStatus } from '@/hooks/useApi'
import { groupManifest, humanFamily } from './coverage'
import { Code, P, Section } from './Prose'

function fmtTime(iso: string | null): string {
  if (!iso) return '–'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString()
}

/** Manifest entries grouped per family: source, newest fetch, rows, notes. */
export function SourcesTable() {
  const manifest = useManifest()
  const status = useStatus()
  const groups = useMemo(() => groupManifest(manifest.data?.data.entries ?? [], status.data?.data.families ?? []), [manifest.data, status.data])
  return (
    <Section id="sources" question="Where does each family come from, and how fresh is it?" method="Grouped from the manifest. Real data is retrieved through the nba_api client against stats.nba.com by the backend pipeline; the browser only talks to this API.">
      {manifest.error ? (
        <ErrorState error={manifest.error} retry={() => { void manifest.refetch() }} />
      ) : manifest.isLoading ? (
        <Loading label="Loading manifest" />
      ) : groups.length === 0 ? (
        <EmptyState title="The manifest is empty" body="Run make ingest to fetch data; every family records its source and fetch time here." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-ink-3">
                <th className="py-1 pr-3 font-medium">Family</th>
                <th className="py-1 pr-3 font-medium">Source</th>
                <th className="py-1 pr-3 font-medium">Latest fetch</th>
                <th className="py-1 pr-3 text-right font-medium">Rows</th>
                <th className="py-1 pr-3 text-right font-medium">Entries ok</th>
                <th className="py-1 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.family} className="border-t border-line align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap"><span className="text-ink">{humanFamily(g.family)}</span> <Code>{g.family}</Code></td>
                  <td className="py-1.5 pr-3 whitespace-nowrap text-ink-2">{g.source}</td>
                  <td className="py-1.5 pr-3 whitespace-nowrap tnum text-ink-2">{fmtTime(g.latest_fetched_at)}</td>
                  <td className="py-1.5 pr-3 text-right tnum">{g.rows.toLocaleString()}</td>
                  <td className="py-1.5 pr-3 text-right tnum text-ink-2">{g.ok} / {g.entries}</td>
                  <td className="py-1.5 text-xs text-ink-2">{g.notes.length ? g.notes.join('; ') : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <P>
        Endpoint-by-endpoint provenance (which stats.nba.com endpoint feeds which family, pacing and caching) is documented in <Code>docs/DATA_SOURCES.md</Code> in the repository. Fetch order: cheap league summaries first (teams, players, team and player season totals), then combine measurements, game logs, lineups, on/off, defense dashboards, matchups, and league-wide shots last.
      </P>
    </Section>
  )
}
