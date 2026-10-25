import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { CategoryDef } from '../../api/types'
import { makeFreeAgent as fa } from '../../test/seasonFixtures'
import { FreeAgentsTable } from './FreeAgentsTable'

const CATS: CategoryDef[] = [{ key: 'PTS', label: 'Points', higher_is_better: true, kind: 'counting', numerator: null, denominator: null }]

describe('FreeAgentsTable', () => {
  it('marks OUT players and shows each row’s best drop', () => {
    render(<FreeAgentsTable items={[fa('a', 'Healthy Guy'), fa('b', 'Hurt Guy', ['out'])]} categories={CATS} onSelect={() => {}} />)
    expect(screen.getByText('Hurt Guy').closest('tr')).toHaveClass('drafted')
    expect(screen.getByText('OUT')).toBeInTheDocument()
    expect(screen.getAllByText('Bench Guy')).toHaveLength(2)
  })

  it('selects on row or name click, opens details from the details button, and marks the selected row', () => {
    const picked: string[] = []
    const opened: string[] = []
    render(<FreeAgentsTable items={[fa('a', 'Healthy Guy'), fa('b', 'Other Guy')]} categories={CATS} selectedId="b" onSelect={(id) => picked.push(id)} onOpen={(id) => opened.push(id)} />)
    expect(screen.getByText('Other Guy').closest('tr')).toHaveClass('selected')
    fireEvent.click(screen.getByText('Other Guy').closest('tr')!.querySelector('td')!)
    fireEvent.click(screen.getByText('Healthy Guy'))
    fireEvent.click(screen.getByRole('button', { name: 'Details for Healthy Guy' }))
    expect(picked).toEqual(['b', 'a'])
    expect(opened).toEqual(['a'])
  })
})

describe('FreeAgentsTable actual mode', () => {
  it('shows the real per-game line, value and delta, and an honest gap for players without games', async () => {
    const { makeActual } = await import('../../test/seasonFixtures')
    const meta = { scope: 'week' as const, period: 1, window_start: '2026-10-20', window_end: '2026-10-26', fetched_at: '2026-10-25T06:00:00+00:00', rows: 812, max_game_date: '2026-10-24' }
    render(<FreeAgentsTable items={[fa('a', 'Hot Guy', [], makeActual()), fa('b', 'Idle Guy')]} categories={CATS} onSelect={() => {}} mode="actual" actuals={meta} />)
    expect(screen.getByRole('columnheader', { name: 'Actual value' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Best drop' })).toBeNull()
    const hot = screen.getByText('Hot Guy').closest('tr')!
    expect(hot).toHaveTextContent('16.8')
    expect(hot).toHaveTextContent('+18.4')
    expect(hot).toHaveTextContent(/84(\.2)?%/)
    expect(screen.getByText('Idle Guy').closest('tr')).toHaveTextContent('no games in week 1')
  })
})

describe('FreeAgentsTable minutes', () => {
  it('shows the minutes the ranking used and how they were set', async () => {
    const { makeMinutes } = await import('../../test/seasonFixtures')
    render(
      <FreeAgentsTable
        items={[fa('a', 'Blend Guy', [], null, makeMinutes()), fa('b', 'Benched Guy', [], null, makeMinutes({ used: 0, source: 'override', recent: 4.5 })), fa('c', 'Plain Guy')]}
        categories={CATS}
        onSelect={() => {}}
      />,
    )
    expect(screen.getByRole('columnheader', { name: 'MIN' })).toBeInTheDocument()
    const blend = within(screen.getByText('Blend Guy').closest('tr')!).getByTestId('minutes-cell')
    expect(blend).toHaveTextContent('27.6')
    expect(blend).toHaveAttribute('title', expect.stringMatching(/26\.5.*29\.7.*2 games/))
    const benched = within(screen.getByText('Benched Guy').closest('tr')!).getByTestId('minutes-cell')
    expect(benched).toHaveTextContent('0.0')
    expect(benched).toHaveTextContent(/override/i)
    const plain = within(screen.getByText('Plain Guy').closest('tr')!).getByTestId('minutes-cell')
    expect(plain).toHaveTextContent('30.0')
    expect(plain).toHaveClass('muted')
  })
})

describe('FreeAgentsTable detail rows', () => {
  it('expands a row to show category detail', async () => {
    const { TWO_CATS } = await import('../../test/seasonFixtures')
    const picked: string[] = []
    const agent = { ...fa('a', 'Healthy Guy'), z: { PTS: 0.4, TOV: -0.8 } }
    render(<FreeAgentsTable items={[agent, fa('b', 'Other Guy')]} categories={TWO_CATS} onSelect={(id) => picked.push(id)} />)
    // compact by default: no per-category columns
    expect(screen.queryByRole('columnheader', { name: 'Points' })).toBeNull()
    expect(screen.queryByTestId('fa-detail-row')).toBeNull()
    const toggle = screen.getByRole('button', { name: 'Category detail for Healthy Guy' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    const detail = screen.getByTestId('fa-detail-row')
    expect(detail).toHaveTextContent('Points')
    expect(detail).toHaveTextContent('+0.4')
    expect(detail).toHaveTextContent('Turnovers')
    expect(detail).toHaveTextContent('-0.8')
    expect(detail).toHaveTextContent(/lower is better/)
    expect(picked).toEqual([]) // expanding does not change the swap selection
    fireEvent.click(toggle)
    expect(screen.queryByTestId('fa-detail-row')).toBeNull()
  })
})
