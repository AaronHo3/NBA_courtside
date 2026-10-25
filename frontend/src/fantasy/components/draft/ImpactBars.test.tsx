import { render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ImpactBars, type ImpactRow } from './ImpactBars'

const row = (key: string, value: number | null, lowerIsBetter = false): ImpactRow => ({ key, label: key, value, lowerIsBetter })

describe('ImpactBars', () => {
  it('draws a zero baseline and symmetric scale', () => {
    render(<ImpactBars rows={[row('PTS', 2), row('TOV', -1, true), row('AST', 0.5), row('STL', null)]} />)
    const list = screen.getByRole('list', { name: /category impact/i })
    // the shared scale is the largest absolute value shown
    expect(list).toHaveAttribute('data-scale', '2')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(4)
    // every row has a centred zero line
    for (const item of items) expect(item.querySelector('[data-testid="impact-zero"]')).not.toBeNull()
    const bar = (key: string) => list.querySelector<HTMLElement>(`[data-cat="${key}"] .impact-bar`)
    expect(bar('PTS')?.style.width).toBe('50%')
    expect(bar('PTS')?.style.left).toBe('50%')
    expect(bar('PTS')).toHaveClass('pos')
    expect(bar('TOV')?.style.width).toBe('25%')
    expect(bar('TOV')?.style.right).toBe('50%')
    expect(bar('TOV')).toHaveClass('neg')
    expect(bar('AST')?.style.width).toBe('12.5%')
    expect(bar('STL')).toBeNull()
    // signed values with the unit, and the lower-is-better note survives
    expect(within(items[0]).getByText('+2.00 z')).toBeInTheDocument()
    expect(within(items[1]).getByText('-1.00 z')).toBeInTheDocument()
    expect(within(items[1]).getByText('lower is better')).toBeInTheDocument()
    expect(within(items[3]).getByText('—')).toBeInTheDocument()
  })

  it('shows one row per league category', () => {
    const eight = ['PTS', 'REB', 'AST', 'STL', 'BLK', 'FG3M', 'FG_PCT', 'FT_PCT'].map((k, i) => row(k, i - 3))
    render(<ImpactBars rows={eight} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(8)
    expect(screen.queryByText('lower is better')).toBeNull()
  })
})
