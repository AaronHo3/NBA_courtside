import { render, screen } from '@testing-library/react'
import { ChartFrame } from './ChartFrame'
import { hoverTemplate } from './hover'

describe('ChartFrame', () => {
  it('renders the title, question, legend and the chart at a fixed height', () => {
    render(
      <ChartFrame title="Shot profile" question="Where does he score from?" legend={[{ label: 'Above league', swatch: 'pos' }, { label: 'Projected', swatch: 'hatched' }]} height={240} testId="cf">
        <svg data-testid="plot" />
      </ChartFrame>,
    )
    const frame = screen.getByRole('figure', { name: 'Shot profile' })
    expect(frame).toHaveTextContent('Where does he score from?')
    expect(screen.getByRole('list', { name: 'Legend' })).toHaveTextContent('Above league')
    expect(screen.getByTestId('plot').parentElement).toHaveStyle({ height: '240px' })
  })

  it('replaces the chart with the unavailable note', () => {
    render(<ChartFrame title="Tracking" unavailable="No tracking data for this season."><svg data-testid="plot" /></ChartFrame>)
    expect(screen.queryByTestId('plot')).toBeNull()
    expect(screen.getByRole('note')).toHaveTextContent('No tracking data for this season.')
  })
})

describe('hoverTemplate', () => {
  it('joins label/value rows, escapes labels and hides the trace box', () => {
    expect(hoverTemplate([['TS%', '%{y:.1%}'], ['<b>Games', '%{customdata[0]}']])).toBe('TS%: <b>%{y:.1%}</b><br>&lt;b&gt;Games: <b>%{customdata[0]}</b><extra></extra>')
  })
})
