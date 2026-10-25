import { fireEvent, render, screen } from '@testing-library/react'
import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from './DataTable'

type Row = { id: string; name: string; pts: number }
const data: Row[] = [
  { id: 'a', name: 'Alpha', pts: 30 },
  { id: 'b', name: 'Bravo', pts: 20 },
  { id: 'c', name: 'Charlie', pts: 10 },
]
const columns: ColumnDef<Row, unknown>[] = [
  { accessorKey: 'name', header: 'Player' },
  { accessorKey: 'pts', header: 'PTS', meta: { numeric: true } },
]

// jsdom has no layout; give elements a height so the virtualiser renders rows.
const offsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')
beforeAll(() => Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => 400 }))
afterAll(() => { if (offsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', offsetHeight) })

describe('DataTable', () => {
  it('pins the first column with sticky positioning and keeps the header sticky', () => {
    render(<DataTable data={data} columns={columns} rowKey={(r) => r.id} pinFirstColumn />)
    const [firstHead, secondHead] = screen.getAllByRole('columnheader')
    expect(firstHead).toHaveStyle({ position: 'sticky', left: '0px', top: '0px' })
    expect(secondHead).toHaveStyle({ position: 'sticky', top: '0px' })
    const alpha = screen.getByRole('cell', { name: 'Alpha' })
    expect(alpha).toHaveStyle({ position: 'sticky', left: '0px' })
    expect(screen.getByRole('cell', { name: '30' })).not.toHaveStyle({ position: 'sticky' })
  })

  it('does not pin when pinFirstColumn is off', () => {
    render(<DataTable data={data} columns={columns} rowKey={(r) => r.id} />)
    expect(screen.getByRole('cell', { name: 'Alpha' })).not.toHaveStyle({ position: 'sticky' })
  })

  it('caps the scroll container at maxHeight', () => {
    const { container } = render(<DataTable data={data} columns={columns} rowKey={(r) => r.id} maxHeight={240} />)
    expect(container.querySelector('[data-table-scroll]')).toHaveStyle({ maxHeight: '240px' })
  })

  it('with focusable, Arrow keys move the focused row and Enter or Space opens it', () => {
    const onRowClick = vi.fn()
    render(<DataTable data={data} columns={columns} rowKey={(r) => r.id} focusable onRowClick={onRowClick} />)
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows).toHaveLength(3)
    rows.forEach((r) => expect(r).toHaveAttribute('tabindex', '0'))
    rows[0].focus()
    fireEvent.keyDown(rows[0], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rows[1])
    fireEvent.keyDown(rows[1], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rows[2])
    fireEvent.keyDown(rows[2], { key: 'ArrowDown' })
    expect(document.activeElement).toBe(rows[2])
    fireEvent.keyDown(rows[2], { key: 'ArrowUp' })
    expect(document.activeElement).toBe(rows[1])
    fireEvent.keyDown(rows[1], { key: 'Enter' })
    expect(onRowClick).toHaveBeenLastCalledWith(data[1])
    fireEvent.keyDown(rows[1], { key: ' ' })
    expect(onRowClick).toHaveBeenCalledTimes(2)
  })
})
