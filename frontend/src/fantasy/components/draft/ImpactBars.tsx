import { fmtSigned } from '../../lib/format'
import { symmetricMax } from '../../lib/scale'

export interface ImpactRow {
  key: string
  label: string
  /** Weighted z contribution; positive always helps (lower-is-better categories arrive sign-flipped). */
  value: number | null
  lowerIsBetter: boolean
}

interface ImpactBarsProps {
  rows: ImpactRow[]
  label?: string
}

/** One row per league category: centred zero line, bars on one symmetric scale, signed value in z. */
export function ImpactBars({ rows, label = 'Category impact' }: ImpactBarsProps) {
  const scale = symmetricMax(rows.flatMap((r) => (r.value === null ? [] : [r.value])))
  return (
    <ul className="impact-bars" aria-label={label} data-scale={String(scale)}>
      {rows.map((r) => {
        const v = r.value
        const width = v === null || v === 0 ? 0 : (Math.abs(v) / scale) * 50
        const tone = v === null || v === 0 ? 'even' : v > 0 ? 'pos' : 'neg'
        return (
          <li key={r.key} data-cat={r.key} className={`impact-row ${tone}`}>
            <span className="impact-label">{r.label}</span>
            <span className="impact-track" aria-hidden="true">
              <span className="impact-zero" data-testid="impact-zero" />
              {v !== null && width > 0 && <span className={`impact-bar ${tone}`} style={v > 0 ? { left: '50%', width: `${width}%` } : { right: '50%', width: `${width}%` }} />}
            </span>
            <span className="impact-value tnum">{v === null ? '—' : `${fmtSigned(v, 2)} z`}</span>
            {r.lowerIsBetter && <span className="impact-note">lower is better</span>}
          </li>
        )
      })}
    </ul>
  )
}
