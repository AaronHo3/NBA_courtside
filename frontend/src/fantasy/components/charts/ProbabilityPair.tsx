import { fmtPct } from '../../lib/format'

export interface PairRow {
  key: string
  label: string
  /** Probability the left side wins the category; null when the API did not return it. */
  pLeft: number | null
  /** Extra hint for the row (e.g. lower is better). */
  title?: string
  /** Optional exact totals for each side, shown under the label when present (actual or projected). */
  leftValue?: string | null
  rightValue?: string | null
}

interface ProbabilityPairProps {
  leftName: string
  rightName: string
  rows: PairRow[]
  /** Label for the values line, e.g. "ESPN actual" or "projected total". */
  valuesLabel?: string
  compact?: boolean
  /** Test id prefix so each row is addressable (cat-<key>, cat-<key>-winner, cat-<key>-loser). */
  rowTestId?: (key: string) => string
  /** Extra class per row (e.g. fav-a / fav-b for the home side). */
  rowClass?: (key: string, pLeft: number) => string
  /** Appended to the values tooltip (e.g. how rates are computed). */
  valuesNote?: string
  /** Rows whose left share falls inside [lo, hi] get a "close" chip, e.g. [0.4, 0.6]. */
  closeBand?: readonly [number, number]
  /** Optional captions under the side names, e.g. "projected winner". */
  leftCaption?: string
  rightCaption?: string
}

/** Compared on the printed whole percentages so the chip always agrees with the numbers shown. */
function isClose(p: number, band?: readonly [number, number]): boolean {
  if (band === undefined) return false
  const pct = Math.round(p * 100)
  return pct >= Math.round(band[0] * 100) && pct <= Math.round(band[1] * 100)
}

/** One centred bar per category, both sides' chances printed at the ends; optional "close" chip for toss-ups. */
export function ProbabilityPair({ leftName, rightName, rows, valuesLabel, compact = false, rowTestId, rowClass, valuesNote, closeBand, leftCaption, rightCaption }: ProbabilityPairProps) {
  return (
    <div className={`pair${compact ? ' compact' : ''}`} role="list" aria-label="Category odds">
      <div className="pair-head" aria-hidden="true">
        <span className="pair-side">
          {leftName}
          {leftCaption && <span className="pair-caption">{leftCaption}</span>}
        </span>
        <span className="pair-label" />
        <span className="pair-side right">
          {rightName}
          {rightCaption && <span className="pair-caption">{rightCaption}</span>}
        </span>
      </div>
      {rows.map((r) => {
        const id = rowTestId ? rowTestId(r.key) : undefined
        if (r.pLeft === null || !Number.isFinite(r.pLeft)) {
          return (
            <div key={r.key} role="listitem" className="pair-row missing" data-testid={id} title={r.title}>
              <span className="pair-cell left">
                <span className="pair-num">—</span>
                <span className="pair-track" aria-hidden="true" />
              </span>
              <span className="pair-label">
                <span className="pair-cat">{r.label}</span>
              </span>
              <span className="pair-cell right">
                <span className="pair-track" aria-hidden="true" />
                <span className="pair-num">—</span>
              </span>
            </div>
          )
        }
        const pL = r.pLeft
        const pR = 1 - pL
        const leftLeads = pL > 0.5
        const rightLeads = pR > 0.5
        const close = isClose(pL, closeBand)
        return (
          <div key={r.key} role="listitem" className={`pair-row${leftLeads ? ' lead-left' : rightLeads ? ' lead-right' : ' even'}${rowClass ? ` ${rowClass(r.key, pL)}` : ''}`} data-testid={id} title={`${leftName} wins ${r.label} in ${fmtPct(pL)} of simulated weeks${r.title ? ` · ${r.title}` : ''}`}>
            <span className={`pair-cell left${leftLeads ? ' lead' : ''}`} data-testid={id ? `${id}-winner` : undefined}>
              <span className="pair-num">{fmtPct(pL)}</span>
              <span className="pair-track" aria-hidden="true">
                <span className="pair-fill" style={{ width: `${Math.round(pL * 100)}%` }} />
              </span>
            </span>
            <span className="pair-label">
              <span className="pair-cat">{r.label}</span>
              {close && <span className="pair-close">close</span>}
              {(r.leftValue || r.rightValue) && (
                <span className="pair-values" title={[valuesLabel, valuesNote].filter(Boolean).join(' · ')}>
                  {r.leftValue ?? '—'} <span className="muted">·</span> {r.rightValue ?? '—'}
                </span>
              )}
            </span>
            <span className={`pair-cell right${rightLeads ? ' lead' : ''}`} data-testid={id ? `${id}-loser` : undefined}>
              <span className="pair-track" aria-hidden="true">
                <span className="pair-fill" style={{ width: `${Math.round(pR * 100)}%` }} />
              </span>
              <span className="pair-num">{fmtPct(pR)}</span>
            </span>
          </div>
        )
      })}
    </div>
  )
}
