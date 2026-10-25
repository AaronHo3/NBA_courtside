import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CareerTimeline } from './CareerTimeline'
import type { TimelineSeason } from './helpers'

const seasons: TimelineSeason[] = Array.from({ length: 12 }, (_, i) => {
  const y = 2013 + i
  const season = `${y}-${String((y + 1) % 100).padStart(2, '0')}`
  return { season, traded: false, stints: [{ season, team_id: 1610612738, team_abbreviation: 'BOS', team_name: 'Boston Celtics', gp: 70, min: 2100 }] } as TimelineSeason
})

function mockScroller() {
  const strip = screen.getByRole('list', { name: 'Career timeline' })
  let left = 0
  Object.defineProperty(strip, 'scrollWidth', { configurable: true, get: () => 12 * 166 })
  Object.defineProperty(strip, 'clientWidth', { configurable: true, get: () => 500 })
  Object.defineProperty(strip, 'scrollLeft', { configurable: true, get: () => left, set: (v: number) => { left = v } })
  const scrollBy = vi.fn(({ left: dx }: ScrollToOptions) => {
    left = Math.max(0, Math.min(12 * 166 - 500, left + (dx ?? 0)))
    fireEvent.scroll(strip)
  })
  ;(strip as HTMLElement & { scrollBy: unknown }).scrollBy = scrollBy
  fireEvent.scroll(strip)
  return { strip, scrollBy, left: () => left }
}

describe('CareerTimeline', () => {
  it('scroll buttons move the strip and are labelled', async () => {
    render(<CareerTimeline seasons={seasons} teams={['BOS']} focusSeason="2013-14" onFocus={() => {}} />)
    const { scrollBy, left } = mockScroller()
    const earlier = screen.getByRole('button', { name: 'Earlier seasons' })
    const later = screen.getByRole('button', { name: 'Later seasons' })
    expect(earlier).toBeDisabled()
    expect(later).toBeEnabled()
    await userEvent.click(later)
    expect(scrollBy).toHaveBeenCalledTimes(1)
    expect(scrollBy.mock.calls[0][0].left).toBeGreaterThan(0)
    expect(left()).toBeGreaterThan(0)
    expect(earlier).toBeEnabled()
    await userEvent.click(earlier)
    expect(scrollBy.mock.calls[1][0].left).toBeLessThan(0)
    expect(left()).toBe(0)
  })

  it('cells are 160px and a click focuses that season', async () => {
    const onFocus = vi.fn()
    render(<CareerTimeline seasons={seasons} teams={['BOS']} focusSeason="2013-14" onFocus={onFocus} />)
    const cell = screen.getByRole('button', { name: /2016-17/ })
    expect(cell.className).toContain('w-[160px]')
    await userEvent.click(cell)
    expect(onFocus).toHaveBeenCalledWith('2016-17')
    expect(screen.getByRole('button', { name: /2013-14/ })).toHaveAttribute('aria-pressed', 'true')
  })
})
