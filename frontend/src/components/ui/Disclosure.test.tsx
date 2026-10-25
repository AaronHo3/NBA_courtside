import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Disclosure } from './Disclosure'

describe('Disclosure', () => {
  it('is a native details element, closed by default, with the summary visible', () => {
    render(<Disclosure summary="How this is computed" testId="method">Shrunk toward the league mean.</Disclosure>)
    const details = screen.getByTestId('method')
    expect(details.tagName).toBe('DETAILS')
    expect(details).not.toHaveAttribute('open')
    expect(screen.getByText('How this is computed').closest('summary')).not.toBeNull()
  })

  it('opens when defaultOpen is set', () => {
    render(<Disclosure summary="Assumptions" defaultOpen testId="a">Body</Disclosure>)
    expect(screen.getByTestId('a')).toHaveAttribute('open')
    expect(screen.getByText('Body')).toBeVisible()
  })

  it('toggles when the summary is clicked', async () => {
    render(<Disclosure summary="Method" testId="m">Body</Disclosure>)
    await userEvent.click(screen.getByText('Method'))
    expect(screen.getByTestId('m')).toHaveAttribute('open')
  })
})
