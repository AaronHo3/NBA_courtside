import type { ReactNode } from 'react'
import { Badge, Refetching } from '@/components/ui'
import { CourtKey } from '@/components/court/CourtKey'
import type { AccuracyMetric, Domain } from '@/components/court/colour'
import type { CourtLayer, CourtSelection, FrequencyEncoding } from '@/components/court/types'
import { BinDetail } from './BinDetail'
import { ZoneTable, type ZoneRow } from './ZoneTable'
import type { HexBin, ZoneSummary } from '@/lib/types'

type Cell = HexBin | ZoneSummary

export type CourtAsideProps = {
  legend: { layer: CourtLayer; metric: AccuracyMetric; domain: Domain; encoding: FrequencyEncoding; threshold: number; diff: boolean; diffLabels?: [string, string] }
  zones: { rows: ZoneRow[]; showSubject: boolean; loading: boolean; error: unknown; retry: () => void }
  selected: CourtSelection | null
  onSelect: (s: CourtSelection | null) => void
  onHoverZone: (zone: string | null) => void
  highlightZone: string | null
  cells: Array<{ label: string; cell: Cell | null }>
  comparison: { label: string; view: string; fga?: number } | null
}

const VIEW_LABEL: Record<string, string> = { single: 'A only', side: 'side by side', diff: 'difference (A − B)' }

function Block({ title, hint, children, testId }: { title: string; hint?: string; children: ReactNode; testId?: string }) {
  return (
    <section className="flex min-w-0 flex-col gap-2" data-testid={testId}>
      <div>
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {hint && <p className="text-xs text-ink-3">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/** Right column beside the court: legend, compact zone summary, the selected bin and the comparison subject. */
export function CourtAside({ legend, zones, selected, onSelect, onHoverZone, highlightZone, cells, comparison }: CourtAsideProps) {
  return (
    <aside className="flex min-w-0 flex-col gap-5" data-testid="shooting-aside" aria-label="Court key, zone summary and selection">
      <Block title="How to read the court">
        <CourtKey {...legend} />
      </Block>

      <Block title="Zone summary" hint="Hover a row to outline the zone on the court; click to select it." testId="zone-summary">
        <Refetching loading={zones.loading} error={zones.error} retry={zones.retry}>
          <ZoneTable compact rows={zones.rows} showSubject={zones.showSubject} threshold={legend.threshold} selected={selected} onSelect={onSelect} onHoverZone={onHoverZone} highlightZone={highlightZone} />
        </Refetching>
      </Block>

      <Block title="Selected area">
        {selected ? (
          <BinDetail compact selection={selected} threshold={legend.threshold} onClear={() => onSelect(null)} cells={cells} />
        ) : (
          <p className="text-sm text-ink-2">Click a hex or zone on the court, or a zone row, for attempts, makes, FG% with its Wilson interval and the league rate.</p>
        )}
      </Block>

      {comparison && (
        <Block title="Compared with">
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink">
            <Badge>B · {comparison.label}</Badge>
            {comparison.fga !== undefined && <span className="tnum text-xs text-ink-2">{comparison.fga.toLocaleString()} FGA</span>}
            <span className="text-xs text-ink-3">shown {VIEW_LABEL[comparison.view] ?? comparison.view}</span>
          </div>
        </Block>
      )}
    </aside>
  )
}
