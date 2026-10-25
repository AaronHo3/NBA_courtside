import { useMemo, useState, type ReactNode } from 'react'
import type { Tone } from '../../lib/scale'
import { Icon } from '../ui/Icon'
import { Tooltip } from '../ui/Tooltip'

export interface HeatRow {
  id: string
  label: string
  /** Extra class for the row (e.g. "mine"). */
  className?: string
}

export interface HeatColumn {
  key: string
  label: string
  title?: string
}

export interface HeatLead {
  key: string
  label: string
  render: (rowId: string) => ReactNode
  numeric?: boolean
  /** The lead column that names the row (rendered as the row header and, when selectable, as the button). */
  header?: boolean
  /** Value used when sorting by this column; without it the column is not sortable. */
  sortValue?: (rowId: string) => number | string | null | undefined
  /** Direction applied on the first click (default: descending for numbers, ascending for text). */
  firstDir?: SortDir
  /** Short explanation behind a help icon in the header. */
  info?: ReactNode
}

export type SortDir = 'asc' | 'desc'
export interface HeatSort {
  key: string
  dir: SortDir
}

interface HeatmapProps {
  rows: HeatRow[]
  columns: HeatColumn[]
  value: (rowId: string, colKey: string) => number | null | undefined
  format: (v: number) => string
  tone: (v: number) => Tone
  /** Optional 0–1 intensity used for the cell shade; defaults to the value itself when in [0,1]. */
  intensity?: (v: number) => number
  scaleNote: ReactNode
  /** Leading columns rendered before the heat cells (rank, total). Columns up to the row header stay pinned on horizontal scroll. */
  lead?: HeatLead[]
  caption: string
  selectedId?: string | null
  onSelect?: (rowId: string) => void
  testId?: string
  /** Legend words for the three tones (default: unfavoured / toss-up / favoured). */
  legendLabels?: { bad: string; even: string; good: string }
  /** Headers become sort buttons (heat columns and lead columns with `sortValue`). */
  sortable?: boolean
  /** Initial sort when uncontrolled; without it rows keep their given order until a header is clicked. */
  defaultSort?: HeatSort | null
  /** Controlled sort; pair with `onSort`. */
  sort?: HeatSort | null
  onSort?: (sort: HeatSort) => void
}

type SortKey = number | string | null | undefined

function compare(a: SortKey, b: SortKey, dir: SortDir): number {
  const aMissing = a === null || a === undefined || (typeof a === 'number' && !Number.isFinite(a))
  const bMissing = b === null || b === undefined || (typeof b === 'number' && !Number.isFinite(b))
  // missing values sink to the bottom in either direction
  if (aMissing || bMissing) return aMissing === bMissing ? 0 : aMissing ? 1 : -1
  const c = typeof a === 'number' && typeof b === 'number' ? a - b : String(a).localeCompare(String(b))
  return dir === 'asc' ? c : -c
}

const ARIA_SORT = { asc: 'ascending', desc: 'descending' } as const

/** Team × category grid. Every cell carries its number; shade is a documented secondary cue. Rows select by click or keyboard; headers optionally sort. */
export function Heatmap({ rows, columns, value, format, tone, intensity, scaleNote, lead = [], caption, selectedId, onSelect, testId, legendLabels, sortable = false, defaultSort = null, sort: sortProp, onSort }: HeatmapProps) {
  const [innerSort, setInnerSort] = useState<HeatSort | null>(defaultSort)
  const sort = sortProp !== undefined ? sortProp : innerSort
  const alpha = (v: number) => {
    const i = intensity ? intensity(v) : v
    return Math.max(0.08, Math.min(1, Math.abs(i - 0.5) * 2))
  }
  const headerIdx = Math.max(
    0,
    lead.findIndex((l) => l.header),
  )
  const pinned = (i: number) => lead.length > 0 && i <= headerIdx

  const sortValueFor = useMemo(() => {
    const m = new Map<string, (id: string) => SortKey>()
    for (const l of lead) if (l.sortValue) m.set(l.key, l.sortValue)
    for (const c of columns) m.set(c.key, (id: string) => value(id, c.key))
    return m
  }, [lead, columns, value])

  const ordered = useMemo(() => {
    const get = sortable && sort ? sortValueFor.get(sort.key) : undefined
    if (!get || !sort) return rows
    return rows
      .map((r, i) => ({ r, i, k: get(r.id) }))
      .sort((x, y) => compare(x.k, y.k, sort.dir) || x.i - y.i)
      .map((x) => x.r)
  }, [rows, sortable, sort, sortValueFor])

  const toggle = (key: string, firstDir: SortDir) => {
    const next: HeatSort = sort?.key === key ? { key, dir: sort.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: firstDir }
    if (sortProp === undefined) setInnerSort(next)
    onSort?.(next)
  }

  const headCell = (key: string, label: string, opts: { numeric?: boolean; title?: string; canSort: boolean; firstDir: SortDir; info?: ReactNode; className?: string }) => {
    const active = sortable && opts.canSort && sort?.key === key ? sort.dir : null
    const cls = [opts.numeric ? 'num' : '', opts.className ?? '', sortable && opts.canSort ? 'sortable' : ''].filter(Boolean).join(' ') || undefined
    return (
      <th key={key} scope="col" className={cls} title={opts.title} aria-sort={sortable && opts.canSort ? (active ? ARIA_SORT[active] : 'none') : undefined}>
        <span className="heat-th">
          {sortable && opts.canSort ? (
            <button type="button" className="heat-sort" onClick={() => toggle(key, opts.firstDir)}>
              {label}
              <span className={`heat-sort-mark${active ? ' on' : ''}`} aria-hidden="true">
                {active === 'asc' ? '▲' : '▼'}
              </span>
            </button>
          ) : (
            label
          )}
          {opts.info && (
            <Tooltip content={opts.info} side="bottom">
              <button type="button" className="icon-btn help heat-info" aria-label={`About ${label}`}>
                <Icon name="help" size={13} />
              </button>
            </Tooltip>
          )}
        </span>
      </th>
    )
  }

  return (
    <div className="heatmap">
      <div className="table-wrap">
        <table className={`grid heat${lead.length > 0 ? ' pinned' : ''}`} aria-label={caption} data-testid={testId}>
          <thead>
            <tr>
              {lead.map((l, i) =>
                headCell(l.key, l.label, {
                  numeric: l.numeric,
                  canSort: Boolean(l.sortValue),
                  firstDir: l.firstDir ?? (l.numeric ? 'desc' : 'asc'),
                  info: l.info,
                  className: pinned(i) ? `pin pin-${i}${i === headerIdx ? ' pin-last' : ''}` : undefined,
                }),
              )}
              {columns.map((c) => headCell(c.key, c.label, { numeric: true, title: c.title, canSort: true, firstDir: 'desc' }))}
            </tr>
          </thead>
          <tbody>
            {ordered.map((r) => (
              <tr
                key={r.id}
                className={[r.className, selectedId === r.id ? 'selected' : ''].filter(Boolean).join(' ') || undefined}
                onClick={onSelect ? () => onSelect(r.id) : undefined}
                style={onSelect ? { cursor: 'pointer' } : undefined}
                aria-selected={onSelect ? selectedId === r.id : undefined}
              >
                {lead.map((l, i) => {
                  const content =
                    i === headerIdx && onSelect ? (
                      <button type="button" className="row-select" aria-pressed={selectedId === r.id} aria-label={`Show ${r.label}`} onClick={(e) => {
                        e.stopPropagation()
                        onSelect(r.id)
                      }}>
                        {l.render(r.id)}
                      </button>
                    ) : (
                      l.render(r.id)
                    )
                  const cls = [l.numeric ? 'num' : '', pinned(i) ? `pin pin-${i}${i === headerIdx ? ' pin-last' : ''}` : ''].filter(Boolean).join(' ') || undefined
                  return i === headerIdx ? (
                    <th key={l.key} scope="row" className={cls}>
                      {content}
                    </th>
                  ) : (
                    <td key={l.key} className={cls}>
                      {content}
                    </td>
                  )
                })}
                {columns.map((c) => {
                  const v = value(r.id, c.key)
                  if (v === null || v === undefined || !Number.isFinite(v)) {
                    return (
                      <td key={c.key} className="num heat-cell missing">
                        —
                      </td>
                    )
                  }
                  const t = tone(v)
                  return (
                    <td key={c.key} className={`num heat-cell ${t}`} style={{ ['--heat' as string]: alpha(v) }} title={`${c.label}: ${format(v)}`}>
                      {format(v)}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="heat-scale">
        <span className="swatch bad" aria-hidden="true" /> {legendLabels?.bad ?? 'unfavoured'} <span className="swatch even" aria-hidden="true" /> {legendLabels?.even ?? 'toss-up'} <span className="swatch good" aria-hidden="true" /> {legendLabels?.good ?? 'favoured'} · {scaleNote}
      </p>
    </div>
  )
}
