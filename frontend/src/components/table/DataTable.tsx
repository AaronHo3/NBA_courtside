import { useMemo, useRef, useState, type ReactNode } from 'react'
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
  height?: number
  initialSort?: SortingState
  globalFilter?: string
  emptyMessage?: string
  toolbar?: ReactNode
  dense?: boolean
  /** Extra classes per row (e.g. a flash when a row is added). */
  rowClassName?: (row: T) => string | undefined
}

/** Sortable, filterable, virtualised table. Numbers should be rendered with the `tnum` class by cells. */
export function DataTable<T>({ data, columns, rowKey, onRowClick, onRowHover, isSelected, isHighlighted, height = 480, initialSort = [], globalFilter = '', emptyMessage = 'No rows match these filters.', toolbar, dense, rowClassName }: DataTableProps<T>) {
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
  const rowHeight = dense ? 28 : 32
  const virtualizer = useVirtualizer({ count: rows.length, getScrollElement: () => parentRef.current, estimateSize: () => rowHeight, overscan: 12 })
  const items = virtualizer.getVirtualItems()
  const paddingTop = items.length ? items[0].start : 0
  const paddingBottom = items.length ? virtualizer.getTotalSize() - items[items.length - 1].end : 0
  const colCount = useMemo(() => table.getAllLeafColumns().length, [table])

  return (
    <div className="flex flex-col gap-2">
      {toolbar}
      <div ref={parentRef} className="overflow-auto rounded-[var(--radius-control)] border border-line" style={{ maxHeight: height }}>
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-raised">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
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
                  onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row.original) } : undefined}
                  tabIndex={onRowClick ? 0 : -1}
                  className={clsx('t-fast border-b border-line', onRowClick && 'cursor-pointer hover:bg-raised', selected && 'row-highlight shadow-[inset_2px_0_0_var(--accent)]', highlighted && !selected && 'bg-accent-soft/60 shadow-[inset_2px_0_0_var(--accent)]', rowClassName?.(row.original))}
                  style={{ height: rowHeight }}
                >
                  {row.getVisibleCells().map((cell) => {
                    const numeric = (cell.column.columnDef.meta as { numeric?: boolean } | undefined)?.numeric
                    return (
                      <td key={cell.id} className={clsx('whitespace-nowrap px-2 py-1', numeric ? 'text-right tnum' : 'text-left')}>
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
