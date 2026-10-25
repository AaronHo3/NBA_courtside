import { render } from '@testing-library/react'
import { Freshness } from './Freshness'

describe('fantasy Freshness', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-25T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('reads label · relative time and tones by age', () => {
    const { container, rerender } = render(<Freshness label="Snapshot" at="2026-10-25T11:30:00Z" />)
    const root = () => container.firstElementChild as HTMLElement
    expect(root()).toHaveTextContent('Snapshot · 30m ago')
    expect(root()).toHaveAttribute('data-tone', 'accent')
    rerender(<Freshness label="Snapshot" at="2026-10-20T12:00:00Z" />)
    expect(root()).toHaveAttribute('data-tone', 'neutral')
    rerender(<Freshness label="Snapshot" at={null} detail="import a league" />)
    expect(root()).toHaveTextContent('Snapshot · never')
    expect(root()).toHaveTextContent('import a league')
    expect(root()).toHaveAttribute('data-tone', 'warning')
  })
})
