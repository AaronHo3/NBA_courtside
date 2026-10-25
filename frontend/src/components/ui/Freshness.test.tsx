import { render } from '@testing-library/react'
import { Freshness } from './Freshness'

const NOW = new Date('2026-10-25T12:00:00Z')

describe('Freshness', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)
  })
  afterEach(() => vi.useRealTimers())

  it('reads label · relative time with an accent dot inside a day', () => {
    const { container } = render(<Freshness label="Box scores" at="2026-10-25T10:00:00Z" />)
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveTextContent('Box scores · 2h ago')
    expect(root).toHaveAttribute('data-tone', 'accent')
    expect(root.querySelector('time')).toHaveAttribute('datetime', '2026-10-25T10:00:00Z')
  })

  it('is neutral within a week and a warning after that', () => {
    const { container, rerender } = render(<Freshness label="Lineups" at="2026-10-22T12:00:00Z" />)
    const root = () => container.firstElementChild as HTMLElement
    expect(root()).toHaveTextContent('Lineups · 3d ago')
    expect(root()).toHaveAttribute('data-tone', 'neutral')
    rerender(<Freshness label="Lineups" at="2026-10-01T12:00:00Z" />)
    expect(root()).toHaveAttribute('data-tone', 'warning')
  })

  it('says never when there is no timestamp, and shows the detail', () => {
    const { container } = render(<Freshness label="Tracking" at={null} detail="run make ingest" />)
    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveTextContent('Tracking · never')
    expect(root).toHaveTextContent('run make ingest')
    expect(root).toHaveAttribute('data-tone', 'warning')
  })
})
