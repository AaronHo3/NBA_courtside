import { useCallback, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react'
import { flexRender, getCoreRowModel, getFilteredRowModel, getSortedRowModel, useReactTable, type ColumnDef, type Row, type SortingState } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { clsx } from 'clsx'

export type DataTableProps<T> = {
  data: T[]
  columns: ColumnDef<T, unknown>[]
  rowKey: (row: T) => string | number
  onRowClick?: (row: T) => void
  /** Hover linkage to a chart; called with null when the pointer leaves the row. */
  onRowHover?: (row: T | null) => void
  isSelected?: (row: T) => boolean
  isHighlighted?: (row: T) => boolean
  /** @deprecated use `maxHeight`; kept for existing callers. */
  height?: number
  /** Cap on the scroll container's height; the header stays sticky inside it. */
  maxHeight?: number
  /** Row height in px (36 by default, 30 when `dense`). */
  rowHeight?: number
  /** First column sticks to the left edge on a surface background so it reads over scrolled cells. */
  pinFirstColumn?: boolean
  /** Header row sticks to the top of the scroll container (default true). */
  stickyHeader?: boolean
  /** Rows take focus: ArrowUp/ArrowDown move between rows, Enter/Space trigger `onRowClick`. */
  focusable?: boolean
  initialSort?: SortingState
  globalFilter?: string
  emptyMessage?: string
  toolbar?: ReactNode
  dense?: boolean
  /** Extra classes per row (e.g. a flash when a row is added). */
  rowClassName?: (row: T) => string | undefined
}

const PIN_SHADOW = 'inset -1px 0 0 var(--line)'

function headStyle(sticky: boolean, pinned: boolean): CSSProperties | undefined {
  if (!sticky && !pinned) return undefined
  return {
    position: 'sticky',
    ...(sticky ? { top: 0 } : {}),
    ...(pinned ? { left: 0, boxShadow: PIN_SHADOW } : {}),
    zIndex: pinned ? 3 : 2,
    background: 'var(--raised)',
  }
}

const PINNED_CELL: CSSProperties = { position: 'sticky', left: 0, zIndex: 1, boxShadow: PIN_SHADOW }

/** Sortable, filterable, virtualised table. Numbers should be rendered with the `tnum` class by cells. */
export function DataTable<T>({ data, columns, rowKey, onRowClick, onRowHover, isSelected, isHighlighted, height = 480, maxHeight, rowHeight: rowHeightProp, pinFirstColumn = false, stickyHeader = true, focusable = false, initialSort = [], globalFilter = '', emptyMessage = 'No rows match these filters.', toolbar, dense, rowClassName }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort)
  const table = useReactTable({
    data,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  })
  const rows = table.getRowModel().rows
  const parentRef = useRef<HTMLDivElement>(null)
  const rowHeight = rowHeightProp ?? (dense ? 30 : 36)
  const cap = maxHeight ?? height
  // initialRect lets the first render (and jsdom) lay out a screenful before the element is measured.
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => rowHeight, overscan: 12, initialRect: { width: 0, height: cap } })
  const items = virtualizer.getVirtualItems()
  const paddingTop = items.length ? items[0].start : 0
  const paddingBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0
  const colCount = useMemo(() => table.getAllLeafColumns().length, [table])
  const interactive = focusable || Boolean(onRowClick)

  const focusRow = useCallback((index: number) => {
    const find = () => parentRef.current?.querySelector<HTMLElement>(`tbody tr[data-index="${index}"]`)
    const el = find()
    if (el) {
      el.focus()
      return
    }
    virtualizer.scrollToIndex(index, { align: 'auto' })
    requestAnimationFrame(() => find()?.focus())
  }, [virtualizer])

  const onRowKeyDown = (e: KeyboardEvent<HTMLTableRowElement>, index: number, original: T) => {
    if (e.target !== e.currentTarget) return
    if (focusable && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      e.preventDefault()
      const next = e.key === 'ArrowDown' ? Math.min(index + 1, rows.length - 1) : Math.max(index - 1, 0)
      if (next !== index) focusRow(next)
      return
    }
    if (onRowClick && (e.key === 'Enter' || (focusable && e.key === ' '))) {
      e.preventDefault()
      onRowClick(original)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {toolbar}
      <div ref={parentRef} data-table-scroll="" className="overflow-auto rounded-[var(--radius-control)] border border-line" style={{ maxHeight: cap }}>
        <table className="w-full border-collapse text-sm">
          <thead className="bg-raised">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h, ci) => {
                  const sorted = h.column.getIsSorted()
                  const numeric = (h.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      aria-sort={sorted === 'asc' ? 'ascending' : sorted === 'desc' ? 'descending' : 'none'}
                      className={clsx('t-fast whitespace-nowrap border-b border-line px-2 py-1.5 text-xs font-medium uppercase tracking-wide text-ink-3 select-none', numeric ? 'text-right' : 'text-left', h.column.getCanSort() && 'cursor-pointer hover:text-ink')}
                      onClick={h.column.getToggleSortingHandler()}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); h.column.toggleSorting() } }}
                      tabIndex={h.column.getCanSort() ? 0 : -1}
                      style={headStyle(stickyHeader, pinFirstColumn && ci === 0)}
                    >
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      {sorted && <span className="ml-1 text-accent">{sorted === 'asc' ? '▲' : '▼'}</span>}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={colCount} className="px-3 py-6 text-center text-ink-3">{emptyMessage}</td></tr>
            )}
            {paddingTop > 0 && <tr><td style={{ height: paddingTop }} colSpan={colCount} /></tr>}
            {items.map((vi) => {
              const row = rows[vi.index] as Row<T>
              const selected = isSelected?.(row.original)
              const highlighted = isHighlighted?.(row.original)
              return (
                <tr
                  key={rowKey(row.original)}
                  data-index={vi.index}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  onMouseEnter={onRowHover ? () => onRowHover(row.original) : undefined}
                  onMouseLeave={onRowHover ? () => onRowHover(null) : undefined}
                  onKeyDown={interactive ? (e) => onRowKeyDown(e, vi.index, row.original) : undefined}
                  tabIndex={interactive ? 0 : -1}
                  className={clsx('group t-fast border-b border-line', onRowClick && 'cursor-pointer hover:bg-raised', selected && 'row-highlight shadow-[inset_2px_0_0_var(--accent)]', highlighted && !selected && 'bg-accent-soft/60 shadow-[inset_2px_0_0_var(--accent)]', rowClassName?.(row.original))}
                  style={{ height: rowHeight }}
                >
                  {row.getVisibleCells().map((cell, ci) => {
                    const numeric = (cell.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric
                    const pinned = pinFirstColumn && ci === 0
                    return (
                      <td
                        key={cell.id}
                        style={pinned ? PINNED_CELL : undefined}
                        className={clsx(
                          'whitespace-nowrap px-2 py-1',
                          numeric ? 'text-right tnum' : 'text-left',
                          // opaque fill so scrolled cells never show through; tint matches the row state
                          pinned && (selected || highlighted ? '[background:linear-gradient(var(--accent-soft),var(--accent-soft)),var(--surface)]' : clsx('bg-surface', onRowClick && 'group-hover:bg-raised')),
                        )}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
            {paddingBottom > 0 && <tr><td style={{ height: paddingBottom }} colSpan={colCount} /></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Build a CSV string from rows and trigger a download. Values are quoted; nulls empty. */
export function downloadCsv(filename: string, rows: Record<string, unknown>[], columns?: string[]) {
  if (!rows.length) return
  const cols = columns ?? Object.keys(rows[0])
  const esc = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = Array.isArray(v) ? v.join('|') : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
